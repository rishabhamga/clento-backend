import ClentoAPI from '../../utils/apiUtil';
import { ConnectedAccountService } from '../../services/ConnectedAccountService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import logger from '../../utils/logger';
import '../../utils/expressExtensions';

/**
 * Account Usage API - Account usage statistics endpoint
 */
class AccountUsageAPI extends ClentoAPI {
  public path = '/api/accounts/:id/usage';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private connectedAccountService = new ConnectedAccountService();

  /**
   * Get account usage statistics
   */
  public GET = async (req: Request, res: Response): Promise<Response> => {
    try {
      const pathParams = req.getPathParams();
      const id = pathParams.getParamAsString('id', true);
      const userId = req.userId;

      const query = req.getQuery();
      const date_from = query.getParamAsString('date_from', true);
      const date_to = query.getParamAsString('date_to', true);

      const usage = await this.connectedAccountService.getAccountUsage(id, userId, date_from, date_to);

      return res.sendOKResponse({
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

export default new AccountUsageAPI();

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
