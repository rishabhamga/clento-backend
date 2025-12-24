// Force production queues BEFORE any imports that use env
process.env.USE_DEVELOPMENT_QUEUE = 'false';

import { TemporalClientService } from '../src/temporal/services/temporal-client.service';
import { ReporterLeadMonitorService } from '../src/services/ReporterLeadMonitorService';
import { ReporterCompanyMonitorService } from '../src/services/ReporterCompanyMonitorService';
import { ReporterLeadRepository } from '../src/repositories/reporterRepositories/LeadRepository';
import { ReporterCompanyLeadRepository } from '../src/repositories/reporterRepositories/CompanyRepository';
import { getLeadMonitorTaskQueue } from '../src/utils/queueUtil';
import logger from '../src/utils/logger';
import supabase from '../src/config/supabase';
import { WorkflowExecutionInfo } from '@temporalio/client';
import { ReporterLeadResponseDto } from '../src/dto/reporterDtos/leads.dto';
import { ReporterCompanyLeadResponseDto } from '../src/dto/reporterDtos/companies.dto';

/**
 * Script to stop all running workflows (leads and companies) and restart them on production queues
 *
 * Usage: npx ts-node tempScripts/runAllLeads
 */
async function runAllLeads() {
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

        // Helper function to terminate workflow and verify it's stopped
        const terminateAndVerify = async (workflowId: string, workflowType: string, maxRetries = 5): Promise<boolean> => {
            try {
                const handle = client.workflow.getHandle(workflowId);

                // Try to terminate the workflow
                try {
                    await handle.terminate('Script restart - terminating for restart');
                    logger.info(`Terminated ${workflowType} workflow: ${workflowId}`);
                } catch (error: any) {
                    // If terminate fails, try cancel
                    try {
                        await handle.cancel();
                        logger.info(`Cancelled ${workflowType} workflow: ${workflowId}`);
                    } catch (cancelError: any) {
                        logger.warn(`Could not terminate/cancel ${workflowType} workflow ${workflowId}`, {
                            terminateError: error.message,
                            cancelError: cancelError.message,
                        });
                    }
                }

                // Verify workflow is stopped
                for (let i = 0; i < maxRetries; i++) {
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between checks

                    try {
                        const description = await handle.describe();
                        const status = description.status.name;

                        if (status !== 'RUNNING') {
                            logger.info(`Verified ${workflowType} workflow ${workflowId} is stopped (status: ${status})`);
                            return true;
                        }

                        if (i === maxRetries - 1) {
                            logger.warn(`Workflow ${workflowId} still running after ${maxRetries} checks`);
                            return false;
                        }
                    } catch (error: any) {
                        // Workflow might not exist anymore, which is fine
                        logger.info(`Workflow ${workflowId} no longer exists (likely stopped)`);
                        return true;
                    }
                }

                return false;
            } catch (error: any) {
                logger.warn(`Failed to terminate/verify ${workflowType} workflow ${workflowId}`, {
                    error: error.message,
                });
                return false;
            }
        };

        // Step 1: List and terminate all running lead workflows
        logger.info('Step 1: Finding and terminating all running lead workflows');
        const leadWorkflowQuery = `WorkflowType = 'leadMonitorWorkflow' AND ExecutionStatus = 'Running'`;
        const leadWorkflowList = client.workflow.list({ query: leadWorkflowQuery });

        const leadWorkflows: WorkflowExecutionInfo[] = [];
        for await (const wf of leadWorkflowList) {
            leadWorkflows.push(wf);
        }

        logger.info(`Found ${leadWorkflows.length} running lead workflows`);

        let leadTerminatedCount = 0;
        for (const wf of leadWorkflows) {
            const success = await terminateAndVerify(wf.workflowId, 'lead');
            if (success) {
                leadTerminatedCount++;
            }
        }

        logger.info(`Terminated ${leadTerminatedCount} of ${leadWorkflows.length} lead workflows`);

        // Step 2: List and terminate all running company workflows
        logger.info('Step 2: Finding and terminating all running company workflows');
        const companyWorkflowQuery = `WorkflowType = 'companyMonitorWorkflow' AND ExecutionStatus = 'Running'`;
        const companyWorkflowList = client.workflow.list({ query: companyWorkflowQuery });

        const companyWorkflows: WorkflowExecutionInfo[] = [];
        for await (const wf of companyWorkflowList) {
            companyWorkflows.push(wf);
        }

        logger.info(`Found ${companyWorkflows.length} running company workflows`);

        let companyTerminatedCount = 0;
        for (const wf of companyWorkflows) {
            const success = await terminateAndVerify(wf.workflowId, 'company');
            if (success) {
                companyTerminatedCount++;
            }
        }

        logger.info(`Terminated ${companyTerminatedCount} of ${companyWorkflows.length} company workflows`);

        // Wait a bit more for terminations to fully complete
        logger.info('Waiting 10 seconds for terminations to fully complete...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Step 3: Get all non-deleted leads from database
        logger.info('Step 3: Fetching all non-deleted leads from database');
        const leadRepository = new ReporterLeadRepository();

        // Get all non-deleted leads (paginated)
        const allLeads: ReporterLeadResponseDto[] = [];
        let page = 1;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
            const result = await leadRepository.findPaginatedWithFilters({
                filters: { is_deleted: false },
                page,
                limit,
            });
            allLeads.push(...result.data);
            hasMore = result.hasNextPage;
            page++;
        }

        logger.info(`Found ${allLeads.length} non-deleted leads in database`);

        // Step 4: Get all companies from database
        logger.info('Step 4: Fetching all companies from database');
        const companyRepository = new ReporterCompanyLeadRepository();

        // Get all companies (paginated)
        const allCompanies: ReporterCompanyLeadResponseDto[] = [];
        page = 1;
        hasMore = true;

        while (hasMore) {
            const result = await companyRepository.list(page, limit);
            allCompanies.push(...result.data);
            hasMore = result.data.length === limit;
            page++;
        }

        logger.info(`Found ${allCompanies.length} total companies in database`);

        // Step 5: Restart lead workflows one by one
        logger.info('Step 5: Restarting lead workflows on production queue');
        const leadMonitorService = new ReporterLeadMonitorService();
        let leadSuccessCount = 0;
        let leadErrorCount = 0;
        let leadSkippedCount = 0;

        for (const lead of allLeads) {
            try {
                // Double-check: Filter out deleted leads (shouldn't happen since we filtered at DB level)
                if (lead.is_deleted) {
                    leadSkippedCount++;
                    continue;
                }

                // Check if workflow is still running before starting
                const workflowId = `lead-monitor-${lead.id}`;
                try {
                    const handle = client.workflow.getHandle(workflowId);
                    const description = await handle.describe();
                    if (description.status.name === 'RUNNING') {
                        logger.warn(`Lead workflow ${workflowId} is still running, attempting to terminate again...`);
                        await handle.terminate('Force terminate before restart');
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for termination
                    }
                } catch (checkError: any) {
                    // Workflow doesn't exist or is stopped, which is fine
                }

                await leadMonitorService.startMonitoring({ leadId: lead.id });
                leadSuccessCount++;

                if (leadSuccessCount % 10 === 0) {
                    logger.info(`Restarted ${leadSuccessCount} lead workflows...`);
                }

                // Small delay to avoid overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error: any) {
                leadErrorCount++;
                // Check if error is about workflow already running
                if (error.message?.includes('already started') || error.message?.includes('already exists')) {
                    logger.warn(`Lead workflow for lead ${lead.id} already exists, skipping...`);
                } else {
                    logger.warn(`Failed to restart lead workflow for lead ${lead.id}`, {
                        error: error.message,
                    });
                }
            }
        }

        if (leadSkippedCount > 0) {
            logger.warn(`Skipped ${leadSkippedCount} deleted leads`);
        }

        logger.info(`Completed restarting lead workflows`, {
            total: allLeads.length,
            success: leadSuccessCount,
            errors: leadErrorCount,
        });

        // Step 6: Restart company workflows one by one
        logger.info('Step 6: Restarting company workflows on production queue');
        const companyMonitorService = new ReporterCompanyMonitorService();
        let companySuccessCount = 0;
        let companyErrorCount = 0;

        for (const company of allCompanies) {
            try {
                // Check if workflow is still running before starting
                const workflowId = `company-monitor-${company.id}`;
                try {
                    const handle = client.workflow.getHandle(workflowId);
                    const description = await handle.describe();
                    if (description.status.name === 'RUNNING') {
                        logger.warn(`Company workflow ${workflowId} is still running, attempting to terminate again...`);
                        await handle.terminate('Force terminate before restart');
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for termination
                    }
                } catch (checkError: any) {
                    // Workflow doesn't exist or is stopped, which is fine
                }

                await companyMonitorService.startMonitoring({ companyId: company.id });
                companySuccessCount++;

                if (companySuccessCount % 10 === 0) {
                    logger.info(`Restarted ${companySuccessCount} company workflows...`);
                }

                // Small delay to avoid overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error: any) {
                companyErrorCount++;
                // Check if error is about workflow already running
                if (error.message?.includes('already started') || error.message?.includes('already exists')) {
                    logger.warn(`Company workflow for company ${company.id} already exists, skipping...`);
                } else {
                    logger.warn(`Failed to restart company workflow for company ${company.id}`, {
                        error: error.message,
                    });
                }
            }
        }

        logger.info(`Completed restarting company workflows`, {
            total: allCompanies.length,
            success: companySuccessCount,
            errors: companyErrorCount,
        });

        logger.info('✅ Script completed successfully', {
            leadsCancelled: leadWorkflows.length,
            companiesCancelled: companyWorkflows.length,
            leadsRestarted: leadSuccessCount,
            companiesRestarted: companySuccessCount,
            leadErrors: leadErrorCount,
            companyErrors: companyErrorCount,
        });

    } catch (error: any) {
        logger.error('Script failed', {
            error: error.message,
            stack: error.stack,
        });
        process.exit(1);
    }
}

// Run the script
runAllLeads()
    .then(() => {
        logger.info('Script finished');
        process.exit(0);
    })
    .catch((error) => {
        logger.error('Script crashed', { error });
        process.exit(1);
    });
