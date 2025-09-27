/**
 * Profile Visit Activity
 * 
 * Activity for visiting LinkedIn profiles and triggering view notifications.
 */

import { UnipileWrapperService } from '../../services/unipile-wrapper.service';
import { logger } from '../../../utils/logger';
import { ActivityResult, ProfileVisitResult } from '../../workflows/workflow.types';

export interface ProfileVisitActivityInput {
    accountId: string;
    leadId: string;
    identifier: string; // LinkedIn URL, ID, or name
    config: {
        notify?: boolean;
        linkedinSections?: string;
    };
}

/**
 * Profile Visit Activity Implementation
 */
export async function ProfileVisitActivity(
    input: ProfileVisitActivityInput
): Promise<ProfileVisitResult> {
    logger.info('Starting profile visit activity', {
        accountId: input.accountId,
        leadId: input.leadId,
        identifier: input.identifier,
        notify: input.config.notify,
    });

    try {
        const unipileService = UnipileWrapperService.getInstance();
        
        const result = await unipileService.visitProfile({
            accountId: input.accountId,
            identifier: input.identifier,
            notify: input.config.notify ?? true,
            linkedinSections: input.config.linkedinSections || '*',
        });

        if (result.success) {
            logger.info('Profile visit completed successfully', {
                accountId: input.accountId,
                leadId: input.leadId,
                identifier: input.identifier,
                profileData: result.data?.profileData,
            });
        } else {
            logger.warn('Profile visit failed', {
                accountId: input.accountId,
                leadId: input.leadId,
                identifier: input.identifier,
                error: result.error,
            });
        }

        return result as ProfileVisitResult;

    } catch (error: any) {
        logger.error('Profile visit activity failed with exception', {
            accountId: input.accountId,
            leadId: input.leadId,
            identifier: input.identifier,
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

    return retryableErrors.some(retryable => 
        errorMessage.includes(retryable) || errorType.includes(retryable)
    );
}
