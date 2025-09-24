import ClentoAPI from '../../utils/apiUtil';
import { ConnectedAccountService } from '../../services/ConnectedAccountService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import logger from '../../utils/logger';
import '../../utils/expressExtensions';

/**
 * Account Connect API - Create hosted authentication link for connecting accounts
 */
class AccountConnectAPI extends ClentoAPI {
  public path = '/api/accounts/connect';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private connectedAccountService = new ConnectedAccountService();

  /**
   * Create hosted authentication link for connecting accounts
   */
  public POST = async (req: Request, res: Response): Promise<Response> => {
    try {
      logger.info('=== Backend Controller: createHostedAuthLink START ===');

      // Mock user and organization for development
      const userId = req.userId;
      const organizationId = req.organizationId;

      if (!userId || !organizationId) {
        throw new NotFoundError('User or organization not found');
      }

      // Using express extensions for parameter validation
      const body = req.getBody();
      const provider = body.getParamAsString('provider', true);
      const successRedirectUrl = body.getParamAsString('success_redirect_url', false);
      const failureRedirectUrl = body.getParamAsString('failure_redirect_url', false);
      const notifyUrl = body.getParamAsString('notify_url', false);

      logger.info('Creating hosted auth link', {
        userId,
        organizationId,
        provider: provider || '',
        successRedirectUrl: successRedirectUrl,
        failureRedirectUrl: failureRedirectUrl,
        notifyUrl: notifyUrl
      });

      const result = await this.connectedAccountService.createHostedAuthLink({
        userId,
        organizationId,
        provider: provider || '',
        successRedirectUrl: successRedirectUrl || undefined,
        failureRedirectUrl: failureRedirectUrl || undefined,
        notifyUrl: notifyUrl || undefined
      });

      logger.info('=== Backend Controller: createHostedAuthLink END ===', { result });

      return res.sendCreatedResponse({
        success: true,
        message: 'Authentication link created successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error in createHostedAuthLink controller', { error, userId: req.userId });
      throw error;
    }
  };
}

export default new AccountConnectAPI();
