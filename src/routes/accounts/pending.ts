import ClentoAPI from '../../utils/apiUtil';
import { ConnectedAccountService } from '../../services/ConnectedAccountService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import logger from '../../utils/logger';
import '../../utils/expressExtensions';

/**
 * Account Pending API - Pending accounts endpoint
 */
class AccountPendingAPI extends ClentoAPI {
  public path = '/api/accounts/pending';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private connectedAccountService = new ConnectedAccountService();

  /**
   * Get user's pending accounts (for debugging)
   */
  public GET = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.userId;
      const organizationId = req.organizationId;

      // Using express extensions for parameter validation
      const query = req.getQuery();
      const provider = query.getParamAsString('provider', false);

      logger.info('Getting pending accounts', { userId, organizationId, provider });

      // Get pending accounts from the service
      const accounts = await this.connectedAccountService.getPendingAccounts(
        userId,
        organizationId,
        provider || undefined
      );

      return res.sendOKResponse({
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

export default new AccountPendingAPI();

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
