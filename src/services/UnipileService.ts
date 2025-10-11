import { PostHostedAuthLinkInput, SupportedProvider, UnipileClient } from 'unipile-node-sdk';
import env from '../config/env';
import { ExternalAPIError, ServiceUnavailableError } from '../errors/AppError';
import { WorkflowNodeConfig } from '../types/workflow.types';
import logger from '../utils/logger';

export interface UnipileError {
    error:{
        body: {
            title: string,
            detail: string,
            instance: string,
            type: string,
            status: number,
            connectionParams?: {
                imap_host: string,
                imap_encryption: string,
                imap_port: number,
                imap_user: string,
                smtp_host: string,
                smtp_port: number,
                smtp_user: string
            }
        }
    }
}
/**
 * Unipile integration service for managing external accounts using Unipile Node SDK
 */
export class UnipileService {
    private static client: UnipileClient | null = null;

    constructor() {
        this.initializeClient();
    }

    /**
     * Initialize Unipile client using the SDK
     */
    private initializeClient(): void {
        if (!UnipileService.client) {
            try {
                if (!env.UNIPILE_ACCESS_TOKEN) {
                    logger.error('Unipile API key not configured. Please set UNIPILE_ACCESS_TOKEN in your environment variables.');
                    UnipileService.client = null;
                    return;
                }

                if (!env.UNIPILE_DNS) {
                    logger.error('Unipile API URL not configured. Please set UNIPILE_DNS in your environment variables.');
                    UnipileService.client = null;
                    return;
                }

                // Initialize UnipileClient with actual credentials
                UnipileService.client = new UnipileClient(env.UNIPILE_DNS, env.UNIPILE_ACCESS_TOKEN);
                logger.info('Unipile client initialized successfully', {
                    apiUrl: env.UNIPILE_DNS,
                    hasApiKey: !!env.UNIPILE_ACCESS_TOKEN
                });
            } catch (error) {
                logger.error('Failed to initialize Unipile client', { error });
                UnipileService.client = null;
            }
        }
    }

    /**
     * Check if Unipile is configured
     */
    static isConfigured(): boolean {
        return !!env.UNIPILE_ACCESS_TOKEN && UnipileService.client !== null;
    }

    /**
     * Create hosted authentication link using Unipile SDK
     */
    async createHostedAuthLink(params: {
        type: 'create';
        providers: string[];
        expiresOn: string;
        successRedirectUrl?: string;
        failureRedirectUrl?: string;
        notifyUrl?: string;
        name?: string;
        reconnectAccount?: string;
    }): Promise<{ url: string }> {
        try {
            logger.info('=== UnipileService: createHostedAuthLink START ===', { params });

            logger.info('Checking Unipile configuration', {
                isConfigured: UnipileService.isConfigured(),
                hasApiKey: !!env.UNIPILE_ACCESS_TOKEN,
                apiUrl: env.UNIPILE_DNS,
                apiKeyLength: env.UNIPILE_ACCESS_TOKEN?.length,
                apiKeyPrefix: env.UNIPILE_ACCESS_TOKEN?.substring(0, 10) + '...'
            });


            if (!UnipileService.isConfigured()) {
                throw new ExternalAPIError('Unipile API is not configured. Please set UNIPILE_ACCESS_TOKEN and UNIPILE_DNS in your environment variables.');
            }

            // Use actual Unipile SDK
            logger.info('Using actual Unipile SDK');

            // Validate required parameters
            if (!params.providers || params.providers.length === 0) {
                throw new ExternalAPIError('Providers are required for hosted auth link');
            }

            const unipileRequest: PostHostedAuthLinkInput = {
                type: params.type,
                expiresOn: params.expiresOn,
                api_url: env.UNIPILE_DNS!,
                providers: params.providers as SupportedProvider[],
                success_redirect_url: params.successRedirectUrl,
                failure_redirect_url: params.failureRedirectUrl,
                notify_url: params.notifyUrl,
                name: params.name,
            };

            logger.info('Unipile SDK request', {
                unipileRequest,
                clientExists: !!UnipileService.client,
                apiKeyLength: env.UNIPILE_ACCESS_TOKEN?.length || 0
            });

            try {
                logger.info('=== MAKING UNIPILE SDK CALL ===', {
                    method: 'client.account.createHostedAuthLink',
                    requestPayload: unipileRequest,
                    clientInfo: {
                        hasClient: !!UnipileService.client,
                        apiUrl: env.UNIPILE_DNS,
                        apiKeyPrefix: env.UNIPILE_ACCESS_TOKEN?.substring(0, 10) + '...',
                    }
                });

                const response = await UnipileService.client!.account.createHostedAuthLink(unipileRequest);


                if (!response || !response.url) {
                    logger.error('=== INVALID UNIPILE RESPONSE ===', {
                        response,
                        hasResponse: !!response,
                        responseType: typeof response,
                        responseKeys: response ? Object.keys(response) : null
                    });
                    throw new ExternalAPIError('Invalid response from Unipile API - missing URL');
                }

                return { url: response.url };
            } catch (sdkError: any) {
                logger.error('=== UNIPILE SDK ERROR DETAILED ===', {
                    errorName: sdkError?.name,
                    errorMessage: sdkError?.message,
                    errorStack: sdkError?.stack,
                    errorStatus: sdkError?.status,
                    errorBody: sdkError?.body,
                    errorResponse: sdkError?.response,
                    errorResponseData: sdkError?.response?.data,
                    errorResponseStatus: sdkError?.response?.status,
                    errorResponseHeaders: sdkError?.response?.headers,
                    requestData: unipileRequest,
                    sdkErrorKeys: Object.keys(sdkError || {}),
                    fullError: sdkError
                });

                // Check for common authentication errors
                if (sdkError?.status === 401 || sdkError?.message?.includes('unauthorized')) {
                    throw new ExternalAPIError('Unipile authentication failed. Please check your API key.');
                }

                if (sdkError?.status === 403) {
                    throw new ExternalAPIError('Unipile access forbidden. Please check your API permissions.');
                }

                if (sdkError?.status === 404) {
                    throw new ExternalAPIError('Unipile API endpoint not found. Please check your API URL.');
                }

                if (sdkError?.status === 400) {
                    throw new ExternalAPIError(`Unipile API bad request: ${sdkError?.body?.message || sdkError?.message || 'Invalid request parameters'}`);
                }

                // Handle empty error messages
                const errorMessage = sdkError?.message || sdkError?.body?.message || 'Unknown error';
                throw new ExternalAPIError(`Unipile API error: ${errorMessage}`);
            }
        } catch (error) {
            logger.error('=== UnipileService: createHostedAuthLink ERROR ===', {
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error,
                params
            });
            throw new ExternalAPIError('Failed to create authentication link');
        }
    }

    /**
     * Get account details from Unipile using SDK
     */
    async getAccount(accountId: string): Promise<any> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        try {
            // Use the correct SDK method to get account details
            const account = await UnipileService.client.account.getOne(accountId);

            logger.info('Account retrieved from Unipile via SDK', { accountId });

            return account;
        } catch (error) {
            logger.error('Error getting account from Unipile via SDK', { error, accountId });
            throw new ExternalAPIError('Failed to retrieve account information');
        }
    }

    /**
     * List all accounts from Unipile using SDK
     */
    async listAccounts(): Promise<any[]> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        try {
            const response = await UnipileService.client.account.getAll();

            logger.info('Accounts listed from Unipile via SDK', { count: response.items?.length || 0 });

            return response.items || [];
        } catch (error) {
            logger.error('Error listing accounts from Unipile via SDK', { error });
            throw new ExternalAPIError('Failed to list accounts');
        }
    }

    /**
     * Delete account from Unipile using SDK
     */
    async deleteAccount(accountId: string): Promise<void> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        try {
            await UnipileService.client.account.delete(accountId);

            logger.info('Account deleted from Unipile via SDK', { accountId });
        } catch (error) {
            logger.error('Error deleting account from Unipile via SDK', { error, accountId });
            throw new ExternalAPIError('Failed to delete account');
        }
    }

    /**
     * Get user profile from connected account using SDK
     */
    async getUserProfile(accountId: string, identifier: string): Promise<any> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        try {
            const profile = await UnipileService.client.users.getProfile({
                account_id: accountId,
                identifier: identifier,
            });

            logger.info('User profile retrieved via SDK', { accountId, identifier });

            return profile;
        } catch (error) {
            logger.error('Error getting user profile via SDK', { error, accountId, identifier });
            throw new ExternalAPIError('Failed to retrieve user profile');
        }
    }

    /**
     * Get own profile from connected account using SDK
     */
    async getOwnProfile(accountId: string) {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        try {
            const profile = await UnipileService.client.users.getOwnProfile(accountId)
            return profile;
        } catch (error: any) {
            logger.error('=== UNIPILE SDK: Profile fetch failed ===', {
                accountId,
                error: error,
                errorBody: error && typeof error === 'object' && 'body' in error ? error.body : undefined,
                errorStatus: error && typeof error === 'object' && 'body' in error && error.body && typeof error.body === 'object' && 'status' in error.body ? error.body.status : undefined,
                errorType: error && typeof error === 'object' && 'body' in error && error.body && typeof error.body === 'object' && 'type' in error.body ? error.body.type : undefined,
                errorDetail: error && typeof error === 'object' && 'body' in error && error.body && typeof error.body === 'object' && 'detail' in error.body ? error.body.detail : undefined,
                sdkMethod: 'client.users.getOwnProfile'
            });
        }
    }

    /**
     * Send message through connected account using SDK
     */
    async sendMessage(params: {
        accountId: string;
        attendeesIds: string[];
        text: string;
        options?: any;
    }): Promise<any> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        try {
            const response = await UnipileService.client.messaging.startNewChat({
                account_id: params.accountId,
                attendees_ids: params.attendeesIds,
                text: params.text,
                options: params.options,
            });

            logger.info('Message sent via SDK', {
                accountId: params.accountId,
                attendeesCount: params.attendeesIds.length
            });

            return response;
        } catch (error) {
            logger.error('Error sending message via SDK', { error, params });
            throw new ExternalAPIError('Failed to send message');
        }
    }

    /**
     * Send LinkedIn invitation using SDK
     */
    async sendLinkedInInvitation(params: {
        accountId: string;
        providerId: string;
        message?: string;
    }): Promise<any> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        try {
            const response = await UnipileService.client.users.sendInvitation({
                account_id: params.accountId,
                provider_id: params.providerId,
                message: params.message,
            });

            logger.info('LinkedIn invitation sent via SDK', {
                accountId: params.accountId,
                providerId: params.providerId
            });

            return response;
        } catch (error) {
            logger.error('Error sending LinkedIn invitation via SDK', { error, params });
            throw error;
        }
    }

    /**
     * Visit LinkedIn profile (for tracking) using SDK
     */
    async visitLinkedInProfile(params: {
        accountId: string;
        identifier: string;
        notify?: boolean;
    }) {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }
        try {
            const response = await UnipileService.client.users.getProfile({
                account_id: params.accountId,
                identifier: params.identifier,
                linkedin_sections: 'about',
                notify: params.notify || true,
            });

            logger.info('LinkedIn profile visited via SDK', {
                accountId: params.accountId,
                identifier: params.identifier
            });

            return response;
        } catch (error) {
            logger.error('Error visiting LinkedIn profile via SDK', { error });
            throw error;
        }
    }

    async getRecentPosts(params: {
        accountId: string,
        linkedInUrn: string,
        lastDays: number
    }) {
        if (!UnipileClient) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }
        try {
            const response = await UnipileService.client?.users.getAllPosts({
                account_id: params.accountId,
                identifier: params.linkedInUrn,
                limit: 5
            });
            // Filter posts to only those created within the last X days
            if (Array.isArray(response?.items)) {
                const now = new Date();
                const daysAgo = params.lastDays ?? 7;
                const cutoffDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

                response.items = response.items.filter((post: any) => {
                    // Accept posts that have a valid parsed_datetime within the window
                    if (!post.parsed_datetime) return false;
                    const postDate = new Date(post.parsed_datetime);
                    return postDate >= cutoffDate && postDate <= now;
                });
            }
            const filteredPosts = response?.items
            return filteredPosts;
        } catch (error) {
            throw error
        }
    }

    /**
     * Like LinkedIn post using SDK
     */
    async likeLinkedInPost(params: {
        accountId: string;
        linkedInUrn: string;
        lastDays: number;
        reactionType?: string;
    }) {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        try {
            const posts = await this.getRecentPosts({
                accountId: params.accountId,
                linkedInUrn: params.linkedInUrn,
                lastDays: params.lastDays
            });

            const postToLikeFull = posts?.getRandom();
            const postToLike = postToLikeFull?.id;

            if (!postToLike) {
                console.log('No post to like');
                return;
            }

            const response = await UnipileService.client.users.sendPostReaction({
                account_id: params.accountId,
                post_id: postToLike,
                reaction_type: (params.reactionType === 'like' || params.reactionType === 'celebrate' || params.reactionType === 'support' || params.reactionType === 'love' || params.reactionType === 'insightful' || params.reactionType === 'funny') ? params.reactionType : 'like',
            });
            logger.info('LinkedIn post liked via SDK', {
                accountId: params.accountId,
                linkedInUrn: params.linkedInUrn
            });
            return response


        } catch (error) {
            throw error
        }
    }

    async generateAtComment(params: {
        config: WorkflowNodeConfig;
        author: string
    }) {
        //@TODO Rishabh Need to implement AI
        const text = 'Great Info ' + params.author;
        return text;
    }
    /**
     * Comment on LinkedIn post using SDK
     */
    async commentLinkedInPost(params: {
        accountId: string;
        linkedInUrn: string;
        config: WorkflowNodeConfig;
    }): Promise<any> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        const posts = await this.getRecentPosts({
            accountId: params.accountId,
            linkedInUrn: params.linkedInUrn,
            lastDays: params.config.recentPostDays || 7
        });

        const postToComment = posts?.getRandom();
        const postToCommentId = postToComment?.id;

        console.log(postToComment);

        const authorName = postToComment?.author;

        const text = params.config.useAI
            ? await this.generateAtComment({ config: params.config, author: authorName?.name || '' })
            : params.config.customComment
                ? params.config.customComment.split('{{first_name}}').join(authorName?.name || '')
                : await this.generateAtComment({ config: params.config, author: authorName?.name || '' });

        if (!postToCommentId) {
            return { success: false, message: 'Post to comment not found' };
        }

        try {
            const response = await UnipileService.client.users.sendPostComment({
                account_id: params.accountId,
                post_id: postToCommentId,
                text: text,
            });

            logger.info('LinkedIn post commented via SDK', {
                accountId: params.accountId,
                postId: postToCommentId
            });

            return response;
        } catch (error) {
            logger.error('Error commenting on LinkedIn post via SDK', { error, params });
            throw error;
        }
    }

    async withdrawLinkedInInvitationRequest(params: {
        accountId: string;
        providerId: string;
    }): Promise<any> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }
        try {
            const invitation = await UnipileService.client.users.getAllInvitationsSent({
                account_id: params.accountId
            });
            const invitationId = invitation.items?.find(item => item.invited_user_id === params.providerId)?.id;
            if (!invitationId) {
                return { success: false, message: 'Invitation ID not found' };
            }
            const response = await UnipileService.client.users.cancelInvitationSent({
                account_id: params.accountId,
                invitation_id: invitationId,
            });

            logger.info('LinkedIn invitation request withdrawn via SDK', {
                accountId: params.accountId,
                invitationId: invitationId
            });

            return response;
        } catch (error) {
            logger.error('Error withdrawing LinkedIn invitation request via SDK', { error, params });
            throw error;
        }
    }

    async isConnected(params: {
        accountId: string;
        identifier: string;
    }): Promise<any> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }
        try {
            const result = await UnipileService.client.users.getAllRelations({
                account_id: params.accountId
            });
            const relation = result.items?.find(item => item.public_identifier === params.identifier);
            return relation ? true : false;
        } catch (error) {
            logger.error('Error checking if connected via SDK', { error, params });
            throw error;
        }
    }

    /**
     * Check if an invitation is still pending for a specific user
     */
    async isInvitationPending(params: {
        accountId: string;
        providerId: string;
    }): Promise<boolean> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }
        try {
            const invitation = await UnipileService.client.users.getAllInvitationsSent({
                account_id: params.accountId
            });
            const invitationExists = invitation.items?.some(item => item.invited_user_id === params.providerId);
            return invitationExists || false;
        } catch (error) {
            logger.error('Error checking invitation status via SDK', { error, params });
            throw error;
        }
    }

    /**
     * Send email through connected account using SDK
     */
    async sendEmail(params: {
        accountId: string;
        to: Array<{ identifier: string }>;
        subject: string;
        body: string;
        replyTo?: string;
    }): Promise<any> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        try {
            const response = await UnipileService.client.email.send({
                account_id: params.accountId,
                to: params.to,
                subject: params.subject,
                body: params.body,
                reply_to: params.replyTo,
            });

            logger.info('Email sent via SDK', {
                accountId: params.accountId,
                recipientCount: params.to.length
            });

            return response;
        } catch (error) {
            logger.error('Error sending email via SDK', { error, params });
            throw error;
        }
    }

    /**
     * Get supported providers
     */
    static getSupportedProviders(): string[] {
        return [
            'linkedin',
            'email',
            'gmail',
            'outlook',
            'whatsapp',
            'telegram',
            'instagram',
            'messenger',
            'twitter'
        ];
    }

    /**
     * Check if provider is supported
     */
    static isProviderSupported(provider: string): boolean {
        return UnipileService.getSupportedProviders().includes(provider.toLowerCase());
    }

    /**
     * Get provider configuration
     */
    static getProviderConfig(provider: string) {
        const configs = {
            linkedin: {
                name: 'LinkedIn',
                supportsMessaging: true,
                supportsPosting: true,
                supportsInvitations: true,
                capabilities: ['messaging', 'posting', 'invitations', 'profile_visits']
            },
            email: {
                name: 'Email',
                supportsMessaging: true,
                supportsPosting: false,
                supportsInvitations: false,
                capabilities: ['messaging']
            },
            gmail: {
                name: 'Gmail',
                supportsMessaging: true,
                supportsPosting: false,
                supportsInvitations: false,
                capabilities: ['messaging']
            },
            outlook: {
                name: 'Outlook',
                supportsMessaging: true,
                supportsPosting: false,
                supportsInvitations: false,
                capabilities: ['messaging']
            },
            whatsapp: {
                name: 'WhatsApp',
                supportsMessaging: true,
                supportsPosting: false,
                supportsInvitations: false,
                capabilities: ['messaging']
            },
            telegram: {
                name: 'Telegram',
                supportsMessaging: true,
                supportsPosting: false,
                supportsInvitations: false,
                capabilities: ['messaging']
            },
            instagram: {
                name: 'Instagram',
                supportsMessaging: true,
                supportsPosting: true,
                supportsInvitations: false,
                capabilities: ['messaging', 'posting']
            },
            messenger: {
                name: 'Facebook Messenger',
                supportsMessaging: true,
                supportsPosting: false,
                supportsInvitations: false,
                capabilities: ['messaging']
            },
            twitter: {
                name: 'Twitter',
                supportsMessaging: true,
                supportsPosting: true,
                supportsInvitations: false,
                capabilities: ['messaging', 'posting']
            }
        };

        return configs[provider.toLowerCase() as keyof typeof configs] || null;
    }
}
