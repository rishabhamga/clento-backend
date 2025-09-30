/**
 * Campaign Execution Database Activities
 * 
 * Activities for managing campaign execution records in the database.
 */

import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../utils/logger';
import { ActivityResult } from '../../workflows/workflow.types';

export interface CreateExecutionActivityInput {
    campaignId: string;
    leadId: string;
    executionId: string;
    totalSteps: number;
}

export interface UpdateExecutionActivityInput {
    executionId: string;
    status?: 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'failed' | 'skipped';
    current_step?: number;
    execution_data?: Record<string, any>;
    started_at?: string;
    completed_at?: string;
}

/**
 * Create Campaign Execution Activity
 */
export async function CreateExecutionActivity(
    input: CreateExecutionActivityInput
): Promise<ActivityResult> {
    logger.info('Creating campaign execution record', {
        campaignId: input.campaignId,
        leadId: input.leadId,
        executionId: input.executionId,
        totalSteps: input.totalSteps,
    });

    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not initialized');
        }

        const executionData = {
            id: input.executionId,
            campaign_id: input.campaignId,
            lead_id: input.leadId,
            workflow_execution_id: input.executionId,
            status: 'pending' as const,
            current_step: 0,
            total_steps: input.totalSteps,
            execution_data: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabaseAdmin
            .from('campaign_executions')
            .insert(executionData)
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to create campaign execution: ${error.message}`);
        }

        logger.info('Campaign execution record created successfully', {
            executionId: data.id,
            campaignId: input.campaignId,
            leadId: input.leadId,
        });

        return {
            success: true,
            data: data,
        };

    } catch (error: any) {
        logger.error('Failed to create campaign execution record', {
            campaignId: input.campaignId,
            leadId: input.leadId,
            executionId: input.executionId,
            error: error.message,
        });

        return {
            success: false,
            error: error.message,
            retryable: isRetryableError(error),
        };
    }
}

/**
 * Update Campaign Execution Activity
 */
export async function UpdateExecutionActivity(
    input: UpdateExecutionActivityInput
): Promise<ActivityResult> {
    logger.info('Updating campaign execution record', {
        executionId: input.executionId,
        status: input.status,
        current_step: input.current_step,
    });

    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not initialized');
        }

        const updateData = {
            ...input,
            updated_at: new Date().toISOString(),
        };

        // Remove executionId from update data
        delete (updateData as any).executionId;

        const { data, error } = await supabaseAdmin
            .from('campaign_executions')
            .update(updateData)
            .eq('id', input.executionId)
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to update campaign execution: ${error.message}`);
        }

        logger.info('Campaign execution record updated successfully', {
            executionId: input.executionId,
            status: data.status,
            current_step: data.current_step,
        });

        return {
            success: true,
            data: data,
        };

    } catch (error: any) {
        logger.error('Failed to update campaign execution record', {
            executionId: input.executionId,
            error: error.message,
        });

        return {
            success: false,
            error: error.message,
            retryable: isRetryableError(error),
        };
    }
}

/**
 * Get Campaign Execution Activity
 */
export async function GetExecutionActivity(
    executionId: string
): Promise<ActivityResult> {
    logger.info('Getting campaign execution record', {
        executionId,
    });

    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not initialized');
        }

        const { data, error } = await supabaseAdmin
            .from('campaign_executions')
            .select('*')
            .eq('id', executionId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') { // Not found
                return {
                    success: false,
                    error: 'Campaign execution not found',
                    retryable: false,
                };
            }
            throw new Error(`Failed to get campaign execution: ${error.message}`);
        }

        logger.info('Campaign execution record retrieved successfully', {
            executionId,
            status: data.status,
            current_step: data.current_step,
        });

        return {
            success: true,
            data: data,
        };

    } catch (error: any) {
        logger.error('Failed to get campaign execution record', {
            executionId,
            error: error.message,
        });

        return {
            success: false,
            error: error.message,
            retryable: isRetryableError(error),
        };
    }
}

/**
 * Load Leads from Lead List Activity
 */
export async function LoadLeadsActivity(
    leadListId: string
): Promise<ActivityResult> {
    logger.info('Loading leads from lead list', {
        leadListId,
    });

    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not initialized');
        }

        const { data, error } = await supabaseAdmin
            .from('leads')
            .select('*')
            .eq('lead_list_id', leadListId)
            .eq('is_deleted', false);

        if (error) {
            throw new Error(`Failed to load leads: ${error.message}`);
        }

        logger.info('Leads loaded successfully', {
            leadListId,
            leadCount: data?.length || 0,
        });

        return {
            success: true,
            data: data || [],
        };

    } catch (error: any) {
        logger.error('Failed to load leads from lead list', {
            leadListId,
            error: error.message,
        });

        return {
            success: false,
            error: error.message,
            retryable: isRetryableError(error),
        };
    }
}

/**
 * Update Campaign Status Activity
 */
export async function UpdateCampaignStatusActivity(
    campaignId: string,
    status: string,
    additionalData?: Record<string, any>
): Promise<ActivityResult> {
    logger.info('Updating campaign status', {
        campaignId,
        status,
    });

    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not initialized');
        }

        const updateData = {
            status,
            updated_at: new Date().toISOString(),
            ...additionalData,
        };

        const { data, error } = await supabaseAdmin
            .from('campaigns')
            .update(updateData)
            .eq('id', campaignId)
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to update campaign status: ${error.message}`);
        }

        logger.info('Campaign status updated successfully', {
            campaignId,
            status: data.status,
        });

        return {
            success: true,
            data: data,
        };

    } catch (error: any) {
        logger.error('Failed to update campaign status', {
            campaignId,
            status,
            error: error.message,
        });

        return {
            success: false,
            error: error.message,
            retryable: isRetryableError(error),
        };
    }
}

/**
 * Helper function to determine if error is retryable
 */
function isRetryableError(error: any): boolean {
    const retryableErrors = [
        'network',
        'timeout',
        'connection',
        'temporary',
        'server_error',
    ];

    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code?.toLowerCase() || '';

    // Database constraint violations are not retryable
    const nonRetryableErrors = [
        'unique_violation',
        'foreign_key_violation',
        'check_violation',
        'not_null_violation',
    ];

    const isNonRetryable = nonRetryableErrors.some(nonRetryable => 
        errorMessage.includes(nonRetryable) || errorCode.includes(nonRetryable)
    );

    if (isNonRetryable) {
        return false;
    }

    return retryableErrors.some(retryable => 
        errorMessage.includes(retryable) || errorCode.includes(retryable)
    );
}
