import { Router } from 'express';
import { z } from 'zod';
import { ConnectedAccountController } from '../controllers/ConnectedAccountController';
import { requireAuth, loadUser, loadOrganization, requireOrganization } from '../middleware/auth';
import { validateBody, validateQuery, validateParams, commonParams } from '../middleware/validation';
import {
  CreateConnectedAccountDto,
  UpdateConnectedAccountDto,
  ConnectedAccountQueryDto,
  ConnectLinkedInDto,
  ConnectEmailDto,
  SyncAccountDto,
  AccountUsageDto
} from '../dto/accounts.dto';

const router = Router();
const accountController = new ConnectedAccountController();

// Apply authentication middleware to all routes
// TODO: Re-enable authentication when ready
// router.use(requireAuth);
// router.use(loadUser);

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
 *       - BearerAuth: []
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
router.get('/',
  validateQuery(ConnectedAccountQueryDto),
  accountController.getUserAccounts
);

/**
 * @swagger
 * /api/accounts/pending:
 *   get:
 *     summary: Get user's pending accounts (for debugging)
 *     tags: [Connected Accounts]
 *     security:
 *       - BearerAuth: []
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
router.get('/pending',
  validateQuery(ConnectedAccountQueryDto),
  accountController.getPendingAccounts
);

/**
 * @swagger
 * /api/accounts/connect:
 *   post:
 *     summary: Create hosted authentication link for connecting accounts
 *     tags: [Connected Accounts]
 *     security:
 *       - BearerAuth: []
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
router.post('/connect',
  // loadOrganization,
  // requireOrganization,
  validateBody(z.object({
    provider: z.enum(['linkedin', 'email', 'gmail', 'outlook', 'whatsapp', 'telegram', 'instagram', 'messenger', 'twitter']),
    success_redirect_url: z.string().url().optional(),
    failure_redirect_url: z.string().url().optional(),
    notify_url: z.string().url().optional(),
  })),
  accountController.createHostedAuthLink
);

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
router.post('/webhook', accountController.handleWebhook);

/**
 * @swagger
 * /api/accounts/{id}/sync-profile:
 *   post:
 *     summary: Manually sync profile data for an account
 *     tags: [Connected Accounts]
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
router.post('/:id/sync-profile',
  validateParams(commonParams.id),
  accountController.syncAccountProfile
);

/**
 * @swagger
 * /api/accounts/{id}:
 *   get:
 *     summary: Get connected account by ID
 *     tags: [Connected Accounts]
 *     security:
 *       - BearerAuth: []
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
router.get('/:id',
  validateParams(commonParams.id),
  accountController.getAccount
);

/**
 * @swagger
 * /api/accounts/{id}:
 *   put:
 *     summary: Update connected account
 *     tags: [Connected Accounts]
 *     security:
 *       - BearerAuth: []
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
router.put('/:id',
  validateParams(commonParams.id),
  validateBody(UpdateConnectedAccountDto),
  accountController.updateAccount
);

/**
 * @swagger
 * /api/accounts/{id}:
 *   delete:
 *     summary: Disconnect account
 *     tags: [Connected Accounts]
 *     security:
 *       - BearerAuth: []
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
router.delete('/:id',
  validateParams(commonParams.id),
  accountController.disconnectAccount
);

/**
 * @swagger
 * /api/accounts/{id}/sync:
 *   post:
 *     summary: Sync account with Unipile
 *     tags: [Connected Accounts]
 *     security:
 *       - BearerAuth: []
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
router.post('/:id/sync',
  validateParams(commonParams.id),
  validateBody(SyncAccountDto),
  accountController.syncAccount
);

/**
 * @swagger
 * /api/accounts/{id}/usage:
 *   get:
 *     summary: Get account usage statistics
 *     tags: [Connected Accounts]
 *     security:
 *       - BearerAuth: []
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
router.get('/:id/usage',
  validateParams(commonParams.id),
  validateQuery(AccountUsageDto),
  accountController.getAccountUsage
);

export default router;
