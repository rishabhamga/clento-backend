import { PostHostedAuthLinkInput, SupportedProvider, UnipileClient } from 'unipile-node-sdk';
import { ExternalAPIError, ServiceUnavailableError } from '../errors/AppError';
import logger from '../utils/logger';
import env from '../config/env';

interface UnipileRequest {
    type: 'create' | 'reconnect';
    expiresOn: string;
    api_url: string;
    providers: string[];
    success_redirect_url?: string;
    failure_redirect_url?: string;
    notify_url?: string;
    name?: string;
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
                if (!env.UNIPILE_API_KEY) {
                    logger.error('Unipile API key not configured. Please set UNIPILE_API_KEY in your environment variables.');
                    UnipileService.client = null;
                    return;
                }

                if (!env.UNIPILE_API_URL) {
                    logger.error('Unipile API URL not configured. Please set UNIPILE_API_URL in your environment variables.');
                    UnipileService.client = null;
                    return;
                }

                // Initialize UnipileClient with actual credentials
                UnipileService.client = new UnipileClient(env.UNIPILE_API_URL, env.UNIPILE_API_KEY);
                logger.info('Unipile client initialized successfully', {
                    apiUrl: env.UNIPILE_API_URL,
                    hasApiKey: !!env.UNIPILE_API_KEY
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
        return !!env.UNIPILE_API_KEY && UnipileService.client !== null;
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
                hasApiKey: !!env.UNIPILE_API_KEY,
                apiUrl: env.UNIPILE_API_URL
            });

            if (!UnipileService.isConfigured()) {
                throw new ExternalAPIError('Unipile API is not configured. Please set UNIPILE_API_KEY and UNIPILE_API_URL in your environment variables.');
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
                api_url: env.UNIPILE_API_URL!,
                providers: params.providers as SupportedProvider[],
                success_redirect_url: params.successRedirectUrl,
                failure_redirect_url: params.failureRedirectUrl,
                notify_url: params.notifyUrl,
                name: params.name,
            };

            logger.info('Unipile SDK request', {
                unipileRequest,
                clientExists: !!UnipileService.client,
                apiKeyLength: env.UNIPILE_API_KEY?.length || 0
            });

            try {
                const response = await UnipileService.client!.account.createHostedAuthLink(unipileRequest);
                logger.info('Unipile SDK response', { response });

                if (!response || !response.url) {
                    throw new ExternalAPIError('Invalid response from Unipile API - missing URL');
                }

                return { url: response.url };
            } catch (sdkError: any) {
                logger.error('Unipile SDK Error Details', {
                    errorName: sdkError?.name,
                    errorMessage: sdkError?.message,
                    errorStack: sdkError?.stack,
                    errorStatus: sdkError?.status,
                    errorBody: sdkError?.body,
                    errorResponse: sdkError?.response?.data,
                    requestData: unipileRequest
                });

                // Check for common authentication errors
                if (sdkError?.status === 401 || sdkError?.message?.includes('unauthorized')) {
                    throw new ExternalAPIError('Unipile authentication failed. Please check your API key.');
                }

                if (sdkError?.status === 403) {
                    throw new ExternalAPIError('Unipile access forbidden. Please check your API permissions.');
                }

                throw new ExternalAPIError(`Unipile API error: ${sdkError?.message || 'Unknown error'}`);
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
    async getOwnProfile(accountId: string): Promise<any> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        try {
            logger.info('=== UNIPILE SDK: Getting own profile ===', {
                accountId,
                sdkMethod: 'client.users.getOwnProfile',
                apiUrl: env.UNIPILE_API_URL
            });

            const profile = await UnipileService.client.users.getOwnProfile(accountId);

            logger.info('=== UNIPILE SDK: Profile retrieved successfully ===', {
                accountId,
                profileKeys: Object.keys(profile || {}),
                hasEmail: !!(profile && typeof profile === 'object' && 'email' in profile),
                hasName: !!(profile && typeof profile === 'object' && ('first_name' in profile || 'last_name' in profile || 'full_name' in profile)),
                profileData: profile
            });

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

            // Re-throw the original error so the caller can handle specific error types
            throw error;
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
            throw new ExternalAPIError('Failed to send LinkedIn invitation');
        }
    }

    /**
     * Visit LinkedIn profile (for tracking) using SDK
     */
    async visitLinkedInProfile(params: {
        accountId: string;
        identifier: string;
        notify?: boolean;
    }): Promise<any> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        try {
            const response = await UnipileService.client.users.getProfile({
                account_id: params.accountId,
                identifier: params.identifier,
                linkedin_sections: '*',
                notify: params.notify || true,
            });

            logger.info('LinkedIn profile visited via SDK', {
                accountId: params.accountId,
                identifier: params.identifier
            });

            return response;
        } catch (error) {
            logger.error('Error visiting LinkedIn profile via SDK', { error, params });
            throw new ExternalAPIError('Failed to visit LinkedIn profile');
        }
    }

    /**
     * Like LinkedIn post using SDK
     */
    async likeLinkedInPost(params: {
        accountId: string;
        postId: string;
        reactionType?: string;
    }): Promise<any> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        try {
            const response = await UnipileService.client.users.sendPostReaction({
                account_id: params.accountId,
                post_id: params.postId,
                reaction_type: (params.reactionType === 'like' || params.reactionType === 'celebrate' || params.reactionType === 'support' || params.reactionType === 'love' || params.reactionType === 'insightful' || params.reactionType === 'funny') ? params.reactionType : 'like',
            });

            logger.info('LinkedIn post liked via SDK', {
                accountId: params.accountId,
                postId: params.postId
            });

            return response;
        } catch (error) {
            logger.error('Error liking LinkedIn post via SDK', { error, params });
            throw new ExternalAPIError('Failed to like LinkedIn post');
        }
    }

    /**
     * Comment on LinkedIn post using SDK
     */
    async commentLinkedInPost(params: {
        accountId: string;
        postId: string;
        text: string;
    }): Promise<any> {
        if (!UnipileService.client) {
            throw new ServiceUnavailableError('Unipile service not configured');
        }

        try {
            const response = await UnipileService.client.users.sendPostComment({
                account_id: params.accountId,
                post_id: params.postId,
                text: params.text,
            });

            logger.info('LinkedIn post commented via SDK', {
                accountId: params.accountId,
                postId: params.postId
            });

            return response;
        } catch (error) {
            logger.error('Error commenting on LinkedIn post via SDK', { error, params });
            throw new ExternalAPIError('Failed to comment on LinkedIn post');
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
            throw new ExternalAPIError('Failed to send email');
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
