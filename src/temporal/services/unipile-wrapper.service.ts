/**
 * Unipile Wrapper Service
 * 
 * Service that wraps Unipile SDK calls with rate limiting, error handling,
 * and retry logic for use in Temporal activities.
 */

import { UnipileClient } from 'unipile-node-sdk';
import { RateLimiterRegistry } from '../config/rate-limiter.config';
import { logger } from '../../utils/logger';
import { ActivityResult } from '../workflows/workflow.types';

export interface UnipileConfig {
    dsn: string;
    accessToken: string;
}

export interface ProfileVisitOptions {
    accountId: string;
    identifier: string;
    notify?: boolean;
    linkedinSections?: string;
}

export interface LikePostOptions {
    accountId: string;
    identifier: string;
    numberOfPosts?: number;
    recentPostDays?: number;
}

export interface CommentPostOptions {
    accountId: string;
    identifier: string;
    numberOfPosts?: number;
    recentPostDays?: number;
    configureWithAI?: boolean;
    commentLength?: 'short' | 'medium' | 'long';
    tone?: 'professional' | 'casual' | 'friendly';
    language?: string;
    customGuidelines?: string;
}

export interface SendInvitationOptions {
    accountId: string;
    providerId: string;
    message?: string;
    useAI?: boolean;
    tone?: 'moderate' | 'warm' | 'professional';
    formality?: 'approachable' | 'formal' | 'casual';
    approach?: 'diplomatic' | 'direct' | 'indirect';
    focus?: 'relational' | 'personal' | 'business';
    intention?: 'networking' | 'sales' | 'recruitment';
    personalization?: 'specific' | 'generic';
    language?: string;
    engageWithRecentActivity?: boolean;
    customGuidelines?: string;
}

export interface SendFollowupOptions {
    accountId: string;
    attendeesIds: string[];
    message?: string;
    smartFollowups?: boolean;
    aiWritingAssistant?: boolean;
    messageLength?: 'short' | 'medium' | 'long';
    tone?: 'professional' | 'casual' | 'friendly';
    language?: string;
    engageWithRecentActivity?: boolean;
    messagePurpose?: string;
}

export interface CheckInvitationOptions {
    accountId: string;
    invitationId?: string;
}

export interface WithdrawRequestOptions {
    accountId: string;
    invitationId: string;
}

export class UnipileWrapperService {
    private static instance: UnipileWrapperService;
    private client: UnipileClient | null = null;
    private rateLimiterRegistry = RateLimiterRegistry.getInstance();

    private constructor() {}

    public static getInstance(): UnipileWrapperService {
        if (!UnipileWrapperService.instance) {
            UnipileWrapperService.instance = new UnipileWrapperService();
        }
        return UnipileWrapperService.instance;
    }

    /**
     * Initialize Unipile client
     */
    public initialize(config: UnipileConfig): void {
        this.client = new UnipileClient(config.dsn, config.accessToken);
        logger.info('Unipile client initialized');
    }

    /**
     * Get Unipile client instance
     */
    private getClient(): UnipileClient {
        if (!this.client) {
            throw new Error('Unipile client not initialized. Call initialize() first.');
        }
        return this.client;
    }

    /**
     * Execute rate-limited API call
     */
    private async executeRateLimited<T>(
        accountId: string,
        operation: 'profileVisits' | 'invitations' | 'messages' | 'postComments' | 'postReactions',
        apiCall: () => Promise<T>
    ): Promise<T> {
        const rateLimiter = this.rateLimiterRegistry.getRateLimiter(accountId, operation);
        const globalRateLimiter = this.rateLimiterRegistry.getGlobalRateLimiter();

        return await globalRateLimiter.schedule(async () => {
            return await rateLimiter.schedule(apiCall);
        });
    }

    /**
     * Visit LinkedIn profile
     */
    public async visitProfile(options: ProfileVisitOptions): Promise<ActivityResult> {
        try {
            logger.info('Visiting LinkedIn profile', {
                accountId: options.accountId,
                identifier: options.identifier,
                notify: options.notify,
            });

            const client = this.getClient();
            
            const result = await this.executeRateLimited(
                options.accountId,
                'profileVisits',
                async () => {
                    return await client.users.getProfile({
                        account_id: options.accountId,
                        identifier: options.identifier,
                        notify: options.notify || true,
                        linkedin_sections: options.linkedinSections || '*',
                    });
                }
            );

            logger.info('Profile visit completed successfully', {
                accountId: options.accountId,
                identifier: options.identifier,
                profileId: result.id,
            });

            return {
                success: true,
                data: {
                    profileData: {
                        id: result.id,
                        name: result.full_name || result.first_name + ' ' + result.last_name,
                        title: result.headline,
                        company: result.company,
                        profileUrl: result.public_identifier,
                    },
                    notificationSent: options.notify || true,
                },
            };
        } catch (error: any) {
            logger.error('Profile visit failed', {
                accountId: options.accountId,
                identifier: options.identifier,
                error: error.message,
            });

            return {
                success: false,
                error: error.message,
                retryable: this.isRetryableError(error),
            };
        }
    }

    /**
     * Like LinkedIn posts
     */
    public async likePosts(options: LikePostOptions): Promise<ActivityResult> {
        try {
            logger.info('Liking LinkedIn posts', {
                accountId: options.accountId,
                identifier: options.identifier,
                numberOfPosts: options.numberOfPosts,
            });

            const client = this.getClient();
            
            // Get recent posts
            const posts = await client.users.getAllPosts({
                account_id: options.accountId,
                identifier: options.identifier,
            });

            // Filter recent posts
            const recentPosts = this.filterRecentPosts(posts, options.recentPostDays || 7);
            const postsToLike = recentPosts.slice(0, options.numberOfPosts || 1);

            const likedPosts: string[] = [];

            for (const post of postsToLike) {
                try {
                    await this.executeRateLimited(
                        options.accountId,
                        'postReactions',
                        async () => {
                            return await client.users.sendPostReaction({
                                account_id: options.accountId,
                                post_id: post.id,
                                reaction_type: 'like',
                            });
                        }
                    );

                    likedPosts.push(post.id);
                    logger.info('Post liked successfully', {
                        accountId: options.accountId,
                        postId: post.id,
                    });
                } catch (error: any) {
                    logger.warn('Failed to like post', {
                        accountId: options.accountId,
                        postId: post.id,
                        error: error.message,
                    });
                }
            }

            return {
                success: true,
                data: {
                    postsLiked: likedPosts.length,
                    postIds: likedPosts,
                },
            };
        } catch (error: any) {
            logger.error('Like posts failed', {
                accountId: options.accountId,
                identifier: options.identifier,
                error: error.message,
            });

            return {
                success: false,
                error: error.message,
                retryable: this.isRetryableError(error),
            };
        }
    }

    /**
     * Comment on LinkedIn posts
     */
    public async commentOnPosts(options: CommentPostOptions): Promise<ActivityResult> {
        try {
            logger.info('Commenting on LinkedIn posts', {
                accountId: options.accountId,
                identifier: options.identifier,
                numberOfPosts: options.numberOfPosts,
                useAI: options.configureWithAI,
            });

            const client = this.getClient();
            
            // Get recent posts
            const posts = await client.users.getAllPosts({
                account_id: options.accountId,
                identifier: options.identifier,
            });

            // Filter recent posts
            const recentPosts = this.filterRecentPosts(posts, options.recentPostDays || 7);
            const postsToComment = recentPosts.slice(0, options.numberOfPosts || 1);

            const comments: Array<{ postId: string; comment: string; commentId?: string }> = [];

            for (const post of postsToComment) {
                try {
                    // Generate comment (AI or custom)
                    const comment = options.configureWithAI 
                        ? await this.generateAIComment(post, options)
                        : options.customGuidelines || 'Great post!';

                    const result = await this.executeRateLimited(
                        options.accountId,
                        'postComments',
                        async () => {
                            return await client.users.sendPostComment({
                                account_id: options.accountId,
                                post_id: post.id,
                                text: comment,
                            });
                        }
                    );

                    comments.push({
                        postId: post.id,
                        comment,
                        commentId: result.id,
                    });

                    logger.info('Comment posted successfully', {
                        accountId: options.accountId,
                        postId: post.id,
                        commentId: result.id,
                    });
                } catch (error: any) {
                    logger.warn('Failed to comment on post', {
                        accountId: options.accountId,
                        postId: post.id,
                        error: error.message,
                    });
                }
            }

            return {
                success: true,
                data: {
                    commentsPosted: comments.length,
                    postIds: comments.map(c => c.postId),
                    comments,
                },
            };
        } catch (error: any) {
            logger.error('Comment on posts failed', {
                accountId: options.accountId,
                identifier: options.identifier,
                error: error.message,
            });

            return {
                success: false,
                error: error.message,
                retryable: this.isRetryableError(error),
            };
        }
    }

    /**
     * Send LinkedIn invitation
     */
    public async sendInvitation(options: SendInvitationOptions): Promise<ActivityResult> {
        try {
            logger.info('Sending LinkedIn invitation', {
                accountId: options.accountId,
                providerId: options.providerId,
                useAI: options.useAI,
            });

            const client = this.getClient();
            
            // Generate message (AI or custom)
            const message = options.useAI 
                ? await this.generateAIInvitationMessage(options)
                : options.message || 'I would like to connect with you.';

            const result = await this.executeRateLimited(
                options.accountId,
                'invitations',
                async () => {
                    return await client.users.sendInvitation({
                        account_id: options.accountId,
                        provider_id: options.providerId,
                        message,
                    });
                }
            );

            logger.info('Invitation sent successfully', {
                accountId: options.accountId,
                providerId: options.providerId,
                invitationId: result.id,
            });

            return {
                success: true,
                data: {
                    invitationId: result.id,
                    message,
                    status: 'sent',
                },
            };
        } catch (error: any) {
            logger.error('Send invitation failed', {
                accountId: options.accountId,
                providerId: options.providerId,
                error: error.message,
            });

            return {
                success: false,
                error: error.message,
                retryable: this.isRetryableError(error),
            };
        }
    }

    /**
     * Check invitation status
     */
    public async checkInvitationStatus(options: CheckInvitationOptions): Promise<ActivityResult> {
        try {
            logger.info('Checking invitation status', {
                accountId: options.accountId,
                invitationId: options.invitationId,
            });

            const client = this.getClient();
            
            const invitations = await client.users.getAllInvitationsSent({
                account_id: options.accountId,
            });

            const invitation = options.invitationId 
                ? invitations.find((inv: any) => inv.id === options.invitationId)
                : invitations[0]; // Get most recent if no specific ID

            if (!invitation) {
                return {
                    success: false,
                    error: 'Invitation not found',
                    retryable: false,
                };
            }

            const status = this.mapInvitationStatus(invitation.status);

            logger.info('Invitation status checked', {
                accountId: options.accountId,
                invitationId: invitation.id,
                status,
            });

            return {
                success: true,
                data: {
                    status,
                    invitationId: invitation.id,
                    acceptedAt: invitation.accepted_at,
                    declinedAt: invitation.declined_at,
                },
            };
        } catch (error: any) {
            logger.error('Check invitation status failed', {
                accountId: options.accountId,
                invitationId: options.invitationId,
                error: error.message,
            });

            return {
                success: false,
                error: error.message,
                retryable: this.isRetryableError(error),
            };
        }
    }

    /**
     * Send follow-up message
     */
    public async sendFollowup(options: SendFollowupOptions): Promise<ActivityResult> {
        try {
            logger.info('Sending follow-up message', {
                accountId: options.accountId,
                attendeesIds: options.attendeesIds,
                useAI: options.aiWritingAssistant,
            });

            const client = this.getClient();
            
            // Generate message (AI or custom)
            const message = options.aiWritingAssistant 
                ? await this.generateAIFollowupMessage(options)
                : options.message || options.messagePurpose || 'Thank you for connecting!';

            const result = await this.executeRateLimited(
                options.accountId,
                'messages',
                async () => {
                    return await client.messaging.startNewChat({
                        account_id: options.accountId,
                        attendees_ids: options.attendeesIds,
                        text: message,
                    });
                }
            );

            logger.info('Follow-up message sent successfully', {
                accountId: options.accountId,
                attendeesIds: options.attendeesIds,
                chatId: result.id,
            });

            return {
                success: true,
                data: {
                    messageId: result.id,
                    chatId: result.id,
                    message,
                },
            };
        } catch (error: any) {
            logger.error('Send follow-up failed', {
                accountId: options.accountId,
                attendeesIds: options.attendeesIds,
                error: error.message,
            });

            return {
                success: false,
                error: error.message,
                retryable: this.isRetryableError(error),
            };
        }
    }

    /**
     * Withdraw connection request
     */
    public async withdrawRequest(options: WithdrawRequestOptions): Promise<ActivityResult> {
        try {
            logger.info('Withdrawing connection request', {
                accountId: options.accountId,
                invitationId: options.invitationId,
            });

            const client = this.getClient();
            
            await client.users.cancelInvitationSent({
                account_id: options.accountId,
                invitation_id: options.invitationId,
            });

            logger.info('Connection request withdrawn successfully', {
                accountId: options.accountId,
                invitationId: options.invitationId,
            });

            return {
                success: true,
                data: {
                    invitationId: options.invitationId,
                    withdrawnAt: new Date().toISOString(),
                },
            };
        } catch (error: any) {
            logger.error('Withdraw request failed', {
                accountId: options.accountId,
                invitationId: options.invitationId,
                error: error.message,
            });

            return {
                success: false,
                error: error.message,
                retryable: this.isRetryableError(error),
            };
        }
    }

    /**
     * Helper: Filter recent posts
     */
    private filterRecentPosts(posts: any[], days: number): any[] {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        return posts.filter(post => {
            const postDate = new Date(post.created_at || post.published_at);
            return postDate >= cutoffDate;
        });
    }

    /**
     * Helper: Generate AI comment
     */
    private async generateAIComment(post: any, options: CommentPostOptions): Promise<string> {
        // TODO: Implement AI comment generation
        // For now, return a template-based comment
        const templates = [
            'Great insights! Thanks for sharing.',
            'This is really valuable information.',
            'Excellent point! I completely agree.',
            'Thanks for the thoughtful post.',
            'Very interesting perspective!',
        ];

        return templates[Math.floor(Math.random() * templates.length)];
    }

    /**
     * Helper: Generate AI invitation message
     */
    private async generateAIInvitationMessage(options: SendInvitationOptions): Promise<string> {
        // TODO: Implement AI invitation message generation
        // For now, return a template-based message
        return 'I would like to connect with you to expand my professional network.';
    }

    /**
     * Helper: Generate AI follow-up message
     */
    private async generateAIFollowupMessage(options: SendFollowupOptions): Promise<string> {
        // TODO: Implement AI follow-up message generation
        // For now, return a template-based message
        return options.messagePurpose || 'Thank you for connecting! I look forward to staying in touch.';
    }

    /**
     * Helper: Map invitation status
     */
    private mapInvitationStatus(status: string): 'accepted' | 'pending' | 'declined' | 'withdrawn' {
        switch (status?.toLowerCase()) {
            case 'accepted':
                return 'accepted';
            case 'declined':
            case 'rejected':
                return 'declined';
            case 'withdrawn':
            case 'cancelled':
                return 'withdrawn';
            default:
                return 'pending';
        }
    }

    /**
     * Helper: Check if error is retryable
     */
    private isRetryableError(error: any): boolean {
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
}
