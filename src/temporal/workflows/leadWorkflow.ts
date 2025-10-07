import { log, proxyActivities, sleep } from "@temporalio/workflow";
import { LeadUpdateDto } from "../../dto/leads.dto";
import { EAction, EWorkflowNodeType, WorkflowEdge, WorkflowJson, WorkflowNode } from "../../types/workflow.types"
import type * as activities from "../activities";

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
            case 'seconds': return delay * 1000;
            case 'minutes': return delay * 60_000;
            case 'hours': return delay * 3_600_000;
            case 'days': return delay * 86_400_000;
        }
    }
    return 0;
}

async function executeNode(node: WorkflowNode) {
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
            CheckNever(type)
    }
}

export async function leadWorkflow(input: LeadWorkflowInput) {
    const { leadId, workflow, accountId } = input
    const leadUpdate:LeadUpdateDto = {
        status: "Processing"
    }

    await updateLead(leadId, leadUpdate);

    // Filter out "add node" type nodes - these are UI/configuration nodes that shouldn't be executed
    const nodes = workflow.nodes.filter(it => it.type !== EAction.addStep);
    const edges = workflow.edges;

    const adjacencyMap: Record<string, { to: string; delay: number }[]> = {};
    const incomingCount: Record<string, number> = {};

    nodes.forEach(n => (incomingCount[n.id] = 0));

    edges.forEach(edge => {
        if (!adjacencyMap[edge.source]) adjacencyMap[edge.source] = [];
        adjacencyMap[edge.source].push({ to: edge.target, delay: getDelayMs(edge) });
        incomingCount[edge.target] = (incomingCount[edge.target] || 0) + 1;
    });

    let queue: string[] = nodes.filter(n => incomingCount[n.id] === 0).map(n => n.id);

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentNode = nodes.find(n => n.id === currentId);
        if (!currentNode) continue;

        await executeNode(currentNode);

        for (const edge of adjacencyMap[currentId] || []) {
            if (edge.delay > 0) {
                log.info(`Sleeping ${edge.delay}ms before next node ${edge.to}`);
                await sleep(edge.delay);
            }

            incomingCount[edge.to] -= 1;
            if (incomingCount[edge.to] === 0) {
                queue.push(edge.to);
            }
        }
    }
}