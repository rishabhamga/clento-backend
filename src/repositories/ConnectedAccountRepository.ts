import { BaseRepository } from './BaseRepository';
import { DatabaseError, NotFoundError } from '../errors/AppError';
import logger from '../utils/logger';
import { supabaseAdmin } from '../config/supabase';

// Connected Account types based on actual database schema
export interface ConnectedAccount {
  id: string;
  user_id: string;
  organization_id: string;
  provider: string;
  provider_account_id: string;
  display_name: string;
  email?: string;
  profile_picture_url?: string;
  status: string;
  capabilities: any[]; // JSONB array
  metadata: Record<string, any>; // JSONB object
  last_synced_at?: string;
  daily_usage?: number;
  usage_reset_at?: string;
  connection_quality?: string;
  last_error?: string;
  daily_limit?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateConnectedAccount {
  user_id: string;
  organization_id: string;
  provider: string;
  provider_account_id: string;
  display_name: string;
  email?: string;
  profile_picture_url?: string;
  status?: string;
  capabilities?: any[];
  metadata?: Record<string, any>;
}

export interface UpdateConnectedAccount {
  display_name?: string;
  email?: string;
  profile_picture_url?: string;
  status?: string;
  capabilities?: any[];
  metadata?: Record<string, any>;
  last_synced_at?: string;
  daily_usage?: number;
  daily_limit?: number;
  usage_reset_at?: string;
  connection_quality?: string;
  provider_account_id?: string;
  last_error?: string;
}

/**
 * Repository for connected account-related database operations
 */
export class ConnectedAccountRepository extends BaseRepository<ConnectedAccount, CreateConnectedAccount, UpdateConnectedAccount> {
  constructor() {
    super('connected_accounts');
  }

  /**
   * Find connected account by provider account ID
   */
  async findByProviderAccountId(provider: string, providerAccountId: string): Promise<ConnectedAccount | null> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('provider', provider)
        .eq('provider_account_id', providerAccountId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data as ConnectedAccount | null;
    } catch (error) {
      logger.error('Error finding connected account by provider account ID', {
        error,
        provider,
        providerAccountId
      });
      throw new DatabaseError('Failed to find connected account by provider account ID');
    }
  }

  /**
   * Get user's pending/incomplete accounts (for debugging or status tracking)
   */
  async getPendingAccounts(userId: string, organizationId?: string): Promise<ConnectedAccount[]> {
    try {
      logger.info('Getting user pending accounts', { userId, organizationId });

      let query = this.client
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId);

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        logger.error('Database error getting pending accounts', { error, userId, organizationId });
        throw error;
      }

      // Filter for pending/incomplete accounts
      const pendingAccounts = (data || []).filter((account: ConnectedAccount) => {
        const isPending = account.provider_account_id?.startsWith('pending-') ||
                         !account.email ||
                         account.email.trim() === '';

        const metadata = account.metadata as any;
        const connectionStatus = metadata?.connection_status;
        const isPendingStatus = connectionStatus === 'pending';

        return isPending || isPendingStatus;
      });

      logger.info('Retrieved pending accounts', {
        userId,
        organizationId,
        pendingCount: pendingAccounts.length
      });

      return pendingAccounts as ConnectedAccount[];
    } catch (error) {
      logger.error('Error getting pending accounts', { error, userId, organizationId });
      throw new DatabaseError('Failed to get pending accounts');
    }
  }

  /**
   * Get user's connected accounts
   */
  async getUserAccounts(userId: string, organizationId?: string): Promise<ConnectedAccount[]> {
    try {
      logger.info('Getting user connected accounts', { userId, organizationId });

      let query = this.client
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId);

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        logger.error('Database error getting user accounts', { error, userId, organizationId });

        // Handle specific error cases
        if (error.code === '22P02') {
          // Invalid UUID format
          logger.warn('Invalid UUID format for user_id', { userId });
          return []; // Return empty array instead of throwing
        }

        if (error.code === '42P01') {
          // Table doesn't exist
          logger.warn('Connected accounts table does not exist');
          return [];
        }

        throw error;
      }

      // Filter out pending/incomplete accounts
      const connectedAccounts = (data || []).filter((account: ConnectedAccount) => {
        // Check if account is truly connected
        const isConnected = account.status === 'connected' &&
                           account.email &&
                           account.email.trim() !== '' &&
                           account.provider_account_id &&
                           !account.provider_account_id.startsWith('pending-');

        // Also check metadata for connection_status
        const metadata = account.metadata as any;
        const connectionStatus = metadata?.connection_status;
        const isNotPending = connectionStatus !== 'pending';

        const shouldInclude = isConnected && isNotPending;

        if (!shouldInclude) {
          logger.info('Filtering out pending/incomplete account', {
            accountId: account.id,
            displayName: account.display_name,
            status: account.status,
            email: account.email,
            providerAccountId: account.provider_account_id,
            connectionStatus: connectionStatus
          });
        }

        return shouldInclude;
      });

      logger.info('Successfully retrieved user accounts', {
        userId,
        organizationId,
        totalAccounts: data?.length || 0,
        connectedAccounts: connectedAccounts.length,
        filteredOut: (data?.length || 0) - connectedAccounts.length
      });

      return connectedAccounts as ConnectedAccount[];
    } catch (error) {
      logger.error('Error getting user connected accounts', { error, userId, organizationId });

      // For development, return empty array instead of throwing
      if (process.env.NODE_ENV === 'development') {
        logger.warn('Returning empty accounts array for development');
        return [];
      }

      throw new DatabaseError('Failed to get user connected accounts');
    }
  }

  /**
   * Get organization's connected accounts
   */
  async getOrganizationAccounts(organizationId: string, page = 1, limit = 20): Promise<{ data: ConnectedAccount[]; count: number }> {
    try {
      const offset = (page - 1) * limit;

      // Get total count
      const { count, error: countError } = await this.client
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);

      if (countError) {
        throw countError;
      }

      // Get paginated data
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('organization_id', organizationId)
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return {
        data: (data || []) as ConnectedAccount[],
        count: count || 0,
      };
    } catch (error) {
      logger.error('Error getting organization connected accounts', { error, organizationId });
      throw new DatabaseError('Failed to get organization connected accounts');
    }
  }

  /**
   * Get accounts by provider
   */
  async getAccountsByProvider(provider: string, organizationId?: string): Promise<ConnectedAccount[]> {
    try {
      let query = this.client
        .from(this.tableName)
        .select('*')
        .eq('provider', provider)
        .eq('status', 'connected');

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as ConnectedAccount[];
    } catch (error) {
      logger.error('Error getting accounts by provider', { error, provider, organizationId });
      throw new DatabaseError('Failed to get accounts by provider');
    }
  }

  /**
   * Update account usage statistics
   */
  async updateUsage(id: string, usage: number): Promise<ConnectedAccount> {
    try {
      const now = new Date().toISOString();

      // Get current account to check if we need to reset daily usage
      const account = await this.findById(id);
      const resetTime = account.usage_reset_at ? new Date(account.usage_reset_at) : new Date();
      const shouldReset = resetTime <= new Date();

      const updateData: UpdateConnectedAccount = {
        daily_usage: shouldReset ? usage : (account.daily_usage || 0) + usage,
        usage_reset_at: shouldReset ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : account.usage_reset_at,
        last_synced_at: now
      };

      return await this.update(id, updateData);
    } catch (error) {
      logger.error('Error updating account usage', { error, id, usage });
      throw new DatabaseError('Failed to update account usage');
    }
  }

  /**
   * Update account sync status
   */
  async updateSyncStatus(id: string, status: string, error?: string): Promise<ConnectedAccount> {
    try {
      const updateData: UpdateConnectedAccount = {
        status,
        last_synced_at: new Date().toISOString(),
        connection_quality: error ? 'error' : 'good',
        last_error: error || undefined,
      };

      return await this.update(id, updateData);
    } catch (error) {
      logger.error('Error updating account sync status', { error, id, status });
      throw new DatabaseError('Failed to update account sync status');
    }
  }

  /**
   * Get accounts that need token refresh
   */
  async getAccountsNeedingRefresh(): Promise<ConnectedAccount[]> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('status', 'connected')
        .not('token_expires_at', 'is', null)
        .lt('token_expires_at', new Date(Date.now() + 60 * 60 * 1000).toISOString()); // Expires in 1 hour

      if (error) {
        throw error;
      }

      return (data || []) as ConnectedAccount[];
    } catch (error) {
      logger.error('Error getting accounts needing refresh', { error });
      throw new DatabaseError('Failed to get accounts needing refresh');
    }
  }

  /**
   * Get accounts by status
   */
  async getAccountsByStatus(status: string, organizationId?: string): Promise<ConnectedAccount[]> {
    try {
      let query = this.client
        .from(this.tableName)
        .select('*')
        .eq('status', status);

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as ConnectedAccount[];
    } catch (error) {
      logger.error('Error getting accounts by status', { error, status, organizationId });
      throw new DatabaseError('Failed to get accounts by status');
    }
  }

  /**
   * Check if user has account for provider
   */
  async hasProviderAccount(userId: string, provider: string, organizationId?: string): Promise<boolean> {
    try {
      let query = this.client
        .from(this.tableName)
        .select('id')
        .eq('user_id', userId)
        .eq('provider', provider)
        .eq('status', 'connected');

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query.single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return !!data;
    } catch (error) {
      logger.error('Error checking provider account', { error, userId, provider, organizationId });
      return false;
    }
  }

  /**
   * Get account usage statistics for organization
   */
  async getOrganizationUsageStats(organizationId: string): Promise<Record<string, any>> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('provider, daily_usage, daily_limit, status')
        .eq('organization_id', organizationId);

      if (error) {
        throw error;
      }

      const stats = (data || []).reduce((acc: Record<string, any>, account: any) => {
        const provider = account.provider;
        if (!acc[provider]) {
          acc[provider] = {
            total_accounts: 0,
            connected_accounts: 0,
            total_usage: 0,
            total_limit: 0,
          };
        }

        acc[provider].total_accounts++;
        if (account.status === 'connected') {
          acc[provider].connected_accounts++;
        }
        acc[provider].total_usage += account.daily_usage || 0;
        acc[provider].total_limit += account.daily_limit || 0;

        return acc;
      }, {});

      return stats;
    } catch (error) {
      logger.error('Error getting organization usage stats', { error, organizationId });
      throw new DatabaseError('Failed to get organization usage stats');
    }
  }
}
