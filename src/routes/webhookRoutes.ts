import { Router } from 'express';
import { ClerkWebhookController } from '../controllers/ClerkWebhookController';

const router = Router();
const clerkWebhookController = new ClerkWebhookController();

/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: Webhook endpoints
 */

/**
 * @swagger
 * /api/webhooks/clerk:
 *   post:
 *     summary: Handle Clerk webhook events
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook received
 *       400:
 *         description: Invalid webhook request
 *       500:
 *         description: Internal server error
 */
router.post('/clerk', clerkWebhookController.handleWebhook);

export default router;
