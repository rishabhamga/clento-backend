import {
    CreateReporterConnectedAccountDto,
    UpdateReporterConnectedAccountDto,
    ReporterConnectedAccountResponseDto,
} from '../../dto/reporterDtos/accounts.dto';
import { DatabaseError } from '../../errors/AppError';
import logger from '../../utils/logger';
import { BaseRepository } from '../BaseRepository';

/**
 * Repository for reporter connected account database operations
 * Stores accounts in a separate table from the main service
 */
export class ReporterConnectedAccountRepository extends BaseRepository<
    ReporterConnectedAccountResponseDto,
    CreateReporterConnectedAccountDto,
    UpdateReporterConnectedAccountDto
> {
    constructor() {
        super('reporter_connected_accounts');
    }

    /**
     * Find connected account by provider account ID
     */
    public async findByProviderAccountId(providerAccountId: string): Promise<ReporterConnectedAccountResponseDto | null> {
        try {
            const data = await this.findOneByField('provider_account_id', providerAccountId);
            return data;
        } catch (error) {
            logger.error('Error finding reporter connected account by provider account ID', {
                error,
                providerAccountId,
            });
            throw new DatabaseError('Failed to find connected account by provider account ID');
        }
    }

    /**
     * Get user's pending accounts
     */
    public async getPendingAccounts(reporterUserId: string): Promise<ReporterConnectedAccountResponseDto[]> {
        try {
            logger.info('Getting reporter user pending accounts', { reporterUserId });

            const data = await this.findByField('reporter_user_id' as keyof ReporterConnectedAccountResponseDto, reporterUserId);

            // Filter for pending/incomplete accounts
            const pendingAccounts = (data || []).filter((account: ReporterConnectedAccountResponseDto) => {
                const isPending =
                    account.provider_account_id?.startsWith('pending-');

                const metadata = account.metadata as any;
                const connectionStatus = metadata?.connection_status;
                const isPendingStatus = connectionStatus === 'pending';

                return isPending || isPendingStatus;
            });

            logger.info('Retrieved reporter pending accounts', {
                reporterUserId,
                pendingCount: pendingAccounts.length,
            });

            return pendingAccounts;
        } catch (error) {
            logger.error('Error getting reporter pending accounts', { error, reporterUserId });
            throw new DatabaseError('Failed to get pending accounts');
        }
    }

    /**
     * Get user's connected accounts
     */
    public async getUserAccounts(reporterUserId: string): Promise<ReporterConnectedAccountResponseDto[]> {
        try {
            logger.info('Getting reporter user connected accounts', { reporterUserId });

            const data = await this.findByField('reporter_user_id' as keyof ReporterConnectedAccountResponseDto, reporterUserId);

            // Filter out pending/incomplete accounts
            const connectedAccounts = (data || []).filter((account: ReporterConnectedAccountResponseDto) => {
                const isConnected =
                    account.status === 'connected' &&
                    account.provider_account_id &&
                    !account.provider_account_id.startsWith('pending-');

                return isConnected;
            });

            logger.info('Successfully retrieved reporter user accounts', {
                reporterUserId,
                totalAccounts: data?.length || 0,
                connectedAccounts: connectedAccounts.length,
                filteredOut: (data?.length || 0) - connectedAccounts.length,
            });

            return connectedAccounts as ReporterConnectedAccountResponseDto[];
        } catch (error) {
            logger.error('Error getting reporter user connected accounts', { error, reporterUserId });
            throw new DatabaseError('Failed to get user connected accounts');
        }
    }

    /**
     * Get accounts by provider
     */
    public async getAccountsByProvider(
        provider: string,
        reporterUserId: string
    ): Promise<ReporterConnectedAccountResponseDto[]> {
        try {
            const data = await this.findByMultipleFields({
                provider,
                status: 'connected',
                reporter_user_id: reporterUserId,
            });
            return data;
        } catch (error) {
            logger.error('Error getting reporter accounts by provider', { error, provider, reporterUserId });
            throw new DatabaseError('Failed to get accounts by provider');
        }
    }

    /**
     * Update account sync status
     */
    public async updateSyncStatus(
        id: string,
        status: 'connected' | 'disconnected' | 'error' | 'expired',
        error?: string
    ): Promise<ReporterConnectedAccountResponseDto> {
        try {
            const updateData: UpdateReporterConnectedAccountDto = {
                status,
                metadata: {
                    last_synced_at: new Date().toISOString(),
                    last_error: error || undefined,
                    connection_quality: error ? 'error' : 'good',
                },
                updated_at: new Date().toISOString(),
            };

            return await this.update(id, updateData);
        } catch (error) {
            logger.error('Error updating reporter account sync status', { error, id, status });
            throw new DatabaseError('Failed to update account sync status');
        }
    }

    /**
     * Check if user has account for provider
     */
    public async hasProviderAccount(reporterUserId: string, provider: string): Promise<boolean> {
        try {
            const data = await this.findByMultipleFields({
                reporter_user_id: reporterUserId,
                provider,
                status: 'connected',
            });
            return data.length > 0;
        } catch (error) {
            logger.error('Error checking reporter provider account', { error, reporterUserId, provider });
            return false;
        }
    }

    /**
     * Find account by reporter user ID and provider account ID
     */
    public async findByUserAndProviderAccountId(
        reporterUserId: string,
        providerAccountId: string
    ): Promise<ReporterConnectedAccountResponseDto | null> {
        try {
            const data = await this.findOneByMultipleFields({
                reporter_user_id: reporterUserId,
                provider_account_id: providerAccountId,
            });
            return data;
        } catch (error) {
            logger.error('Error finding reporter account by user and provider account ID', {
                error,
                reporterUserId,
                providerAccountId,
            });
            return null;
        }
    }
}
