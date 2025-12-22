import { Client, Connection, WorkflowClient, WorkflowHandle } from '@temporalio/client';
import logger from '../../utils/logger';
import { getTemporalConfig, getTemporalConnectionOptions } from '../config/temporal.config';
import { parentWorkflow } from '../workflows/parentWorkflow';
import { getCampaignTaskQueue } from '../../utils/queueUtil';

export interface CampaignOrchestratorInput {
    campaignId: string;
    organizationId: string;
    accountId: string;
    leadListId: string;
    maxConcurrentLeads?: number;
    leadProcessingDelay?: number;
    taskQueue?: string; // Task queue name for child workflows
}

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
            logger.error('Failed to initialize Temporal client', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                name: error instanceof Error ? error.name : undefined,
                cause: error instanceof Error ? error.cause : undefined,
                fullError: error,
            });
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

    public async startWorkflowCampaign(input: CampaignOrchestratorInput): Promise<WorkflowHandle | undefined> {
        try {
            logger.info('Starting workflow campaign', { input });

            // Ensure client is initialized
            if (!this.client?.workflow) {
                await this.initialize();
            }

            const campaignQueue = getCampaignTaskQueue();
            const workflowInput = {
                ...input,
                taskQueue: campaignQueue,
            };

            const handle = await this.client?.workflow.start(parentWorkflow, {
                args: [workflowInput],
                taskQueue: campaignQueue,
                workflowId: `campaign-${input.campaignId}`,
            });

            logger.info('Workflow campaign started', {
                workflowId: handle?.workflowId,
                runId: handle?.firstExecutionRunId,
            });

            return handle;
        } catch (error) {
            logger.error('Failed to start workflow campaign', { error });
            throw error;
        }
    }
}
