import ClentoAPI from '../../utils/apiUtil';
import { ConnectedAccountService } from '../../services/ConnectedAccountService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import logger from '../../utils/logger';
import '../../utils/expressExtensions';

/**
 * Account Detail API - Individual account management endpoints
 */
class AccountDetailAPI extends ClentoAPI {
  public path = '/api/accounts/:id';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private connectedAccountService = new ConnectedAccountService();

  /**
   * Get connected account by ID
   */
  public GET = async (req: Request, res: Response): Promise<Response> => {
    try {
      const pathParams = req.getPathParams();
      const id = pathParams.getParamAsString('id', true);
      const userId = req.userId;

      const account = await this.connectedAccountService.getAccount(id, userId);

      return res.sendOKResponse({
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
  public PUT = async (req: Request, res: Response): Promise<Response> => {
    try {
      const pathParams = req.getPathParams();
      const id = pathParams.getParamAsString('id', true);
      const userId = req.userId;

      // Using express extensions for parameter validation
      const body = req.getBody();
      const display_name = body.getParamAsString('display_name', false);
      const daily_limit = body.getParamAsNumber('daily_limit', false);

      const updateData = {
        display_name: display_name || undefined,
        daily_limit: daily_limit || undefined,
      };

      const account = await this.connectedAccountService.updateAccount(id, updateData, userId);

      return res.sendOKResponse({
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
  public DELETE = async (req: Request, res: Response): Promise<Response> => {
    try {
      const pathParams = req.getPathParams();
      const id = pathParams.getParamAsString('id', true);
      const userId = req.userId;

      logger.info('Mock disconnect account', { accountId: id, userId });

      return res.sendOKResponse({
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

export default new AccountDetailAPI();

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
