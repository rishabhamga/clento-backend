import { TemporalClientService } from '../temporal/services/temporal-client.service';
import { leadMonitorWorkflow, LeadMonitorWorkflowInput } from '../temporal/workflows';
import { ReporterLeadRepository } from '../repositories/reporterRepositories/LeadRepository';
import logger from '../utils/logger';
import { getLeadMonitorTaskQueue, getCampaignTaskQueue } from '../utils/queueUtil';
import { TemporalService } from './TemporalService';

export interface StartMonitoringInput {
    leadId: string;
}

export interface StartMonitoringResult {
    workflowId: string;
    runId: string;
}

/**
 * Service for managing lead monitoring workflows
 */
export class ReporterLeadMonitorService {
    private temporalClient = TemporalClientService.getInstance();

    /**
     * Start monitoring a lead's LinkedIn profile
     * Verifies lead exists in database before starting workflow
     */
    async startMonitoring(input: StartMonitoringInput): Promise<StartMonitoringResult> {
        try {
            logger.info('Starting lead monitoring workflow', {
                leadId: input.leadId,
            });

            // Verify lead exists in database
            const leadRepository = new ReporterLeadRepository();
            const lead = await leadRepository.findById(input.leadId);

            if (!lead) {
                throw new Error(`Lead not found: ${input.leadId}`);
            }

            // Ensure temporal client is initialized
            await this.temporalClient.initialize();

            const client = this.temporalClient.getClient();

            const workflowInput: LeadMonitorWorkflowInput = {
                leadId: input.leadId,
            };

            // Generate deterministic workflow ID using leadId
            // This allows us to easily track and retrieve workflow status
            const workflowId = `lead-monitor-${input.leadId}`;

            const handle = await client.workflow.start(leadMonitorWorkflow, {
                args: [workflowInput],
                taskQueue: getLeadMonitorTaskQueue(),
                workflowId,
            });

            logger.info('Lead monitoring workflow started', {
                workflowId: handle.workflowId,
                runId: handle.firstExecutionRunId,
                leadId: input.leadId,
            });

            return {
                workflowId: handle.workflowId,
                runId: handle.firstExecutionRunId,
            };
        } catch (error: any) {
            logger.error('Failed to start lead monitoring workflow', {
                error: error.message,
                stack: error.stack,
                input,
            });
            throw error;
        }
    }

    /**
     * Stop monitoring a lead
     * Uses deterministic workflow ID to cancel the workflow
     */
    async stopMonitoring(leadId: string): Promise<void> {
        try {
            logger.info('Stopping lead monitoring workflow', { leadId });

            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForLead(leadId);

            try {
                const handle = client.workflow.getHandle(workflowId);
                await handle.cancel();
                logger.info('Lead monitoring workflow cancelled', { workflowId, leadId });
            } catch (error: any) {
                // Workflow might not exist or already completed
                logger.warn('Could not cancel workflow', {
                    workflowId,
                    leadId,
                    error: error.message,
                });
            }
        } catch (error: any) {
            logger.warn('Failed to stop lead monitoring workflow', {
                error: error.message,
                leadId,
            });
        }
    }

    /**
     * Get monitoring status for a lead
     * Uses deterministic workflow ID to check status and queries internal pause state
     */
    async getMonitoringStatus(leadId: string): Promise<{
        isRunning: boolean;
        isPaused?: boolean;
        workflowId?: string;
        runId?: string;
        status?: string;
    }> {
        try {
            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForLead(leadId);

            try {
                const handle = client.workflow.getHandle(workflowId);
                const description = await handle.describe();

                // Check if workflow is running
                const isRunning = description.status.name === 'RUNNING';

                // If workflow is running, query its internal state to check if it's paused
                let isPaused = false;
                if (isRunning) {
                    try {
                        const status = await handle.query('get-monitoring-status');
                        isPaused = (status as { isPaused: boolean })?.isPaused ?? false;
                    } catch (queryError: any) {
                        // Query might fail if workflow hasn't registered the query handler yet
                        // This can happen during workflow initialization
                        logger.warn('Failed to query workflow status, assuming not paused', {
                            error: queryError.message,
                            leadId,
                            workflowId,
                        });
                        // Default to not paused if query fails
                        isPaused = false;
                    }
                }

                return {
                    isRunning,
                    isPaused: isRunning ? isPaused : undefined,
                    workflowId: description.workflowId,
                    runId: description.runId,
                    status: description.status.name,
                };
            } catch (error: any) {
                // Workflow doesn't exist or is not accessible
                return {
                    isRunning: false,
                };
            }
        } catch (error: any) {
            logger.error('Failed to get monitoring status', {
                error: error.message,
                leadId,
            });
            return {
                isRunning: false,
            };
        }
    }

    /**
     * Get all active monitoring workflows for a user
     */
    async getActiveMonitoringWorkflows(userId: string): Promise<
        Array<{
            workflowId: string;
            leadId: string;
            status: string;
            startTime: Date;
        }>
    > {
        try {
            const client = this.temporalClient.getClient();

            // Query for lead monitor workflows
            const query = `WorkflowType = 'leadMonitorWorkflow' AND ExecutionStatus = 'Running'`;
            const listIterable = client.workflow.list({ query });

            const workflows = [];
            for await (const wf of listIterable) {
                // Extract leadId from workflowId
                const leadId = wf.workflowId.replace('lead-monitor-', '');
                workflows.push({
                    workflowId: wf.workflowId,
                    leadId,
                    status: wf.status.name,
                    startTime: wf.startTime,
                });
            }

            logger.info('Retrieved active monitoring workflows', {
                userId,
                count: workflows.length,
            });

            return workflows;
        } catch (error: any) {
            logger.error('Failed to get active monitoring workflows', {
                error: error.message,
                userId,
            });
            return [];
        }
    }

    /**
     * Get workflow ID for a lead
     * Uses deterministic workflow ID format: lead-monitor-${leadId}
     */
    private getWorkflowIdForLead(leadId: string): string {
        return `lead-monitor-${leadId}`;
    }

    /**
     * Check if workflow exists and is running for a lead
     */
    private async checkWorkflowExists(leadId: string): Promise<boolean> {
        try {
            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForLead(leadId);

            try {
                const handle = client.workflow.getHandle(workflowId);
                const description = await handle.describe();
                return description.status.name === 'RUNNING';
            } catch (error: any) {
                // Workflow doesn't exist or is not running
                return false;
            }
        } catch (error: any) {
            logger.error('Failed to check workflow existence', {
                error: error.message,
                leadId,
            });
            return false;
        }
    }

    /**
     * Pause monitoring for a lead
     * Sends a pause signal to the workflow
     * If no workflow exists, starts a new one first
     */
    async pauseMonitoring(leadId: string, userId: string): Promise<void> {
        try {
            logger.info('Pausing lead monitoring workflow', { leadId, userId });

            // Verify lead exists and belongs to user
            const leadRepository = new ReporterLeadRepository();
            const lead = await leadRepository.findById(leadId);

            if (!lead) {
                throw new Error(`Lead not found: ${leadId}`);
            }

            if (lead.user_id !== userId) {
                throw new Error(`Lead does not belong to user: ${leadId}`);
            }

            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForLead(leadId);

            // Check if workflow exists
            const workflowExists = await this.checkWorkflowExists(leadId);

            // If workflow doesn't exist, start it first
            if (!workflowExists) {
                logger.info('No active workflow found, starting new workflow before pausing', { leadId, userId });

                // Ensure temporal client is initialized
                await this.temporalClient.initialize();

                const workflowInput: LeadMonitorWorkflowInput = {
                    leadId,
                };

                const handle = await client.workflow.start(leadMonitorWorkflow, {
                    args: [workflowInput],
                    taskQueue: getCampaignTaskQueue(),
                    workflowId,
                });

                logger.info('Workflow started, now pausing it', {
                    workflowId: handle.workflowId,
                    leadId,
                    userId,
                });

                // Use the handle from start to send signal
                await handle.signal('pause-lead-monitoring');

                logger.info('Pause signal sent to newly started workflow', {
                    workflowId: handle.workflowId,
                    leadId,
                    userId,
                });
                return;
            }

            // Get workflow handle and send pause signal
            const handle = client.workflow.getHandle(workflowId);
            await handle.signal('pause-lead-monitoring');

            logger.info('Pause signal sent to workflow', {
                workflowId,
                leadId,
                userId,
            });
        } catch (error: any) {
            logger.error('Failed to pause lead monitoring workflow', {
                error: error.message,
                stack: error.stack,
                leadId,
                userId,
            });
            throw error;
        }
    }

    /**
     * Resume monitoring for a lead
     * Sends a resume signal to the workflow
     * If no workflow exists, starts a new one first
     */
    async resumeMonitoring(leadId: string, userId: string): Promise<void> {
        try {
            logger.info('Resuming lead monitoring workflow', { leadId, userId });

            // Verify lead exists and belongs to user
            const leadRepository = new ReporterLeadRepository();
            const lead = await leadRepository.findById(leadId);

            if (!lead) {
                throw new Error(`Lead not found: ${leadId}`);
            }

            if (lead.user_id !== userId) {
                throw new Error(`Lead does not belong to user: ${leadId}`);
            }

            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForLead(leadId);

            // Check if workflow exists
            const workflowExists = await this.checkWorkflowExists(leadId);

            // If workflow doesn't exist, start it first
            if (!workflowExists) {
                logger.info('No active workflow found, starting new workflow', { leadId, userId });

                // Ensure temporal client is initialized
                await this.temporalClient.initialize();

                const workflowInput: LeadMonitorWorkflowInput = {
                    leadId,
                };

                const handle = await client.workflow.start(leadMonitorWorkflow, {
                    args: [workflowInput],
                    taskQueue: getCampaignTaskQueue(),
                    workflowId,
                });

                logger.info('Workflow started successfully', {
                    workflowId: handle.workflowId,
                    leadId,
                    userId,
                });
                // Workflow starts unpaused by default, so no need to send resume signal
                return;
            }

            // Get workflow handle and send resume signal
            const handle = client.workflow.getHandle(workflowId);
            await handle.signal('resume-lead-monitoring');

            logger.info('Resume signal sent to workflow', {
                workflowId,
                leadId,
                userId,
            });
        } catch (error: any) {
            logger.error('Failed to resume lead monitoring workflow', {
                error: error.message,
                stack: error.stack,
                leadId,
                userId,
            });
            throw error;
        }
    }
}
