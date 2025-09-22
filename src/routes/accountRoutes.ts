import ClentoAPI from '../utils/apiUtil';
import { ConnectedAccountService } from '../services/ConnectedAccountService';
import { Request, Response } from 'express';
import { NotFoundError } from '../errors/AppError';
import logger from '../utils/logger';

/**
 * Account Webhook API - Webhook endpoint with no authentication
 */
export class AccountWebhookAPI extends ClentoAPI {
  public path = '/api/accounts/webhook';
  public authType:'NONE' = 'NONE';

  private connectedAccountService: ConnectedAccountService;

  constructor() {
    super();
    this.connectedAccountService = new ConnectedAccountService();

    this.requestParams = {
      POST: {
        bodyParams: {
          type: 'optional',
          account_id: 'optional',
          accountId: 'optional',
          status: 'optional',
          name: 'optional'
        },
        queryParams: {},
        pathParams: {},
      },
      GET: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Handle Unipile webhook for account connection
   */
  public POST = async (req: Request, res: Response): Promise<void> => {
    try {
      const webhookData = req.body;

      logger.info('=== Received Unipile webhook ===', {
        fullPayload: webhookData,
        status: webhookData.status,
        accountId: webhookData.account_id || webhookData.accountId,
        name: webhookData.name
      });

      // Handle Unipile webhook based on status (as per Unipile documentation)
      switch (webhookData.status) {
        case 'CREATION_SUCCESS':
          logger.info('Processing account creation success');
          await this.handleAccountConnected(webhookData);
          break;
        case 'RECONNECTED':
          logger.info('Processing account reconnection');
          await this.handleAccountConnected(webhookData);
          break;
        case 'CREATION_FAILED':
        case 'CONNECTION_ERROR':
          logger.info('Processing account connection error');
          await this.handleAccountError(webhookData);
          break;
        default:
          logger.warn('Unknown webhook status', {
            status: webhookData.status,
            fullPayload: webhookData
          });
      }

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
      });
    } catch (error) {
      logger.error('Error in handleWebhook controller', { error, body: req.body });
      throw error;
    }
  };

  /**
   * Handle account connected webhook
   */
  private async handleAccountConnected(webhookData: any): Promise<void> {
    try {
      // Extract pending account ID from webhook data (should be in the 'name' field)
      const pendingAccountId = webhookData.name;

      if (!pendingAccountId) {
        logger.error('No pending account ID in webhook data', { webhookData });
        return;
      }

      await this.connectedAccountService.handleAccountConnected({
        unipileAccountId: webhookData.account_id || webhookData.accountId,
        pendingAccountId: pendingAccountId,
        accountData: webhookData,
      });

      logger.info('Account connection handled successfully', {
        pendingAccountId,
        unipileAccountId: webhookData.account_id
      });
    } catch (error) {
      logger.error('Error handling account connected webhook', { error, webhookData });
    }
  }

  /**
   * Handle account error webhook
   */
  private async handleAccountError(webhookData: any): Promise<void> {
    try {
      // TODO: Implement account error handling
      logger.info('Account error webhook received', { webhookData });
    } catch (error) {
      logger.error('Error handling account error webhook', { error, webhookData });
    }
  }
}

/**
 * Account API - Main account management endpoints
 */
export class AccountAPI extends ClentoAPI {
  public path = '/api/accounts';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private connectedAccountService: ConnectedAccountService;

  constructor() {
    super();
    this.connectedAccountService = new ConnectedAccountService();

    this.requestParams = {
      GET: {
        bodyParams: {},
        queryParams: {
          provider: 'optional',
          status: 'optional'
        },
        pathParams: {},
      },
      POST: {
        bodyParams: {
          provider: 'required',
          success_redirect_url: 'optional',
          failure_redirect_url: 'optional',
          notify_url: 'optional'
        },
        queryParams: {},
        pathParams: {},
      },
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Get user's connected accounts
   */
  public GET = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId;
      const { provider } = req.query;

      logger.info('Getting user accounts', { organizationId, provider });

      // Get actual accounts from the service
      const accounts = await this.connectedAccountService.getUserAccounts(
        organizationId,
        provider as string
      );

      res.status(200).json({
        success: true,
        data: accounts,
        meta: {
          total: accounts.length,
        },
        message: 'Accounts retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getUserAccounts controller', { error, userId: req.userId });
      throw error;
    }
  };

  /**
   * Create hosted authentication link for connecting accounts
   */
  public POST = async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info('=== Backend Controller: createHostedAuthLink START ===');

      // Mock user and organization for development
      const userId = req.userId;
      const organizationId = req.organizationId;
      const { provider, success_redirect_url, failure_redirect_url, notify_url } = req.body;

      if (!userId || !organizationId) {
        throw new NotFoundError('User or organization not found');
      }

      logger.info('Request details', {
        provider,
        userId,
        organizationId,
        success_redirect_url,
        failure_redirect_url,
        notify_url,
        headers: {
          authorization: req.headers.authorization ? 'Present' : 'Missing',
          'x-organization-id': req.headers['x-organization-id'] || 'Missing'
        }
      });

      logger.info('Calling ConnectedAccountService.createHostedAuthLink');

      // Use the actual Unipile service
      const result = await this.connectedAccountService.createHostedAuthLink({
        userId,
        organizationId,
        provider,
        successRedirectUrl: success_redirect_url,
        failureRedirectUrl: failure_redirect_url,
        notifyUrl: notify_url,
      });

      logger.info('Service call successful', {
        resultUrl: result.url,
        pendingAccountId: result.pendingAccountId
      });

      res.status(201).json({
        success: true,
        message: 'Authentication link created successfully',
        data: {
          url: result.url,
          connection_url: result.url, // Support both formats
          pending_account_id: result.pendingAccountId,
        },
      });
    } catch (error) {
      logger.error('=== Backend Controller: createHostedAuthLink ERROR ===', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        userId: req.userId,
        body: req.body
      });
      throw error;
    }
  };
}

/**
 * Account Pending API - Pending accounts endpoint
 */
export class AccountPendingAPI extends ClentoAPI {
  public path = '/api/accounts/pending';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private connectedAccountService: ConnectedAccountService;

  constructor() {
    super();
    this.connectedAccountService = new ConnectedAccountService();

    this.requestParams = {
      GET: {
        bodyParams: {},
        queryParams: {
          provider: 'optional'
        },
        pathParams: {},
      },
      POST: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Get user's pending accounts (for debugging)
   */
  public GET = async (req: Request, res: Response): Promise<void> => {
    try {
      // Mock user and organization for development
      const userId = req.userId;
      const organizationId = req.organizationId;
      const { provider } = req.query;

      if (!userId || !organizationId) {
        throw new NotFoundError('User or organization not found');
      }

      logger.info('Getting pending accounts', { userId, organizationId, provider });

      // Get pending accounts from the service
      const accounts = await this.connectedAccountService.getPendingAccounts(
        userId,
        organizationId,
        provider as string
      );

      res.status(200).json({
        success: true,
        data: accounts,
        meta: {
          total: accounts.length,
        },
        message: 'Pending accounts retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getPendingAccounts controller', { error, userId: req.userId });
      throw error;
    }
  };
}

/**
 * Account Detail API - Individual account management endpoints
 */
export class AccountDetailAPI extends ClentoAPI {
  public path = '/api/accounts/:id';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private connectedAccountService: ConnectedAccountService;

  constructor() {
    super();
    this.connectedAccountService = new ConnectedAccountService();

    this.requestParams = {
      GET: {
        bodyParams: {},
        queryParams: {},
        pathParams: { id: 'required' },
      },
      PUT: {
        bodyParams: {
          display_name: 'optional',
          daily_limit: 'optional'
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
   * Get connected account by ID
   */
  public GET = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.userId;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const account = await this.connectedAccountService.getAccount(id, userId);

      res.status(200).json({
        success: true,
        data: account,
        message: 'Account retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getAccount controller', {
        error,
        accountId: req.params.id,
        userId: req.userId
      });
      throw error;
    }
  };

  /**
   * Update connected account
   */
  public PUT = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.userId;
      const updateData = req.body;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const account = await this.connectedAccountService.updateAccount(id, updateData, userId);

      res.status(200).json({
        success: true,
        message: 'Account updated successfully',
        data: account,
      });
    } catch (error) {
      logger.error('Error in updateAccount controller', {
        error,
        accountId: req.params.id,
        userId: req.userId
      });
      throw error;
    }
  };

  /**
   * Disconnect account
   */
  public DELETE = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.userId;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      // Mock disconnect for development - just return success
      logger.info('Mock disconnect account', { accountId: id, userId });

      res.status(200).json({
        success: true,
        message: 'Account disconnected successfully',
      });
    } catch (error) {
      logger.error('Error in disconnectAccount controller', {
        error,
        accountId: req.params.id,
        userId: req.userId
      });
      throw error;
    }
  };
}

/**
 * Account Sync API - Account sync endpoint
 */
export class AccountSyncAPI extends ClentoAPI {
  public path = '/api/accounts/:id/sync';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private connectedAccountService: ConnectedAccountService;

  constructor() {
    super();
    this.connectedAccountService = new ConnectedAccountService();

    this.requestParams = {
      POST: {
        bodyParams: {
          force: 'optional'
        },
        queryParams: {},
        pathParams: { id: 'required' },
      },
      GET: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Sync account with Unipile
   */
  public POST = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.userId;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const account = await this.connectedAccountService.syncAccount(id, userId);

      res.status(200).json({
        success: true,
        message: 'Account synced successfully',
        data: account,
      });
    } catch (error) {
      logger.error('Error in syncAccount controller', {
        error,
        accountId: req.params.id,
        userId: req.userId
      });
      throw error;
    }
  };
}

/**
 * Account Profile Sync API - Account profile sync endpoint
 */
export class AccountProfileSyncAPI extends ClentoAPI {
  public path = '/api/accounts/:id/sync-profile';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private connectedAccountService: ConnectedAccountService;

  constructor() {
    super();
    this.connectedAccountService = new ConnectedAccountService();

    this.requestParams = {
      POST: {
        bodyParams: {},
        queryParams: {},
        pathParams: { id: 'required' },
      },
      GET: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Manually sync profile data for an account
   */
  public POST = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      logger.info('=== Manual profile sync requested ===', { accountId: id, userId });

      const updatedAccount = await this.connectedAccountService.syncAccountProfile(id, userId);

      res.status(200).json({
        success: true,
        message: 'Profile synced successfully',
        data: updatedAccount,
      });
    } catch (error) {
      logger.error('Error in syncAccountProfile controller', { error, accountId: req.params.id });
      throw error;
    }
  };
}

/**
 * Account Usage API - Account usage statistics endpoint
 */
export class AccountUsageAPI extends ClentoAPI {
  public path = '/api/accounts/:id/usage';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private connectedAccountService: ConnectedAccountService;

  constructor() {
    super();
    this.connectedAccountService = new ConnectedAccountService();

    this.requestParams = {
      GET: {
        bodyParams: {},
        queryParams: {
          date_from: 'optional',
          date_to: 'optional'
        },
        pathParams: { id: 'required' },
      },
      POST: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Get account usage statistics
   */
  public GET = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.userId;
      const { date_from, date_to } = req.query as any;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const usage = await this.connectedAccountService.getAccountUsage(id, userId, date_from, date_to);

      res.status(200).json({
        success: true,
        data: usage,
        message: 'Account usage retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getAccountUsage controller', {
        error,
        accountId: req.params.id,
        userId: req.userId
      });
      throw error;
    }
  };
}

// Create routers for each API class
const accountWebhookRouter = ClentoAPI.createRouter(AccountWebhookAPI, {
  POST: '/webhook'
});

const accountRouter = ClentoAPI.createRouter(AccountAPI, {
  GET: '/',
  POST: '/connect'
});

const accountPendingRouter = ClentoAPI.createRouter(AccountPendingAPI, {
  GET: '/pending'
});

const accountDetailRouter = ClentoAPI.createRouter(AccountDetailAPI, {
  GET: '/:id',
  PUT: '/:id',
  DELETE: '/:id'
});

const accountSyncRouter = ClentoAPI.createRouter(AccountSyncAPI, {
  POST: '/:id/sync'
});

const accountProfileSyncRouter = ClentoAPI.createRouter(AccountProfileSyncAPI, {
  POST: '/:id/sync-profile'
});

const accountUsageRouter = ClentoAPI.createRouter(AccountUsageAPI, {
  GET: '/:id/usage'
});

// Combine all routers
const { Router } = require('express');
const combinedRouter = Router();

combinedRouter.use('/', accountWebhookRouter);
combinedRouter.use('/', accountRouter);
combinedRouter.use('/', accountPendingRouter);
combinedRouter.use('/', accountDetailRouter);
combinedRouter.use('/', accountSyncRouter);
combinedRouter.use('/', accountProfileSyncRouter);
combinedRouter.use('/', accountUsageRouter);

export default combinedRouter;

/**
 * @swagger
 * components:
 *   schemas:
 *     ConnectedAccount:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         user_id:
 *           type: string
 *           format: uuid
 *         organization_id:
 *           type: string
 *           format: uuid
 *         provider:
 *           type: string
 *           enum: [linkedin, email, gmail, outlook, whatsapp, telegram, instagram, messenger, twitter]
 *         provider_account_id:
 *           type: string
 *         display_name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         profile_picture_url:
 *           type: string
 *           format: uri
 *         account_type:
 *           type: string
 *           enum: [personal, business, sales_navigator]
 *         status:
 *           type: string
 *           enum: [connected, disconnected, error, expired]
 *         connection_quality:
 *           type: string
 *           enum: [good, warning, error]
 *         capabilities:
 *           type: array
 *           items:
 *             type: string
 *         daily_limit:
 *           type: integer
 *         daily_usage:
 *           type: integer
 *         last_synced_at:
 *           type: string
 *           format: date-time
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/accounts:
 *   get:
 *     summary: Get user's connected accounts
 *     tags: [Connected Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *           enum: [linkedin, email, gmail, outlook, whatsapp, telegram, instagram, messenger, twitter]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [connected, disconnected, error, expired]
 *     responses:
 *       200:
 *         description: List of user's connected accounts
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
 *                     $ref: '#/components/schemas/ConnectedAccount'
 */

/**
 * @swagger
 * /api/accounts/pending:
 *   get:
 *     summary: Get user's pending accounts (for debugging)
 *     tags: [Connected Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *           enum: [linkedin, email, gmail, outlook, whatsapp, telegram, instagram, messenger, twitter]
 *     responses:
 *       200:
 *         description: List of user's pending accounts
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
 *                     $ref: '#/components/schemas/ConnectedAccount'
 */

/**
 * @swagger
 * /api/accounts/connect:
 *   post:
 *     summary: Create hosted authentication link for connecting accounts
 *     tags: [Connected Accounts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [linkedin, email, gmail, outlook, whatsapp, telegram, instagram, messenger, twitter]
 *               success_redirect_url:
 *                 type: string
 *                 format: uri
 *               failure_redirect_url:
 *                 type: string
 *                 format: uri
 *               notify_url:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Authentication link created successfully
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
 *                   type: object
 *                   properties:
 *                     connection_url:
 *                       type: string
 *                       format: uri
 *                     pending_account_id:
 *                       type: string
 *                       format: uuid
 */

/**
 * @swagger
 * /api/accounts/webhook:
 *   post:
 *     summary: Handle Unipile webhook for account events
 *     tags: [Connected Accounts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *               account_id:
 *                 type: string
 *               status:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */

/**
 * @swagger
 * /api/accounts/{id}:
 *   get:
 *     summary: Get connected account by ID
 *     tags: [Connected Accounts]
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
 *         description: Connected account details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ConnectedAccount'
 */

/**
 * @swagger
 * /api/accounts/{id}:
 *   put:
 *     summary: Update connected account
 *     tags: [Connected Accounts]
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
 *               display_name:
 *                 type: string
 *               daily_limit:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 1000
 *     responses:
 *       200:
 *         description: Account updated successfully
 */

/**
 * @swagger
 * /api/accounts/{id}:
 *   delete:
 *     summary: Disconnect account
 *     tags: [Connected Accounts]
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
 *         description: Account disconnected successfully
 */

/**
 * @swagger
 * /api/accounts/{id}/sync:
 *   post:
 *     summary: Sync account with Unipile
 *     tags: [Connected Accounts]
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               force:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Account synced successfully
 */

/**
 * @swagger
 * /api/accounts/{id}/sync-profile:
 *   post:
 *     summary: Manually sync profile data for an account
 *     tags: [Connected Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Account ID
 *     responses:
 *       200:
 *         description: Profile synced successfully
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
 *                   $ref: '#/components/schemas/ConnectedAccount'
 */

/**
 * @swagger
 * /api/accounts/{id}/usage:
 *   get:
 *     summary: Get account usage statistics
 *     tags: [Connected Accounts]
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
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Account usage statistics
 */
