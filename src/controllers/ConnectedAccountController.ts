import { Request, Response, NextFunction } from 'express';
import { ConnectedAccountService } from '../services/ConnectedAccountService';
import { ApiResponse } from '../dto/common.dto';
import logger from '../utils/logger';

/**
 * Controller for connected account-related endpoints
 */
export class ConnectedAccountController {
  private connectedAccountService: ConnectedAccountService;

  constructor() {
    this.connectedAccountService = new ConnectedAccountService();
  }

  /**
   * Create hosted authentication link for connecting accounts
   */
  createHostedAuthLink = async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('=== Backend Controller: createHostedAuthLink START ===');
      
      // Mock user and organization for development
      const userId = req.userId || '550e8400-e29b-41d4-a716-446655440000';
      const organizationId = req.organizationId || '550e8400-e29b-41d4-a716-446655440001';
      const { provider, success_redirect_url, failure_redirect_url, notify_url } = req.body;

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

      const response: ApiResponse = {
        success: true,
        message: 'Authentication link created successfully',
        data: {
          url: result.url,
          connection_url: result.url, // Support both formats
          pending_account_id: result.pendingAccountId,
        },
      };

      logger.info('=== Backend Controller: createHostedAuthLink SUCCESS ===', { response });
      res.status(201).json(response);
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
      next(error);
    }
  };

  /**
   * Get user's connected accounts
   */
  getUserAccounts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Mock user and organization for development
      const userId = req.userId || '550e8400-e29b-41d4-a716-446655440000';
      const organizationId = req.organizationId || '550e8400-e29b-41d4-a716-446655440001';
      const { provider } = req.query;

      logger.info('Getting user accounts', { userId, organizationId, provider });

      // Get actual accounts from the service
      const accounts = await this.connectedAccountService.getUserAccounts(
        userId,
        organizationId,
        provider as string
      );

      const response: ApiResponse = {
        success: true,
        data: accounts,
        meta: {
          total: accounts.length,
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getUserAccounts controller', { error, userId: req.userId });
      next(error);
    }
  };

  /**
   * Get user's pending accounts (for debugging)
   */
  getPendingAccounts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Mock user and organization for development
      const userId = req.userId || '550e8400-e29b-41d4-a716-446655440000';
      const organizationId = req.organizationId || '550e8400-e29b-41d4-a716-446655440001';
      const { provider } = req.query;

      logger.info('Getting pending accounts', { userId, organizationId, provider });

      // Get pending accounts from the service
      const accounts = await this.connectedAccountService.getPendingAccounts(
        userId,
        organizationId,
        provider as string
      );

      const response: ApiResponse = {
        success: true,
        data: accounts,
        meta: {
          total: accounts.length,
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getPendingAccounts controller', { error, userId: req.userId });
      next(error);
    }
  };

  /**
   * Get organization's connected accounts
   */
  getOrganizationAccounts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.userId!;
      const { page = 1, limit = 20 } = req.query as any;

      const result = await this.connectedAccountService.getOrganizationAccounts(
        organizationId,
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
      logger.error('Error in getOrganizationAccounts controller', { 
        error, 
        organizationId: req.organizationId, 
        userId: req.userId 
      });
      next(error);
    }
  };

  /**
   * Get connected account by ID
   */
  getAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const account = await this.connectedAccountService.getAccount(id, userId);

      const response: ApiResponse = {
        success: true,
        data: account,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getAccount controller', { 
        error, 
        accountId: req.params.id, 
        userId: req.userId 
      });
      next(error);
    }
  };

  /**
   * Update connected account
   */
  updateAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;
      const updateData = req.body;

      const account = await this.connectedAccountService.updateAccount(id, updateData, userId);

      const response: ApiResponse = {
        success: true,
        message: 'Account updated successfully',
        data: account,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in updateAccount controller', { 
        error, 
        accountId: req.params.id, 
        userId: req.userId 
      });
      next(error);
    }
  };

  /**
   * Disconnect account
   */
  disconnectAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId || 'mock-user-id';

      // Mock disconnect for development - just return success
      logger.info('Mock disconnect account', { accountId: id, userId });

      const response: ApiResponse = {
        success: true,
        message: 'Account disconnected successfully',
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in disconnectAccount controller', { 
        error, 
        accountId: req.params.id, 
        userId: req.userId 
      });
      next(error);
    }
  };

  /**
   * Sync account with Unipile
   */
  syncAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const account = await this.connectedAccountService.syncAccount(id, userId);

      const response: ApiResponse = {
        success: true,
        message: 'Account synced successfully',
        data: account,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in syncAccount controller', { 
        error, 
        accountId: req.params.id, 
        userId: req.userId 
      });
      next(error);
    }
  };

  /**
   * Get account usage statistics
   */
  getAccountUsage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;
      const { date_from, date_to } = req.query as any;

      const usage = await this.connectedAccountService.getAccountUsage(id, userId, date_from, date_to);

      const response: ApiResponse = {
        success: true,
        data: usage,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in getAccountUsage controller', { 
        error, 
        accountId: req.params.id, 
        userId: req.userId 
      });
      next(error);
    }
  };

  /**
   * Handle Unipile webhook for account connection
   */
  /**
   * Manually sync profile data for an account
   */
  syncAccountProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id || '550e8400-e29b-41d4-a716-446655440000'; // Mock user ID for development
      
      logger.info('=== Manual profile sync requested ===', { accountId: id, userId });

      const updatedAccount = await this.connectedAccountService.syncAccountProfile(id, userId);

      const response: ApiResponse = {
        success: true,
        message: 'Profile synced successfully',
        data: updatedAccount,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in syncAccountProfile controller', { error, accountId: req.params.id });
      next(error);
    }
  };

  handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
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

      const response: ApiResponse = {
        success: true,
        message: 'Webhook processed successfully',
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in handleWebhook controller', { error, body: req.body });
      next(error);
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
   * Handle account disconnected webhook
   */
  private async handleAccountDisconnected(webhookData: any): Promise<void> {
    try {
      // TODO: Implement account disconnection handling
      logger.info('Account disconnected webhook received', { webhookData });
    } catch (error) {
      logger.error('Error handling account disconnected webhook', { error, webhookData });
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
