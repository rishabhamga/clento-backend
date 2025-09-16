import { BaseRepository } from './BaseRepository';
import { DatabaseError, NotFoundError } from '../errors/AppError';
import logger from '../utils/logger';

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  permissions: Record<string, any>;
  status: string;
  invited_by: string | null;
  invited_at: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrganizationMember {
  organization_id: string;
  user_id: string;
  role?: string;
  permissions?: Record<string, any>;
  status?: string;
  invited_by?: string | null;
  invited_at?: string | null;
  joined_at?: string;
}

export interface UpdateOrganizationMember {
  role?: string;
  permissions?: Record<string, any>;
  status?: string;
  invited_by?: string | null;
  invited_at?: string | null;
  joined_at?: string;
}

/**
 * Repository for organization_members table operations
 */
export class OrganizationMemberRepository extends BaseRepository<OrganizationMember, CreateOrganizationMember, UpdateOrganizationMember> {
  constructor() {
    super('organization_members');
  }

  /**
   * Find members by organization ID
   */
  async findByOrganizationId(
    organizationId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: string;
      role?: string;
    }
  ): Promise<{ data: OrganizationMember[]; total: number; page: number; limit: number }> {
    try {
      const page = options?.page || 1;
      const limit = options?.limit || 20;
      const offset = (page - 1) * limit;

      let query = this.client
        .from(this.tableName)
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (options?.status) {
        query = query.eq('status', options.status);
      }

      if (options?.role) {
        query = query.eq('role', options.role);
      }

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error('Error finding members by organization', { error, organizationId });
        throw new DatabaseError('Failed to retrieve organization members');
      }

      return {
        data: data || [],
        total: count || 0,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Error in findByOrganizationId', { error, organizationId });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to retrieve organization members');
    }
  }

  /**
   * Find members by user ID
   */
  async findByUserId(userId: string): Promise<OrganizationMember[]> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error finding members by user', { error, userId });
        throw new DatabaseError('Failed to retrieve organization members');
      }

      return data || [];
    } catch (error) {
      logger.error('Error in findByUserId', { error, userId });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to retrieve organization members');
    }
  }

  /**
   * Find member by organization and user ID
   */
  async findByOrganizationAndUser(organizationId: string, userId: string): Promise<OrganizationMember | null> {
    try {
      const members = await this.findByField('organization_id', organizationId);
      return members.find(member => member.user_id === userId) || null;
    } catch (error) {
      logger.error('Error finding member by organization and user', { error, organizationId, userId });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to find organization member');
    }
  }

  /**
   * Get members with user information
   */
  async getMembersWithUserInfo(
    organizationId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: string;
      role?: string;
    }
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    try {
      const page = options?.page || 1;
      const limit = options?.limit || 20;
      const offset = (page - 1) * limit;

      let query = this.client
        .from(this.tableName)
        .select(`
          id,
          role,
          permissions,
          status,
          created_at,
          updated_at,
          users (
            id,
            external_id,
            email,
            full_name,
            avatar_url
          )
        `, { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (options?.status) {
        query = query.eq('status', options.status);
      }

      if (options?.role) {
        query = query.eq('role', options.role);
      }

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error('Error getting members with user info', { error, organizationId });
        throw new DatabaseError('Failed to retrieve organization members');
      }

      return {
        data: data || [],
        total: count || 0,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Error in getMembersWithUserInfo', { error, organizationId });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to retrieve organization members');
    }
  }

  /**
   * Update member role
   */
  async updateRole(organizationId: string, userId: string, role: string): Promise<OrganizationMember> {
    try {
      const member = await this.findByOrganizationAndUser(organizationId, userId);
      if (!member) {
        throw new NotFoundError('Organization member not found');
      }

      return await this.update(member.id, { role });
    } catch (error) {
      logger.error('Error updating member role', { error, organizationId, userId, role });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to update member role');
    }
  }

  /**
   * Update member permissions
   */
  async updatePermissions(organizationId: string, userId: string, permissions: Record<string, any>): Promise<OrganizationMember> {
    try {
      const member = await this.findByOrganizationAndUser(organizationId, userId);
      if (!member) {
        throw new NotFoundError('Organization member not found');
      }

      return await this.update(member.id, { permissions });
    } catch (error) {
      logger.error('Error updating member permissions', { error, organizationId, userId, permissions });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to update member permissions');
    }
  }

  /**
   * Remove member from organization
   */
  async removeMember(organizationId: string, userId: string): Promise<void> {
    try {
      const member = await this.findByOrganizationAndUser(organizationId, userId);
      if (!member) {
        throw new NotFoundError('Organization member not found');
      }

      await this.delete(member.id);
      logger.info('Member removed from organization', { organizationId, userId });
    } catch (error) {
      logger.error('Error removing member', { error, organizationId, userId });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to remove member');
    }
  }

  /**
   * Get organization member count
   */
  async getMemberCount(organizationId: string): Promise<number> {
    try {
      const { count, error } = await this.client
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);

      if (error) {
        logger.error('Error getting member count', { error, organizationId });
        throw new DatabaseError('Failed to get member count');
      }

      return count || 0;
    } catch (error) {
      logger.error('Error in getMemberCount', { error, organizationId });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to get member count');
    }
  }
}
