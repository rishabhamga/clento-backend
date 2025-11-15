import { log, proxyActivities, sleep } from "@temporalio/workflow";
import { LeadResponseDto, LeadUpdateDto } from "../../dto/leads.dto";
import { EAction, EWorkflowNodeType, WorkflowEdge, WorkflowJson, WorkflowNode } from "../../types/workflow.types";
import type * as activities from "../activities";

// Import ActivityResult type
export type ActivityResult = {
    success: boolean;
    message?: string;
    data?: any;
    providerId?: string;
    lead_data?: {
        first_name: string;
        last_name: string;
        company?: string;
    }
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
    updateCampaignStep,
    extractLinkedInPublicIdentifier,
    checkTimeWindow
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
    organizationId: string,
    startTime?: string | null,
    endTime?: string | null,
    timezone?: string | null
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

/**
 * Wait for the time window to be valid before executing a step
 */
async function waitForTimeWindow(
    startTime: string | null | undefined,
    endTime: string | null | undefined,
    timezone: string | null | undefined
): Promise<void> {
    // If no time restrictions, proceed immediately
    if (!startTime || !endTime) {
        return;
    }

    const timeWindowCheck = await checkTimeWindow(startTime, endTime, timezone);

    if (timeWindowCheck.inWindow) {
        log.info('Current time is within allowed window', {
            startTime,
            endTime,
            timezone,
            currentTime: timeWindowCheck.currentTime
        });
        return;
    }

    // Need to wait until the window opens
    const waitMs = timeWindowCheck.waitMs;

    // Convert wait time to Temporal sleep format
    let sleepDuration: string;
    if (waitMs >= 3600000) {
        // Hours
        const hours = Math.floor(waitMs / 3600000);
        const remainingMs = waitMs % 3600000;
        if (remainingMs >= 60000) {
            const minutes = Math.floor(remainingMs / 60000);
            sleepDuration = `${hours} hours ${minutes} minutes`;
        } else {
            sleepDuration = `${hours} hours`;
        }
    } else if (waitMs >= 60000) {
        // Minutes
        const minutes = Math.floor(waitMs / 60000);
        const remainingMs = waitMs % 60000;
        if (remainingMs >= 1000) {
            const seconds = Math.floor(remainingMs / 1000);
            sleepDuration = `${minutes} minutes ${seconds} seconds`;
        } else {
            sleepDuration = `${minutes} minutes`;
        }
    } else if (waitMs >= 1000) {
        // Seconds
        sleepDuration = `${Math.floor(waitMs / 1000)} seconds`;
    } else {
        // Less than 1 second, proceed immediately
        return;
    }

    log.info('Waiting for time window to open', {
        startTime,
        endTime,
        timezone,
        waitMs,
        sleepDuration,
        currentTime: timeWindowCheck.currentTime
    });

    await sleep(sleepDuration);

    // Verify we're now in the window (double-check after sleep)
    const verifyCheck = await checkTimeWindow(startTime, endTime, timezone);
    if (!verifyCheck.inWindow) {
        log.warn('Still not in time window after wait, waiting additional time', {
            startTime,
            endTime,
            timezone,
            additionalWaitMs: verifyCheck.waitMs
        });
        // Wait a bit more if still not in window (shouldn't happen, but safety check)
        if (verifyCheck.waitMs > 0) {
            const additionalWaitSeconds = Math.ceil(verifyCheck.waitMs / 1000);
            await sleep(`${additionalWaitSeconds} seconds`);
        }
    }
}

async function executeNode(
    node: WorkflowNode,
    accountId: string,
    lead: LeadResponseDto,
    campaignId: string,
    workflow: WorkflowJson,
    index: number,
    startTime?: string | null,
    endTime?: string | null,
    timezone?: string | null
): Promise<ActivityResult | null> {
    // Check and wait for time window before executing the step
    await waitForTimeWindow(startTime, endTime, timezone);
    const type = node.data.type;
    const config = node.data.config ?? {};
    let identifier: string;

    try {
        const extractedIdentifier = await extractLinkedInPublicIdentifier(lead.linkedin_url!);
        if (!extractedIdentifier) {
            return { success: false, message: 'Invalid linkedin_url: Could not extract identifier' };
        }
        identifier = extractedIdentifier as string;
    } catch (error) {
        log.error('Failed to extract public identifier from linkedin_url', { linkedin_url: lead.linkedin_url, error });
        return { success: false, message: 'Invalid linkedin_url: Failed to extract identifier' };
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
            result = await send_followup(accountId, identifier, config, lead.campaign_id, {
                first_name: lead.first_name,
                last_name: lead.last_name,
                company: lead.company
            });
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

            // Default values: 10 days = 240 hours, check every hour
            let totalWaitDurationMs = 10 * 24 * 60 * 60 * 1000; // 10 days in milliseconds (default)
            let pollIntervalMs = 60 * 60 * 1000; // 1 hour in milliseconds (default)
            let pollInterval = '1 hour'; // Temporal sleep format

            // If edge has delayData, use it to calculate total wait time
            if (rejectedEdge?.data?.delayData?.delay && rejectedEdge?.data?.delayData?.unit) {
                const edgeDelayMs = getDelayMs(rejectedEdge);
                if (edgeDelayMs > 0) {
                    totalWaitDurationMs = edgeDelayMs;

                    // Calculate polling interval based on total wait time
                    // Poll every hour, but if total wait is less than a day, poll more frequently
                    if (totalWaitDurationMs < 24 * 60 * 60 * 1000) {
                        // Less than 1 day: poll every 15 minutes
                        pollIntervalMs = 15 * 60 * 1000;
                        pollInterval = '15 minutes';
                    } else if (totalWaitDurationMs < 7 * 24 * 60 * 60 * 1000) {
                        // Less than 7 days: poll every 30 minutes
                        pollIntervalMs = 30 * 60 * 1000;
                        pollInterval = '30 minutes';
                    } else {
                        // 7+ days: poll every hour
                        pollIntervalMs = 60 * 60 * 1000;
                        pollInterval = '1 hour';
                    }
                }
            }

            // Calculate number of polling attempts needed
            const maxAttempts = Math.ceil(totalWaitDurationMs / pollIntervalMs);
            const totalDays = totalWaitDurationMs / (24 * 60 * 60 * 1000);

            log.info('Connection request sent, starting polling', {
                accountId,
                identifier,
                providerId,
                totalWaitDurationMs,
                totalWaitDays: totalDays,
                pollIntervalMs,
                pollInterval,
                maxAttempts,
                delayFromEdge: rejectedEdge?.data?.delayData
            });

            // Wait and poll for connection status
            let attempt = 0;
            let elapsedTimeMs = 0;

            while (elapsedTimeMs < totalWaitDurationMs) {
                attempt++;

                // Calculate remaining wait time
                const remainingTimeMs = totalWaitDurationMs - elapsedTimeMs;
                const waitTimeMs = Math.min(pollIntervalMs, remainingTimeMs);

                // Convert to Temporal sleep format
                let sleepDuration: string;
                if (waitTimeMs >= 3600000) {
                    // Hours
                    sleepDuration = `${Math.floor(waitTimeMs / 3600000)} hours`;
                } else if (waitTimeMs >= 60000) {
                    // Minutes
                    sleepDuration = `${Math.floor(waitTimeMs / 60000)} minutes`;
                } else if (waitTimeMs >= 1000) {
                    // Seconds
                    sleepDuration = `${Math.floor(waitTimeMs / 1000)} seconds`;
                } else {
                    // Less than 1 second, skip to status check
                    sleepDuration = '0 seconds';
                }

                if (waitTimeMs > 0) {
                    log.info('Waiting before next status check', {
                        attempt,
                        maxAttempts,
                        waitTime: sleepDuration,
                        elapsedTimeMs,
                        elapsedDays: elapsedTimeMs / (24 * 60 * 60 * 1000),
                        remainingTimeMs,
                        remainingDays: remainingTimeMs / (24 * 60 * 60 * 1000)
                    });
                    await sleep(sleepDuration);
                    elapsedTimeMs += waitTimeMs;
                }

                // Only check status if we haven't exceeded total wait time
                if (elapsedTimeMs >= totalWaitDurationMs) {
                    log.info('Total wait time elapsed, performing final status check', {
                        accountId,
                        identifier,
                        totalWaitDurationMs,
                        totalWaitDays: totalDays,
                        elapsedTimeMs
                    });
                }

                log.info('Checking connection status (activity call)', {
                    accountId,
                    identifier,
                    providerId,
                    attempt,
                    maxAttempts,
                    elapsedTimeMs,
                    elapsedDays: elapsedTimeMs / (24 * 60 * 60 * 1000),
                    remainingTimeMs: totalWaitDurationMs - elapsedTimeMs,
                    remainingDays: (totalWaitDurationMs - elapsedTimeMs) / (24 * 60 * 60 * 1000)
                });

                // Call activity to check status
                const statusResult = await check_connection_status(accountId, identifier, providerId, lead.campaign_id);

                // Check if accepted
                if (statusResult.success && statusResult.data?.status === 'accepted') {
                    const elapsedHours = elapsedTimeMs / (60 * 60 * 1000);
                    const elapsedDays = elapsedTimeMs / (24 * 60 * 60 * 1000);
                    log.info('Connection request ACCEPTED!', {
                        accountId,
                        identifier,
                        attemptNumber: attempt,
                        elapsedTimeMs,
                        elapsedHours,
                        elapsedDays
                    });
                    result = {
                        success: true,
                        message: `Connection request accepted after ${elapsedDays.toFixed(1)} day(s)`,
                        data: {
                            connected: true,
                            hoursWaited: elapsedHours,
                            daysWaited: elapsedDays,
                            status: 'accepted'
                        }
                    };
                    break;
                }

                // Check if rejected
                if (statusResult.data?.status === 'rejected') {
                    const elapsedHours = elapsedTimeMs / (60 * 60 * 1000);
                    const elapsedDays = elapsedTimeMs / (24 * 60 * 60 * 1000);
                    log.warn('Connection request REJECTED!', {
                        accountId,
                        identifier,
                        attemptNumber: attempt,
                        elapsedTimeMs,
                        elapsedHours,
                        elapsedDays
                    });
                    result = {
                        success: false,
                        message: `Connection request rejected after ${elapsedDays.toFixed(1)} day(s)`,
                        data: {
                            connected: false,
                            hoursWaited: elapsedHours,
                            daysWaited: elapsedDays,
                            status: 'rejected'
                        }
                    };
                    break;
                }

                // Still pending, continue polling if we haven't exceeded total wait time
                if (elapsedTimeMs >= totalWaitDurationMs) {
                    log.info('Total wait time reached, connection still pending', {
                        accountId,
                        identifier,
                        totalWaitDurationMs,
                        totalWaitDays: totalDays,
                        elapsedTimeMs
                    });
                    break;
                }

                log.info('Connection request still pending, continuing to poll', {
                    accountId,
                    identifier,
                    attempt,
                    maxAttempts,
                    elapsedTimeMs,
                    elapsedDays: elapsedTimeMs / (24 * 60 * 60 * 1000),
                    remainingTimeMs: totalWaitDurationMs - elapsedTimeMs,
                    remainingDays: (totalWaitDurationMs - elapsedTimeMs) / (24 * 60 * 60 * 1000)
                });
            }

            // Timeout after total wait duration if result not set
            if (!result) {
                log.warn('Connection request TIMEOUT - total wait time elapsed', {
                    accountId,
                    identifier,
                    totalWaitDurationMs,
                    totalWaitDays: totalDays,
                    totalAttempts: attempt,
                    elapsedTimeMs
                });
                result = {
                    success: false,
                    message: `Connection request not accepted within ${totalDays.toFixed(1)} day(s) (timeout)`,
                    data: {
                        connected: false,
                        timeoutReached: true,
                        status: 'timeout',
                        daysWaited: totalDays,
                        hoursWaited: totalDays * 24
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
        log.info('Recording step execution', { step: `step-${index}`, nodeId: node.id, type, success: result.success });

        await updateCampaignStep(campaignId, type, config, result.success, result.data, index, lead.organization_id, lead.id);
    }

    return result;
}

export async function leadWorkflow(input: LeadWorkflowInput) {
    const { leadId, workflow, accountId, campaignId, organizationId, startTime, endTime, timezone } = input
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
        if (!unipileAccountId) {
            log.error("Unipile Account not found - cannot continue lead execution", { leadId, accountId });
            await updateLead(leadId, { status: "Failed" });
            return;
        }
        const currentId = queue.shift()!;
        const currentNode = nodes.find(n => n.id === currentId);
        if (!currentNode) continue;

        // Execute the current node and store the result
        const result = await executeNode(currentNode, unipileAccountId, lead, campaignId, workflow, stepIndex, startTime, endTime, timezone);

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
                // Convert delay to Temporal sleep format and wait
                // Note: Once a lead starts, it continues regardless of campaign state
                let sleepDuration: string;
                if (delay >= 3600000) {
                    // Hours
                    sleepDuration = `${Math.floor(delay / 3600000)} hours`;
                } else if (delay >= 60000) {
                    // Minutes
                    sleepDuration = `${Math.floor(delay / 60000)} minutes`;
                } else if (delay >= 1000) {
                    // Seconds
                    sleepDuration = `${Math.floor(delay / 1000)} seconds`;
                } else {
                    // Less than 1 second, use minimum 1 second
                    sleepDuration = '1 second';
                }

                log.info('Waiting before next step', {
                    leadId: lead.id,
                    delayMs: delay,
                    sleepDuration
                });

                await sleep(sleepDuration);
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