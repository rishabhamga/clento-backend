import { Webhook } from 'svix';
import { UserRepository } from '../repositories/UserRepository';
import { OrganizationRepository } from '../repositories/OrganizationRepository';
import { SyncService } from './SyncService';
import { UserUpdateDto } from '../dto/users.dto';
import logger from '../utils/logger';
import env from '../config/env';

/**
 * Service for handling Clerk webhooks
 */
export class ClerkWebhookService {
  private userRepository: UserRepository;
  private organizationRepository: OrganizationRepository;
  private syncService: SyncService;

  constructor() {
    this.userRepository = new UserRepository();
    this.organizationRepository = new OrganizationRepository();
    this.syncService = new SyncService();
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(body: string, svixId: string, svixTimestamp: string, svixSignature: string): any {
    if (!env.CLERK_WEBHOOK_SECRET) {
      throw new Error('CLERK_WEBHOOK_SECRET is not defined');
    }

    const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);
    return wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  }

  /**
   * Handle user.created webhook event
   */
  async handleUserCreated(data: any): Promise<void> {
    try {
      const { id } = data;

      // Use the comprehensive sync service to sync user and their organizations
      const result = await this.syncService.fullUserSync(id);

      logger.info('User created from webhook', {
        clerkId: id,
        userId: result.user.id,
        orgCount: result.organizations.length
      });
    } catch (error) {
      logger.error('Error handling user.created webhook', { error, data });
      throw error;
    }
  }

  /**
   * Handle user.updated webhook event
   */
  async handleUserUpdated(data: any): Promise<void> {
    try {
      const { id } = data;

      // Use the comprehensive sync service to sync user and their organizations
      const result = await this.syncService.fullUserSync(id);

      logger.info('User updated from webhook', {
        clerkId: id,
        userId: result.user.id,
        orgCount: result.organizations.length
      });
    } catch (error) {
      logger.error('Error handling user.updated webhook', { error, data });
      throw error;
    }
  }

  /**
   * Handle user.deleted webhook event
   */
  async handleUserDeleted(data: any): Promise<void> {
    try {
      const { id } = data;

      // Find user by Clerk ID
      const user = await this.userRepository.findByClerkId(id);

      if (user) {
        // We don't actually delete the user, just log the event
        // This is to maintain data integrity with related records
        logger.info('User deleted event received', { clerkId: id, userId: user.id });
      }
    } catch (error) {
      logger.error('Error handling user.deleted webhook', { error, data });
      throw error;
    }
  }

  /**
   * Handle organization.created webhook event
   */
  async handleOrganizationCreated(data: any): Promise<void> {
    try {
      const { id, created_by } = data;

      if (!created_by) {
        logger.warn('No creator found for organization', { clerkOrgId: id });
        return;
      }

      // Use the comprehensive sync service
      await this.syncService.syncOrganizationToDatabase(id);

      logger.info('Organization created from webhook', { clerkOrgId: id });
    } catch (error) {
      logger.error('Error handling organization.created webhook', { error, data });
      throw error;
    }
  }

  /**
   * Handle organization.updated webhook event
   */
  async handleOrganizationUpdated(data: any): Promise<void> {
    try {
      const { id } = data;

      // Use the comprehensive sync service
      await this.syncService.syncOrganizationToDatabase(id);

      logger.info('Organization updated from webhook', { clerkOrgId: id });
    } catch (error) {
      logger.error('Error handling organization.updated webhook', { error, data });
      throw error;
    }
  }

  /**
   * Handle organization.deleted webhook event
   */
  async handleOrganizationDeleted(data: any): Promise<void> {
    try {
      const { id } = data;

      // Find organization by Clerk ID
      const organization = await this.organizationRepository.findByClerkOrgId(id);

      if (organization) {
        // We don't actually delete the organization, just log the event
        // This is to maintain data integrity with related records
        logger.info('Organization deleted event received', { clerkOrgId: id, orgId: organization.id });
      }
    } catch (error) {
      logger.error('Error handling organization.deleted webhook', { error, data });
      throw error;
    }
  }

  /**
   * Handle organizationMembership.created webhook event
   */
  async handleOrganizationMembershipCreated(data: any): Promise<void> {
    try {
      const { organization, public_user_data, role } = data;

      if (!organization || !public_user_data) {
        logger.warn('Missing organization or user data', { data });
        return;
      }

      // Use the comprehensive sync service
      await this.syncService.syncOrganizationMembership(
        organization.id,
        public_user_data.user_id,
        role
      );

      logger.info('Organization membership created from webhook', {
        clerkOrgId: organization.id,
        clerkUserId: public_user_data.user_id,
        role,
      });
    } catch (error) {
      logger.error('Error handling organizationMembership.created webhook', { error, data });
      throw error;
    }
  }

  /**
   * Handle organizationMembership.updated webhook event
   */
  async handleOrganizationMembershipUpdated(data: any): Promise<void> {
    try {
      const { organization, public_user_data, role } = data;

      if (!organization || !public_user_data) {
        logger.warn('Missing organization or user data', { data });
        return;
      }

      // Use the comprehensive sync service
      await this.syncService.syncOrganizationMembership(
        organization.id,
        public_user_data.user_id,
        role
      );

      logger.info('Organization membership updated from webhook', {
        clerkOrgId: organization.id,
        clerkUserId: public_user_data.user_id,
        role,
      });
    } catch (error) {
      logger.error('Error handling organizationMembership.updated webhook', { error, data });
      throw error;
    }
  }

  /**
   * Handle organizationMembership.deleted webhook event
   */
  async handleOrganizationMembershipDeleted(data: any): Promise<void> {
    try {
      const { organization, public_user_data } = data;

      if (!organization || !public_user_data) {
        logger.warn('Missing organization or user data', { data });
        return;
      }

      // Find organization
      const org = await this.organizationRepository.findByClerkOrgId(organization.id);
      if (!org) {
        logger.warn('Organization not found', { clerkOrgId: organization.id });
        return;
      }

      // Find user
      const user = await this.userRepository.findByClerkId(public_user_data.user_id);
      if (!user) {
        logger.warn('User not found', { clerkUserId: public_user_data.user_id });
        return;
      }

      // Remove member from organization
      await this.organizationRepository.removeMember(org.id, user.id);

      logger.info('Organization member removed from webhook', {
        clerkOrgId: organization.id,
        clerkUserId: public_user_data.user_id,
      });
    } catch (error) {
      logger.error('Error handling organizationMembership.deleted webhook', { error, data });
      throw error;
    }
  }

  /**
   * Handle session.created webhook event
   */
  async handleSessionCreated(data: any): Promise<void> {
    try {
      const { user_id } = data;

      // Find user and ensure they exist in our database
      const user = await this.userRepository.findByClerkId(user_id);

      if (!user) {
        logger.warn('User not found for session creation', { clerkUserId: user_id });
        // Optionally create user if they don't exist
        // This can happen if webhook order is different than expected
        return;
      }

      logger.info('Session created for user', { clerkUserId: user_id, userId: user.id });
    } catch (error) {
      logger.error('Error handling session.created webhook', { error, data });
      throw error;
    }
  }

  /**
   * Process webhook event
   */
  async processWebhook(type: string, data: any): Promise<void> {
    try {
      logger.info(`Processing webhook event: ${type}`, {
        type,
        userId: data.user_id || data.public_user_data?.user_id,
        orgId: data.organization?.id
      });

      switch (type) {
        case 'user.created':
          await this.handleUserCreated(data);
          break;
        case 'user.updated':
          await this.handleUserUpdated(data);
          break;
        case 'user.deleted':
          await this.handleUserDeleted(data);
          break;
        case 'organization.created':
          await this.handleOrganizationCreated(data);
          break;
        case 'organization.updated':
          await this.handleOrganizationUpdated(data);
          break;
        case 'organization.deleted':
          await this.handleOrganizationDeleted(data);
          break;
        case 'organizationMembership.created':
          await this.handleOrganizationMembershipCreated(data);
          break;
        case 'organizationMembership.updated':
          await this.handleOrganizationMembershipUpdated(data);
          break;
        case 'organizationMembership.deleted':
          await this.handleOrganizationMembershipDeleted(data);
          break;
        case 'session.created':
          await this.handleSessionCreated(data);
          break;
        default:
          logger.info('Unhandled webhook event type', { type, data });
      }

      logger.info(`Successfully processed webhook event: ${type}`);
    } catch (error) {
      logger.error(`Error processing webhook event: ${type}`, { error, data });
      throw error;
    }
  }
}
