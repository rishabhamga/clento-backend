import { Request, Response, NextFunction } from 'express';
import { OrganizationService } from '../services/OrganizationService';
import { ApiResponse } from '../dto/common.dto';
import logger from '../utils/logger';

/**
 * Controller for organization-related endpoints
 */
export class OrganizationController {
  private organizationService: OrganizationService;

  constructor() {
    this.organizationService = new OrganizationService();
  }

  /**
   * Create a new organization
   */
  createOrganization = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;
      const organizationData = req.body;

      const organization = await this.organizationService.createOrganization(organizationData, userId);

      const response: ApiResponse = {
        success: true,
        message: 'Organization created successfully',
        data: organization,
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Error in createOrganization controller', { error, userId: req.userId });
      next(error);
    }
  };

  /**
   * Get organization by ID
   */
  getOrganization = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const organization = await this.organizationService.getOrganization(id, userId);

      const response: ApiResponse = {
        success: true,
        data: organization,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getOrganization controller', { error, organizationId: req.params.id, userId: req.userId });
      next(error);
    }
  };

  /**
   * Update organization
   */
  updateOrganization = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;
      const updateData = req.body;

      const organization = await this.organizationService.updateOrganization(id, updateData, userId);

      const response: ApiResponse = {
        success: true,
        message: 'Organization updated successfully',
        data: organization,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in updateOrganization controller', { 
        error, 
        organizationId: req.params.id, 
        userId: req.userId 
      });
      next(error);
    }
  };

  /**
   * Delete organization
   */
  deleteOrganization = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      await this.organizationService.deleteOrganization(id, userId);

      const response: ApiResponse = {
        success: true,
        message: 'Organization deleted successfully',
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in deleteOrganization controller', { 
        error, 
        organizationId: req.params.id, 
        userId: req.userId 
      });
      next(error);
    }
  };

  /**
   * Get user's organizations
   */
  getUserOrganizations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;

      const organizations = await this.organizationService.getUserOrganizations(userId);

      const response: ApiResponse = {
        success: true,
        data: organizations,
        meta: {
          total: organizations.length,
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getUserOrganizations controller', { error, userId: req.userId });
      next(error);
    }
  };

  /**
   * Get organization members
   */
  getOrganizationMembers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;
      const { page = 1, limit = 20 } = req.query as any;

      const result = await this.organizationService.getOrganizationMembers(
        id, 
        userId, 
        parseInt(page), 
        parseInt(limit)
      );

      const response: ApiResponse = {
        success: true,
        data: result.data,
        meta: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.count,
          total_pages: Math.ceil(result.count / parseInt(limit)),
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getOrganizationMembers controller', { 
        error, 
        organizationId: req.params.id, 
        userId: req.userId 
      });
      next(error);
    }
  };

  /**
   * Add member to organization
   */
  addOrganizationMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;
      const { user_id, role } = req.body;

      const member = await this.organizationService.addMember(id, user_id, role, userId);

      const response: ApiResponse = {
        success: true,
        message: 'Member added successfully',
        data: member,
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Error in addOrganizationMember controller', { 
        error, 
        organizationId: req.params.id, 
        userId: req.userId,
        memberToAdd: req.body.user_id 
      });
      next(error);
    }
  };

  /**
   * Update organization member
   */
  updateOrganizationMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, userId: userIdToUpdate } = req.params;
      const requesterId = req.userId!;
      const { role } = req.body;

      const member = await this.organizationService.updateMemberRole(id, userIdToUpdate, role, requesterId);

      const response: ApiResponse = {
        success: true,
        message: 'Member updated successfully',
        data: member,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in updateOrganizationMember controller', { 
        error, 
        organizationId: req.params.id, 
        userId: req.userId,
        memberToUpdate: req.params.userId 
      });
      next(error);
    }
  };

  /**
   * Remove organization member
   */
  removeOrganizationMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, userId: userIdToRemove } = req.params;
      const requesterId = req.userId!;

      await this.organizationService.removeMember(id, userIdToRemove, requesterId);

      const response: ApiResponse = {
        success: true,
        message: 'Member removed successfully',
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in removeOrganizationMember controller', { 
        error, 
        organizationId: req.params.id, 
        userId: req.userId,
        memberToRemove: req.params.userId 
      });
      next(error);
    }
  };

  /**
   * Get organization usage statistics
   */
  getOrganizationUsage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;
      const { month } = req.query as any;

      const usage = await this.organizationService.getUsageStats(id, userId, month);

      const response: ApiResponse = {
        success: true,
        data: usage,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getOrganizationUsage controller', { 
        error, 
        organizationId: req.params.id, 
        userId: req.userId 
      });
      next(error);
    }
  };
}
