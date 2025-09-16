import { Webhook } from 'svix';
import { UserRepository } from '../repositories/UserRepository';
import { OrganizationRepository } from '../repositories/OrganizationRepository';
import { UserUpdateDto } from '../dto/users.dto';
import logger from '../utils/logger';
import env from '../config/env';

/**
 * Service for handling Clerk webhooks
 */
export class ClerkWebhookService {
  private userRepository: UserRepository;
  private organizationRepository: OrganizationRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.organizationRepository = new OrganizationRepository();
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
      const { id, email_addresses, first_name, last_name } = data;
      const primaryEmail = email_addresses.find((email: any) => email.id === data.primary_email_address_id);

      if (!primaryEmail) {
        logger.warn('No primary email found for user', { clerkId: id });
        return;
      }

      const fullName = [first_name, last_name].filter(Boolean).join(' ');

      // Create or update user in database
      await this.userRepository.syncFromClerk(
        id,
        primaryEmail.email_address,
        fullName || undefined
      );

      logger.info('User created from webhook', { clerkId: id, email: primaryEmail.email_address });
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
      const { id, email_addresses, first_name, last_name } = data;
      const primaryEmail = email_addresses.find((email: any) => email.id === data.primary_email_address_id);

      if (!primaryEmail) {
        logger.warn('No primary email found for user', { clerkId: id });
        return;
      }

      const fullName = [first_name, last_name].filter(Boolean).join(' ');

      // Update user in database
      const user = await this.userRepository.findByClerkId(id);

      if (user) {
        await this.userRepository.update(user.id, {
          email: primaryEmail.email_address,
          full_name: fullName || null,
        } as UserUpdateDto);

        logger.info('User updated from webhook', { clerkId: id, email: primaryEmail.email_address });
      } else {
        // Create user if not found
        await this.userRepository.createFromClerk(
          id,
          primaryEmail.email_address,
          fullName || undefined
        );

        logger.info('User created from update webhook', { clerkId: id, email: primaryEmail.email_address });
      }
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
      const { id, name, created_by } = data;

      if (!created_by) {
        logger.warn('No creator found for organization', { clerkOrgId: id });
        return;
      }

      // Find creator user
      const creator = await this.userRepository.findByClerkId(created_by);

      if (!creator) {
        logger.warn('Creator user not found', { clerkUserId: created_by, clerkOrgId: id });
        return;
      }

      // Create organization in database
      await this.organizationRepository.syncFromClerk(
        id,
        name,
        creator.id
      );

      logger.info('Organization created from webhook', { clerkOrgId: id, name });
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
      const { id, name } = data;

      // Find organization by Clerk ID
      const organization = await this.organizationRepository.findByClerkOrgId(id);

      if (organization) {
        // Update organization
        await this.organizationRepository.update(organization.id, {
          name,
        });

        logger.info('Organization updated from webhook', { clerkOrgId: id, name });
      } else {
        logger.warn('Organization not found for update', { clerkOrgId: id });
      }
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

      // Check if already a member
      const isMember = await this.organizationRepository.isMember(org.id, user.id);
      if (isMember) {
        logger.info('User is already a member of organization', {
          userId: user.id,
          orgId: org.id,
        });
        return;
      }

      // Add member to organization
      await this.organizationRepository.addMember({
        organization_id: org.id,
        user_id: user.id,
        role: role.toLowerCase()
      });

      logger.info('Organization member added from webhook', {
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
   * Process webhook event
   */
  async processWebhook(type: string, data: any): Promise<void> {
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
      default:
        logger.info('Unhandled webhook event type', { type });
    }
  }
}
