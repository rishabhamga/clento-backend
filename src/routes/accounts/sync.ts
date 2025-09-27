import ClentoAPI from '../../utils/apiUtil';
import { ConnectedAccountService } from '../../services/ConnectedAccountService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import logger from '../../utils/logger';
import '../../utils/expressExtensions';

/**
 * Account Sync API - Account sync endpoint
 */
class AccountSyncAPI extends ClentoAPI {
  public path = '/api/accounts/sync';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private connectedAccountService = new ConnectedAccountService();

  /**
   * Sync account with Unipile
   */
  public POST = async (req: Request, res: Response): Promise<Response> => {
      const query = req.getQuery();
      const id = query.getParamAsString('id', true);
      const userId = req.userId;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const account = await this.connectedAccountService.syncAccount(id, userId);

      return res.sendOKResponse({
        message: 'Account synced successfully',
        data: account,
      });
    }
  };

export default new AccountSyncAPI();

/**
 * @swagger
 * /api/accounts/sync:
 *   post:
 *     summary: Sync account with Unipile
 *     tags: [Connected Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
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
