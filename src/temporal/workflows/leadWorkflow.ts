import { log, proxyActivities, sleep } from "@temporalio/workflow";
import { LeadUpdateDto } from "../../dto/leads.dto";
import { EAction, EWorkflowNodeType, WorkflowEdge, WorkflowJson, WorkflowNode } from "../../types/workflow.types"
import type * as activities from "../activities";

// Import ActivityResult type
type ActivityResult = {
    success: boolean;
    message?: string;
    data?: any;
};

const { profile_visit, like_post, follow_profile, comment_post, send_invite, send_followup, withdraw_request, send_inmail, follow_company, send_connection_request, updateLead } = proxyActivities<typeof activities>({
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

async function executeNode(node: WorkflowNode): Promise<ActivityResult | null> {
    const type = node.data.type;
    const config = node.data.config;

    switch (type) {
        case EWorkflowNodeType.profile_visit: return await profile_visit();
        case EWorkflowNodeType.like_post: return await like_post();
        case EWorkflowNodeType.follow_profile: return await follow_profile();
        case EWorkflowNodeType.comment_post: return await comment_post();
        case EWorkflowNodeType.send_invite: return await send_invite();
        case EWorkflowNodeType.send_followup: return await send_followup();
        case EWorkflowNodeType.withdraw_request: return await withdraw_request();
        case EWorkflowNodeType.send_inmail: return await send_inmail();
        case EWorkflowNodeType.follow_company: return await follow_company();
        case EWorkflowNodeType.send_connection_request: return await send_connection_request();
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

    await updateLead(leadId, leadUpdate);

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
        const currentId = queue.shift()!;
        const currentNode = nodes.find(n => n.id === currentId);
        if (!currentNode) continue;

        // Execute the current node and store the result
        const result = await executeNode(currentNode);

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