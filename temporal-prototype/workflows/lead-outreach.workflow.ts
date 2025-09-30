/**
 * Lead Outreach Workflow
 * 
 * Individual workflow that processes a single lead through the complete
 * outreach sequence defined in the workflow definition.
 */

import { sleep, proxyActivities, log } from '@temporalio/workflow';
import {
    LeadOutreachInput,
    WorkflowNode,
    WorkflowEdge,
    ActivityResult,
    ProfileVisitResult,
    LikePostResult,
    CommentPostResult,
    SendInvitationResult,
    CheckInvitationResult,
    SendFollowupResult,
    WithdrawRequestResult,
    NotifyWebhookResult,
    ACTIVITY_TYPES,
} from './workflow.types';

// Import activity types
import type * as activities from '../activities/index';

// Proxy activities with retry configuration
const {
    ProfileVisitActivity,
    LikePostActivity,
    CommentPostActivity,
    SendInvitationActivity,
    CheckInvitationActivity,
    SendFollowupActivity,
    WithdrawRequestActivity,
    NotifyWebhookActivity,
    CreateExecutionActivity,
    UpdateExecutionActivity,
} = proxyActivities<typeof activities>({
    startToCloseTimeout: '5m',
    heartbeatTimeout: '30s',
    retry: {
        initialInterval: '1s',
        backoffCoefficient: 2,
        maximumInterval: '60s',
        maximumAttempts: 3,
        nonRetryableErrorTypes: [
            'AuthenticationError',
            'InvalidCredentialsError',
            'AccountSuspendedError',
            'InvalidDataError',
        ],
    },
});

/**
 * Lead Outreach Workflow Implementation
 */
export async function LeadOutreachWorkflow(input: LeadOutreachInput): Promise<ActivityResult> {
    log.info('Lead outreach workflow started', {
        campaignId: input.campaignId,
        leadId: input.lead.id,
        leadName: input.lead.full_name,
        executionId: input.executionId,
    });

    try {
        // Step 1: Apply initial delay for staggered execution
        if (input.startDelay && input.startDelay > 0) {
            log.info('Applying start delay', {
                leadId: input.lead.id,
                delayMs: input.startDelay,
            });
            await sleep(input.startDelay);
        }

        // Step 2: Create execution record in database
        const totalSteps = countWorkflowSteps(input.workflowDefinition);
        
        await CreateExecutionActivity({
            campaignId: input.campaignId,
            leadId: input.lead.id,
            executionId: input.executionId,
            totalSteps,
        });

        // Step 3: Update execution status to in_progress
        await UpdateExecutionActivity({
            executionId: input.executionId,
            status: 'in_progress',
            started_at: new Date().toISOString(),
        });

        // Step 4: Process workflow nodes in sequence
        const workflowResult = await processWorkflowNodes(input);

        // Step 5: Update execution status to completed
        await UpdateExecutionActivity({
            executionId: input.executionId,
            status: 'completed',
            completed_at: new Date().toISOString(),
            execution_data: workflowResult,
        });

        log.info('Lead outreach workflow completed successfully', {
            campaignId: input.campaignId,
            leadId: input.lead.id,
            executionId: input.executionId,
        });

        return {
            success: true,
            data: workflowResult,
        };

    } catch (error: any) {
        log.error('Lead outreach workflow failed', {
            campaignId: input.campaignId,
            leadId: input.lead.id,
            executionId: input.executionId,
            error: error.message,
        });

        // Update execution status to failed
        try {
            await UpdateExecutionActivity({
                executionId: input.executionId,
                status: 'failed',
                completed_at: new Date().toISOString(),
                execution_data: { error: error.message },
            });
        } catch (updateError: any) {
            log.error('Failed to update execution status to failed', {
                executionId: input.executionId,
                error: updateError.message,
            });
        }

        return {
            success: false,
            error: error.message,
            retryable: false,
        };
    }
}

/**
 * Process workflow nodes in sequence according to the workflow definition
 */
async function processWorkflowNodes(input: LeadOutreachInput): Promise<Record<string, any>> {
    const { nodes, edges } = input.workflowDefinition;
    const results: Record<string, any> = {};
    let currentStepNumber = 0;

    // Find the starting node (no incoming edges)
    const startingNode = findStartingNode(nodes, edges);
    if (!startingNode) {
        throw new Error('No starting node found in workflow definition');
    }

    log.info('Starting workflow execution', {
        leadId: input.lead.id,
        startingNodeId: startingNode.id,
        totalNodes: nodes.length,
    });

    // Process nodes recursively starting from the starting node
    await processNodeRecursively(
        startingNode,
        input,
        nodes,
        edges,
        results,
        currentStepNumber,
        new Set() // visited nodes to prevent infinite loops
    );

    return results;
}

/**
 * Process a single node and its connected nodes recursively
 */
async function processNodeRecursively(
    currentNode: WorkflowNode,
    input: LeadOutreachInput,
    allNodes: WorkflowNode[],
    allEdges: WorkflowEdge[],
    results: Record<string, any>,
    stepNumber: number,
    visitedNodes: Set<string>
): Promise<void> {
    // Prevent infinite loops
    if (visitedNodes.has(currentNode.id)) {
        log.warn('Node already visited, skipping to prevent infinite loop', {
            nodeId: currentNode.id,
            leadId: input.lead.id,
        });
        return;
    }

    visitedNodes.add(currentNode.id);

    log.info('Processing workflow node', {
        leadId: input.lead.id,
        nodeId: currentNode.id,
        nodeType: currentNode.data.type,
        stepNumber,
    });

    // Update current step in execution
    await UpdateExecutionActivity({
        executionId: input.executionId,
        current_step: stepNumber,
    });

    let nodeResult: ActivityResult | null = null;

    // Execute the node activity based on its type
    if (currentNode.type === 'action') {
        nodeResult = await executeNodeActivity(currentNode, input);
        results[currentNode.id] = nodeResult;

        log.info('Node activity completed', {
            leadId: input.lead.id,
            nodeId: currentNode.id,
            nodeType: currentNode.data.type,
            success: nodeResult.success,
        });
    }

    // Find outgoing edges from current node
    const outgoingEdges = allEdges.filter(edge => edge.source === currentNode.id);

    if (outgoingEdges.length === 0) {
        log.info('Reached end of workflow path', {
            leadId: input.lead.id,
            nodeId: currentNode.id,
        });
        return;
    }

    // Process each outgoing edge
    for (const edge of outgoingEdges) {
        // Apply time delay if specified
        if (edge.data.delayData) {
            const delayMs = convertDelayToMilliseconds(edge.data.delayData);
            if (delayMs > 0) {
                log.info('Applying edge delay', {
                    leadId: input.lead.id,
                    edgeId: edge.id,
                    delayMs,
                });
                await sleep(delayMs);
            }
        }

        // Check conditional logic for branching
        if (edge.data.isConditionalPath) {
            const shouldFollowPath = evaluateConditionalPath(edge, nodeResult);
            
            if (!shouldFollowPath) {
                log.info('Skipping conditional path', {
                    leadId: input.lead.id,
                    edgeId: edge.id,
                    isPositive: edge.data.isPositive,
                });
                continue;
            }
        }

        // Find target node and process it
        const targetNode = allNodes.find(node => node.id === edge.target);
        if (targetNode) {
            await processNodeRecursively(
                targetNode,
                input,
                allNodes,
                allEdges,
                results,
                stepNumber + 1,
                visitedNodes
            );
        } else {
            log.warn('Target node not found for edge', {
                leadId: input.lead.id,
                edgeId: edge.id,
                targetNodeId: edge.target,
            });
        }
    }
}

/**
 * Execute activity for a specific node type
 */
async function executeNodeActivity(
    node: WorkflowNode,
    input: LeadOutreachInput
): Promise<ActivityResult> {
    const { type, config } = node.data;

    switch (type) {
        case 'profile_visit':
            return await ProfileVisitActivity({
                accountId: input.accountId,
                leadId: input.lead.id,
                identifier: input.lead.linkedin_url || input.lead.linkedin_id || input.lead.full_name,
                config,
            });

        case 'like_post':
            return await LikePostActivity({
                accountId: input.accountId,
                leadId: input.lead.id,
                identifier: input.lead.linkedin_url || input.lead.linkedin_id || input.lead.full_name,
                config,
            });

        case 'comment_post':
            return await CommentPostActivity({
                accountId: input.accountId,
                leadId: input.lead.id,
                identifier: input.lead.linkedin_url || input.lead.linkedin_id || input.lead.full_name,
                config,
            });

        case 'send_connection_request':
            return await SendInvitationActivity({
                accountId: input.accountId,
                leadId: input.lead.id,
                providerId: input.lead.linkedin_id || '',
                config,
            });

        case 'send_followup':
            return await SendFollowupActivity({
                accountId: input.accountId,
                leadId: input.lead.id,
                attendeesIds: [input.lead.linkedin_id || ''],
                config,
            });

        case 'withdraw_request':
            // Get invitation ID from previous results
            const invitationId = findInvitationIdFromResults(input.executionId);
            return await WithdrawRequestActivity({
                accountId: input.accountId,
                leadId: input.lead.id,
                invitationId: invitationId || '',
                config,
            });

        case 'notify_webhook':
            return await NotifyWebhookActivity({
                campaignId: input.campaignId,
                leadId: input.lead.id,
                executionId: input.executionId,
                config,
            });

        default:
            log.warn('Unknown node type, skipping', {
                leadId: input.lead.id,
                nodeId: node.id,
                nodeType: type,
            });
            
            return {
                success: true,
                data: { skipped: true, reason: 'Unknown node type' },
            };
    }
}

/**
 * Helper functions
 */

function findStartingNode(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode | null {
    // Find node with no incoming edges
    const targetNodeIds = new Set(edges.map(edge => edge.target));
    return nodes.find(node => !targetNodeIds.has(node.id)) || null;
}

function countWorkflowSteps(workflowDefinition: any): number {
    return workflowDefinition.nodes?.filter((node: any) => node.type === 'action')?.length || 0;
}

function convertDelayToMilliseconds(delayData: { delay: number; unit: 'm' | 'h' | 'd' }): number {
    const { delay, unit } = delayData;
    
    switch (unit) {
        case 'm':
            return delay * 60 * 1000; // minutes to milliseconds
        case 'h':
            return delay * 60 * 60 * 1000; // hours to milliseconds
        case 'd':
            return delay * 24 * 60 * 60 * 1000; // days to milliseconds
        default:
            return 0;
    }
}

function evaluateConditionalPath(edge: WorkflowEdge, nodeResult: ActivityResult | null): boolean {
    if (!edge.data.isConditionalPath || !nodeResult) {
        return true; // Non-conditional paths are always followed
    }

    // For connection request results, check if invitation was accepted
    if (nodeResult.data?.status === 'sent' || nodeResult.data?.invitationId) {
        // This is likely a connection request result
        // We'll need to check the invitation status in a separate activity
        // For now, we'll use a simple heuristic based on the path type
        const isAcceptedPath = edge.data.isPositive === true;
        
        // TODO: Implement proper invitation status checking
        // For now, randomly determine acceptance for demo purposes
        const isAccepted = Math.random() > 0.7; // 30% acceptance rate
        
        return isAcceptedPath ? isAccepted : !isAccepted;
    }

    // Default behavior: follow positive paths if result was successful
    return edge.data.isPositive ? nodeResult.success : !nodeResult.success;
}

async function findInvitationIdFromResults(executionId: string): Promise<string | null> {
    // TODO: Implement logic to find invitation ID from previous execution results
    // This would query the database for the execution record and extract the invitation ID
    return null;
}
