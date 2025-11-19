import { CampaignOrchestratorInput, TemporalClientService } from '../temporal/services/temporal-client.service';
import { UnipileWrapperService } from '../temporal/services/unipile-wrapper.service';
import logger from '../utils/logger';
import { testWorkflow } from '../temporal/workflows/testWorkflow';
import { CampaignService } from './CampaignService';
import { DisplayError } from '../errors/AppError';

export class TemporalService {
    private static instance: TemporalService;
    private temporalClient = TemporalClientService.getInstance();
    private unipileService = UnipileWrapperService.getInstance();
    private campaignService = new CampaignService();

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
                taskQueue: 'campaign-task-queue', // ✅ Must match worker
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

        const query = `WorkflowType = 'parentWorkflow' AND TaskQueue = 'campaign-task-queue' AND ExecutionStatus = 'Running'`;

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
}
