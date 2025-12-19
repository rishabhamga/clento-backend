import { TemporalClientService } from '../temporal/services/temporal-client.service';
import { companyMonitorWorkflow, CompanyMonitorWorkflowInput } from '../temporal/workflows/leadMonitorWorkflows';
import { ReporterCompanyLeadRepository } from '../repositories/reporterRepositories/CompanyRepository';
import logger from '../utils/logger';

export interface StartCompanyMonitoringInput {
    companyId: string;
}

export interface StartCompanyMonitoringResult {
    workflowId: string;
    runId: string;
}

/**
 * Service for managing company monitoring workflows
 */
export class ReporterCompanyMonitorService {
    private temporalClient = TemporalClientService.getInstance();

    /**
     * Start monitoring a company's LinkedIn profile
     * Verifies company exists in database before starting workflow
     */
    async startMonitoring(input: StartCompanyMonitoringInput): Promise<StartCompanyMonitoringResult> {
        try {
            logger.info('Starting company monitoring workflow', {
                companyId: input.companyId,
            });

            // Verify company exists in database
            const companyRepository = new ReporterCompanyLeadRepository();
            const company = await companyRepository.findById(input.companyId);

            if (!company) {
                throw new Error(`Company not found: ${input.companyId}`);
            }

            // Ensure temporal client is initialized
            await this.temporalClient.initialize();

            const client = this.temporalClient.getClient();

            const workflowInput: CompanyMonitorWorkflowInput = {
                companyId: input.companyId,
            };

            // Generate deterministic workflow ID using companyId
            // This allows us to easily track and retrieve workflow status
            const workflowId = `company-monitor-${input.companyId}`;

            const handle = await client.workflow.start(companyMonitorWorkflow, {
                args: [workflowInput],
                taskQueue: 'lead-monitor-task-queue',
                workflowId,
            });

            logger.info('Company monitoring workflow started', {
                workflowId: handle.workflowId,
                runId: handle.firstExecutionRunId,
                companyId: input.companyId,
            });

            return {
                workflowId: handle.workflowId,
                runId: handle.firstExecutionRunId,
            };
        } catch (error: any) {
            logger.error('Failed to start company monitoring workflow', {
                error: error.message,
                stack: error.stack,
                input,
            });
            throw error;
        }
    }

    /**
     * Stop monitoring a company
     * Uses deterministic workflow ID to cancel the workflow
     */
    async stopMonitoring(companyId: string): Promise<void> {
        try {
            logger.info('Stopping company monitoring workflow', { companyId });

            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForCompany(companyId);

            try {
                const handle = client.workflow.getHandle(workflowId);
                await handle.cancel();
                logger.info('Company monitoring workflow cancelled', { workflowId, companyId });
            } catch (error: any) {
                // Workflow might not exist or already completed
                logger.warn('Could not cancel workflow', {
                    workflowId,
                    companyId,
                    error: error.message,
                });
            }
        } catch (error: any) {
            logger.warn('Failed to stop company monitoring workflow', {
                error: error.message,
                companyId,
            });
        }
    }

    /**
     * Get monitoring status for a company
     * Uses deterministic workflow ID to check status and queries internal pause state
     */
    async getMonitoringStatus(companyId: string): Promise<{
        isRunning: boolean;
        isPaused?: boolean;
        workflowId?: string;
        runId?: string;
        status?: string;
    }> {
        try {
            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForCompany(companyId);

            try {
                const handle = client.workflow.getHandle(workflowId);
                const description = await handle.describe();

                // Check if workflow is running
                const isRunning = description.status.name === 'RUNNING';

                // If workflow is running, query its internal state to check if it's paused
                let isPaused = false;
                if (isRunning) {
                    try {
                        const status = await handle.query('get-company-monitoring-status');
                        isPaused = (status as { isPaused: boolean })?.isPaused ?? false;
                    } catch (queryError: any) {
                        // Query might fail if workflow hasn't registered the query handler yet
                        // This can happen during workflow initialization
                        logger.warn('Failed to query workflow status, assuming not paused', {
                            error: queryError.message,
                            companyId,
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
                companyId,
            });
            return {
                isRunning: false,
            };
        }
    }

    /**
     * Get workflow ID for a company
     * Uses deterministic workflow ID format: company-monitor-${companyId}
     */
    private getWorkflowIdForCompany(companyId: string): string {
        return `company-monitor-${companyId}`;
    }

    /**
     * Check if workflow exists and is running for a company
     */
    private async checkWorkflowExists(companyId: string): Promise<boolean> {
        try {
            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForCompany(companyId);

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
                companyId,
            });
            return false;
        }
    }

    /**
     * Pause monitoring for a company
     * Sends a pause signal to the workflow
     * If no workflow exists, starts a new one first
     */
    async pauseMonitoring(companyId: string, userId: string): Promise<void> {
        try {
            logger.info('Pausing company monitoring workflow', { companyId, userId });

            // Verify company exists and belongs to user
            const companyRepository = new ReporterCompanyLeadRepository();
            const company = await companyRepository.findById(companyId);

            if (!company) {
                throw new Error(`Company not found: ${companyId}`);
            }

            if (company.user_id !== userId) {
                throw new Error(`Company does not belong to user: ${companyId}`);
            }

            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForCompany(companyId);

            // Check if workflow exists
            const workflowExists = await this.checkWorkflowExists(companyId);

            // If workflow doesn't exist, start it first
            if (!workflowExists) {
                logger.info('No active workflow found, starting new workflow before pausing', { companyId, userId });

                // Ensure temporal client is initialized
                await this.temporalClient.initialize();

                const workflowInput: CompanyMonitorWorkflowInput = {
                    companyId,
                };

                const handle = await client.workflow.start(companyMonitorWorkflow, {
                    args: [workflowInput],
                    taskQueue: 'lead-monitor-task-queue',
                    workflowId,
                });

                logger.info('Workflow started, now pausing it', {
                    workflowId: handle.workflowId,
                    companyId,
                    userId,
                });

                // Use the handle from start to send signal
                await handle.signal('pause-company-monitoring');

                logger.info('Pause signal sent to newly started workflow', {
                    workflowId: handle.workflowId,
                    companyId,
                    userId,
                });
                return;
            }

            // Get workflow handle and send pause signal
            const handle = client.workflow.getHandle(workflowId);
            await handle.signal('pause-company-monitoring');

            logger.info('Pause signal sent to workflow', {
                workflowId,
                companyId,
                userId,
            });
        } catch (error: any) {
            logger.error('Failed to pause company monitoring workflow', {
                error: error.message,
                stack: error.stack,
                companyId,
                userId,
            });
            throw error;
        }
    }

    /**
     * Resume monitoring for a company
     * Sends a resume signal to the workflow
     * If no workflow exists, starts a new one first
     */
    async resumeMonitoring(companyId: string, userId: string): Promise<void> {
        try {
            logger.info('Resuming company monitoring workflow', { companyId, userId });

            // Verify company exists and belongs to user
            const companyRepository = new ReporterCompanyLeadRepository();
            const company = await companyRepository.findById(companyId);

            if (!company) {
                throw new Error(`Company not found: ${companyId}`);
            }

            if (company.user_id !== userId) {
                throw new Error(`Company does not belong to user: ${companyId}`);
            }

            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForCompany(companyId);

            // Check if workflow exists
            const workflowExists = await this.checkWorkflowExists(companyId);

            // If workflow doesn't exist, start it first
            if (!workflowExists) {
                logger.info('No active workflow found, starting new workflow', { companyId, userId });

                // Ensure temporal client is initialized
                await this.temporalClient.initialize();

                const workflowInput: CompanyMonitorWorkflowInput = {
                    companyId,
                };

                const handle = await client.workflow.start(companyMonitorWorkflow, {
                    args: [workflowInput],
                    taskQueue: 'lead-monitor-task-queue',
                    workflowId,
                });

                logger.info('Workflow started successfully', {
                    workflowId: handle.workflowId,
                    companyId,
                    userId,
                });
                // Workflow starts unpaused by default, so no need to send resume signal
                return;
            }

            // Get workflow handle and send resume signal
            const handle = client.workflow.getHandle(workflowId);
            await handle.signal('resume-company-monitoring');

            logger.info('Resume signal sent to workflow', {
                workflowId,
                companyId,
                userId,
            });
        } catch (error: any) {
            logger.error('Failed to resume company monitoring workflow', {
                error: error.message,
                stack: error.stack,
                companyId,
                userId,
            });
            throw error;
        }
    }
}
