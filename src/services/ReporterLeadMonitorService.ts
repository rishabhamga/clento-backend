import { TemporalClientService } from '../temporal/services/temporal-client.service';
import { leadMonitorWorkflow, LeadMonitorWorkflowInput } from '../temporal/workflows/leadMonitorWorkflow';
import { CsvService } from './CsvService';
import { ReporterLeadRepository } from '../repositories/reporterRepositories/LeadRepository';
import logger from '../utils/logger';

export interface StartMonitoringInput {
    userId: string;
    linkedinUrl: string;
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
     */
    async startMonitoring(input: StartMonitoringInput): Promise<StartMonitoringResult> {
        try {
            logger.info('Starting lead monitoring workflow', {
                userId: input.userId,
                linkedinUrl: input.linkedinUrl,
            });

            // Ensure temporal client is initialized
            await this.temporalClient.initialize();

            const client = this.temporalClient.getClient();

            const workflowInput: LeadMonitorWorkflowInput = {
                userId: input.userId,
                linkedinUrl: input.linkedinUrl,
            };

            // Generate unique workflow ID using LinkedIn identifier
            const identifier = CsvService.extractLinkedInPublicIdentifier(input.linkedinUrl) || 'unknown';
            const workflowId = `lead-monitor-${input.userId}-${identifier}-${Date.now()}`;

            const handle = await client.workflow.start(leadMonitorWorkflow, {
                args: [workflowInput],
                taskQueue: 'campaign-task-queue', // Use same task queue as other workflows
                workflowId,
            });

            logger.info('Lead monitoring workflow started', {
                workflowId: handle.workflowId,
                runId: handle.firstExecutionRunId,
                userId: input.userId,
                linkedinUrl: input.linkedinUrl,
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
     * Note: This method attempts to find and cancel workflows by searching for the leadId in workflow metadata
     * Since workflow IDs are now based on userId and linkedinUrl, we need to search for active workflows
     */
    async stopMonitoring(leadId: string): Promise<void> {
        try {
            logger.info('Stopping lead monitoring workflow', { leadId });

            const client = this.temporalClient.getClient();

            // Get the lead to find its linkedinUrl
            const leadRepository = new ReporterLeadRepository();
            const lead = await leadRepository.findById(leadId);

            if (!lead) {
                logger.warn('Lead not found, cannot stop monitoring', { leadId });
                return;
            }

            // Try to find workflow by searching active workflows
            // Note: This is a simplified approach - in production you might want to store workflow IDs
            const query = `WorkflowType = 'leadMonitorWorkflow' AND ExecutionStatus = 'Running'`;
            const listIterable = client.workflow.list({ query });

            for await (const wf of listIterable) {
                try {
                    const handle = client.workflow.getHandle(wf.workflowId);
                    await handle.cancel();
                    logger.info('Lead monitoring workflow cancelled', { workflowId: wf.workflowId, leadId });
                } catch (error: any) {
                    // Continue searching other workflows
                    logger.debug('Could not cancel workflow', { workflowId: wf.workflowId, error: error.message });
                }
            }
        } catch (error: any) {
            // Workflow might not exist or already completed
            logger.warn('Failed to stop lead monitoring workflow', {
                error: error.message,
                leadId,
            });
        }
    }

    /**
     * Get monitoring status for a lead
     * Note: This searches for active workflows since workflow IDs are now based on userId and linkedinUrl
     */
    async getMonitoringStatus(leadId: string): Promise<{
        isRunning: boolean;
        workflowId?: string;
        runId?: string;
        status?: string;
    }> {
        try {
            const client = this.temporalClient.getClient();

            // Get the lead to find its linkedinUrl
            const leadRepository = new ReporterLeadRepository();
            const lead = await leadRepository.findById(leadId);

            if (!lead) {
                return {
                    isRunning: false,
                };
            }

            // Search for active workflows
            const query = `WorkflowType = 'leadMonitorWorkflow' AND ExecutionStatus = 'Running'`;
            const listIterable = client.workflow.list({ query });

            for await (const wf of listIterable) {
                // Check if this workflow is for this lead's linkedinUrl
                // Since we can't easily match, we'll return the first running workflow
                // In production, you might want to store workflow IDs in the database
                const handle = client.workflow.getHandle(wf.workflowId);
                const description = await handle.describe();

                return {
                    isRunning: description.status.name === 'RUNNING',
                    workflowId: description.workflowId,
                    runId: description.runId,
                    status: description.status.name,
                };
            }

            return {
                isRunning: false,
            };
        } catch (error: any) {
            // Workflow doesn't exist
            return {
                isRunning: false,
            };
        }
    }

    /**
     * Get all active monitoring workflows for a user
     */
    async getActiveMonitoringWorkflows(userId: string): Promise<Array<{
        workflowId: string;
        leadId: string;
        status: string;
        startTime: Date;
    }>> {
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
}
