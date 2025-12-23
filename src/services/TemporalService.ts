import { CampaignOrchestratorInput, TemporalClientService } from '../temporal/services/temporal-client.service';
import { UnipileWrapperService } from '../temporal/services/unipile-wrapper.service';
import logger from '../utils/logger';
import { testWorkflow } from '../temporal/workflows/testWorkflow';
import { parentWorkflow } from '../temporal/workflows/parentWorkflow';
import { CampaignService } from './CampaignService';
import { DisplayError } from '../errors/AppError';
import { getCampaignTaskQueue } from '../utils/queueUtil';
import { CheckNever } from '../utils/apiUtil';

export class TemporalService {
    private static instance: TemporalService;
    private temporalClient = TemporalClientService.getInstance();
    private unipileService = UnipileWrapperService.getInstance();
    private campaignService = new CampaignService();

    public static getQueueName(type: 'campaign' | 'leadMonitor'): string {
        switch (type) {
            case 'campaign':
                if (process.env.USE_DEVELOPMENT_QUEUE) {
                    return 'dev-campaign-task-queue';
                } else {
                    return 'campaign-task-queue';
                }
            case 'leadMonitor':
                if (process.env.USE_DEVELOPMENT_QUEUE) {
                    return 'dev-lead-monitor-task-queue';
                } else {
                    return 'lead-monitor-task-queue';
                }
            default:
                return CheckNever(type);
        }
    }

    public static getInstance(): TemporalService {
        if (!TemporalService.instance) {
            TemporalService.instance = new TemporalService();
        }
        return TemporalService.instance;
    }

    public async initialize() {
        try {
            logger.info('Initializing Temporal Service');

            await this.temporalClient.initialize();

            const unipileConfig = {
                dns: process.env.UNIPILE_DNS!,
                accessToken: process.env.UNIPILE_ACCESS_TOKEN!,
            };

            if (!unipileConfig.dns || !unipileConfig.accessToken) {
                throw new Error('Missing Unipile DNS or Key');
            }

            this.unipileService.initialize(unipileConfig);

            logger.info('Temporal Initialization successful');
        } catch (error) {
            logger.error('Temporal Initialization Failed', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                name: error instanceof Error ? error.name : undefined,
                cause: error instanceof Error ? error.cause : undefined,
                fullError: error,
            });
            throw error;
        }
    }

    public async startCampaign(campaignId: string) {
        const campaign = await this.campaignService.getCampaignById(campaignId);
        if (!campaign) {
            throw new DisplayError('Workflow not found');
        }
        if (!campaign.organization_id) {
            throw new DisplayError('Organization not found');
        }
        if (!campaign.sender_account) {
            throw new DisplayError('Sender account not found');
        }
        if (!campaign.prospect_list) {
            throw new DisplayError('Prospect list not found');
        }

        const campaignInput: CampaignOrchestratorInput = {
            campaignId,
            organizationId: campaign.organization_id,
            accountId: campaign.sender_account,
            leadListId: campaign.prospect_list,
            maxConcurrentLeads: campaign.leads_per_day || 0,
        };

        const handle = await this.temporalClient.startWorkflowCampaign(campaignInput);
        return handle;
    }

    public async runTestWorkflow(input: { message: string; delay?: number; iterations?: number }) {
        try {
            logger.info('Starting test workflow', { input });

            const client = this.temporalClient.getClient();

            const workflowId = `test-workflow-${Date.now()}`;

            const handle = await client.workflow.start(testWorkflow, {
                args: [input],
                taskQueue: getCampaignTaskQueue(), // ✅ Must match worker
                workflowId,
            });

            logger.info('Test workflow started', {
                workflowId: handle.workflowId,
                runId: handle.firstExecutionRunId,
            });

            // Wait for the workflow to complete with timeout
            const timeoutMs = 30000; // 30 seconds timeout
            const result = await Promise.race([handle.result(), new Promise((_, reject) => setTimeout(() => reject(new Error(`Workflow timeout after ${timeoutMs}ms`)), timeoutMs))]);

            logger.info('Test workflow completed', {
                workflowId: handle.workflowId,
                result,
            });

            return {
                success: true,
                workflowId: handle.workflowId,
                runId: handle.firstExecutionRunId,
                result,
            };
        } catch (error) {
            logger.error('Failed to run test workflow', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                input,
            });
            throw error;
        }
    }

    /**
     * Get list of active campaign workflows
     * This is now only for monitoring - workers handle execution automatically
     */
    public async getActiveCampaignWorkflows() {
        const client = this.temporalClient.getClient();

        const campaignQueue = getCampaignTaskQueue();
        const query = `WorkflowType = 'parentWorkflow' AND TaskQueue = '${campaignQueue}' AND ExecutionStatus = 'Running'`;

        const listIterable = client.workflow.list({ query });

        const workflows = [];
        for await (const wf of listIterable) {
            workflows.push(wf);
        }

        logger.info(`Found ${workflows.length} active campaign workflow(s)`, {
            count: workflows.length,
            workflowIds: workflows.map(wf => wf.workflowId),
        });

        return workflows;
    }

    /**
     * Get campaign statistics
     */
    public async getCampaignStats() {
        const activeWorkflows = await this.getActiveCampaignWorkflows();

        return {
            activeCampaigns: activeWorkflows.length,
            workflows: activeWorkflows.map(wf => ({
                workflowId: wf.workflowId,
                runId: wf.runId,
                startTime: wf.startTime,
                status: wf.status,
            })),
        };
    }

    /**
     * Get workflow ID for a campaign
     */
    private getWorkflowIdForCampaign(campaignId: string): string {
        return `campaign-${campaignId}`;
    }

    /**
     * Check if workflow exists and is running for a campaign
     */
    private async checkWorkflowExists(campaignId: string): Promise<boolean> {
        try {
            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForCampaign(campaignId);

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
                campaignId,
            });
            return false;
        }
    }

    /**
     * Pause a campaign workflow
     * Sends a pause signal to the workflow
     * If no workflow exists, starts a new one first
     */
    public async pauseCampaign(campaignId: string): Promise<void> {
        try {
            logger.info('Pausing campaign workflow', { campaignId });

            // Verify campaign exists
            const campaign = await this.campaignService.getCampaignById(campaignId);
            if (!campaign) {
                throw new DisplayError(`Campaign not found: ${campaignId}`);
            }

            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForCampaign(campaignId);

            // Check if workflow exists
            const workflowExists = await this.checkWorkflowExists(campaignId);

            // If workflow doesn't exist, start it first
            if (!workflowExists) {
                logger.info('No active workflow found, starting new workflow before pausing', { campaignId });

                // Ensure temporal client is initialized
                await this.temporalClient.initialize();

                if (!campaign.organization_id) {
                    throw new DisplayError('Organization not found');
                }
                if (!campaign.sender_account) {
                    throw new DisplayError('Sender account not found');
                }
                if (!campaign.prospect_list) {
                    throw new DisplayError('Prospect list not found');
                }

                const campaignInput: CampaignOrchestratorInput = {
                    campaignId,
                    organizationId: campaign.organization_id,
                    accountId: campaign.sender_account,
                    leadListId: campaign.prospect_list,
                    maxConcurrentLeads: campaign.leads_per_day || 0,
                };

                const campaignQueue = getCampaignTaskQueue();
                const workflowInput = {
                    ...campaignInput,
                    taskQueue: campaignQueue,
                };
                const handle = await client.workflow.start(parentWorkflow, {
                    args: [workflowInput],
                    taskQueue: campaignQueue,
                    workflowId,
                });

                logger.info('Workflow started, now pausing it', {
                    workflowId: handle.workflowId,
                    campaignId,
                });

                // Use the handle from start to send signal
                await handle.signal('pause-campaign');

                logger.info('Pause signal sent to newly started workflow', {
                    workflowId: handle.workflowId,
                    campaignId,
                });
                return;
            }

            // Get workflow handle and send pause signal
            const handle = client.workflow.getHandle(workflowId);
            await handle.signal('pause-campaign');

            logger.info('Pause signal sent to workflow', {
                workflowId,
                campaignId,
            });
        } catch (error: any) {
            logger.error('Failed to pause campaign workflow', {
                error: error.message,
                stack: error.stack,
                campaignId,
            });
            throw error;
        }
    }

    /**
     * Resume a campaign workflow
     * Sends a resume signal to the workflow
     * If no workflow exists, starts a new one first
     */
    public async resumeCampaign(campaignId: string): Promise<void> {
        try {
            logger.info('Resuming campaign workflow', { campaignId });

            // Verify campaign exists
            const campaign = await this.campaignService.getCampaignById(campaignId);
            if (!campaign) {
                throw new DisplayError(`Campaign not found: ${campaignId}`);
            }

            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForCampaign(campaignId);

            // Check if workflow exists
            const workflowExists = await this.checkWorkflowExists(campaignId);

            // If workflow doesn't exist, start it first
            if (!workflowExists) {
                logger.info('No active workflow found, starting new workflow', { campaignId });

                // Ensure temporal client is initialized
                await this.temporalClient.initialize();

                if (!campaign.organization_id) {
                    throw new DisplayError('Organization not found');
                }
                if (!campaign.sender_account) {
                    throw new DisplayError('Sender account not found');
                }
                if (!campaign.prospect_list) {
                    throw new DisplayError('Prospect list not found');
                }

                const campaignInput: CampaignOrchestratorInput = {
                    campaignId,
                    organizationId: campaign.organization_id,
                    accountId: campaign.sender_account,
                    leadListId: campaign.prospect_list,
                    maxConcurrentLeads: campaign.leads_per_day || 0,
                };

                const campaignQueue = getCampaignTaskQueue();
                const workflowInput = {
                    ...campaignInput,
                    taskQueue: campaignQueue,
                };
                const handle = await client.workflow.start(parentWorkflow, {
                    args: [workflowInput],
                    taskQueue: campaignQueue,
                    workflowId,
                });

                logger.info('Workflow started successfully', {
                    workflowId: handle.workflowId,
                    campaignId,
                });
                // Workflow starts unpaused by default, so no need to send resume signal
                return;
            }

            // Get workflow handle and send resume signal
            const handle = client.workflow.getHandle(workflowId);
            await handle.signal('resume-campaign');

            logger.info('Resume signal sent to workflow', {
                workflowId,
                campaignId,
            });
        } catch (error: any) {
            logger.error('Failed to resume campaign workflow', {
                error: error.message,
                stack: error.stack,
                campaignId,
            });
            throw error;
        }
    }

    /**
     * Get campaign workflow status
     * Uses deterministic workflow ID to check status and queries internal pause state
     */
    public async getCampaignStatus(campaignId: string): Promise<{
        isRunning: boolean;
        isPaused?: boolean;
        workflowId?: string;
        runId?: string;
        status?: string;
    }> {
        try {
            const client = this.temporalClient.getClient();
            const workflowId = this.getWorkflowIdForCampaign(campaignId);

            try {
                const handle = client.workflow.getHandle(workflowId);
                const description = await handle.describe();

                // Check if workflow is running
                const isRunning = description.status.name === 'RUNNING';

                // If workflow is running, query its internal state to check if it's paused
                let isPaused = false;
                if (isRunning) {
                    try {
                        const status = await handle.query('get-campaign-status');
                        isPaused = (status as { isPaused: boolean })?.isPaused ?? false;
                    } catch (queryError: any) {
                        // Query might fail if workflow hasn't registered the query handler yet
                        // This can happen during workflow initialization
                        logger.warn('Failed to query workflow status, assuming not paused', {
                            error: queryError.message,
                            campaignId,
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
            logger.error('Failed to get campaign status', {
                error: error.message,
                campaignId,
            });
            return {
                isRunning: false,
            };
        }
    }
}
