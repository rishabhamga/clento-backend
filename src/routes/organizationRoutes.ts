import ClentoAPI from '../utils/apiUtil';
import { OrganizationService } from '../services/OrganizationService';
import { Request, Response } from 'express';
import { NotFoundError } from '../errors/AppError';

/**
 * Organization API - Organization management endpoints
 */
export class OrganizationAPI extends ClentoAPI {
  public path = '/api/organizations';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private organizationService: OrganizationService;

  constructor() {
    super();
    this.organizationService = new OrganizationService();

    this.requestParams = {
      GET: {
        bodyParams: {},
        queryParams: {},
        pathParams: {},
      },
      POST: {
        bodyParams: {
          name: 'required',
          slug: 'optional',
          logo_url: 'optional',
          website_url: 'optional',
          plan: 'optional',
          billing_email: 'optional',
        },
        queryParams: {},
        pathParams: {},
      },
      PUT: {
        bodyParams: {
          name: 'optional',
          slug: 'optional',
          logo_url: 'optional',
          website_url: 'optional',
          plan: 'optional',
          billing_email: 'optional',
          subscription_status: 'optional',
          monthly_campaign_limit: 'optional',
          monthly_lead_limit: 'optional',
          user_limit: 'optional',
          settings: 'optional',
        },
        queryParams: {},
        pathParams: { id: 'required' },
      },
      DELETE: {
        bodyParams: {},
        queryParams: {},
        pathParams: { id: 'required' },
      },
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Get user's organizations
   */
  public GET = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const organizations = await this.organizationService.getUserOrganizations(userId);

      res.status(200).json({
        success: true,
        data: organizations,
        meta: {
          total: organizations.length,
        },
        message: 'Organizations retrieved successfully'
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Create a new organization
   */
  public POST = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId;
      const organizationData = req.body;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const organization = await this.organizationService.createOrganization(organizationData, userId);

      res.status(201).json({
        success: true,
        message: 'Organization created successfully',
        data: organization,
      });
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Organization Detail API - Individual organization management endpoints
 */
export class OrganizationDetailAPI extends ClentoAPI {
  public path = '/api/organizations/:id';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private organizationService: OrganizationService;

  constructor() {
    super();
    this.organizationService = new OrganizationService();

    this.requestParams = {
      GET: {
        bodyParams: {},
        queryParams: {},
        pathParams: { id: 'required' },
      },
      PUT: {
        bodyParams: {
          name: 'optional',
          slug: 'optional',
          logo_url: 'optional',
          website_url: 'optional',
          plan: 'optional',
          billing_email: 'optional',
          subscription_status: 'optional',
          monthly_campaign_limit: 'optional',
          monthly_lead_limit: 'optional',
          user_limit: 'optional',
          settings: 'optional',
        },
        queryParams: {},
        pathParams: { id: 'required' },
      },
      DELETE: {
        bodyParams: {},
        queryParams: {},
        pathParams: { id: 'required' },
      },
      POST: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Get organization by ID
   */
  public GET = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.userId;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const organization = await this.organizationService.getOrganization(id, userId);

      res.status(200).json({
        success: true,
        data: organization,
        message: 'Organization retrieved successfully'
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Update organization
   */
  public PUT = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.userId;
      const updateData = req.body;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const organization = await this.organizationService.updateOrganization(id, updateData, userId);

      res.status(200).json({
        success: true,
        message: 'Organization updated successfully',
        data: organization,
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Delete organization
   */
  public DELETE = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.userId;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      await this.organizationService.deleteOrganization(id, userId);

      res.status(200).json({
        success: true,
        message: 'Organization deleted successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Organization Members API - Organization member management endpoints
 */
export class OrganizationMembersAPI extends ClentoAPI {
  public path = '/api/organizations/:id/members';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private organizationService: OrganizationService;

  constructor() {
    super();
    this.organizationService = new OrganizationService();

    this.requestParams = {
      GET: {
        bodyParams: {},
        queryParams: { page: 'optional', limit: 'optional', role: 'optional', status: 'optional' },
        pathParams: { id: 'required' },
      },
      POST: {
        bodyParams: {
          user_id: 'required',
          role: 'optional',
          permissions: 'optional',
        },
        queryParams: {},
        pathParams: { id: 'required' },
      },
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Get organization members
   */
  public GET = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.userId;
      const { page = 1, limit = 20 } = req.query as any;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const result = await this.organizationService.getOrganizationMembers(
        id,
        userId,
        parseInt(page),
        parseInt(limit)
      );

      res.status(200).json({
        success: true,
        data: result.data,
        meta: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.count,
          total_pages: Math.ceil(result.count / parseInt(limit)),
        },
        message: 'Organization members retrieved successfully'
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Add member to organization
   */
  public POST = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.userId;
      const { user_id, role } = req.body;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const member = await this.organizationService.addMember(id, user_id, role, userId);

      res.status(201).json({
        success: true,
        message: 'Member added successfully',
        data: member,
      });
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Organization Member Detail API - Individual member management endpoints
 */
export class OrganizationMemberDetailAPI extends ClentoAPI {
  public path = '/api/organizations/:id/members/:userId';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private organizationService: OrganizationService;

  constructor() {
    super();
    this.organizationService = new OrganizationService();

    this.requestParams = {
      PATCH: {
        bodyParams: {
          role: 'optional',
          permissions: 'optional',
          status: 'optional',
        },
        queryParams: {},
        pathParams: { id: 'required', userId: 'required' },
      },
      DELETE: {
        bodyParams: {},
        queryParams: {},
        pathParams: { id: 'required', userId: 'required' },
      },
      GET: this.getDefaultExpressRequestParams(),
      POST: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Update organization member
   */
  public PATCH = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, userId: userIdToUpdate } = req.params;
      const requesterId = req.userId;
      const { role } = req.body;

      if (!requesterId) {
        throw new NotFoundError('User not found');
      }

      const member = await this.organizationService.updateMemberRole(id, userIdToUpdate, role, requesterId);

      res.status(200).json({
        success: true,
        message: 'Member updated successfully',
        data: member,
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Remove organization member
   */
  public DELETE = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, userId: userIdToRemove } = req.params;
      const requesterId = req.userId;

      if (!requesterId) {
        throw new NotFoundError('User not found');
      }

      await this.organizationService.removeMember(id, userIdToRemove, requesterId);

      res.status(200).json({
        success: true,
        message: 'Member removed successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Organization Usage API - Organization usage statistics endpoint
 */
export class OrganizationUsageAPI extends ClentoAPI {
  public path = '/api/organizations/:id/usage';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private organizationService: OrganizationService;

  constructor() {
    super();
    this.organizationService = new OrganizationService();

    this.requestParams = {
      GET: {
        bodyParams: {},
        queryParams: { month: 'optional', year: 'optional' },
        pathParams: { id: 'required' },
      },
      POST: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Get organization usage statistics
   */
  public GET = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.userId;
      const { month } = req.query as any;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const usage = await this.organizationService.getUsageStats(id, userId, month);

      res.status(200).json({
        success: true,
        data: usage,
        message: 'Usage statistics retrieved successfully'
      });
    } catch (error) {
      throw error;
    }
  };
}

// Create routers for each API class
const organizationRouter = ClentoAPI.createRouter(OrganizationAPI, {
  GET: '/',
  POST: '/'
});

const organizationDetailRouter = ClentoAPI.createRouter(OrganizationDetailAPI, {
  GET: '/:id',
  PUT: '/:id',
  DELETE: '/:id'
});

const organizationMembersRouter = ClentoAPI.createRouter(OrganizationMembersAPI, {
  GET: '/:id/members',
  POST: '/:id/members'
});

const organizationMemberDetailRouter = ClentoAPI.createRouter(OrganizationMemberDetailAPI, {
  PATCH: '/:id/members/:userId',
  DELETE: '/:id/members/:userId'
});

const organizationUsageRouter = ClentoAPI.createRouter(OrganizationUsageAPI, {
  GET: '/:id/usage'
});

// Combine all routers
const { Router } = require('express');
const combinedRouter = Router();

combinedRouter.use('/', organizationRouter);
combinedRouter.use('/', organizationDetailRouter);
combinedRouter.use('/', organizationMembersRouter);
combinedRouter.use('/', organizationMemberDetailRouter);
combinedRouter.use('/', organizationUsageRouter);

export default combinedRouter;

/**
 * @swagger
 * components:
 *   schemas:
 *     Organization:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         slug:
 *           type: string
 *         logo_url:
 *           type: string
 *           format: uri
 *         website_url:
 *           type: string
 *           format: uri
 *         industry:
 *           type: string
 *         company_size:
 *           type: string
 *           enum: [startup, small, medium, large, enterprise]
 *         timezone:
 *           type: string
 *         plan:
 *           type: string
 *         billing_email:
 *           type: string
 *           format: email
 *         subscription_status:
 *           type: string
 *         monthly_campaign_limit:
 *           type: integer
 *         monthly_lead_limit:
 *           type: integer
 *         user_limit:
 *           type: integer
 *         onboarding_completed:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/organizations:
 *   get:
 *     summary: Get user's organizations
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's organizations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Organization'
 *                       - type: object
 *                         properties:
 *                           role:
 *                             type: string
 *                           status:
 *                             type: string
 */

/**
 * @swagger
 * /api/organizations:
 *   post:
 *     summary: Create a new organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               logo_url:
 *                 type: string
 *                 format: uri
 *               website_url:
 *                 type: string
 *                 format: uri
 *               industry:
 *                 type: string
 *               company_size:
 *                 type: string
 *                 enum: [startup, small, medium, large, enterprise]
 *               timezone:
 *                 type: string
 *               billing_email:
 *                 type: string
 *                 format: email
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Organization'
 */

/**
 * @swagger
 * /api/organizations/{id}:
 *   get:
 *     summary: Get organization by ID
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Organization details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Organization'
 */

/**
 * @swagger
 * /api/organizations/{id}:
 *   put:
 *     summary: Update organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               logo_url:
 *                 type: string
 *                 format: uri
 *               website_url:
 *                 type: string
 *                 format: uri
 *               industry:
 *                 type: string
 *               company_size:
 *                 type: string
 *                 enum: [startup, small, medium, large, enterprise]
 *               timezone:
 *                 type: string
 *               billing_email:
 *                 type: string
 *                 format: email
 *               onboarding_completed:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Organization updated successfully
 */

/**
 * @swagger
 * /api/organizations/{id}:
 *   delete:
 *     summary: Delete organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Organization deleted successfully
 */

/**
 * @swagger
 * /api/organizations/{id}/members:
 *   get:
 *     summary: Get organization members
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Organization members retrieved successfully
 */

/**
 * @swagger
 * /api/organizations/{id}/members:
 *   post:
 *     summary: Add member to organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *             properties:
 *               user_id:
 *                 type: string
 *                 format: uuid
 *               role:
 *                 type: string
 *                 enum: [owner, admin, member, viewer]
 *                 default: member
 *               permissions:
 *                 type: object
 *     responses:
 *       201:
 *         description: Member added successfully
 */

/**
 * @swagger
 * /api/organizations/{id}/members/{userId}:
 *   patch:
 *     summary: Update organization member
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [owner, admin, member, viewer]
 *               permissions:
 *                 type: object
 *               status:
 *                 type: string
 *                 enum: [active, inactive, pending]
 *     responses:
 *       200:
 *         description: Member updated successfully
 */

/**
 * @swagger
 * /api/organizations/{id}/members/{userId}:
 *   delete:
 *     summary: Remove organization member
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Member removed successfully
 */

/**
 * @swagger
 * /api/organizations/{id}/usage:
 *   get:
 *     summary: Get organization usage statistics
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *           description: Month in YYYY-MM format
 *     responses:
 *       200:
 *         description: Usage statistics retrieved successfully
 */