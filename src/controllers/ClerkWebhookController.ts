import { Request, Response } from 'express';
import { ClerkWebhookService } from '../services/ClerkWebhookService';
import logger from '../utils/logger';

/**
 * Controller for handling Clerk webhooks
 */
export class ClerkWebhookController {
  private webhookService: ClerkWebhookService;

  constructor() {
    this.webhookService = new ClerkWebhookService();
  }

  /**
   * Handle webhook events from Clerk
   * @route POST /api/webhooks/clerk
   */
  handleWebhook = async (req: Request, res: Response) => {
    try {
      // Get the headers
      const svixId = req.headers['svix-id'] as string;
      const svixTimestamp = req.headers['svix-timestamp'] as string;
      const svixSignature = req.headers['svix-signature'] as string;

      // If there are no headers, error out
      if (!svixId || !svixTimestamp || !svixSignature) {
        return res.status(400).json({
          success: false,
          error: 'Missing Svix headers',
        });
      }

      // Get the body as a string
      const payload = req.body;
      const body = JSON.stringify(payload);

      // Verify the webhook
      let evt: any;
      try {
        evt = this.webhookService.verifyWebhook(
          body,
          svixId,
          svixTimestamp,
          svixSignature
        );
      } catch (err) {
        logger.error('Error verifying webhook:', err);
        return res.status(400).json({
          success: false,
          error: 'Invalid signature',
        });
      }

      // Process the webhook
      const { type, data } = evt;
      logger.info(`Processing webhook: ${type}`);

      // Process asynchronously and return response immediately
      this.webhookService.processWebhook(type, data)
        .catch(error => {
          logger.error('Error processing webhook:', { error, type });
        });

      // Return a 200 response
      return res.status(200).json({
        success: true,
        message: 'Webhook received',
      });
    } catch (error) {
      logger.error('Webhook error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}
