import { Request, Response } from 'express';
import '../../utils/expressExtensions';
import * as crypto from 'crypto';
import { DisplayError, UnauthorizedError } from '../../errors/AppError';
import ClentoAPI, { CheckNever } from '../../utils/apiUtil';
import env from '../../config/env';
import logger from '../../utils/logger';
import { OrderRepository } from '../../repositories/OrderRepository';
import { OrderStatus } from '../../dto/orders.dto';
import { SubscriptionRepository } from '../../repositories/SubscriptionRepository';
import { SubscriptionType } from '../../dto/subscriptions.dto';
import { plans } from '../../config/plans';

interface XpayWebhookPayload {
    eventId: string;
    eventType: string;
    eventTime: number;
    intentId: string;
    status: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    card: {
        brand: string;
        country: string;
        lastFourDigit: string;
        expiryMonth: number;
        expiryYear: number;
    };
    metadata: {
        orderId: string;
    };
    customerDetails: {
        name: string;
        email: string;
        contactNumber: string | null;
        customerAddress: {
            country: string;
            postalCode: string;
        };
    };
    receiptId: null;
}

class API extends ClentoAPI {
    public path = '/api/payments/webhook';
    public authType: 'NONE' = 'NONE';

    private orderRepository = new OrderRepository();
    private subscriptionRepository = new SubscriptionRepository();

    private verifySignature(incomingSignature: string, payload: Buffer, signingKey: string): boolean {
        try {
            const hmac = crypto.createHmac('sha512', signingKey);
            hmac.update(payload);
            const computedSignature = hmac.digest('base64');
            const incomingBuffer = Buffer.from(incomingSignature);
            const computedBuffer = Buffer.from(computedSignature);
            if (incomingBuffer.length !== computedBuffer.length) {
                return false;
            }
            return crypto.timingSafeEqual(incomingBuffer, computedBuffer);
        } catch (error) {
            logger.error('Error verifying webhook signature', { error });
            return false;
        }
    }

    public POST = async (req: Request, res: Response) => {
        try {
            const payload = req.rawBody;
            const payloadJson = req.body as XpayWebhookPayload;
            if (!payload) {
                logger.error('Missing raw body in webhook request');
                throw new UnauthorizedError('Missing request body');
            }
            const incomingSignature = req.headers['xpay-signature'] as string;
            if (!incomingSignature) {
                logger.error('Missing xpay-signature header');
                throw new UnauthorizedError('Missing webhook signature');
            }
            const signingKey = env.XPAY_WEBHOOK_SECRET;
            if (!signingKey) {
                logger.error('XPAY_WEBHOOK_SIGNING_KEY not configured');
                throw new UnauthorizedError('Webhook signing key not configured');
            }
            const isValid = this.verifySignature(incomingSignature, payload, signingKey);
            if (!isValid) {
                logger.error('Invalid webhook signature', {
                    signature: incomingSignature.substring(0, 20) + '...',
                });
                throw new UnauthorizedError('Invalid webhook signature');
            }

            const order = await this.orderRepository.update(payloadJson.metadata.orderId, {
                status: OrderStatus.SUCCESS,
            });

            const plan = plans.find(plan => plan.id === order.plan_id);

            if(!plan){
                console.log('THIS SHOULD NEVER HAPPEN');
                throw new DisplayError('That Plan Doesnt Exist');
            }

            switch(plan.type){
                case SubscriptionType.PLAN:
                    await this.subscriptionRepository.create({
                        organization_id: order.organization_id,
                        plan_id: order.plan_id,
                        type: plan.type,
                        parent_id: order.id,
                        numberOfSeats: order.numberOfSeats,
                        period_start: new Date().toISOString(),
                        period_end: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    })
                    break;
                case SubscriptionType.ADDON:
                    const parentPlan = (await this.subscriptionRepository.getActiveSubscription(order.organization_id)).filter(it => it.type === SubscriptionType.PLAN).firstOrNull();
                    await this.subscriptionRepository.create({
                        organization_id: order.organization_id,
                        plan_id: order.plan_id,
                        type: plan.type,
                        parent_id: parentPlan?.id || order.id,
                        numberOfSeats: order.numberOfSeats,
                        period_start: new Date().toISOString(),
                        period_end: parentPlan?.period_end || new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    })
                    break;
                default: CheckNever(plan.type);
            }


            return res.sendOKResponse({ success: true });
        } catch (error) {
            if (error instanceof UnauthorizedError) {
                throw new UnauthorizedError(error.message);
            }
            throw new DisplayError('Error processing webhook');
        }
    };
}

export default new API();
