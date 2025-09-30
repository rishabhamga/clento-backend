/**
 * Like Post Activity
 * 
 * Activity for liking LinkedIn posts from a lead's profile.
 */

import { UnipileWrapperService } from '../../services/unipile-wrapper.service';
import { logger } from '../../../utils/logger';
import { ActivityResult, LikePostResult } from '../../workflows/workflow.types';

export interface LikePostActivityInput {
    accountId: string;
    leadId: string;
    identifier: string; // LinkedIn URL, ID, or name
    config: {
        numberOfPosts?: number;
        recentPostDays?: number;
    };
}

/**
 * Like Post Activity Implementation
 */
export async function LikePostActivity(
    input: LikePostActivityInput
): Promise<LikePostResult> {
    logger.info('Starting like post activity', {
        accountId: input.accountId,
        leadId: input.leadId,
        identifier: input.identifier,
        numberOfPosts: input.config.numberOfPosts,
        recentPostDays: input.config.recentPostDays,
    });

    try {
        const unipileService = UnipileWrapperService.getInstance();
        
        const result = await unipileService.likePosts({
            accountId: input.accountId,
            identifier: input.identifier,
            numberOfPosts: input.config.numberOfPosts || 1,
            recentPostDays: input.config.recentPostDays || 7,
        });

        if (result.success) {
            logger.info('Like post activity completed successfully', {
                accountId: input.accountId,
                leadId: input.leadId,
                identifier: input.identifier,
                postsLiked: result.data?.postsLiked,
                postIds: result.data?.postIds,
            });
        } else {
            logger.warn('Like post activity failed', {
                accountId: input.accountId,
                leadId: input.leadId,
                identifier: input.identifier,
                error: result.error,
            });
        }

        return result as LikePostResult;

    } catch (error: any) {
        logger.error('Like post activity failed with exception', {
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
