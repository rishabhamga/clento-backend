/**
 * Temporal Client Service
 *
 * Service for managing Temporal client connections and workflow operations.
 * Provides a clean interface for starting, monitoring, and controlling workflows.
 */

import { Client, Connection, WorkflowHandle } from '@temporalio/client';
import { getTemporalConnectionOptions, getTemporalConfig } from '../config/temporal.config';
import { logger } from '../../utils/logger';
import {
    CampaignOrchestratorInput,
    LeadOutreachInput,
    WorkflowStatus,
    CampaignStatus,
    WORKFLOW_TYPES,
    SIGNAL_TYPES,
    QUERY_TYPES,
    PauseCampaignSignal,
    ResumeCampaignSignal,
    StopCampaignSignal,
} from '../workflows/workflow.types';

export class TemporalClientService {
    private static instance: TemporalClientService;
    private client: Client | null = null;
    private connection: Connection | null = null;
    private config = getTemporalConfig();

    private constructor() {}

    public static getInstance(): TemporalClientService {
        if (!TemporalClientService.instance) {
            TemporalClientService.instance = new TemporalClientService();
        }
        return TemporalClientService.instance;
    }

    /**
     * Initialize Temporal client connection
     */
    public async initialize(): Promise<void> {
        try {
            if (this.client) {
                logger.info('Temporal client already initialized');
                return;
            }

            logger.info('Initializing Temporal client connection');

            // Create connection
            this.connection = await Connection.connect(getTemporalConnectionOptions());

            // Create client
            this.client = new Client({
                connection: this.connection,
                namespace: this.config.namespace,
            });

            logger.info('Temporal client initialized successfully', {
                namespace: this.config.namespace,
                address: this.config.address,
            });
        } catch (error) {
            logger.error('Failed to initialize Temporal client', { error });
            throw error;
        }
    }

    /**
     * Get Temporal client instance
     */
    public getClient(): Client {
        if (!this.client) {
            throw new Error('Temporal client not initialized. Call initialize() first.');
        }
        return this.client;
    }

    /**
     * Start a campaign orchestrator workflow
     */
    public async startCampaignWorkflow(
        input: CampaignOrchestratorInput
    ): Promise<WorkflowHandle<any>> {
        try {
            const client = this.getClient();
            const workflowId = `campaign-${input.campaignId}-${Date.now()}`;

            logger.info('Starting campaign workflow', {
                campaignId: input.campaignId,
                workflowId,
                organizationId: input.organizationId,
                accountId: input.accountId,
                leadListId: input.leadListId,
            });

            const handle = await client.workflow.start(WORKFLOW_TYPES.CAMPAIGN_ORCHESTRATOR, {
                args: [input],
                taskQueue: this.config.taskQueue,
                workflowId,
                workflowExecutionTimeout: this.config.workflowExecutionTimeout,
                workflowRunTimeout: this.config.workflowRunTimeout,
                workflowTaskTimeout: this.config.workflowTaskTimeout,
                memo: {
                    campaignId: input.campaignId,
                    organizationId: input.organizationId,
                    accountId: input.accountId,
                },
                searchAttributes: {
                    CampaignId: [input.campaignId],
                    OrganizationId: [input.organizationId],
                    AccountId: [input.accountId],
                },
            });

            logger.info('Campaign workflow started successfully', {
                campaignId: input.campaignId,
                workflowId: handle.workflowId,
                runId: handle.firstExecutionRunId,
            });

            return handle;
        } catch (error) {
            logger.error('Failed to start campaign workflow', {
                campaignId: input.campaignId,
                error,
            });
            throw error;
        }
    }

    /**
     * Start an individual lead workflow
     */
    public async startLeadWorkflow(
        input: LeadOutreachInput
    ): Promise<WorkflowHandle<any>> {
        try {
            const client = this.getClient();
            const workflowId = `lead-${input.lead.id}-${input.campaignId}-${Date.now()}`;

            logger.info('Starting lead workflow', {
                leadId: input.lead.id,
                campaignId: input.campaignId,
                workflowId,
                executionId: input.executionId,
            });

            const handle = await client.workflow.start(WORKFLOW_TYPES.LEAD_OUTREACH, {
                args: [input],
                taskQueue: this.config.taskQueue,
                workflowId,
                workflowExecutionTimeout: this.config.workflowExecutionTimeout,
                workflowRunTimeout: this.config.workflowRunTimeout,
                workflowTaskTimeout: this.config.workflowTaskTimeout,
                memo: {
                    leadId: input.lead.id,
                    campaignId: input.campaignId,
                    executionId: input.executionId,
                },
                searchAttributes: {
                    LeadId: [input.lead.id],
                    CampaignId: [input.campaignId],
                    ExecutionId: [input.executionId],
                },
            });

            logger.info('Lead workflow started successfully', {
                leadId: input.lead.id,
                campaignId: input.campaignId,
                workflowId: handle.workflowId,
                runId: handle.firstExecutionRunId,
            });

            return handle;
        } catch (error) {
            logger.error('Failed to start lead workflow', {
                leadId: input.lead.id,
                campaignId: input.campaignId,
                error,
            });
            throw error;
        }
    }

    /**
     * Get workflow handle by ID
     */
    public async getWorkflowHandle(workflowId: string): Promise<WorkflowHandle<any>> {
        try {
            const client = this.getClient();
            return client.workflow.getHandle(workflowId);
        } catch (error) {
            logger.error('Failed to get workflow handle', { workflowId, error });
            throw error;
        }
    }

    /**
     * Get workflow status
     */
    public async getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
        try {
            const handle = await this.getWorkflowHandle(workflowId);
            const description = await handle.describe();

            return {
                workflowId: description.workflowId,
                runId: description.runId,
                status: description.status.name as any,
                startTime: description.startTime.toISOString(),
                endTime: description.closeTime?.toISOString(),
                executionTime: description.closeTime
                    ? description.closeTime.getTime() - description.startTime.getTime()
                    : undefined,
                result: description.status.name === 'COMPLETED' ? await handle.result() : undefined,
                error: description.status.name === 'FAILED' ? description.status.message : undefined,
            };
        } catch (error) {
            logger.error('Failed to get workflow status', { workflowId, error });
            throw error;
        }
    }

    /**
     * Get campaign status with all lead workflows
     */
    public async getCampaignStatus(campaignId: string): Promise<CampaignStatus> {
        try {
            const client = this.getClient();

            // Search for all workflows related to this campaign
            const workflows = client.workflow.list({
                query: `CampaignId = "${campaignId}"`,
            });

            const workflowStatuses: WorkflowStatus[] = [];
            let totalLeads = 0;
            let processedLeads = 0;
            let successfulLeads = 0;
            let failedLeads = 0;
            let campaignStatus: 'pending' | 'running' | 'completed' | 'failed' | 'paused' = 'pending';
            let startTime: string | undefined;
            let endTime: string | undefined;

            for await (const workflow of workflows) {
                const status: WorkflowStatus = {
                    workflowId: workflow.workflowId,
                    runId: workflow.runId,
                    status: workflow.status.name as any,
                    startTime: workflow.startTime.toISOString(),
                    endTime: workflow.closeTime?.toISOString(),
                    executionTime: workflow.closeTime
                        ? workflow.closeTime.getTime() - workflow.startTime.getTime()
                        : undefined,
                };

                workflowStatuses.push(status);

                // Update counters
                if (workflow.workflowType === WORKFLOW_TYPES.LEAD_OUTREACH) {
                    totalLeads++;

                    if (workflow.status.name === 'COMPLETED') {
                        processedLeads++;
                        successfulLeads++;
                    } else if (workflow.status.name === 'FAILED') {
                        processedLeads++;
                        failedLeads++;
                    } else if (workflow.status.name === 'RUNNING') {
                        campaignStatus = 'running';
                    }
                }

                // Track campaign timing
                if (!startTime || workflow.startTime < new Date(startTime)) {
                    startTime = workflow.startTime.toISOString();
                }

                if (workflow.closeTime && (!endTime || workflow.closeTime > new Date(endTime))) {
                    endTime = workflow.closeTime.toISOString();
                }
            }

            // Determine overall campaign status
            if (processedLeads === totalLeads && totalLeads > 0) {
                campaignStatus = failedLeads === totalLeads ? 'failed' : 'completed';
            } else if (processedLeads > 0) {
                campaignStatus = 'running';
            }

            return {
                campaignId,
                status: campaignStatus,
                totalLeads,
                processedLeads,
                successfulLeads,
                failedLeads,
                startTime,
                endTime,
                workflows: workflowStatuses,
            };
        } catch (error) {
            logger.error('Failed to get campaign status', { campaignId, error });
            throw error;
        }
    }

    /**
     * Pause campaign workflow
     */
    public async pauseCampaign(
        workflowId: string,
        signal: PauseCampaignSignal
    ): Promise<void> {
        try {
            const handle = await this.getWorkflowHandle(workflowId);
            await handle.signal(SIGNAL_TYPES.PAUSE_CAMPAIGN, signal);

            logger.info('Campaign paused successfully', {
                workflowId,
                reason: signal.reason,
            });
        } catch (error) {
            logger.error('Failed to pause campaign', { workflowId, error });
            throw error;
        }
    }

    /**
     * Resume campaign workflow
     */
    public async resumeCampaign(
        workflowId: string,
        signal: ResumeCampaignSignal
    ): Promise<void> {
        try {
            const handle = await this.getWorkflowHandle(workflowId);
            await handle.signal(SIGNAL_TYPES.RESUME_CAMPAIGN, signal);

            logger.info('Campaign resumed successfully', {
                workflowId,
                resumeAt: signal.resumeAt,
            });
        } catch (error) {
            logger.error('Failed to resume campaign', { workflowId, error });
            throw error;
        }
    }

    /**
     * Stop campaign workflow
     */
    public async stopCampaign(
        workflowId: string,
        signal: StopCampaignSignal
    ): Promise<void> {
        try {
            const handle = await this.getWorkflowHandle(workflowId);
            await handle.signal(SIGNAL_TYPES.STOP_CAMPAIGN, signal);

            logger.info('Campaign stopped successfully', {
                workflowId,
                reason: signal.reason,
                completeCurrentExecutions: signal.completeCurrentExecutions,
            });
        } catch (error) {
            logger.error('Failed to stop campaign', { workflowId, error });
            throw error;
        }
    }

    /**
     * Cancel workflow
     */
    public async cancelWorkflow(workflowId: string, reason?: string): Promise<void> {
        try {
            const handle = await this.getWorkflowHandle(workflowId);
            await handle.cancel(reason);

            logger.info('Workflow cancelled successfully', {
                workflowId,
                reason,
            });
        } catch (error) {
            logger.error('Failed to cancel workflow', { workflowId, error });
            throw error;
        }
    }

    /**
     * Terminate workflow
     */
    public async terminateWorkflow(workflowId: string, reason?: string): Promise<void> {
        try {
            const handle = await this.getWorkflowHandle(workflowId);
            await handle.terminate(reason);

            logger.info('Workflow terminated successfully', {
                workflowId,
                reason,
            });
        } catch (error) {
            logger.error('Failed to terminate workflow', { workflowId, error });
            throw error;
        }
    }

    /**
     * Close Temporal client connection
     */
    public async close(): Promise<void> {
        try {
            if (this.connection) {
                await this.connection.close();
                this.connection = null;
            }

            this.client = null;

            logger.info('Temporal client connection closed');
        } catch (error) {
            logger.error('Failed to close Temporal client connection', { error });
            throw error;
        }
    }
}
