/**
 * Send Invitation Activity
 * 
 * Activity for sending LinkedIn connection requests with personalized messages.
 */

import { UnipileWrapperService } from '../../services/unipile-wrapper.service';
import { logger } from '../../../utils/logger';
import { ActivityResult, SendInvitationResult } from '../../workflows/workflow.types';

export interface SendInvitationActivityInput {
    accountId: string;
    leadId: string;
    providerId: string; // LinkedIn profile ID
    config: {
        useAI?: boolean;
        tone?: 'moderate' | 'warm' | 'professional';
        formality?: 'approachable' | 'formal' | 'casual';
        approach?: 'diplomatic' | 'direct' | 'indirect';
        focus?: 'relational' | 'personal' | 'business';
        intention?: 'networking' | 'sales' | 'recruitment';
        callToAction?: 'confident' | 'subtle';
        personalization?: 'specific' | 'generic';
        language?: string;
        engageWithRecentActivity?: boolean;
        customGuidelines?: string;
        message?: string; // Custom message if not using AI
    };
}

/**
 * Send Invitation Activity Implementation
 */
export async function SendInvitationActivity(
    input: SendInvitationActivityInput
): Promise<SendInvitationResult> {
    logger.info('Starting send invitation activity', {
        accountId: input.accountId,
        leadId: input.leadId,
        providerId: input.providerId,
        useAI: input.config.useAI,
        tone: input.config.tone,
    });

    try {
        const unipileService = UnipileWrapperService.getInstance();
        
        const result = await unipileService.sendInvitation({
            accountId: input.accountId,
            providerId: input.providerId,
            message: input.config.message,
            useAI: input.config.useAI ?? true,
            tone: input.config.tone || 'moderate',
            formality: input.config.formality || 'approachable',
            approach: input.config.approach || 'diplomatic',
            focus: input.config.focus || 'relational',
            intention: input.config.intention || 'networking',
            personalization: input.config.personalization || 'specific',
            language: input.config.language || 'english',
            engageWithRecentActivity: input.config.engageWithRecentActivity ?? true,
            customGuidelines: input.config.customGuidelines,
        });

        if (result.success) {
            logger.info('Send invitation activity completed successfully', {
                accountId: input.accountId,
                leadId: input.leadId,
                providerId: input.providerId,
                invitationId: result.data?.invitationId,
                status: result.data?.status,
            });
        } else {
            logger.warn('Send invitation activity failed', {
                accountId: input.accountId,
                leadId: input.leadId,
                providerId: input.providerId,
                error: result.error,
            });
        }

        return result as SendInvitationResult;

    } catch (error: any) {
        logger.error('Send invitation activity failed with exception', {
            accountId: input.accountId,
            leadId: input.leadId,
            providerId: input.providerId,
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
        'rate_limit',
        'server_error',
        'temporary',
        'connection',
    ];

    const errorMessage = error.message?.toLowerCase() || '';
    const errorType = error.type?.toLowerCase() || '';

    // Don't retry authentication or account issues
    const nonRetryableErrors = [
        'authentication',
        'invalid_credentials',
        'account_suspended',
        'insufficient_privileges',
        'already_connected',
    ];

    const isNonRetryable = nonRetryableErrors.some(nonRetryable => 
        errorMessage.includes(nonRetryable) || errorType.includes(nonRetryable)
    );

    if (isNonRetryable) {
        return false;
    }

    return retryableErrors.some(retryable => 
        errorMessage.includes(retryable) || errorType.includes(retryable)
    );
}
