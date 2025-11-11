import { log, proxyActivities, sleep } from "@temporalio/workflow";
import { LeadResponseDto, LeadUpdateDto } from "../../dto/leads.dto";
import { EAction, EWorkflowNodeType, WorkflowEdge, WorkflowJson, WorkflowNode } from "../../types/workflow.types";
import { CampaignStatus } from "../../dto/campaigns.dto";
import type * as activities from "../activities";

// Import ActivityResult type
export type ActivityResult = {
    success: boolean;
    message?: string;
    data?: any;
    providerId?: string;
};

const {
    profile_visit,
    like_post,
    comment_post,
    send_followup,
    withdraw_request,
    send_inmail,
    send_connection_request,
    check_connection_status,
    updateLead,
    verifyUnipileAccount,
    pauseCampaign,
    updateCampaignStep,
    extractLinkedInPublicIdentifier,
    getCampaignById,
    isCampaignActive
} = proxyActivities<typeof activities>({
    startToCloseTimeout: '5 minutes',
    retry: {
        initialInterval: '1s',
        maximumInterval: '30s',
        maximumAttempts: 3,
    },
});

// Utility functions for workflow use
const CheckNever = (value: never): never => {
    throw new Error(`Unhandled case: ${value}`)
};

export interface LeadWorkflowInput {
    leadId: string,
    workflow: WorkflowJson,
    accountId: string,
    campaignId: string,
    organizationId: string
}

/**
 * Helper function to wait for campaign to be unpaused
 * Keeps checking campaign status until it's no longer paused
 */
async function waitForCampaignResume(campaignId: string): Promise<void> {
    while (true) {
        const campaign = await getCampaignById(campaignId);
        if (!campaign) {
            log.error('Campaign not found while waiting for resume', { campaignId });
            return;
        }

        // If campaign is deleted, completed, or failed, exit
        if (campaign.is_deleted || campaign.status === CampaignStatus.COMPLETED || campaign.status === CampaignStatus.FAILED) {
            log.warn('Campaign is deleted, completed, or failed - stopping wait', {
                campaignId,
                status: campaign.status,
                is_deleted: campaign.is_deleted
            });
            return;
        }

        // If campaign is not paused, resume execution
        if (campaign.status !== CampaignStatus.PAUSED) {
            log.info('Campaign is no longer paused - resuming execution', { campaignId, status: campaign.status });
            return;
        }

        // Campaign is still paused, wait and check again
        log.info('Campaign is paused - waiting before checking again', { campaignId });
        await sleep('5 minutes'); // Check every 5 minutes
    }
}

/**
 * Check if campaign is paused and wait if necessary
 * Returns true if campaign is active, false if campaign ended
 */
async function checkCampaignStatus(campaignId: string): Promise<boolean> {
    const campaign = await getCampaignById(campaignId);
    if (!campaign) {
        log.error('Campaign not found', { campaignId });
        return false;
    }

    // If campaign is paused, wait for resume
    if (campaign.status === CampaignStatus.PAUSED) {
        log.warn('Campaign is paused - waiting for resume', { campaignId });
        await waitForCampaignResume(campaignId);
        // Re-check after resume
        const campaignAfterWait = await getCampaignById(campaignId);
        if (!campaignAfterWait) {
            return false;
        }
        // If still paused or ended, return false
        if (campaignAfterWait.status === CampaignStatus.PAUSED ||
            campaignAfterWait.status === CampaignStatus.COMPLETED ||
            campaignAfterWait.status === CampaignStatus.FAILED ||
            campaignAfterWait.is_deleted) {
            return false;
        }
    }

    // If campaign is deleted, completed, or failed, stop execution
    if (campaign.is_deleted || campaign.status === CampaignStatus.COMPLETED || campaign.status === CampaignStatus.FAILED) {
        log.warn('Campaign ended - stopping lead execution', {
            campaignId,
            status: campaign.status,
            is_deleted: campaign.is_deleted
        });
        return false;
    }

    return true;
}

function getDelayMs(edge: WorkflowEdge): number {
    if (edge.data?.delayData?.delay && edge.data?.delayData?.unit) {
        const delay = parseInt(edge.data.delayData.delay ?? '0', 10);
        switch (edge.data.delayData.unit) {
            case 's': return delay * 1000;
            case 'm': return delay * 60_000;
            case 'h': return delay * 3_600_000;
            case 'd': return delay * 86_400_000;
            case 'w': return delay * 604_800_000;
            default: CheckNever(edge.data.delayData.unit);
        }
    }
    return 0;
}

async function executeNode(node: WorkflowNode, accountId: string, lead: LeadResponseDto, campaignId: string, workflow: WorkflowJson, index: number): Promise<ActivityResult | null> {
    const type = node.data.type;
    const config = node.data.config ?? {};
    let identifier: string;

    try {
        const extractedIdentifier = await extractLinkedInPublicIdentifier(lead.linkedin_url!);
        if (!extractedIdentifier) {
            return {success: false, message: 'Invalid linkedin_url: Could not extract identifier'};
        }
        identifier = extractedIdentifier as string;
    } catch (error) {
        log.error('Failed to extract public identifier from linkedin_url', { linkedin_url: lead.linkedin_url, error });
        return {success: false, message: 'Invalid linkedin_url: Failed to extract identifier'};
    }

    let result: ActivityResult | null = null;

    switch (type) {
        case EWorkflowNodeType.profile_visit:
            result = await profile_visit(accountId, identifier, lead.campaign_id);
            break;
        case EWorkflowNodeType.like_post:
            result = await like_post(accountId, identifier, config || {}, lead.campaign_id);
            break;
        case EWorkflowNodeType.comment_post:
            result = await comment_post(accountId, identifier, config, lead.campaign_id);
            break;
        case EWorkflowNodeType.send_followup:
            result = await send_followup(accountId, identifier, config, lead.campaign_id);
            break;
        case EWorkflowNodeType.withdraw_request:
            result = await withdraw_request(accountId, identifier, lead.campaign_id);
            break;
        case EWorkflowNodeType.send_inmail:
            result = await send_inmail();
            break;
        case EWorkflowNodeType.send_connection_request: {
            log.info('Executing send_connection_request node', { accountId, identifier });
            const sendResult = await send_connection_request(accountId, identifier, config || {}, lead.campaign_id);

            // If request failed to send or user already connected, return immediately
            if (!sendResult.success) {
                log.error('Failed to send connection request', { result: sendResult });
                result = sendResult;
                break;
            }

            // If already connected, return success
            if (sendResult.data?.alreadyConnected) {
                log.info('User already connected, no polling needed', { accountId, identifier });
                result = sendResult;
                break;
            }

            // Get providerId from the send result
            const providerId = sendResult.data?.providerId;
            if (!providerId) {
                log.error('No providerId in send result', { sendResult });
                result = { success: false, message: 'Provider ID not found in send result' };
                break;
            }

            // Get polling configuration from workflow edges
            const outgoingEdges = workflow.edges.filter((edge: WorkflowEdge) => edge.source === node.id);
            const rejectedEdge = outgoingEdges.find((edge: WorkflowEdge) => edge.data?.isConditionalPath === true && edge.data?.isPositive === false);

            // Default values if no edge configuration found
            let maxAttempts = 240; // 10 days * 24 hours (default)
            let pollInterval = '1 hour'; // default

            if (rejectedEdge?.data?.delayData) {
                const delayMs = getDelayMs(rejectedEdge);
                if (delayMs > 0) {
                    // Convert delay to polling configuration
                    const delayHours = delayMs / (1000 * 60 * 60);
                    maxAttempts = Math.floor(delayHours);
                    pollInterval = `${Math.max(1, Math.floor(delayHours / maxAttempts))} hour`;
                }
            }

            log.info('Connection request sent, starting polling', {
                accountId,
                identifier,
                providerId,
                maxAttempts,
                pollInterval,
                delayFromEdge: rejectedEdge?.data?.delayData
            });
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                // Check campaign status before each polling attempt
                const isActive = await checkCampaignStatus(lead.campaign_id);
                if (!isActive) {
                    log.warn('Campaign is no longer active during connection polling - stopping', {
                        campaignId: lead.campaign_id,
                        attempt,
                        maxAttempts
                    });
                    result = {
                        success: false,
                        message: 'Campaign ended during connection polling',
                        data: {
                            connected: false,
                            campaignEnded: true,
                            status: 'campaign_ended'
                        }
                    };
                    break;
                }

                // Wait before checking (use configured interval)
                log.info('Waiting before next status check', {
                    attempt,
                    maxAttempts,
                    waitTime: pollInterval
                });
                await sleep(pollInterval);

                log.info('Checking connection status (activity call)', {
                    accountId,
                    identifier,
                    providerId,
                    attempt,
                    maxAttempts
                });

                // Call activity to check status
                const statusResult = await check_connection_status(accountId, identifier, providerId, lead.campaign_id);

                // Check if accepted
                if (statusResult.success && statusResult.data?.status === 'accepted') {
                    log.info('Connection request ACCEPTED!', {
                        accountId,
                        identifier,
                        attemptNumber: attempt,
                        hoursWaited: attempt
                    });
                    result = {
                        success: true,
                        message: `Connection request accepted after ${attempt} hour(s)`,
                        data: {
                            connected: true,
                            hoursWaited: attempt,
                            status: 'accepted'
                        }
                    };
                    break;
                }

                // Check if rejected
                if (statusResult.data?.status === 'rejected') {
                    log.warn('Connection request REJECTED!', {
                        accountId,
                        identifier,
                        attemptNumber: attempt,
                        hoursWaited: attempt
                    });
                    result = {
                        success: false,
                        message: `Connection request rejected after ${attempt} hour(s)`,
                        data: {
                            connected: false,
                            hoursWaited: attempt,
                            status: 'rejected'
                        }
                    };
                    break;
                }

                // Still pending, continue polling
                log.info('Connection request still pending, continuing to poll', {
                    accountId,
                    identifier,
                    attempt,
                    remainingAttempts: maxAttempts - attempt
                });
            }

            // Timeout after 10 days if result not set
            if (!result) {
                log.warn('Connection request TIMEOUT - 10 days elapsed', {
                    accountId,
                    identifier,
                    totalDays: 10,
                    totalAttempts: maxAttempts
                });
                result = {
                    success: false,
                    message: 'Connection request not accepted within 10 days (timeout)',
                    data: {
                        connected: false,
                        timeoutReached: true,
                        status: 'timeout',
                        daysWaited: 10
                    }
                };
            }
            break;
        }
        case null:
            return null;
        case undefined:
            return null;
        default:
            CheckNever(type);
            return null;
    }

    // Record step execution in database
    if (result && type) {
        log.info('Recording step execution', {step: `step-${index}`, nodeId: node.id, type, success: result.success });

        await updateCampaignStep(campaignId, type, config, result.success, result.data, index, lead.organization_id, lead.id);
    }

    return result;
}

export async function leadWorkflow(input: LeadWorkflowInput) {
    const { leadId, workflow, accountId, campaignId, organizationId } = input
    const leadUpdate: LeadUpdateDto = {
        status: "Processing"
    }

    const lead = await updateLead(leadId, leadUpdate);

    // Filter out "add node" type nodes - these are UI/configuration nodes that shouldn't be executed
    const nodes = workflow.nodes.filter(it => it.type !== EAction.addStep);

    // Create a set of valid node IDs for quick lookup
    const validNodeIds = new Set(nodes.map(n => n.id));

    // Filter edges to only include those connecting valid nodes (exclude edges to/from "add step" nodes)
    const edges = workflow.edges.filter(edge =>
        validNodeIds.has(edge.source) && validNodeIds.has(edge.target)
    );

    // Build adjacency map with full edge information for conditional handling
    const adjacencyMap: Record<string, WorkflowEdge[]> = {};
    const incomingCount: Record<string, number> = {};

    nodes.forEach(n => (incomingCount[n.id] = 0));

    edges.forEach(edge => {
        if (!adjacencyMap[edge.source]) adjacencyMap[edge.source] = [];
        adjacencyMap[edge.source].push(edge);
        incomingCount[edge.target] = (incomingCount[edge.target] || 0) + 1;
    });

    let queue: string[] = nodes.filter(n => incomingCount[n.id] === 0).map(n => n.id);

    let stepIndex = 0;

    while (queue.length > 0) {
        const unipileAccountId = await verifyUnipileAccount(accountId);
        if(!unipileAccountId) {
            log.error("Unipile Account not found");
            await pauseCampaign(campaignId);
            return
        }
        const currentId = queue.shift()!;
        const currentNode = nodes.find(n => n.id === currentId);
        if (!currentNode) continue;

        // Execute the current node and store the result
        const result = await executeNode(currentNode, unipileAccountId, lead, campaignId, workflow, stepIndex);

        // Check if campaign was paused due to error - stop execution for this lead
        if (result?.data?.campaignPaused) {
            log.error('Campaign was paused due to error - stopping lead execution', {
                leadId: lead.id,
                campaignId: campaignId,
                nodeId: currentNode.id
            });
            // Update lead status to reflect the pause
            await updateLead(leadId, { status: "Failed" });
            return; // Exit this lead's workflow
        }

        // Get outgoing edges from this node
        const outgoingEdges = adjacencyMap[currentId] || [];

        for (const edge of outgoingEdges) {
            const isConditionalEdge = edge.data?.isConditionalPath === true;
            const isPositivePath = edge.data?.isPositive === true;

            // Decide whether to follow this edge
            let shouldFollowEdge = true;

            if (isConditionalEdge && result) {
                // For conditional edges, check if the path matches the result
                // isPositive=true means "accepted" path (success=true)
                // isPositive=false means "not-accepted" path (success=false)
                shouldFollowEdge = (isPositivePath && result.success) || (!isPositivePath && !result.success);
            }

            if (!shouldFollowEdge) {
                // Decrease incoming count since we're not following this edge
                incomingCount[edge.target] -= 1;
                continue;
            }

            // Apply delay if specified
            const delay = getDelayMs(edge);
            if (delay > 0) {
                // Check campaign status during delay (break delay into smaller chunks)
                const delayMs = delay;
                const checkIntervalMs = 5 * 60 * 1000; // Check every 5 minutes
                let remainingDelay = delayMs;

                while (remainingDelay > 0) {
                    const sleepDurationMs = Math.min(checkIntervalMs, remainingDelay);

                    // Convert to Temporal sleep format
                    let sleepDuration: string;
                    if (sleepDurationMs >= 3600000) {
                        // Hours
                        sleepDuration = `${Math.floor(sleepDurationMs / 3600000)} hours`;
                    } else if (sleepDurationMs >= 60000) {
                        // Minutes
                        sleepDuration = `${Math.floor(sleepDurationMs / 60000)} minutes`;
                    } else {
                        // Seconds
                        sleepDuration = `${Math.floor(sleepDurationMs / 1000)} seconds`;
                    }

                    await sleep(sleepDuration);
                    remainingDelay -= sleepDurationMs;

                    // Check campaign status during delay (if there's more delay remaining)
                    if (remainingDelay > 0) {
                        const isActive = await checkCampaignStatus(campaignId);
                        if (!isActive) {
                            log.warn('Campaign ended during delay - stopping lead execution', {
                                leadId: lead.id,
                                campaignId: campaignId
                            });
                            await updateLead(leadId, { status: "Failed" });
                            return;
                        }
                    }
                }
            }

            // Decrease incoming count and add to queue if ready
            incomingCount[edge.target] -= 1;
            if (incomingCount[edge.target] === 0) {
                queue.push(edge.target);
            }
        }
        stepIndex++;
    }
}