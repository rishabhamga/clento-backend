import { log, proxyActivities, sleep } from '@temporalio/workflow';
import type * as activities from '../activities';
import { ActivityResult, LeadWorkflowInput } from './leadWorkflow';
import { LeadResponseDto, LeadUpdateDto } from '../../dto/leads.dto';
import { EAction, EWorkflowNodeType, WorkflowEdge, WorkflowJson, WorkflowNode } from '../../types/workflow.types';
import logger from '../../utils/logger';

const { profile_visit, like_post, comment_post, send_followup, withdraw_request, send_inmail, send_connection_request, check_connection_status, updateLead, verifyUnipileAccount, updateCampaignStep, extractLinkedInPublicIdentifier, checkTimeWindow, checkConnectionRequestLimits } = proxyActivities<typeof activities>({
    startToCloseTimeout: '5 minutes',
    retry: {
        initialInterval: '1s',
        maximumInterval: '30s',
        maximumAttempts: 3,
    },
});

// Utility functions for workflow use
const CheckNever = (value: never): never => {
    throw new Error(`Unhandled case: ${value}`);
};

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

async function waitForTimeWindow(startTime: string | null | undefined, endTime: string | null | undefined, timezone: string | null | undefined) {
    if (!startTime || !endTime) return;

    let w = await checkTimeWindow(startTime, endTime, timezone);
    if (w.inWindow) return;

    // w.waitMs is already milliseconds → just sleep
    await sleepMs(w.waitMs);

    // safety recheck
    w = await checkTimeWindow(startTime, endTime, timezone);
    if (!w.inWindow && w.waitMs > 0) {
        await sleepMs(w.waitMs);
    }
}

async function sleepMs(ms: number) {
    const hours = ms / 3600000;
    await sleep(`${hours} hours`);
}

const executeNode = async (node: WorkflowNode, accountId: string, lead: LeadResponseDto, campaignId: string, workflow: WorkflowJson, index: number, startTime?: string | null, endTime?: string | null, timezone?: string | null): Promise<ActivityResult | null> => {
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
        logger.error('Failed to extract public identifier from linkedin_url', { linkedin_url: lead.linkedin_url, error });
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
                company: lead.company,
            });
            break;
        case EWorkflowNodeType.withdraw_request:
            result = await withdraw_request(accountId, identifier, lead.campaign_id);
            break;
        case EWorkflowNodeType.send_inmail:
            result = await send_inmail();
            break;
        case EWorkflowNodeType.send_connection_request: {
            log.info('Executing send_connection_request node', {
                accountId,
                identifier,
                campaignId: lead.campaign_id,
                leadId: lead.id,
            });

            // -----------------------------------------
            // 1. Check LinkedIn daily/weekly limits
            // -----------------------------------------
            const limitsCheck = await checkAndWaitConnectionLimits(campaignId, { accountId, identifier, leadId: lead.id });

            if (!limitsCheck.canProceed) {
                result = limitsCheck.failureResult;
                break;
            }

            // -----------------------------------------
            // 2. Attempt the send, retrying if provider
            //    imposes a temporary limit (24 hours)
            // -----------------------------------------
            const sendResult = await retryUntilProviderLimitClears(() => send_connection_request(accountId, identifier, config || {}, lead.campaign_id));

            // If null — treat as transient error
            if (!sendResult) {
                result = {
                    success: false,
                    message: 'Unexpected empty send result',
                    data: { error: { type: 'unknown', message: 'Provider returned null' } },
                };
                break;
            }

            // -----------------------------------------
            // 3. If already connected, finish immediately
            // -----------------------------------------
            if (sendResult?.data?.alreadyConnected) {
                log.info('User already connected — skipping polling', {
                    accountId,
                    identifier,
                    leadId: lead.id,
                });

                result = sendResult;
                break;
            }

            // -----------------------------------------
            // 4. Extract providerId for polling
            // -----------------------------------------
            const providerId = sendResult?.data?.providerId;

            if (!providerId) {
                log.error('No providerId returned after sending request', {
                    accountId,
                    identifier,
                    campaignId,
                    leadId: lead.id,
                    sendResult,
                });

                result = {
                    success: false,
                    message: 'Provider ID missing in send connection response',
                    data: {
                        error: {
                            type: 'provider_id_missing',
                            message: 'Connection request was sent but provider ID was not returned',
                            sendResult,
                        },
                    },
                };
                break;
            }

            // -----------------------------------------
            // 5. Prepare polling config
            // -----------------------------------------
            const rejectedEdge = workflow.edges.find(e => e.source === node.id && e.data?.isConditionalPath === true && e.data?.isPositive === false);

            const { totalWaitMs, pollMs, pollText } = getPollingConfig(rejectedEdge);

            // -----------------------------------------
            // 6. Poll until accepted / rejected / timeout
            // -----------------------------------------
            result = await pollUntilResolved(accountId, identifier, providerId, campaignId, totalWaitMs, pollMs, pollText);

            break;
        }
        case null:
            return null;
        case undefined:
            return null;
        default:
            CheckNever(type);
    }
    return result;
};

// Types used by the helper (adjust imports if these are declared elsewhere)
type LimitsCheck = {
    canProceed: boolean;
    waitUntilMs?: number | null;
    // other fields allowed
};

// Helper return type
type LimitsCheckOutcome = { canProceed: true } | { canProceed: false; failureResult: ActivityResult };

//
// NOTE: this function expects `checkConnectionRequestLimits` and `sleep`
// to be in scope (your proxyActivities and Temporal sleep).
//
export async function checkAndWaitConnectionLimits(campaignId: string, ctx: { accountId?: string; identifier?: string; leadId?: string | number }): Promise<LimitsCheckOutcome> {
    const msToSleepString = (ms: number): string => {
        if (ms <= 0) return '0 seconds';
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);

        const parts: string[] = [];
        if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
        if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
        if (seconds > 0 && hours === 0) parts.push(`${seconds} second${seconds > 1 ? 's' : ''}`);

        return parts.length > 0 ? parts.join(' ') : '1 second';
    };
    let limits: LimitsCheck;
    try {
        limits = await checkConnectionRequestLimits(campaignId);
    } catch (err: any) {
        log.error('Failed to check connection request limits', { campaignId, ...ctx, error: err?.message ?? err });
        return {
            canProceed: false,
            failureResult: {
                success: false,
                message: 'Failed to check connection request limits',
                data: {
                    error: {
                        type: 'limits_check_failed',
                        message: err?.message ?? 'Unknown error when checking connection request limits',
                    },
                },
            },
        };
    }

    if (limits.canProceed) return { canProceed: true };

    const waitMs = limits.waitUntilMs ?? 0;
    if (waitMs > 0) {
        const sleepDuration = msToSleepString(waitMs);
        log.info('Connection request limit exceeded — waiting until reset', {
            campaignId,
            ...ctx,
            waitMs,
            sleepDuration,
        });

        try {
            await sleep(sleepDuration);
        } catch (err: any) {
            // sleep shouldn't normally throw in Temporal, but guard anyway
            log.error('Error while sleeping for connection limit reset', { campaignId, ...ctx, error: err?.message ?? err });
            return {
                canProceed: false,
                failureResult: {
                    success: false,
                    message: 'Error while waiting for connection limit reset',
                    data: {
                        error: {
                            type: 'limits_sleep_failed',
                            message: err?.message ?? 'Error during sleep before retrying limit check',
                        },
                    },
                },
            };
        }

        try {
            limits = await checkConnectionRequestLimits(campaignId);
        } catch (err: any) {
            log.error('Failed to re-check connection request limits after waiting', { campaignId, ...ctx, error: err?.message ?? err });
            return {
                canProceed: false,
                failureResult: {
                    success: false,
                    message: 'Failed to re-check connection request limits after waiting',
                    data: {
                        error: {
                            type: 'limits_check_failed_after_wait',
                            message: err?.message ?? 'Unknown error when re-checking limits',
                        },
                    },
                },
            };
        }
    }

    if (limits.canProceed) return { canProceed: true };

    return {
        canProceed: false,
        failureResult: {
            success: false,
            message: 'Connection request limit exceeded',
            data: {
                error: {
                    type: 'connection_request_limit_exceeded',
                    message: 'Daily or weekly connection request limit has been exceeded',
                },
            },
        },
    };
}

async function retryUntilProviderLimitClears(fn: () => Promise<ActivityResult | null>): Promise<ActivityResult | null> {
    while (true) {
        const res = await fn();

        // If null → return immediately
        if (res === null) return null;

        // If success → stop retrying
        if (res.success) return res;

        const err = res.data?.error;

        // If it's NOT your provider-limit error → return it
        if (!err || err.type !== 'provider_limit_reached' || err.shouldRetry !== true) {
            return res;
        }

        // Exactly use your retryAfterHours (default 24)
        const retryAfterHours = err.retryAfterHours ?? 24;

        await sleep(`${retryAfterHours} hours`);
    }
}

// -----------------------------------------------------
// 1. Compute polling config from edges
// -----------------------------------------------------
function getPollingConfig(rejectedEdge?: WorkflowEdge) {
    let totalWaitMs = 10 * 24 * 60 * 60 * 1000; // default 10 days
    let pollMs = 60 * 60 * 1000; // default 1 hour
    let pollText = '1 hour';

    const edgeMs = rejectedEdge ? getDelayMs(rejectedEdge) : 0;

    if (edgeMs > 0) {
        totalWaitMs = edgeMs;

        if (edgeMs < 24 * 60 * 60 * 1000) {
            pollMs = 15 * 60 * 1000;
            pollText = '15 minutes';
        } else if (edgeMs < 7 * 24 * 60 * 60 * 1000) {
            pollMs = 30 * 60 * 1000;
            pollText = '30 minutes';
        }
    }

    return { totalWaitMs, pollMs, pollText };
}

// -----------------------------------------------------
// 2. Evaluate status result: accepted / rejected / pending
// -----------------------------------------------------
function evaluateStatus(statusResult: ActivityResult, elapsedMs: number) {
    const hours = elapsedMs / (60 * 60 * 1000);
    const days = elapsedMs / (24 * 60 * 60 * 1000);

    if (statusResult.success && statusResult.data?.status === 'accepted') {
        return {
            done: true,
            result: {
                success: true,
                message: `Connection accepted after ${days.toFixed(1)} day(s)`,
                data: { connected: true, hoursWaited: hours, daysWaited: days, status: 'accepted' },
            },
        };
    }

    if (statusResult.data?.status === 'rejected') {
        return {
            done: true,
            result: {
                success: false,
                message: `Connection rejected after ${days.toFixed(1)} day(s)`,
                data: { connected: false, hoursWaited: hours, daysWaited: days, status: 'rejected' },
            },
        };
    }

    return {
        done: false,
        result: {
            success: false,
            message: `Connection request not accepted within ${days.toFixed(1)} day(s)`,
            data: {
                connected: false,
                daysWaited: days,
                hoursWaited: days * 24,
                status: 'timeout',
            },
        },
    };
}

function msToTemporalDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    return `${seconds} seconds`;
}

// -----------------------------------------------------
// 3. Polling Loop (super small)
// -----------------------------------------------------
async function pollUntilResolved(accountId: string, identifier: string, providerId: string, campaignId: string, totalWaitMs: number, pollMs: number, pollText: string): Promise<ActivityResult> {
    let elapsedMs = 0;

    while (elapsedMs < totalWaitMs) {
        const remainingMs = totalWaitMs - elapsedMs;
        const waitMs = Math.min(pollMs, remainingMs);

        if (waitMs > 0) {
            await sleep(msToTemporalDuration(waitMs));
            elapsedMs += waitMs;
        }

        let status: ActivityResult | null = null;
        try {
            status = await check_connection_status(accountId, identifier, providerId, campaignId);
        } catch {
            continue; // ignore and continue polling
        }

        if (status) {
            const evaluation = evaluateStatus(status, elapsedMs);
            if (evaluation.done) {
                return evaluation.result; // ALWAYS ActivityResult
            }
        }
    }

    // FINAL RETURN — ALWAYS ActivityResult
    const days = totalWaitMs / (24 * 60 * 60 * 1000);
    return {
        success: false,
        message: `Connection request not accepted within ${days.toFixed(1)} day(s)`,
        data: {
            connected: false,
            timeoutReached: true,
            status: 'timeout',
            daysWaited: days,
            hoursWaited: days * 24,
        },
    };
}

export const leadWorkflow = async (input: LeadWorkflowInput) => {
    const { leadId, workflow, accountId, campaignId, organizationId, startTime, endTime, timezone } = input;

    const leadUpdate: LeadUpdateDto = { status: 'Processing' };
    const lead = await updateLead(leadId, leadUpdate);

    const nodes = workflow.nodes.filter(n => n.type !== EAction.addStep);
    const validNodeIds = new Set(nodes.map(n => n.id));

    const adjacencyMap: Record<string, WorkflowEdge[]> = {};
    const incomingCount: Record<string, number> = {};

    for (const node of nodes) {
        incomingCount[node.id] = 0;
    }
    const edges: WorkflowEdge[] = [];
    for (const edge of workflow.edges) {
        if (!validNodeIds.has(edge.source) || !validNodeIds.has(edge.target)) continue;
        edges.push(edge);
        if (!adjacencyMap[edge.source]) adjacencyMap[edge.source] = [];
        adjacencyMap[edge.source].push(edge);
        incomingCount[edge.target] += 1;
    }
    const queue = nodes.filter(n => incomingCount[n.id] === 0).map(n => n.id);

    let stepIndex = 0;

    while (queue.length > 0) {
        const unipileAccountId = await verifyUnipileAccount(accountId);
        if (!unipileAccountId) {
            logger.error('Unipile Account not found - cannot continue lead execution', { leadId, accountId });
            await updateLead(leadId, { status: 'Failed' });
            return;
        }
        const currentId = queue.shift()!;
        const currentNode = nodes.find(n => n.id === currentId);

        if (!currentNode) continue;

        // Execute the current node and store the result
        const result = await executeNode(currentNode, unipileAccountId, lead, campaignId, workflow, stepIndex, startTime, endTime, timezone);

        const outgoingEdges = adjacencyMap[currentId] || [];

        for (const edge of outgoingEdges) {
            const isConditional = edge.data?.isConditionalPath === true;
            const isPositive = edge.data?.isPositive === true;

            // Decide whether this edge should be followed
            let shouldFollow = true;

            if (isConditional && result) {
                const wasSuccess = result.success === true;
                shouldFollow = isPositive ? wasSuccess : !wasSuccess;
            }

            if (!shouldFollow) {
                // We are *not* taking this edge, reduce indegree so the graph stays consistent
                incomingCount[edge.target] -= 1;
                continue;
            }

            // Apply configured delay (Temporal-safe)
            const delayMs = getDelayMs(edge);
            if (delayMs > 0) {
                const delayStr = msToTemporalDuration(delayMs);

                log.info('Waiting before next step', {
                    leadId: lead.id,
                    delayMs,
                    delayStr,
                });

                await sleep(delayStr);
            }

            // Follow the edge and queue if it's ready
            incomingCount[edge.target] -= 1;
            if (incomingCount[edge.target] === 0) {
                queue.push(edge.target);
            }
        }

        stepIndex++;
    }
};
