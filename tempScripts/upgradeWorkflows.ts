// Force production queue usage
process.env.USE_DEVELOPMENT_QUEUE = 'false';

import { TemporalClientService } from '../src/temporal/services/temporal-client.service';
import logger from '../src/utils/logger';
import { temporal } from '@temporalio/proto';
import Long from 'long';
import { getLeadMonitorTaskQueue } from '../src/utils/queueUtil';
import supabase from '../src/config/supabase';
import '../src/utils/expressExtensions'; // Import express extensions
import '../src/utils/arrayExtensions'; // Import array extensions globally
import '../src/utils/mapExtensions'; // Import map extensions globally
import { WorkflowExecutionInfo } from '@temporalio/client';
import { randomUUID } from 'crypto';

async function resetWorkflowGRPC() {
    try {
        // Verify production queue is being used
        const queueName = getLeadMonitorTaskQueue();
        logger.info('Starting workflow restart script', {
            queue: queueName,
            useDevQueue: process.env.USE_DEVELOPMENT_QUEUE,
        });

        if (queueName.includes('-dev')) {
            logger.error('ERROR: Script is using DEV queue! Please check USE_DEVELOPMENT_QUEUE environment variable.');
            process.exit(1);
        }

        // Initialize Supabase connection
        logger.info('Initializing Supabase connection...');
        await supabase.initSupabase();

        // Initialize Temporal client
        logger.info('Initializing Temporal client...');
        const temporalClient = TemporalClientService.getInstance();
        await temporalClient.initialize();
        const client = temporalClient.getClient();

        // Step 1: List and terminate all running lead workflows
        logger.info('Step 1: Finding and terminating all running lead workflows');
        const leadWorkflowQuery = `WorkflowType = 'leadMonitorWorkflow' AND ExecutionStatus = 'Running'`;
        const leadWorkflowList = client.workflow.list({ query: leadWorkflowQuery });

        const leadWorkflows: WorkflowExecutionInfo[] = [];
        for await (const wf of leadWorkflowList) {
            leadWorkflows.push(wf);
        }

        await leadWorkflows.forEachAsyncOneByOne(async it => {
            // Get history
            const historyRes = await client.workflowService.getWorkflowExecutionHistoryReverse({
                namespace: client.options.namespace,
                execution: {
                    workflowId: it.workflowId,
                    runId: it.runId,
                },
            });
            const events = historyRes.history?.events ?? [];

            // Find the most recent resettable workflow task boundary
            const lastTaskEvent = [...events].find(e => e.workflowTaskCompletedEventAttributes);

            if (!lastTaskEvent) {
                throw new Error(`No completed workflow task found for ${it.workflowId}`);
            }

            if (!lastTaskEvent) {
                throw new Error(`No resettable workflow task found for ${it.workflowId}`);
            }
            // Perform reset and capture new runId from response
            const resetResp = await client.workflowService.resetWorkflowExecution({
                requestId: randomUUID(),
                namespace: client.options.namespace,
                workflowExecution: { workflowId: it.workflowId, runId: it.runId },
                workflowTaskFinishEventId: lastTaskEvent.eventId,
                reason: 'Reset to last workflow task to use latest code',
                resetReapplyType: temporal.api.enums.v1.ResetReapplyType.RESET_REAPPLY_TYPE_NONE,
            });

            console.log(`Reset issued for ${it.workflowId} old runId=${it.runId} -> new runId=${resetResp.runId}`);
        });
    } catch (error) {
        console.log(error);
    }
}

async function main() {
    await resetWorkflowGRPC();
    process.exit(0);
}

main().catch(err => {
    logger.error('Script failed', { error: err.message });
    process.exit(1);
});
