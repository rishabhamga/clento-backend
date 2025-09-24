import ClentoAPI from '../../utils/apiUtil';
import { ConnectedAccountService } from '../../services/ConnectedAccountService';
import { Request, Response } from 'express';
import logger from '../../utils/logger';

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
  public POST = async (req: Request, res: Response): Promise<Response> => {
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

      return res.sendOKResponse({
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

export default new AccountWebhookAPI();

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
