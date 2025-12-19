import { ApplicationFailure, Duration } from '@temporalio/common';
import { log, proxyActivities, sleep } from '@temporalio/workflow';
import { LeadResponseDto, LeadUpdateDto } from '../../dto/leads.dto';
import { EAction, EWorkflowNodeType, WorkflowEdge, WorkflowJson, WorkflowNode } from '../../types/workflow.types';
import type * as activities from '../activities';

// ActivityResult type for workflow compatibility - activities now throw ApplicationFailure instead
export type ActivityResult = {
    success: boolean;
    message?: string;
    data?: unknown;
    providerId?: string;
    lead_data?: {
        first_name: string;
        last_name: string;
        company?: string;
    };
};

const { profile_visit, like_post, comment_post, send_followup, withdraw_request, send_inmail, send_connection_request, check_connection_status, callWebhook, updateLead, verifyUnipileAccount, updateCampaignStep, extractLinkedInPublicIdentifier, checkTimeWindow, checkConnectionRequestLimits } = proxyActivities<typeof activities>({
    startToCloseTimeout: '5 minutes',
    retry: {
        initialInterval: '1s',
        maximumInterval: '30s',
        maximumAttempts: 10, // Increased for transient errors - Temporal will retry automatically
    },
});

// Utility functions for workflow use
const CheckNever = (value: never): never => {
    throw new Error(`Unhandled case: ${value}`);
};

export interface LeadWorkflowInput {
    leadId: string;
    workflow: WorkflowJson;
    accountId: string;
    campaignId: string;
    organizationId: string;
    startTime?: string | null;
    endTime?: string | null;
    timezone?: string | null;
}

function getDelayMs(edge: WorkflowEdge): number {
    if (edge.data?.delayData?.delay && edge.data?.delayData?.unit) {
        const delay = parseInt(edge.data.delayData.delay ?? '0', 10);
        switch (edge.data.delayData.unit) {
            case 's':
                return delay * 1000;
            case 'm':
                return delay * 60_000;
            case 'h':
                return delay * 3_600_000;
            case 'd':
                return delay * 86_400_000;
            case 'w':
                return delay * 604_800_000;
            default:
                CheckNever(edge.data.delayData.unit);
        }
    }
    return 0;
}

/**
 * Wait for the time window to be valid before executing a step
 */
async function waitForTimeWindow(startTime: string | null | undefined, endTime: string | null | undefined, timezone: string | null | undefined): Promise<void> {
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
            currentTime: timeWindowCheck.currentTime,
        });
        return;
    }

    // Need to wait until the window opens
    const waitMs = timeWindowCheck.waitMs;

    // Convert wait time to Temporal sleep format (compact format: "11h43m", "30s", etc.)
    let sleepDuration: Duration;
    if (waitMs >= 3600000) {
        // Hours
        const hours = Math.floor(waitMs / 3600000);
        const remainingMs = waitMs % 3600000;
        if (remainingMs >= 60000) {
            const minutes = Math.floor(remainingMs / 60000);
            sleepDuration = `${hours}h${minutes}m` as Duration;
        } else {
            sleepDuration = `${hours}h` as Duration;
        }
    } else if (waitMs >= 60000) {
        // Minutes
        const minutes = Math.floor(waitMs / 60000);
        const remainingMs = waitMs % 60000;
        if (remainingMs >= 1000) {
            const seconds = Math.floor(remainingMs / 1000);
            sleepDuration = `${minutes}m${seconds}s` as Duration;
        } else {
            sleepDuration = `${minutes}m` as Duration;
        }
    } else if (waitMs >= 1000) {
        // Seconds
        sleepDuration = `${Math.floor(waitMs / 1000)}s` as Duration;
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
        currentTime: timeWindowCheck.currentTime,
    });

    await sleep(sleepDuration);

    // Verify we're now in the window (double-check after sleep)
    const verifyCheck = await checkTimeWindow(startTime, endTime, timezone);
    if (!verifyCheck.inWindow) {
        log.warn('Still not in time window after wait, waiting additional time', {
            startTime,
            endTime,
            timezone,
            additionalWaitMs: verifyCheck.waitMs,
        });
        // Wait a bit more if still not in window (shouldn't happen, but safety check)
        if (verifyCheck.waitMs > 0) {
            const additionalWaitSeconds = Math.ceil(verifyCheck.waitMs / 1000);
            await sleep(`${additionalWaitSeconds}s` as Duration);
        }
    }
}

async function executeNode(node: WorkflowNode, accountId: string, lead: LeadResponseDto, campaignId: string, workflow: WorkflowJson, index: number, startTime?: string | null, endTime?: string | null, timezone?: string | null): Promise<ActivityResult | null> {
    // Check and wait for time window before executing the step
    await waitForTimeWindow(startTime, endTime, timezone);
    const type = node.data.type;
    const config = node.data.config ?? {};

    // Extract LinkedIn identifier
    const identifier = await extractLinkedInPublicIdentifier(lead.linkedin_url!);
    if (!identifier) {
        return { success: false, message: 'Invalid linkedin_url: Could not extract identifier' };
    }

    let result: ActivityResult | null = null;

    try {
        switch (type) {
            case EWorkflowNodeType.profile_visit: {
                const visitResult = await profile_visit(accountId, identifier, lead.campaign_id);
                result = {
                    success: true,
                    message: 'Profile visit completed',
                    providerId: visitResult.providerId,
                    lead_data: visitResult.lead_data,
                };
                break;
            }
            case EWorkflowNodeType.like_post: {
                await like_post(accountId, identifier, config || {}, lead.campaign_id);
                result = { success: true, message: 'Post liked successfully' };
                break;
            }
            case EWorkflowNodeType.comment_post: {
                await comment_post(accountId, identifier, config, lead.campaign_id);
                result = { success: true, message: 'Comment posted successfully' };
                break;
            }
            case EWorkflowNodeType.send_followup: {
                await send_followup(accountId, identifier, config, lead.campaign_id, {
                    first_name: lead.first_name,
                    last_name: lead.last_name,
                    company: lead.company,
                });
                result = { success: true, message: 'Follow-up message sent' };
                break;
            }
            case EWorkflowNodeType.withdraw_request: {
                await withdraw_request(accountId, identifier, lead.campaign_id);
                result = { success: true, message: 'Request withdrawn' };
                break;
            }
            case EWorkflowNodeType.send_inmail: {
                await send_inmail();
                result = { success: true, message: 'InMail sent successfully' };
                break;
            }
            case EWorkflowNodeType.send_connection_request: {
                log.info('Executing send_connection_request node', {
                    accountId,
                    identifier,
                    campaignId: lead.campaign_id,
                    leadId: lead.id,
                });

                // Check limits - if exceeded, wait and retry (Temporal will handle retries)
                const limitsCheck = await checkConnectionRequestLimits(campaignId);
                if (!limitsCheck.canProceed && limitsCheck.waitUntilMs) {
                    const waitMs = limitsCheck.waitUntilMs;
                    const hours = Math.floor(waitMs / 3600000);
                    const minutes = Math.floor((waitMs % 3600000) / 60000);
                    const sleepParts: string[] = [];
                    if (hours > 0) sleepParts.push(`${hours}h`);
                    if (minutes > 0) sleepParts.push(`${minutes}m`);
                    const sleepDuration = sleepParts.length > 0 ? (sleepParts.join('') as Duration) : ('1s' as Duration);
                    log.info('Connection request limit exceeded, waiting until reset', {
                        campaignId,
                        leadId: lead.id,
                        waitMs,
                        sleepDuration,
                    });
                    await sleep(sleepDuration);
                }

                // Send connection request - activities throw ApplicationFailure on errors
                const sendResult = await send_connection_request(accountId, identifier, config || {}, lead.campaign_id);

                // If already connected, return success immediately
                if (sendResult.alreadyConnected) {
                    log.info('User already connected, no polling needed', { accountId, identifier });
                    result = {
                        success: true,
                        message: 'User is already connected',
                        providerId: sendResult.providerId,
                    };
                    break;
                }

                const providerId = sendResult.providerId;
                if (!providerId) {
                    return {
                        success: false,
                        message: 'Provider ID not found in send result',
                    };
                }

                // Get polling configuration from workflow edges
                const outgoingEdges = workflow.edges.filter((edge: WorkflowEdge) => edge.source === node.id);
                const rejectedEdge = outgoingEdges.find((edge: WorkflowEdge) => edge.data?.isConditionalPath === true && edge.data?.isPositive === false);

                // Default: 10 days, poll every hour
                let totalWaitDurationMs = 10 * 24 * 60 * 60 * 1000;
                let pollInterval: Duration = '1h';
                let pollIntervalMs = 60 * 60 * 1000; // 1 hour in milliseconds

                // Use edge delay if specified
                if (rejectedEdge?.data?.delayData?.delay && rejectedEdge?.data?.delayData?.unit) {
                    const edgeDelayMs = getDelayMs(rejectedEdge);
                    if (edgeDelayMs > 0) {
                        totalWaitDurationMs = edgeDelayMs;
                        // Adjust poll interval based on total wait time
                        if (totalWaitDurationMs < 24 * 60 * 60 * 1000) {
                            pollInterval = '15m';
                            pollIntervalMs = 15 * 60 * 1000;
                        } else if (totalWaitDurationMs < 7 * 24 * 60 * 60 * 1000) {
                            pollInterval = '30m';
                            pollIntervalMs = 30 * 60 * 1000;
                        }
                    }
                }

                const totalDays = totalWaitDurationMs / (24 * 60 * 60 * 1000);
                log.info('Starting connection status polling', {
                    accountId,
                    identifier,
                    providerId,
                    totalWaitDays: totalDays,
                    pollInterval,
                });

                // Poll for connection status until accepted/rejected or timeout
                let elapsedTimeMs = 0;
                while (elapsedTimeMs < totalWaitDurationMs) {
                    await sleep(pollInterval);
                    elapsedTimeMs += pollIntervalMs;

                    try {
                        const statusResult = await check_connection_status(accountId, identifier, providerId, lead.campaign_id);

                        if (statusResult.status === 'accepted') {
                            const elapsedDays = elapsedTimeMs / (24 * 60 * 60 * 1000);
                            log.info('Connection request ACCEPTED!', { accountId, identifier, providerId, elapsedDays });
                            result = {
                                success: true,
                                message: `Connection request accepted after ${elapsedDays.toFixed(1)} day(s)`,
                                data: { status: 'accepted', daysWaited: elapsedDays },
                            };
                            break;
                        }

                        if (statusResult.status === 'rejected') {
                            const elapsedDays = elapsedTimeMs / (24 * 60 * 60 * 1000);
                            log.warn('Connection request REJECTED!', { accountId, identifier, providerId, elapsedDays });
                            result = {
                                success: false,
                                message: `Connection request rejected after ${elapsedDays.toFixed(1)} day(s)`,
                                data: { status: 'rejected', daysWaited: elapsedDays },
                            };
                            break;
                        }

                        // Still pending - continue polling
                        log.info('Connection request still pending, continuing to poll', {
                            accountId,
                            identifier,
                            elapsedDays: elapsedTimeMs / (24 * 60 * 60 * 1000),
                        });
                    } catch (error: unknown) {
                        // If ApplicationFailure with non-retryable type (422 error), stop polling
                        if (error instanceof ApplicationFailure) {
                            const errorDetails = error.details as { errorType?: string } | undefined;
                            const isNonRetryable = errorDetails?.errorType === 'Unipile422Error' || error.type === 'Unipile422Error';

                            if (isNonRetryable) {
                                log.error('Permanent error while checking connection status', {
                                    accountId,
                                    identifier,
                                    providerId,
                                    error: error.message,
                                });
                                result = {
                                    success: false,
                                    message: `Connection status check failed: ${error.message}`,
                                };
                                break;
                            }
                        }
                        // For retryable errors, continue polling - Temporal will retry the activity
                        log.warn('Transient error while checking connection status, continuing to poll', {
                            accountId,
                            identifier,
                            providerId,
                            error: error instanceof Error ? error.message : 'Unknown error',
                        });
                    }
                }

                // Timeout if no result set
                if (!result) {
                    log.warn('Connection request TIMEOUT', { accountId, identifier, totalDays });
                    result = {
                        success: false,
                        message: `Connection request not accepted within ${totalDays.toFixed(1)} day(s) (timeout)`,
                        data: { status: 'timeout', daysWaited: totalDays },
                    };
                }
                break;
            }
            case EWorkflowNodeType.webhook: {
                if (!config.webhookId) {
                    return {
                        success: false,
                        message: 'Webhook ID is required',
                    };
                }
                const webhookResult = await callWebhook(config.webhookId, lead.id);
                result = {
                    success: webhookResult.success,
                    message: webhookResult.message,
                };
                break;
            }
            case null:
            case undefined:
                return null;
            default:
                CheckNever(type);
                return null;
        }
    } catch (error: unknown) {
        // Handle ApplicationFailure errors from activities
        if (error instanceof ApplicationFailure) {
            const errorDetails = error.details as { errorType?: string } | undefined;
            const isNonRetryable = errorDetails?.errorType === 'Unipile422Error' || error.type === 'Unipile422Error';

            // Non-retryable errors (422) = permanent failure
            if (isNonRetryable) {
                log.error('Permanent error in node execution', {
                    nodeId: node.id,
                    nodeType: type,
                    error: error.message,
                    errorType: error.type,
                });
                result = {
                    success: false,
                    message: error.message || 'Permanent error occurred',
                    data: { errorType: error.type },
                };
            } else {
                // Retryable errors - rethrow so Temporal can retry
                throw error;
            }
        } else {
            // Unexpected error - log and return failure
            log.error('Unexpected error in node execution', {
                nodeId: node.id,
                nodeType: type,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            result = {
                success: false,
                message: error instanceof Error ? error.message : 'Unexpected error occurred',
            };
        }
    }

    // Record step execution in database
    if (result && type) {
        log.info('Recording step execution', { step: `step-${index}`, nodeId: node.id, type, success: result.success });
        await updateCampaignStep(campaignId, type, config, result.success, (result.data || {}) as Record<string, unknown>, index, lead.organization_id, lead.id);
    }

    return result;
}

export async function leadWorkflow(input: LeadWorkflowInput) {
    const { leadId, workflow, accountId, campaignId, organizationId, startTime, endTime, timezone } = input;
    const leadUpdate: LeadUpdateDto = {
        status: 'Processing',
    };

    const lead = await updateLead(leadId, leadUpdate);

    // Filter out "add node" type nodes - these are UI/configuration nodes that shouldn't be executed
    const nodes = workflow.nodes.filter(it => it.type !== EAction.addStep);

    // Create a set of valid node IDs for quick lookup
    const validNodeIds = new Set(nodes.map(n => n.id));

    // Filter edges to only include those connecting valid nodes (exclude edges to/from "add step" nodes)
    const edges = workflow.edges.filter(edge => validNodeIds.has(edge.source) && validNodeIds.has(edge.target));

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
            log.error('Unipile Account not found - cannot continue lead execution', { leadId, accountId });
            await updateLead(leadId, { status: 'Failed' });
            return;
        }
        const currentId = queue.shift()!;
        const currentNode = nodes.find(n => n.id === currentId);
        if (!currentNode) continue;

        // Execute the current node and store the result
        const result = await executeNode(currentNode, unipileAccountId, lead, campaignId, workflow, stepIndex, startTime, endTime, timezone);

        // If node execution failed with permanent error, mark lead as failed and stop
        if (result && !result.success) {
            const errorData = result.data as { errorType?: string } | undefined;
            const isPermanentError = errorData?.errorType === 'Unipile422Error';

            if (isPermanentError) {
                log.error('Permanent error occurred - stopping lead execution and marking as failed', {
                    leadId,
                    accountId,
                    campaignId,
                    nodeId: currentNode.id,
                    nodeType: currentNode.data.type,
                    errorMessage: result.message,
                    errorData: result.data,
                });
                await updateLead(leadId, { status: 'Failed' });
                return; // Stop workflow execution for this lead
            }
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
                // Convert delay to Temporal sleep format and wait (compact format: "11h43m", "30s", etc.)
                // Note: Once a lead starts, it continues regardless of campaign state
                let sleepDuration: Duration;
                if (delay >= 3600000) {
                    // Hours
                    sleepDuration = `${Math.floor(delay / 3600000)}h` as Duration;
                } else if (delay >= 60000) {
                    // Minutes
                    sleepDuration = `${Math.floor(delay / 60000)}m` as Duration;
                } else if (delay >= 1000) {
                    // Seconds
                    sleepDuration = `${Math.floor(delay / 1000)}s` as Duration;
                } else {
                    // Less than 1 second, use minimum 1 second
                    sleepDuration = '1s' as Duration;
                }

                log.info('Waiting before next step', {
                    leadId: lead.id,
                    delayMs: delay,
                    sleepDuration,
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
