import { createClient } from '@supabase/supabase-js';
import env from '../config/env';
import logger from '../utils/logger';

/**
 * Service for managing Supabase auth schema sync with Clerk
 */
export class SupabaseAuthService {
  private supabase;

  constructor() {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration is missing');
    }

    this.supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  /**
   * Sync user to Supabase auth schema
   */
  async syncUserToAuth(clerkUserId: string, userData: {
    email: string;
    full_name?: string;
    avatar_url?: string;
    external_id: string;
  }): Promise<void> {
    try {
      const authUserId = clerkUserId; // Use Clerk user ID as auth user ID

      const authUserData = {
        id: authUserId,
        email: userData.email,
        email_confirmed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        raw_user_meta_data: {
          full_name: userData.full_name,
          avatar_url: userData.avatar_url,
          external_id: userData.external_id
        },
        raw_app_meta_data: {
          provider: 'clerk',
          providers: ['clerk']
        }
      };

      const { error } = await this.supabase
        .from('auth.users')
        .upsert(authUserData, { onConflict: 'id' });

      if (error) {
        logger.error('Error syncing user to auth schema', { error, clerkUserId });
        throw error;
      }

      logger.info('Successfully synced user to auth schema', { clerkUserId, authUserId });

    } catch (error) {
      logger.error('Failed to sync user to auth schema', { error, clerkUserId });
      // Don't throw - this is supplementary sync, main user creation should continue
    }
  }

  /**
   * Update auth user metadata
   */
  async updateUserAuth(clerkUserId: string, userData: {
    email?: string;
    full_name?: string;
    avatar_url?: string;
  }): Promise<void> {
    try {
      const authUserId = clerkUserId;

      const updates: any = {
        updated_at: new Date().toISOString(),
        raw_user_meta_data: {}
      };

      if (userData.email) {
        updates.email = userData.email;
      }

      if (userData.full_name !== undefined) {
        updates.raw_user_meta_data.full_name = userData.full_name;
      }

      if (userData.avatar_url !== undefined) {
        updates.raw_user_meta_data.avatar_url = userData.avatar_url;
      }

      const { error } = await this.supabase
        .from('auth.users')
        .update(updates)
        .eq('id', authUserId);

      if (error) {
        logger.error('Error updating auth user', { error, clerkUserId });
        throw error;
      }

      logger.info('Successfully updated auth user', { clerkUserId });

    } catch (error) {
      logger.error('Failed to update auth user', { error, clerkUserId });
      // Don't throw - this is supplementary sync
    }
  }

  /**
   * Remove user from auth schema (soft delete)
   */
  async deleteUserAuth(clerkUserId: string): Promise<void> {
    try {
      const authUserId = clerkUserId;

      // Soft delete by updating email and marking as deleted
      const { error } = await this.supabase
        .from('auth.users')
        .update({
          email: `deleted_${authUserId}@deleted.local`,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', authUserId);

      if (error) {
        logger.error('Error soft deleting auth user', { error, clerkUserId });
        throw error;
      }

      logger.info('Successfully soft deleted auth user', { clerkUserId });

    } catch (error) {
      logger.error('Failed to soft delete auth user', { error, clerkUserId });
      // Don't throw - this is supplementary cleanup
    }
  }

  /**
   * Sync organization to auth schema identities if needed
   */
  async syncOrganizationContext(orgId: string, orgData: {
    name: string;
    slug?: string;
  }): Promise<void> {
    try {
      // This could be used to sync organization context to auth metadata
      // For now, we'll just log it as organizations are handled separately
      logger.info('Organization context available for auth sync', { orgId, orgName: orgData.name });
    } catch (error) {
      logger.error('Failed to sync organization context', { error, orgId });
    }
  }

  /**
   * Get auth user by Clerk ID
   */
  async getAuthUser(clerkUserId: string): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('auth.users')
        .select('*')
        .eq('id', clerkUserId)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found is ok
        logger.error('Error fetching auth user', { error, clerkUserId });
        return null;
      }

      return data;
    } catch (error) {
      logger.error('Failed to get auth user', { error, clerkUserId });
      return null;
    }
  }

  /**
   * Verify auth schema connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('auth.users')
        .select('id')
        .limit(1);

      if (error) {
        logger.error('Auth schema health check failed', { error });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Auth schema health check error', { error });
      return false;
    }
  }
}
