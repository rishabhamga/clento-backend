import { ReporterConnectedAccountRepository } from '../repositories/reporterRepositories/ConnectedAccountRepository';
import { UnipileService } from './UnipileService';
import { BadRequestError, DisplayError, ForbiddenError } from '../errors/AppError';
import logger from '../utils/logger';
import { CreateReporterConnectedAccountDto, ReporterConnectedAccountResponseDto, UpdateReporterConnectedAccountDto } from '../dto/reporterDtos/accounts.dto';

/**
 * Service for reporter connected account business logic
 * Uses the same Unipile integration but stores accounts in a separate table
 */
export class ReporterConnectedAccountService {
    private repository: ReporterConnectedAccountRepository;
    private unipileService: UnipileService;

    constructor() {
        this.repository = new ReporterConnectedAccountRepository();
        this.unipileService = new UnipileService();
    }

    /**
     * Create hosted authentication link for connecting accounts
     */
    async createHostedAuthLink(params: { reporterUserId: string; provider: string; successRedirectUrl?: string; failureRedirectUrl?: string; notifyUrl?: string }): Promise<{ url: string; pendingAccountId: string }> {
        try {
            logger.info('=== ReporterConnectedAccountService: createHostedAuthLink START ===', { params });

            // Validate provider
            if (!UnipileService.isProviderSupported(params.provider)) {
                throw new BadRequestError(`Provider ${params.provider} is not supported`);
            }

            // Clean up old pending accounts for this user/provider (older than 1 hour)
            await this.cleanupOldPendingAccounts(params.reporterUserId, params.provider);

            // Create pending account record with unique pending ID
            const uniquePendingId = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const accountData: CreateReporterConnectedAccountDto = {
                reporter_user_id: params.reporterUserId,
                status: 'pending',
                provider: params.provider as 'linkedin' | 'email' | 'gmail' | 'outlook',
                display_name: `${params.provider} Account (Connecting...)`,
                provider_account_id: uniquePendingId,
                capabilities: [],
                metadata: {
                    created_at: new Date().toISOString(),
                    connection_status: 'pending',
                    account_type: 'personal',
                    provider_account_id: uniquePendingId,
                },
            };

            const pendingAccount = await this.repository.create(accountData);
            logger.info('Reporter pending account created', { pendingAccount });

            // Create Unipile hosted auth link
            const unipileParams = {
                type: 'create' as const,
                providers: [params.provider.toUpperCase()],
                expiresOn: new Date(Date.now() + 3600000).toISOString(), // 1 hour
                successRedirectUrl: params.successRedirectUrl,
                failureRedirectUrl: params.failureRedirectUrl,
                notifyUrl: params.notifyUrl,
                name: `reporter-${pendingAccount.id}`, // Prefix with "reporter-" to identify in webhook
            };

            const authLink = await this.unipileService.createHostedAuthLink(unipileParams);

            // Update pending account with auth link
            await this.repository.update(pendingAccount.id, {
                metadata: {
                    ...pendingAccount.metadata,
                    hosted_auth_url: authLink.url,
                },
                updated_at: new Date().toISOString(),
            });

            return {
                url: authLink.url,
                pendingAccountId: pendingAccount.id,
            };
        } catch (error) {
            logger.error('=== ReporterConnectedAccountService: createHostedAuthLink ERROR ===', {
                error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
                params,
            });
            throw error;
        }
    }

    /**
     * Handle successful account connection from Unipile webhook
     */
    async handleAccountConnected(params: { unipileAccountId: string; pendingAccountId: string; accountData: any }): Promise<ReporterConnectedAccountResponseDto> {
        try {
            logger.info('=== ReporterConnectedAccountService: handleAccountConnected START ===', { params });

            // Get pending account
            const pendingAccount = await this.repository.findById(params.pendingAccountId);

            // Get additional profile data from Unipile
            let profileData = null;
            try {
                profileData = await this.unipileService.getOwnProfile(params.unipileAccountId);
                logger.info('Reporter profile fetch success', { profileData });
            } catch (error: any) {
                logger.warn('Could not fetch reporter profile data', { error, unipileAccountId: params.unipileAccountId });

                // Schedule retries if needed
                if (error?.body?.type === 'errors/disconnected_account') {
                    this.scheduleProfileRetries(params.unipileAccountId, params.pendingAccountId, params.accountData, pendingAccount);
                }
            }

            // Extract account information
            const displayName = this.extractDisplayName(params.accountData, profileData);
            const profilePictureUrl = this.extractProfilePicture(params.accountData, profileData);
            const capabilities = this.extractCapabilities(params.accountData);

            // Update account with connection data
            const connectedAccount = await this.repository.update(params.pendingAccountId, {
                display_name: displayName,
                profile_picture_url: profilePictureUrl,
                status: 'connected',
                provider_account_id: params.unipileAccountId,
                capabilities: capabilities,
                metadata: {
                    ...pendingAccount.metadata,
                    last_synced_at: new Date().toISOString(),
                    connection_status: 'connected',
                    connection_quality: 'good',
                    unipile_account_data: params.accountData,
                    profile_data: profileData,
                    connected_at: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
            });

            return connectedAccount;
        } catch (error) {
            logger.error('Error handling reporter account connection', { error, params });
            throw error;
        }
    }

    /**
     * Get user's connected accounts
     */
    async getUserAccounts(reporterUserId: string, provider?: string): Promise<ReporterConnectedAccountResponseDto[]> {
        try {
            const accounts = await this.repository.getUserAccounts(reporterUserId);

            // Filter by provider if specified
            if (provider) {
                return accounts.filter(account => account.provider === provider);
            }

            return accounts;
        } catch (error) {
            logger.error('Error getting reporter user accounts', { error, reporterUserId, provider });
            throw error;
        }
    }

    /**
     * Get connected account by ID
     */
    async getAccountById(id: string): Promise<ReporterConnectedAccountResponseDto> {
        try {
            const account = await this.repository.findById(id);
            if (!account) {
                throw new DisplayError('No Account Found By the Id');
            }
            return account;
        } catch (err) {
            logger.error('Error getting reporter account by ID', { err, id });
            throw new DisplayError('No Account Found By the Id');
        }
    }

    /**
     * Get any connected LinkedIn account (across all users)
     * Returns the first available connected LinkedIn account
     */
    async getAnyConnectedLinkedInAccount(): Promise<ReporterConnectedAccountResponseDto | null> {
        try {
            const accounts = await this.repository.getAllConnectedAccountsByProvider('linkedin');

            if (accounts.length === 0) {
                logger.warn('No connected LinkedIn accounts found');
                return null;
            }
            // Return the first available account
            const account = accounts.getRandom();
            logger.info('Found connected LinkedIn account', {
                accountId: account.id,
                providerAccountId: account.provider_account_id,
                reporterUserId: account.reporter_user_id,
            });

            return account;
        } catch (error) {
            logger.error('Error getting any connected LinkedIn account', { error });
            throw error;
        }
    }

    /**
     * Get user's pending accounts
     */
    async getPendingAccounts(reporterUserId: string, provider?: string): Promise<ReporterConnectedAccountResponseDto[]> {
        try {
            const accounts = await this.repository.getPendingAccounts(reporterUserId);

            // Filter by provider if specified
            if (provider) {
                return accounts.filter(account => account.provider === provider);
            }

            return accounts;
        } catch (error) {
            logger.error('Error getting reporter pending accounts', { error, reporterUserId, provider });
            throw error;
        }
    }

    /**
     * Disconnect account
     */
    async disconnectAccount(id: string, reporterUserId: string): Promise<void> {
        try {
            const account = await this.repository.findById(id);

            // Verify user has access to this account
            if (account.reporter_user_id !== reporterUserId) {
                throw new ForbiddenError('Access denied to this account');
            }

            //Delete from unipile
            await this.unipileService.deleteAccount(account.provider_account_id);

            // Delete from our database
            await this.repository.update(id, {is_deleted: true, updated_at: new Date().toISOString()});

            logger.info('Reporter account disconnected', { accountId: id, reporterUserId, provider: account.provider });
        } catch (error) {
            logger.error('Error disconnecting reporter account', { error, id, reporterUserId });
            throw error;
        }
    }

    /**
     * Sync account with Unipile
     */
    async syncAccount(id: string, reporterUserId: string): Promise<ReporterConnectedAccountResponseDto> {
        try {
            const account = await this.repository.findById(id);

            // Verify user has access to this account
            if (account.reporter_user_id !== reporterUserId) {
                throw new ForbiddenError('Access denied to this account');
            }

            if (account.status !== 'connected' || account.provider_account_id.startsWith('pending-')) {
                throw new BadRequestError('Account is not connected');
            }

            // Get latest data from Unipile
            const unipileAccount = await this.unipileService.getAccount(account.provider_account_id);

            // Get profile data
            let profileData = null;
            try {
                profileData = await this.unipileService.getOwnProfile(account.provider_account_id);
            } catch (error) {
                logger.warn('Could not fetch reporter profile data during sync', { error, accountId: id });
            }

            // Update account with latest data
            const displayName = this.extractDisplayName(unipileAccount, profileData);
            const profilePictureUrl = this.extractProfilePicture(unipileAccount, profileData);
            const capabilities = this.extractCapabilities(unipileAccount);

            const updatedAccount = await this.repository.update(id, {
                display_name: displayName,
                profile_picture_url: profilePictureUrl,
                capabilities: capabilities,
                status: unipileAccount?.sources?.[0]?.status === 'OK' ? 'connected' : 'error',
                metadata: {
                    ...account.metadata,
                    connection_quality: unipileAccount.status === 'active' ? 'good' : 'error',
                    last_synced_at: new Date().toISOString(),
                    unipile_account_data: unipileAccount,
                    profile_data: profileData,
                    last_sync: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
            });

            return updatedAccount;
        } catch (error: any) {
            try {
                await this.repository.updateSyncStatus(id, 'error', error.message);
            } catch (updateError) {
                logger.error('Error updating reporter sync status', { updateError, id });
            }

            throw error;
        }
    }

    /**
     * Extract display name from account data
     */
    private extractDisplayName(accountData: any, profileData?: any): string {
        const sources = [profileData?.full_name, profileData?.display_name, profileData?.name, profileData?.first_name && profileData?.last_name ? `${profileData.first_name} ${profileData.last_name}` : null, profileData?.first_name, profileData?.last_name, accountData?.full_name, accountData?.display_name, accountData?.name && !this.isUUID(accountData.name) ? accountData.name : null, accountData?.username, accountData?.email];

        for (const source of sources) {
            if (source && typeof source === 'string' && source.trim() && source.trim() !== 'null') {
                return source.trim();
            }
        }

        return 'LinkedIn Account';
    }

    /**
     * Check if a string looks like a UUID
     */
    private isUUID(str: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
    }

    /**
     * Schedule multiple profile fetch retries with increasing delays
     */
    private scheduleProfileRetries(unipileAccountId: string, pendingAccountId: string, accountData: any, pendingAccount: any): void {
        const retryDelays = [10000, 30000, 60000]; // 10s, 30s, 60s

        retryDelays.forEach((delay, index) => {
            setTimeout(async () => {
                try {
                    logger.info('=== REPORTER PROFILE RETRY ATTEMPT ===', {
                        unipileAccountId,
                        attempt: index + 1,
                        delay: delay / 1000 + 's',
                    });

                    const retryProfileData = await this.unipileService.getOwnProfile(unipileAccountId);

                    if (retryProfileData) {
                        logger.info('=== REPORTER PROFILE RETRY SUCCESS ===', {
                            unipileAccountId,
                            attempt: index + 1,
                        });

                        // Update account with profile data
                        await this.repository.update(pendingAccountId, {
                            display_name: this.extractDisplayName(accountData, retryProfileData),
                            profile_picture_url: this.extractProfilePicture(accountData, retryProfileData),
                            metadata: {
                                ...pendingAccount.metadata,
                                profile_data: retryProfileData,
                                profile_fetched_at: new Date().toISOString(),
                                profile_retry_attempt: index + 1,
                            },
                            updated_at: new Date().toISOString(),
                        });
                    }
                } catch (retryError: any) {
                    logger.warn('=== REPORTER PROFILE RETRY FAILED ===', {
                        unipileAccountId,
                        attempt: index + 1,
                        retryError: retryError?.body || retryError?.message || retryError,
                    });
                }
            }, delay);
        });
    }
    private extractProfilePicture(accountData: any, profileData?: any): string {
        const sources = [profileData?.profile_picture_url, profileData?.avatar_url, profileData?.picture, profileData?.image_url, accountData?.profile_picture_url, accountData?.avatar_url, accountData?.picture, accountData?.image_url];

        for (const source of sources) {
            if (source && typeof source === 'string' && source.trim()) {
                return source.trim();
            }
        }

        return '';
    }

    /**
     * Extract capabilities from account data
     */
    private extractCapabilities(accountData: any): string[] {
        if (accountData?.capabilities && Array.isArray(accountData.capabilities)) {
            return accountData.capabilities;
        }

        // Default capabilities based on provider
        const providerConfig = UnipileService.getProviderConfig(accountData?.provider || '');
        return providerConfig?.capabilities || [];
    }

    /**
     * Clean up old pending accounts to prevent duplicates
     */
    private async cleanupOldPendingAccounts(reporterUserId: string, provider: string): Promise<void> {
        try {
            logger.info('Cleaning up old reporter pending accounts', { reporterUserId, provider });

            const pendingAccounts = await this.repository.getPendingAccounts(reporterUserId);
            const providerPendingAccounts = pendingAccounts.filter(acc => acc.provider === provider && acc.status === 'pending' && acc.provider_account_id?.startsWith('pending-'));

            // Delete pending accounts older than 1 hour
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            for (const account of providerPendingAccounts) {
                const createdAt = new Date(account.created_at || Date.now());
                if (createdAt < oneHourAgo) {
                    logger.info('Deleting old reporter pending account', {
                        accountId: account.id,
                        providerAccountId: account.provider_account_id,
                        createdAt: account.created_at,
                    });
                    await this.repository.delete(account.id);
                }
            }
        } catch (error) {
            logger.warn('Error cleaning up old reporter pending accounts', { error });
        }
    }
}
