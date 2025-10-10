import { log, proxyActivities, sleep } from "@temporalio/workflow";
import { LeadResponseDto, LeadUpdateDto } from "../../dto/leads.dto";
import { EAction, EWorkflowNodeType, WorkflowEdge, WorkflowJson, WorkflowNode } from "../../types/workflow.types"
import type * as activities from "../activities";

// Import ActivityResult type
export type ActivityResult = {
    success: boolean;
    message?: string;
    data?: any;
    providerId?: string;
};

const { profile_visit, like_post, comment_post, send_followup, withdraw_request, send_inmail, send_connection_request, check_connection_status, updateLead, verifyUnipileAccount } = proxyActivities<typeof activities>({
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

async function executeNode(node: WorkflowNode, accountId: string, lead: LeadResponseDto): Promise<ActivityResult | null> {
    const type = node.data.type;
    const config = node.data.config || {};
    // const identifier = lead.linkedin_url?.split('/').pop();
    // if(!identifier){
    //     return {success: false, message: 'Identifier not found so skipping the node'}
    // }
    const identifier = 'ankur-parchani-267b2b20a'

    switch (type) {
        case EWorkflowNodeType.profile_visit: return await profile_visit(accountId, identifier);
        case EWorkflowNodeType.like_post: return await like_post(accountId, identifier, config?.recentPostDays || 7);
        case EWorkflowNodeType.comment_post: return await comment_post(accountId, identifier, config);
        case EWorkflowNodeType.send_followup: return await send_followup();
        case EWorkflowNodeType.withdraw_request: return await withdraw_request(accountId, identifier);
        case EWorkflowNodeType.send_inmail: return await send_inmail();
        case EWorkflowNodeType.send_connection_request: {
            log.info('Executing send_connection_request node', { accountId, identifier });
            const sendResult = await send_connection_request(accountId, identifier, config?.customMessage || 'YO YO YO YO YO YO');

            // If request failed to send or user already connected, return immediately
            if (!sendResult.success) {
                log.error('Failed to send connection request', { result: sendResult });
                return sendResult;
            }

            // If already connected, return success
            if (sendResult.data?.alreadyConnected) {
                log.info('User already connected, no polling needed', { accountId, identifier });
                return sendResult;
            }

            // Get providerId from the send result
            const providerId = sendResult.data?.providerId;
            if (!providerId) {
                log.error('No providerId in send result', { sendResult });
                return { success: false, message: 'Provider ID not found in send result' };
            }

            log.info('Connection request sent, starting polling', {
                accountId,
                identifier,
                providerId,
                maxDays: 10,
                pollInterval: '1 hour'
            });

            // Poll for connection status for up to 10 days
            const maxAttempts = 240; // 10 days * 24 hours
            const pollInterval = '1 hour';

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                // Wait 1 hour before checking
                log.info('Waiting before next status check', {
                    attempt,
                    maxAttempts,
                    waitTime: pollInterval
                });
                await sleep('10 seconds');

                log.info('Checking connection status (activity call)', {
                    accountId,
                    identifier,
                    providerId,
                    attempt,
                    maxAttempts
                });

                // Call activity to check status
                const statusResult = await check_connection_status(accountId, identifier, providerId);

                // Check if accepted
                if (statusResult.success && statusResult.data?.status === 'accepted') {
                    log.info('Connection request ACCEPTED!', {
                        accountId,
                        identifier,
                        attemptNumber: attempt,
                        hoursWaited: attempt
                    });
                    return {
                        success: true,
                        message: `Connection request accepted after ${attempt} hour(s)`,
                        data: {
                            connected: true,
                            hoursWaited: attempt,
                            status: 'accepted'
                        }
                    };
                }

                // Check if rejected
                if (statusResult.data?.status === 'rejected') {
                    log.warn('Connection request REJECTED!', {
                        accountId,
                        identifier,
                        attemptNumber: attempt,
                        hoursWaited: attempt
                    });
                    return {
                        success: false,
                        message: `Connection request rejected after ${attempt} hour(s)`,
                        data: {
                            connected: false,
                            hoursWaited: attempt,
                            status: 'rejected'
                        }
                    };
                }

                // Still pending, continue polling
                log.info('Connection request still pending, continuing to poll', {
                    accountId,
                    identifier,
                    attempt,
                    remainingAttempts: maxAttempts - attempt
                });
            }

            // Timeout after 10 days
            log.warn('Connection request TIMEOUT - 10 days elapsed', {
                accountId,
                identifier,
                totalDays: 10,
                totalAttempts: maxAttempts
            });
            return {
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
        case null: return null;
        case undefined: return null;
        default:
            CheckNever(type);
            return null;
    }
}

export async function leadWorkflow(input: LeadWorkflowInput) {
    const { leadId, workflow, accountId } = input
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

    while (queue.length > 0) {
        const unipileAccountId = await verifyUnipileAccount(accountId);
        if(!unipileAccountId) {
            log.error("Unipile Account not found")
            return
        }
        const currentId = queue.shift()!;
        const currentNode = nodes.find(n => n.id === currentId);
        if (!currentNode) continue;

        // Execute the current node and store the result
        const result = await executeNode(currentNode, unipileAccountId, lead);

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
                await sleep(delay);
            }

            // Decrease incoming count and add to queue if ready
            incomingCount[edge.target] -= 1;
            if (incomingCount[edge.target] === 0) {
                queue.push(edge.target);
            }
        }
    }
}