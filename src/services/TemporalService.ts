/**
 * Temporal Service
 * 
 * Main service for integrating Temporal workflows with the Clento backend.
 * Provides high-level methods for campaign execution and monitoring.
 */

import { TemporalClientService } from '../temporal/services/temporal-client.service';
import { UnipileWrapperService } from '../temporal/services/unipile-wrapper.service';
import { CampaignService } from './CampaignService';
import { LeadListService } from './LeadListService';
import { ConnectedAccountService } from './ConnectedAccountService';
import { supabaseAdmin } from '../config/supabase';
import { logger } from '../utils/logger';
import {
    CampaignOrchestratorInput,
    LeadOutreachInput,
    WorkflowDefinition,
    Lead,
    CampaignStatus,
    WorkflowStatus,
} from '../temporal/workflows/workflow.types';
import { WorkflowHandle } from '@temporalio/client';

export interface StartCampaignOptions {
    campaignId: string;
    organizationId: string;
    maxConcurrentLeads?: number;
    leadProcessingDelay?: number;
}

export interface CampaignExecutionRecord {
    id: string;
    campaign_id: string;
    lead_id: string;
    workflow_execution_id: string;
    status: 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'failed' | 'skipped';
    current_step: number;
    total_steps: number;
    execution_data: Record<string, any>;
    created_at: string;
    updated_at: string;
    started_at?: string;
    completed_at?: string;
}

export class TemporalService {
    private static instance: TemporalService;
    private temporalClient = TemporalClientService.getInstance();
    private unipileService = UnipileWrapperService.getInstance();
    private campaignService = new CampaignService();
    private leadListService = new LeadListService();
    private connectedAccountService = new ConnectedAccountService();

    private constructor() {}

    public static getInstance(): TemporalService {
        if (!TemporalService.instance) {
            TemporalService.instance = new TemporalService();
        }
        return TemporalService.instance;
    }

    /**
     * Initialize Temporal service
     */
    public async initialize(): Promise<void> {
        try {
            logger.info('Initializing Temporal service');

            // Initialize Temporal client
            await this.temporalClient.initialize();

            // Initialize Unipile service
            const unipileConfig = {
                dsn: process.env.UNIPILE_DSN!,
                accessToken: process.env.UNIPILE_ACCESS_TOKEN!,
            };

            if (!unipileConfig.dsn || !unipileConfig.accessToken) {
                throw new Error('Missing Unipile configuration. Please check UNIPILE_DSN and UNIPILE_ACCESS_TOKEN environment variables.');
            }

            this.unipileService.initialize(unipileConfig);

            logger.info('Temporal service initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Temporal service', { error });
            throw error;
        }
    }

    /**
     * Start a campaign execution
     */
    public async startCampaign(options: StartCampaignOptions): Promise<WorkflowHandle<any>> {
        try {
            logger.info('Starting campaign execution', {
                campaignId: options.campaignId,
                organizationId: options.organizationId,
            });

            // Get campaign details
            const campaign = await this.campaignService.getCampaignById(options.campaignId);
            if (!campaign) {
                throw new Error(`Campaign not found: ${options.campaignId}`);
            }

            // Get lead list
            const leadList = await this.leadListService.getLeadListById(campaign.prospect_list!);
            if (!leadList) {
                throw new Error(`Lead list not found: ${campaign.prospect_list}`);
            }

            // Get connected account
            const account = await this.connectedAccountService.getConnectedAccountById(campaign.sender_account!);
            if (!account) {
                throw new Error(`Connected account not found: ${campaign.sender_account}`);
            }

            // Validate account is active
            if (account.status !== 'connected') {
                throw new Error(`Account is not connected: ${account.display_name}`);
            }

            // Parse workflow definition
            let workflowDefinition: WorkflowDefinition;
            try {
                workflowDefinition = typeof campaign.workflow_definition === 'string' 
                    ? JSON.parse(campaign.workflow_definition)
                    : campaign.workflow_definition;
            } catch (error) {
                throw new Error('Invalid workflow definition format');
            }

            // Update campaign status to active
            await this.campaignService.updateCampaign(options.campaignId, {
                status: 'active',
                started_at: new Date().toISOString(),
            });

            // Prepare workflow input
            const workflowInput: CampaignOrchestratorInput = {
                campaignId: options.campaignId,
                organizationId: options.organizationId,
                accountId: account.id,
                leadListId: leadList.id,
                workflowDefinition,
                maxConcurrentLeads: options.maxConcurrentLeads || 100,
                leadProcessingDelay: options.leadProcessingDelay || 30,
            };

            // Start campaign workflow
            const workflowHandle = await this.temporalClient.startCampaignWorkflow(workflowInput);

            // Update campaign with workflow ID
            await this.campaignService.updateCampaign(options.campaignId, {
                workflow_id: workflowHandle.workflowId,
            });

            logger.info('Campaign started successfully', {
                campaignId: options.campaignId,
                workflowId: workflowHandle.workflowId,
                runId: workflowHandle.firstExecutionRunId,
            });

            return workflowHandle;
        } catch (error) {
            logger.error('Failed to start campaign', {
                campaignId: options.campaignId,
                error,
            });

            // Update campaign status to failed
            try {
                await this.campaignService.updateCampaign(options.campaignId, {
                    status: 'failed',
                });
            } catch (updateError) {
                logger.error('Failed to update campaign status to failed', {
                    campaignId: options.campaignId,
                    error: updateError,
                });
            }

            throw error;
        }
    }

    /**
     * Pause a campaign
     */
    public async pauseCampaign(campaignId: string, reason?: string): Promise<void> {
        try {
            logger.info('Pausing campaign', { campaignId, reason });

            const campaign = await this.campaignService.getCampaignById(campaignId);
            if (!campaign || !campaign.workflow_id) {
                throw new Error(`Campaign or workflow not found: ${campaignId}`);
            }

            // Send pause signal to workflow
            await this.temporalClient.pauseCampaign(campaign.workflow_id, { reason });

            // Update campaign status
            await this.campaignService.updateCampaign(campaignId, {
                status: 'paused',
            });

            logger.info('Campaign paused successfully', { campaignId });
        } catch (error) {
            logger.error('Failed to pause campaign', { campaignId, error });
            throw error;
        }
    }

    /**
     * Resume a campaign
     */
    public async resumeCampaign(campaignId: string): Promise<void> {
        try {
            logger.info('Resuming campaign', { campaignId });

            const campaign = await this.campaignService.getCampaignById(campaignId);
            if (!campaign || !campaign.workflow_id) {
                throw new Error(`Campaign or workflow not found: ${campaignId}`);
            }

            // Send resume signal to workflow
            await this.temporalClient.resumeCampaign(campaign.workflow_id, {});

            // Update campaign status
            await this.campaignService.updateCampaign(campaignId, {
                status: 'active',
            });

            logger.info('Campaign resumed successfully', { campaignId });
        } catch (error) {
            logger.error('Failed to resume campaign', { campaignId, error });
            throw error;
        }
    }

    /**
     * Stop a campaign
     */
    public async stopCampaign(campaignId: string, reason?: string, completeCurrentExecutions = true): Promise<void> {
        try {
            logger.info('Stopping campaign', { campaignId, reason, completeCurrentExecutions });

            const campaign = await this.campaignService.getCampaignById(campaignId);
            if (!campaign || !campaign.workflow_id) {
                throw new Error(`Campaign or workflow not found: ${campaignId}`);
            }

            // Send stop signal to workflow
            await this.temporalClient.stopCampaign(campaign.workflow_id, {
                reason,
                completeCurrentExecutions,
            });

            // Update campaign status
            await this.campaignService.updateCampaign(campaignId, {
                status: 'completed',
                completed_at: new Date().toISOString(),
            });

            logger.info('Campaign stopped successfully', { campaignId });
        } catch (error) {
            logger.error('Failed to stop campaign', { campaignId, error });
            throw error;
        }
    }

    /**
     * Get campaign status with detailed workflow information
     */
    public async getCampaignStatus(campaignId: string): Promise<CampaignStatus> {
        try {
            const campaign = await this.campaignService.getCampaignById(campaignId);
            if (!campaign) {
                throw new Error(`Campaign not found: ${campaignId}`);
            }

            if (!campaign.workflow_id) {
                // Campaign not started yet
                return {
                    campaignId,
                    status: 'pending',
                    totalLeads: 0,
                    processedLeads: 0,
                    successfulLeads: 0,
                    failedLeads: 0,
                    workflows: [],
                };
            }

            // Get status from Temporal
            const status = await this.temporalClient.getCampaignStatus(campaignId);

            // Update campaign status in database if needed
            if (status.status === 'completed' && campaign.status !== 'completed') {
                await this.campaignService.updateCampaign(campaignId, {
                    status: 'completed',
                    completed_at: status.endTime || new Date().toISOString(),
                });
            } else if (status.status === 'failed' && campaign.status !== 'failed') {
                await this.campaignService.updateCampaign(campaignId, {
                    status: 'failed',
                });
            }

            return status;
        } catch (error) {
            logger.error('Failed to get campaign status', { campaignId, error });
            throw error;
        }
    }

    /**
     * Get workflow status
     */
    public async getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
        try {
            return await this.temporalClient.getWorkflowStatus(workflowId);
        } catch (error) {
            logger.error('Failed to get workflow status', { workflowId, error });
            throw error;
        }
    }

    /**
     * Create campaign execution record
     */
    public async createCampaignExecution(
        campaignId: string,
        leadId: string,
        workflowExecutionId: string,
        totalSteps: number
    ): Promise<CampaignExecutionRecord> {
        try {
            if (!supabaseAdmin) {
                throw new Error('Supabase admin client not initialized');
            }

            const executionData = {
                campaign_id: campaignId,
                lead_id: leadId,
                workflow_execution_id: workflowExecutionId,
                status: 'pending' as const,
                current_step: 0,
                total_steps: totalSteps,
                execution_data: {},
            };

            const { data, error } = await supabaseAdmin
                .from('campaign_executions')
                .insert(executionData)
                .select()
                .single();

            if (error) {
                throw new Error(`Failed to create campaign execution: ${error.message}`);
            }

            logger.info('Campaign execution created', {
                executionId: data.id,
                campaignId,
                leadId,
                workflowExecutionId,
            });

            return data;
        } catch (error) {
            logger.error('Failed to create campaign execution', {
                campaignId,
                leadId,
                workflowExecutionId,
                error,
            });
            throw error;
        }
    }

    /**
     * Update campaign execution record
     */
    public async updateCampaignExecution(
        executionId: string,
        updates: Partial<CampaignExecutionRecord>
    ): Promise<CampaignExecutionRecord> {
        try {
            if (!supabaseAdmin) {
                throw new Error('Supabase admin client not initialized');
            }

            const updateData = {
                ...updates,
                updated_at: new Date().toISOString(),
            };

            const { data, error } = await supabaseAdmin
                .from('campaign_executions')
                .update(updateData)
                .eq('id', executionId)
                .select()
                .single();

            if (error) {
                throw new Error(`Failed to update campaign execution: ${error.message}`);
            }

            return data;
        } catch (error) {
            logger.error('Failed to update campaign execution', {
                executionId,
                updates,
                error,
            });
            throw error;
        }
    }

    /**
     * Get campaign executions
     */
    public async getCampaignExecutions(campaignId: string): Promise<CampaignExecutionRecord[]> {
        try {
            if (!supabaseAdmin) {
                throw new Error('Supabase admin client not initialized');
            }

            const { data, error } = await supabaseAdmin
                .from('campaign_executions')
                .select('*')
                .eq('campaign_id', campaignId)
                .order('created_at', { ascending: false });

            if (error) {
                throw new Error(`Failed to get campaign executions: ${error.message}`);
            }

            return data || [];
        } catch (error) {
            logger.error('Failed to get campaign executions', { campaignId, error });
            throw error;
        }
    }

    /**
     * Get lead execution status
     */
    public async getLeadExecutionStatus(campaignId: string, leadId: string): Promise<CampaignExecutionRecord | null> {
        try {
            if (!supabaseAdmin) {
                throw new Error('Supabase admin client not initialized');
            }

            const { data, error } = await supabaseAdmin
                .from('campaign_executions')
                .select('*')
                .eq('campaign_id', campaignId)
                .eq('lead_id', leadId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
                throw new Error(`Failed to get lead execution status: ${error.message}`);
            }

            return data || null;
        } catch (error) {
            logger.error('Failed to get lead execution status', { campaignId, leadId, error });
            throw error;
        }
    }

    /**
     * Cleanup resources
     */
    public async cleanup(): Promise<void> {
        try {
            await this.temporalClient.close();
            logger.info('Temporal service cleanup completed');
        } catch (error) {
            logger.error('Failed to cleanup Temporal service', { error });
            throw error;
        }
    }
}
