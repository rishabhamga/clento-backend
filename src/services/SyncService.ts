import { UserRepository } from '../repositories/UserRepository';
import { OrganizationRepository } from '../repositories/OrganizationRepository';
import { OrganizationMemberRepository } from '../repositories/OrganizationMemberRepository';
import { ClerkApiService } from './ClerkApiService';
import { SupabaseAuthService } from './SupabaseAuthService';
import { DatabaseError, NotFoundError } from '../errors/AppError';
import logger from '../utils/logger';

/**
 * Comprehensive sync service for managing data synchronization between Clerk and database
 */
export class SyncService {
  private userRepository: UserRepository;
  private organizationRepository: OrganizationRepository;
  private memberRepository: OrganizationMemberRepository;
  private clerkApiService: ClerkApiService;
  private supabaseAuthService: SupabaseAuthService;

  constructor() {
    this.userRepository = new UserRepository();
    this.organizationRepository = new OrganizationRepository();
    this.memberRepository = new OrganizationMemberRepository();
    this.clerkApiService = new ClerkApiService();
    this.supabaseAuthService = new SupabaseAuthService();
  }

  /**
   * Sync user from Clerk by Clerk user ID
   * This is the main entry point for user synchronization
   */
  async syncUserToDatabase(clerkUserId: string): Promise<any> {
    try {
      logger.info('Starting user sync', { clerkUserId });

      // Check if user already exists in database
      const existingUser = await this.userRepository.findByClerkId(clerkUserId);

      if (existingUser) {
        logger.info('User already exists, updating if needed', {
          clerkUserId,
          userId: existingUser.id
        });

        // Update user data from Clerk
        return await this.updateUserFromClerk(clerkUserId, existingUser);
      }

      // User doesn't exist, create new user
      logger.info('User not found, creating new user', { clerkUserId });
      return await this.createUserFromClerk(clerkUserId);

    } catch (error) {
      logger.error('Error syncing user to database', { error, clerkUserId });
      throw new DatabaseError('Failed to sync user to database');
    }
  }

  /**
   * Get or create user by Clerk ID (API-friendly version)
   * Handles race conditions and provides fallback data
   */
  async getOrCreateUserByClerkId(clerkUserId: string): Promise<any> {
    try {
      // First try to find existing user
      let user = await this.userRepository.findByClerkId(clerkUserId);

      if (user) {
        return user;
      }

      // User doesn't exist, try to create from Clerk
      try {
        return await this.createUserFromClerk(clerkUserId);
      } catch (clerkError) {
        logger.warn('Failed to fetch from Clerk API, creating temporary user', {
          clerkUserId,
          error: clerkError
        });

        // Fallback: create temporary user with minimal data
        return await this.createTemporaryUser(clerkUserId);
      }

    } catch (error) {
      logger.error('Error in getOrCreateUserByClerkId', { error, clerkUserId });
      throw new DatabaseError('Failed to get or create user');
    }
  }

  /**
   * Sync organization from Clerk by Clerk organization ID
   */
  async syncOrganizationToDatabase(clerkOrgId: string): Promise<any> {
    try {
      logger.info('Starting organization sync', { clerkOrgId });

      // Check if organization already exists
      const existingOrg = await this.organizationRepository.findByClerkOrgId(clerkOrgId);

      if (existingOrg) {
        logger.info('Organization already exists, updating if needed', {
          clerkOrgId,
          orgId: existingOrg.id
        });

        return await this.updateOrganizationFromClerk(clerkOrgId, existingOrg);
      }

      // Organization doesn't exist, create new organization
      logger.info('Organization not found, creating new organization', { clerkOrgId });
      return await this.createOrganizationFromClerk(clerkOrgId);

    } catch (error) {
      logger.error('Error syncing organization to database', { error, clerkOrgId });
      throw new DatabaseError('Failed to sync organization to database');
    }
  }

  /**
   * Sync organization membership
   */
  async syncOrganizationMembership(clerkOrgId: string, clerkUserId: string, role: string = 'member'): Promise<any> {
    try {
      logger.info('Starting organization membership sync', { clerkOrgId, clerkUserId, role });

      // Ensure user exists
      const user = await this.getOrCreateUserByClerkId(clerkUserId);

      // Ensure organization exists
      const organization = await this.syncOrganizationToDatabase(clerkOrgId);

      // Check if membership already exists
      const existingMembership = await this.memberRepository.findByOrganizationAndUser(organization.id, user.id);

      if (existingMembership) {
        // Update role if different
        if (existingMembership.role !== role.toLowerCase()) {
          await this.memberRepository.update(existingMembership.id, { role: role.toLowerCase() });
          logger.info('Updated organization membership role', {
            orgId: organization.id,
            userId: user.id,
            newRole: role
          });
        }
        return existingMembership;
      }

      // Create new membership
      const membership = await this.organizationRepository.addMember({
        organization_id: organization.id,
        user_id: user.id,
        role: role.toLowerCase()
      });

      logger.info('Created organization membership', {
        orgId: organization.id,
        userId: user.id,
        role
      });

      return membership;

    } catch (error) {
      logger.error('Error syncing organization membership', { error, clerkOrgId, clerkUserId });
      throw new DatabaseError('Failed to sync organization membership');
    }
  }

  /**
   * Create user from Clerk API data
   */
  private async createUserFromClerk(clerkUserId: string): Promise<any> {
    try {
      // Fetch user data from Clerk API
      const clerkUser = await this.clerkApiService.getUser(clerkUserId);

      if (!clerkUser) {
        throw new Error('User not found in Clerk');
      }

      // Extract primary email
      const primaryEmail = clerkUser.emailAddresses.find(
        (email: any) => email.id === clerkUser.primaryEmailAddressId
      );

      if (!primaryEmail) {
        throw new Error('No primary email found for user');
      }

      // Create user in database
      const userData = {
        external_id: clerkUserId,
        email: primaryEmail.emailAddress,
        full_name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null,
        avatar_url: clerkUser.imageUrl || null,
      };

      const user = await this.userRepository.create(userData as any);

      // Also sync to Supabase auth schema for RLS integration
      await this.supabaseAuthService.syncUserToAuth(clerkUserId, userData);

      logger.info('Created user from Clerk', {
        clerkUserId,
        userId: user.id,
        email: primaryEmail.emailAddress
      });

      return user;

    } catch (error) {
      logger.error('Error creating user from Clerk', { error, clerkUserId });
      throw error;
    }
  }

  /**
   * Update existing user from Clerk API data
   */
  private async updateUserFromClerk(clerkUserId: string, existingUser: any): Promise<any> {
    try {
      // Fetch latest data from Clerk API
      const clerkUser = await this.clerkApiService.getUser(clerkUserId);

      if (!clerkUser) {
        logger.warn('User not found in Clerk, keeping existing data', { clerkUserId });
        return existingUser;
      }

      // Extract primary email
      const primaryEmail = clerkUser.emailAddresses.find(
        (email: any) => email.id === clerkUser.primaryEmailAddressId
      );

      if (!primaryEmail) {
        logger.warn('No primary email found, keeping existing data', { clerkUserId });
        return existingUser;
      }

      // Check if update is needed
      const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;
      const needsUpdate =
        existingUser.email !== primaryEmail.emailAddress ||
        existingUser.full_name !== fullName ||
        existingUser.avatar_url !== clerkUser.imageUrl;

      if (!needsUpdate) {
        logger.info('User data is up to date', { clerkUserId, userId: existingUser.id });
        return existingUser;
      }

      // Update user
      const updateData = {
        email: primaryEmail.emailAddress,
        full_name: fullName,
        avatar_url: clerkUser.imageUrl || null,
      };

      const updatedUser = await this.userRepository.update(existingUser.id, updateData);

      // Also update in Supabase auth schema
      await this.supabaseAuthService.updateUserAuth(clerkUserId, updateData);

      logger.info('Updated user from Clerk', {
        clerkUserId,
        userId: existingUser.id,
        email: primaryEmail.emailAddress
      });

      return updatedUser;

    } catch (error) {
      logger.error('Error updating user from Clerk', { error, clerkUserId });
      // Return existing user if update fails
      return existingUser;
    }
  }

  /**
   * Create temporary user when Clerk API is unavailable
   */
  private async createTemporaryUser(clerkUserId: string): Promise<any> {
    try {
      const userData = {
        external_id: clerkUserId,
        email: `temp-${clerkUserId}@example.com`,
        full_name: 'Temporary User',
      };

      const user = await this.userRepository.create(userData as any);

      logger.info('Created temporary user', {
        clerkUserId,
        userId: user.id
      });

      return user;

    } catch (error) {
      logger.error('Error creating temporary user', { error, clerkUserId });
      throw error;
    }
  }

  /**
   * Create organization from Clerk API data
   */
  private async createOrganizationFromClerk(clerkOrgId: string): Promise<any> {
    try {
      // Fetch organization data from Clerk API
      const clerkOrg = await this.clerkApiService.getOrganization(clerkOrgId);

      if (!clerkOrg) {
        throw new Error('Organization not found in Clerk');
      }

      // Create organization in database
      const orgData = {
        external_id: clerkOrgId,
        name: clerkOrg.name,
        slug: clerkOrg.slug || clerkOrg.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        timezone: 'UTC',
        plan: 'free',
        subscription_status: 'active',
        monthly_campaign_limit: 10,
        monthly_lead_limit: 100,
        user_limit: 5,
        onboarding_completed: false,
        settings: {},
        usage_stats: {}
      };

      const organization = await this.organizationRepository.create(orgData as any);

      logger.info('Created organization from Clerk', {
        clerkOrgId,
        orgId: organization.id,
        name: clerkOrg.name
      });

      return organization;

    } catch (error) {
      logger.error('Error creating organization from Clerk', { error, clerkOrgId });
      throw error;
    }
  }

  /**
   * Update existing organization from Clerk API data
   */
  private async updateOrganizationFromClerk(clerkOrgId: string, existingOrg: any): Promise<any> {
    try {
      // Fetch latest data from Clerk API
      const clerkOrg = await this.clerkApiService.getOrganization(clerkOrgId);

      if (!clerkOrg) {
        logger.warn('Organization not found in Clerk, keeping existing data', { clerkOrgId });
        return existingOrg;
      }

      // Check if update is needed
      const needsUpdate =
        existingOrg.name !== clerkOrg.name ||
        existingOrg.slug !== (clerkOrg.slug || clerkOrg.name.toLowerCase().replace(/[^a-z0-9]/g, '-'));

      if (!needsUpdate) {
        logger.info('Organization data is up to date', { clerkOrgId, orgId: existingOrg.id });
        return existingOrg;
      }

      // Update organization
      const updatedOrg = await this.organizationRepository.update(existingOrg.id, {
        name: clerkOrg.name,
        slug: clerkOrg.slug || clerkOrg.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      });

      logger.info('Updated organization from Clerk', {
        clerkOrgId,
        orgId: existingOrg.id,
        name: clerkOrg.name
      });

      return updatedOrg;

    } catch (error) {
      logger.error('Error updating organization from Clerk', { error, clerkOrgId });
      // Return existing organization if update fails
      return existingOrg;
    }
  }

  /**
   * Sync all user organizations
   */
  async syncUserOrganizations(clerkUserId: string): Promise<any[]> {
    try {
      logger.info('Starting user organizations sync', { clerkUserId });

      // Get user's organizations from Clerk
      const clerkOrgs = await this.clerkApiService.getUserOrganizations(clerkUserId);

      if (!clerkOrgs || clerkOrgs.length === 0) {
        logger.info('No organizations found for user', { clerkUserId });
        return [];
      }

      const syncedOrgs = [];

      for (const clerkOrg of clerkOrgs) {
        try {
          // Sync organization
          const organization = await this.syncOrganizationToDatabase(clerkOrg.id);

          // Sync membership
          await this.syncOrganizationMembership(
            clerkOrg.id,
            clerkUserId,
            clerkOrg.role || 'member'
          );

          syncedOrgs.push(organization);

        } catch (error) {
          logger.error('Error syncing organization for user', {
            error,
            clerkUserId,
            clerkOrgId: clerkOrg.id
          });
          // Continue with other organizations
        }
      }

      logger.info('Completed user organizations sync', {
        clerkUserId,
        syncedCount: syncedOrgs.length
      });

      return syncedOrgs;

    } catch (error) {
      logger.error('Error syncing user organizations', { error, clerkUserId });
      throw new DatabaseError('Failed to sync user organizations');
    }
  }

  /**
   * Full sync for a user (user + organizations + memberships)
   */
  async fullUserSync(clerkUserId: string): Promise<{
    user: any;
    organizations: any[];
  }> {
    try {
      logger.info('Starting full user sync', { clerkUserId });

      // Sync user
      const user = await this.syncUserToDatabase(clerkUserId);

      // Sync user's organizations
      const organizations = await this.syncUserOrganizations(clerkUserId);

      logger.info('Completed full user sync', {
        clerkUserId,
        userId: user.id,
        orgCount: organizations.length
      });

      return {
        user,
        organizations
      };

    } catch (error) {
      logger.error('Error in full user sync', { error, clerkUserId });
      throw new DatabaseError('Failed to perform full user sync');
    }
  }
}
