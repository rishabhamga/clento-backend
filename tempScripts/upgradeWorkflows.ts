// Force production queue usage
process.env.USE_DEVELOPMENT_QUEUE = 'false';

import { TemporalClientService } from '../src/temporal/services/temporal-client.service';
import logger from '../src/utils/logger';
import { getLeadMonitorTaskQueue } from '../src/utils/queueUtil';
import supabase from '../src/config/supabase';

import '../src/utils/expressExtensions';
import '../src/utils/arrayExtensions';
import '../src/utils/mapExtensions';

import { WorkflowExecutionInfo } from '@temporalio/client';

async function sendRotateSignals() {
    try {
        const queueName = getLeadMonitorTaskQueue();
        logger.info('Starting workflow rotate script', {
            queue: queueName,
            useDevQueue: process.env.USE_DEVELOPMENT_QUEUE,
        });

        if (queueName.includes('-dev')) {
            logger.error('ERROR: Script is using DEV queue! Please check USE_DEVELOPMENT_QUEUE environment variable.');
            process.exit(1);
        }

        // Initialize Supabase
        logger.info('Initializing Supabase connection...');
        await supabase.initSupabase();

        // Initialize Temporal Client
        logger.info('Initializing Temporal client...');
        const temporalClient = TemporalClientService.getInstance();
        await temporalClient.initialize();
        const client = temporalClient.getClient();

        // List all running lead workflows
        logger.info('Finding all running lead monitor workflows...');
        const leadWorkflowQuery = `WorkflowType = 'leadMonitorWorkflow' AND ExecutionStatus = 'Running'`;
        const leadWorkflowList = client.workflow.list({ query: leadWorkflowQuery });

        const leadWorkflows: WorkflowExecutionInfo[] = [];
        for await (const wf of leadWorkflowList) {
            leadWorkflows.push(wf);
        }

        logger.info(`Found ${leadWorkflows.length} workflows. Sending rotate signals...`);

        await leadWorkflows.forEachAsyncOneByOne(async it => {
            try {
                const handle = client.workflow.getHandle(it.workflowId);

                await handle.signal('rotate-run'); // 👈 send your signal here

                logger.info('Rotate signal sent', {
                    workflowId: it.workflowId,
                    runId: it.runId,
                });
            } catch (err: any) {
                logger.error('Failed to send rotate signal', {
                    workflowId: it.workflowId,
                    runId: it.runId,
                    error: err?.message,
                });
            }
        });

        logger.info('All signals processed');
    } catch (error) {
        logger.error('Rotate script failed', { error });
    }
}

async function main() {
    await sendRotateSignals();
    process.exit(0);
}

main().catch(err => {
    logger.error('Script failed', { error: err.message });
    process.exit(1);
});
