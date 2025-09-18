import { Request, Response } from 'express';
import { SyncService } from '../services/SyncService';
import { UnauthorizedError, BadRequestError } from '../errors/AppError';
import logger from '../utils/logger';

/**
 * Controller for manual sync operations
 */
export class SyncController {
  private syncService: SyncService;

  constructor() {
    this.syncService = new SyncService();
  }

  /**
   * Sync current user to database (full sync with organizations)
   * @route POST /api/sync/user
   */
  syncCurrentUser = async (req: Request, res: Response) => {
    try {
      if (!req.externalId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      const result = await this.syncService.fullUserSync(req.externalId);

      logger.info('Manual user sync completed', {
        userId: result.user.id,
        clerkUserId: req.externalId,
        orgCount: result.organizations.length
      });

      return res.status(200).json({
        success: true,
        message: 'User and organizations synced successfully',
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            full_name: result.user.full_name,
            external_id: result.user.external_id
          },
          organizations: result.organizations.map(org => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            plan: org.plan
          }))
        }
      });
    } catch (error) {
      logger.error('Error in manual user sync', { error, clerkUserId: req.externalId });
      return res.status(500).json({
        success: false,
        error: 'Failed to sync user and organizations'
      });
    }
  };

  /**
   * Sync user by Clerk ID (admin only) - full sync with organizations
   * @route POST /api/sync/user/:clerkUserId
   */
  syncUserById = async (req: Request, res: Response) => {
    try {
      const { clerkUserId } = req.params;

      if (!clerkUserId) {
        return res.status(400).json({
          success: false,
          error: 'Clerk user ID is required'
        });
      }

      const result = await this.syncService.fullUserSync(clerkUserId);

      logger.info('Manual user sync by ID completed', {
        userId: result.user.id,
        clerkUserId,
        orgCount: result.organizations.length
      });

      return res.status(200).json({
        success: true,
        message: 'User and organizations synced successfully',
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            full_name: result.user.full_name,
            external_id: result.user.external_id
          },
          organizations: result.organizations.map(org => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            plan: org.plan
          }))
        }
      });
    } catch (error) {
      logger.error('Error in manual user sync by ID', { error, clerkUserId: req.params.clerkUserId });
      return res.status(500).json({
        success: false,
        error: 'Failed to sync user and organizations'
      });
    }
  };

  /**
   * Sync current user and organizations (full sync)
   * @route POST /api/sync/user/organizations
   */
  syncUserOrganizations = async (req: Request, res: Response) => {
    try {
      if (!req.externalId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      const result = await this.syncService.fullUserSync(req.externalId);

      logger.info('Manual user organizations sync completed', {
        userId: result.user.id,
        clerkUserId: req.externalId,
        orgCount: result.organizations.length
      });

      return res.status(200).json({
        success: true,
        message: 'User and organizations synced successfully',
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            full_name: result.user.full_name,
            external_id: result.user.external_id
          },
          organizations: result.organizations.map(org => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            plan: org.plan
          }))
        }
      });
    } catch (error) {
      logger.error('Error in manual user organizations sync', { error, clerkUserId: req.externalId });
      return res.status(500).json({
        success: false,
        error: 'Failed to sync user and organizations'
      });
    }
  };

  /**
   * Sync organization by Clerk ID
   * @route POST /api/sync/organization/:clerkOrgId
   */
  syncOrganizationById = async (req: Request, res: Response) => {
    try {
      const { clerkOrgId } = req.params;

      if (!clerkOrgId) {
        return res.status(400).json({
          success: false,
          error: 'Clerk organization ID is required'
        });
      }

      const organization = await this.syncService.syncOrganizationToDatabase(clerkOrgId);

      logger.info('Manual organization sync completed', {
        orgId: organization.id,
        clerkOrgId
      });

      return res.status(200).json({
        success: true,
        message: 'Organization synced successfully',
        data: {
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            plan: organization.plan
          }
        }
      });
    } catch (error) {
      logger.error('Error in manual organization sync', { error, clerkOrgId: req.params.clerkOrgId });
      return res.status(500).json({
        success: false,
        error: 'Failed to sync organization'
      });
    }
  };

  /**
   * Full sync for current user (user + organizations + memberships)
   * @route POST /api/sync/user/full
   */
  fullUserSync = async (req: Request, res: Response) => {
    try {
      if (!req.externalId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      const result = await this.syncService.fullUserSync(req.externalId);

      logger.info('Full user sync completed', {
        userId: result.user.id,
        clerkUserId: req.externalId,
        orgCount: result.organizations.length
      });

      return res.status(200).json({
        success: true,
        message: 'Full user sync completed successfully',
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            full_name: result.user.full_name,
            external_id: result.user.external_id
          },
          organizations: result.organizations.map(org => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            plan: org.plan
          }))
        }
      });
    } catch (error) {
      logger.error('Error in full user sync', { error, clerkUserId: req.externalId });
      return res.status(500).json({
        success: false,
        error: 'Failed to perform full user sync'
      });
    }
  };

  /**
   * Sync organization membership
   * @route POST /api/sync/membership
   */
  syncMembership = async (req: Request, res: Response) => {
    try {
      const { clerkOrgId, clerkUserId, role = 'member' } = req.body;

      if (!clerkOrgId || !clerkUserId) {
        return res.status(400).json({
          success: false,
          error: 'Clerk organization ID and user ID are required'
        });
      }

      const membership = await this.syncService.syncOrganizationMembership(
        clerkOrgId,
        clerkUserId,
        role
      );

      logger.info('Manual membership sync completed', {
        clerkOrgId,
        clerkUserId,
        role
      });

      return res.status(200).json({
        success: true,
        message: 'Membership synced successfully',
        data: {
          membership: {
            id: membership.id,
            role: membership.role,
            status: membership.status
          }
        }
      });
    } catch (error) {
      logger.error('Error in manual membership sync', { error, body: req.body });
      return res.status(500).json({
        success: false,
        error: 'Failed to sync membership'
      });
    }
  };

  /**
   * Sync all organization members for a specific organization
   * @route POST /api/sync/organization/:clerkOrgId/members
   */
  syncOrganizationMembers = async (req: Request, res: Response) => {
    try {
      const { clerkOrgId } = req.params;

      if (!clerkOrgId) {
        return res.status(400).json({
          success: false,
          error: 'Clerk organization ID is required'
        });
      }

      // First sync the organization
      const organization = await this.syncService.syncOrganizationToDatabase(clerkOrgId);

      // Get organization members from Clerk
      const { ClerkApiService } = await import('../services/ClerkApiService.js');
      const clerkApiService = new ClerkApiService();
      const members = await clerkApiService.getOrganizationMembers(clerkOrgId);

      // Sync each member
      const syncedMembers = [];
      for (const member of members) {
        try {
          // Sync the user
          const user = await this.syncService.syncUserToDatabase(member.id);

          // Sync the membership
          const membership = await this.syncService.syncOrganizationMembership(
            clerkOrgId,
            member.id,
            member.role
          );

          syncedMembers.push({
            user: {
              id: user.id,
              email: user.email,
              full_name: user.full_name
            },
            membership: {
              id: membership.id,
              role: membership.role,
              status: membership.status
            }
          });
        } catch (error) {
          logger.error('Error syncing organization member', {
            error,
            clerkOrgId,
            clerkUserId: member.id
          });
          // Continue with other members
        }
      }

      logger.info('Organization members sync completed', {
        clerkOrgId,
        orgId: organization.id,
        memberCount: syncedMembers.length
      });

      return res.status(200).json({
        success: true,
        message: 'Organization members synced successfully',
        data: {
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug
          },
          members: syncedMembers
        }
      });
    } catch (error) {
      logger.error('Error syncing organization members', { error, clerkOrgId: req.params.clerkOrgId });
      return res.status(500).json({
        success: false,
        error: 'Failed to sync organization members'
      });
    }
  };

  /**
   * Get sync status for current user
   * @route GET /api/sync/status
   */
  getSyncStatus = async (req: Request, res: Response) => {
    try {
      if (!req.externalId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      // Check if user exists in database
      const { UserRepository } = await import('../repositories/UserRepository.js');
      const userRepository = new UserRepository();
      const user = await userRepository.findByClerkId(req.externalId);

      // Check user's organizations
      const { OrganizationRepository } = await import('../repositories/OrganizationRepository.js');
      const organizationRepository = new OrganizationRepository();
      const userOrgs = user ? await organizationRepository.getUserOrganizations(user.id) : [];

      return res.status(200).json({
        success: true,
        data: {
          user: {
            exists: !!user,
            id: user?.id,
            email: user?.email,
            last_synced: user?.updated_at
          },
          organizations: {
            count: userOrgs.length,
            data: userOrgs.map((org: any) => ({
              id: org.id,
              name: org.name,
              role: org.role,
              status: org.status
            }))
          }
        }
      });
    } catch (error) {
      logger.error('Error getting sync status', { error, clerkUserId: req.externalId });
      return res.status(500).json({
        success: false,
        error: 'Failed to get sync status'
      });
    }
  };
}
