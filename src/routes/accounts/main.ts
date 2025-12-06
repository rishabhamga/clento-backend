import ClentoAPI from '../../utils/apiUtil';
import { ConnectedAccountService } from '../../services/ConnectedAccountService';
import { Request, Response } from 'express';
import { DisplayError, NotFoundError } from '../../errors/AppError';
import logger from '../../utils/logger';
import '../../utils/expressExtensions';

/**
 * Account API - Main account management endpoints
 */
class AccountAPI extends ClentoAPI {
    public path = '/api/accounts';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private connectedAccountService = new ConnectedAccountService();

    /**
     * Get user's connected accounts
     */
    public GET = async (req: Request, res: Response): Promise<Response> => {
        try {
            const allowedSeats = req?.subscription?.totalSeats ?? 0;
            const organizationId = req.organizationId;
            // Using express extensions for parameter validation
            const query = req.getQuery();
            const provider = query.getParamAsString('provider', false);
            const status = query.getParamAsString('status', false);

            logger.info('Getting user accounts', { organizationId, provider });

            // Get actual accounts from the service
            const accounts = await this.connectedAccountService.getUserAccounts(organizationId, provider || undefined);

            return res.sendOKResponse({
                success: true,
                data: { accounts, allowedSeats },
                meta: {
                    total: accounts.length,
                },
                allowedSeats,
                message: 'Accounts retrieved successfully',
            });
        } catch (error) {
            logger.error('Error in getUserAccounts controller', { error, userId: req.userId });
            throw error;
        }
    };
}

export default new AccountAPI();

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
