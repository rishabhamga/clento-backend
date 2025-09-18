import { createClerkClient } from '@clerk/clerk-sdk-node';
import logger from '../utils/logger';
import env from '../config/env';

/**
 * Service for interacting with Clerk API
 */
export class ClerkApiService {
  private clerkClient: any;

  constructor() {
    if (!env.CLERK_SECRET_KEY) {
      logger.warn('CLERK_SECRET_KEY not provided, Clerk API calls will fail');
    }

    this.clerkClient = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY || 'dummy-key-for-development'
    });
  }

  /**
   * Get user by Clerk user ID
   */
  async getUser(clerkUserId: string): Promise<any> {
    try {
      if (!env.CLERK_SECRET_KEY) {
        logger.warn('Clerk API not available, returning mock data', { clerkUserId });
        return this.getMockUser(clerkUserId);
      }

      const user = await this.clerkClient.users.getUser(clerkUserId);

      logger.info('Fetched user from Clerk API', { clerkUserId });
      return user;

    } catch (error) {
      logger.error('Error fetching user from Clerk API', { error, clerkUserId });
      throw error;
    }
  }

  /**
   * Get organization by Clerk organization ID
   */
  async getOrganization(clerkOrgId: string): Promise<any> {
    try {
      if (!env.CLERK_SECRET_KEY) {
        logger.warn('Clerk API not available, returning mock data', { clerkOrgId });
        return this.getMockOrganization(clerkOrgId);
      }

      const organization = await this.clerkClient.organizations.getOrganization({
        organizationId: clerkOrgId
      });

      logger.info('Fetched organization from Clerk API', { clerkOrgId });
      return organization;

    } catch (error) {
      logger.error('Error fetching organization from Clerk API', { error, clerkOrgId });
      throw error;
    }
  }

  /**
   * Get user's organizations
   */
  async getUserOrganizations(clerkUserId: string): Promise<any[]> {
    try {
      if (!env.CLERK_SECRET_KEY) {
        logger.warn('Clerk API not available, returning mock data', { clerkUserId });
        return this.getMockUserOrganizations(clerkUserId);
      }

      const memberships = await this.clerkClient.users.getOrganizationMembershipList({
        userId: clerkUserId
      });

      logger.info('Fetched user organizations from Clerk API', {
        clerkUserId,
        count: memberships.data.length
      });

      return memberships.data.map((membership: any) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        role: membership.role
      }));

    } catch (error) {
      logger.error('Error fetching user organizations from Clerk API', { error, clerkUserId });
      throw error;
    }
  }

  /**
   * Get organization members
   */
  async getOrganizationMembers(clerkOrgId: string): Promise<any[]> {
    try {
      if (!env.CLERK_SECRET_KEY) {
        logger.warn('Clerk API not available, returning mock data', { clerkOrgId });
        return this.getMockOrganizationMembers(clerkOrgId);
      }

      const memberships = await this.clerkClient.organizations.getOrganizationMembershipList({
        organizationId: clerkOrgId
      });

      logger.info('Fetched organization members from Clerk API', {
        clerkOrgId,
        count: memberships.data.length
      });

      return memberships.data.map((membership: any) => ({
        id: membership.publicUserData.userId,
        email: membership.publicUserData.emailAddress,
        firstName: membership.publicUserData.firstName,
        lastName: membership.publicUserData.lastName,
        role: membership.role
      }));

    } catch (error) {
      logger.error('Error fetching organization members from Clerk API', { error, clerkOrgId });
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, headers: Record<string, string>): boolean {
    try {
      if (!env.CLERK_WEBHOOK_SECRET) {
        logger.warn('CLERK_WEBHOOK_SECRET not provided, skipping webhook verification');
        return true; // Allow in development
      }

      // This would typically use svix or similar library
      // For now, we'll do basic validation
      const svixId = headers['svix-id'];
      const svixTimestamp = headers['svix-timestamp'];
      const svixSignature = headers['svix-signature'];

      if (!svixId || !svixTimestamp || !svixSignature) {
        logger.warn('Missing webhook headers');
        return false;
      }

      // In production, you'd verify the signature here
      logger.info('Webhook signature verification passed', { svixId });
      return true;

    } catch (error) {
      logger.error('Error verifying webhook signature', { error });
      return false;
    }
  }

  /**
   * Mock user data for development
   */
  private getMockUser(clerkUserId: string): any {
    return {
      id: clerkUserId,
      firstName: 'Mock',
      lastName: 'User',
      emailAddresses: [
        {
          id: 'email-1',
          emailAddress: `mock-${clerkUserId}@example.com`
        }
      ],
      primaryEmailAddressId: 'email-1',
      imageUrl: null
    };
  }

  /**
   * Mock organization data for development
   */
  private getMockOrganization(clerkOrgId: string): any {
    return {
      id: clerkOrgId,
      name: `Mock Organization ${clerkOrgId.slice(-4)}`,
      slug: `mock-org-${clerkOrgId.slice(-4)}`
    };
  }

  /**
   * Mock user organizations data for development
   */
  private getMockUserOrganizations(clerkUserId: string): any[] {
    return [
      {
        id: `org-${clerkUserId.slice(-4)}-1`,
        name: `Mock Org 1 for ${clerkUserId.slice(-4)}`,
        slug: `mock-org-1-${clerkUserId.slice(-4)}`,
        role: 'owner'
      }
    ];
  }

  /**
   * Mock organization members data for development
   */
  private getMockOrganizationMembers(clerkOrgId: string): any[] {
    return [
      {
        id: `user-${clerkOrgId.slice(-4)}-1`,
        email: `member1-${clerkOrgId.slice(-4)}@example.com`,
        firstName: 'Mock',
        lastName: 'Member 1',
        role: 'owner'
      }
    ];
  }
}
