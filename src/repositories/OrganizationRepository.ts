import { BaseRepository } from './BaseRepository';
import { DatabaseError, NotFoundError } from '../errors/AppError';
import logger from '../utils/logger';

// Organization types based on our enhanced schema
export interface Organization {
  id: string;
  name: string;
  slug?: string;
  logo_url?: string;
  website_url?: string;
  industry?: string;
  company_size?: string;
  timezone: string;
  plan: string;
  billing_email?: string;
  subscription_status: string;
  trial_ends_at?: string;
  monthly_campaign_limit: number;
  monthly_lead_limit: number;
  user_limit: number;
  onboarding_completed: boolean;
  settings: Record<string, any>;
  usage_stats: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreateOrganization {
  name: string;
  slug?: string;
  logo_url?: string;
  website_url?: string;
  industry?: string;
  company_size?: string;
  timezone?: string;
  billing_email?: string;
}

export interface UpdateOrganization {
  name?: string;
  slug?: string;
  logo_url?: string;
  website_url?: string;
  industry?: string;
  company_size?: string;
  timezone?: string;
  billing_email?: string;
  onboarding_completed?: boolean;
  settings?: Record<string, any>;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  permissions: Record<string, any>;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrganizationMember {
  organization_id: string;
  user_id: string;
  role?: string;
  permissions?: Record<string, any>;
}

export interface UpdateOrganizationMember {
  role?: string;
  permissions?: Record<string, any>;
  status?: string;
}

/**
 * Repository for organization-related database operations
 */
export class OrganizationRepository extends BaseRepository<Organization, CreateOrganization, UpdateOrganization> {
  constructor() {
    super('organizations');
  }

  /**
   * Find organization by slug
   */
  async findBySlug(slug: string): Promise<Organization | null> {
    try {
      return await this.findOneByField('slug', slug);
    } catch (error) {
      logger.error('Error finding organization by slug', { error, slug });
      throw new DatabaseError('Failed to find organization by slug');
    }
  }

  /**
   * Check if slug is available
   */
  async isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
    try {
      let query = this.client
        .from(this.tableName)
        .select('id')
        .eq('slug', slug);

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query.single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return !data;
    } catch (error) {
      logger.error('Error checking slug availability', { error, slug });
      throw new DatabaseError('Failed to check slug availability');
    }
  }

  /**
   * Get organizations for a user
   */
  async getUserOrganizations(userId: string): Promise<Array<Organization & { role: string; status: string }>> {
    try {
      const { data, error } = await this.client
        .from('organization_members')
        .select(`
          role,
          status,
          organizations (*)
        `)
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        throw error;
      }

      return (data || []).map((item: any) => ({
        ...item.organizations,
        role: item.role,
        status: item.status,
      }));
    } catch (error) {
      logger.error('Error getting user organizations', { error, userId });
      throw new DatabaseError('Failed to get user organizations');
    }
  }

  /**
   * Get organization members
   */
  async getMembers(organizationId: string, page = 1, limit = 20): Promise<{ data: any[]; count: number }> {
    try {
      const offset = (page - 1) * limit;

      // Get total count
      const { count, error: countError } = await this.client
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);

      if (countError) {
        throw countError;
      }

      // Get paginated data with user info
      const { data, error } = await this.client
        .from('organization_members')
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
            avatar_url,
            timezone
          )
        `)
        .eq('organization_id', organizationId)
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return {
        data: data || [],
        count: count || 0,
      };
    } catch (error) {
      logger.error('Error getting organization members', { error, organizationId });
      throw new DatabaseError('Failed to get organization members');
    }
  }

  /**
   * Add member to organization
   */
  async addMember(data: CreateOrganizationMember): Promise<OrganizationMember> {
    try {
      const { data: result, error } = await this.client
        .from('organization_members')
        .insert({
          ...data,
          role: data.role || 'member',
          permissions: data.permissions || {},
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return result as OrganizationMember;
    } catch (error) {
      logger.error('Error adding organization member', { error, data });
      throw new DatabaseError('Failed to add organization member');
    }
  }

  /**
   * Update organization member
   */
  async updateMember(organizationId: string, userId: string, data: UpdateOrganizationMember): Promise<OrganizationMember> {
    try {
      const { data: result, error } = await this.client
        .from('organization_members')
        .update(data)
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!result) {
        throw new NotFoundError('Organization member not found');
      }

      return result as OrganizationMember;
    } catch (error) {
      logger.error('Error updating organization member', { error, organizationId, userId, data });
      throw new DatabaseError('Failed to update organization member');
    }
  }

  /**
   * Remove member from organization
   */
  async removeMember(organizationId: string, userId: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('organization_members')
        .delete()
        .eq('organization_id', organizationId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }
    } catch (error) {
      logger.error('Error removing organization member', { error, organizationId, userId });
      throw new DatabaseError('Failed to remove organization member');
    }
  }

  /**
   * Get member info
   */
  async getMembership(organizationId: string, userId: string): Promise<OrganizationMember | null> {
    try {
      const { data, error } = await this.client
        .from('organization_members')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data as OrganizationMember | null;
    } catch (error) {
      logger.error('Error getting organization membership', { error, organizationId, userId });
      throw new DatabaseError('Failed to get organization membership');
    }
  }

  /**
   * Check if user is member of organization
   */
  async isMember(organizationId: string, userId: string): Promise<boolean> {
    try {
      const membership = await this.getMembership(organizationId, userId);
      return membership !== null && membership.status === 'active';
    } catch (error) {
      logger.error('Error checking organization membership', { error, organizationId, userId });
      return false;
    }
  }

  /**
   * Get organization usage statistics
   */
  async getUsageStats(organizationId: string, month?: string): Promise<Record<string, any>> {
    try {
      // This would typically involve complex queries across multiple tables
      // For now, return basic stats from the organization record
      const organization = await this.findById(organizationId);
      
      // TODO: Implement actual usage calculation from campaigns, leads, etc.
      const stats = {
        campaigns_used: 0,
        leads_used: 0,
        users_count: 0,
        monthly_limits: {
          campaigns: organization.monthly_campaign_limit,
          leads: organization.monthly_lead_limit,
          users: organization.user_limit,
        },
        ...organization.usage_stats,
      };

      return stats;
    } catch (error) {
      logger.error('Error getting organization usage stats', { error, organizationId });
      throw new DatabaseError('Failed to get organization usage stats');
    }
  }

  /**
   * Update organization usage statistics
   */
  async updateUsageStats(organizationId: string, stats: Record<string, any>): Promise<void> {
    try {
      await this.update(organizationId, {
        settings: stats,
      } as UpdateOrganization);
    } catch (error) {
      logger.error('Error updating organization usage stats', { error, organizationId, stats });
      throw new DatabaseError('Failed to update organization usage stats');
    }
  }

  /**
   * Sync organization from Clerk webhook
   */
  async syncFromClerk(clerkOrgId: string, name: string, creatorUserId: string): Promise<Organization> {
    try {
      // Check if organization already exists
      const existing = await this.findByClerkOrgId(clerkOrgId);
      if (existing) {
        return existing;
      }

      // Create new organization
      const orgData: CreateOrganization = {
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      };

      const organization = await this.create(orgData);

      // Add creator as owner
      await this.addMember(organization.id, creatorUserId, 'owner');

      return organization;
    } catch (error) {
      logger.error('Error syncing organization from Clerk', { error, clerkOrgId, name });
      throw new DatabaseError('Failed to sync organization from Clerk');
    }
  }

  /**
   * Find organization by Clerk organization ID
   */
  async findByClerkOrgId(clerkOrgId: string): Promise<Organization | null> {
    try {
      // Note: You'll need to add clerk_org_id field to your schema
      // For now, we'll search by name as a fallback
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('name', clerkOrgId) // Temporary - should be clerk_org_id field
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data as Organization | null;
    } catch (error) {
      logger.error('Error finding organization by Clerk ID', { error, clerkOrgId });
      return null;
    }
  }
}