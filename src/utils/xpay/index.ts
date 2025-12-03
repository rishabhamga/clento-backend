import axios from 'axios';
import { env } from 'process';
import { DisplayError } from '../../errors/AppError';
import { OrderStatus } from '../../dto/orders.dto';
import { OrderRepository } from '../../repositories/OrderRepository';
import { plans } from '../../config/plans';

interface XpayResponse {
    amount: number;
    currency: string;
    receiptId: string | null;
    customerDetails: string | null;
    description: string | null;
    callbackUrl: string;
    createdAt: Date;
    status: string;
    secret: string;
    fwdUrl: string;
    xIntentId: string;
}

export class Xpay {
    private secretKey: string | null = env.XPAY_SECRET_KEY!;
    private publicKey: string | null = env.XPAY_PUBLIC_KEY!;

    private orderRepository = new OrderRepository();

    private getAuth() {
        if (!this.secretKey || !this.publicKey) {
            throw new Error('Xpay secret key and public key are required');
        }
        const auth = `${this.publicKey}:${this.secretKey}`;
        const encodedAuth = Buffer.from(auth).toString('base64');
        return encodedAuth;
    }

    async createIntent({ amount, currency, organization_id, seats = 1 }: { amount: number; currency: string; organization_id: string, seats?: number}) {
        const order = await this.orderRepository.create({ organization_id, plan_id: plans[0].id, amount, status: OrderStatus.INITIATED });

        const orderId = order.id;
        const encodedAuth = this.getAuth();
        const url = 'https://api.xpaycheckout.com/payments/create-intent';
        const options = {
            method: 'POST',
            headers: { Authorization: `Basic ${encodedAuth}`, 'Content-Type': 'application/json' },
            body: {
                amount,
                currency,
                callbackUrl: 'http://localhost:3000/subscriptions/callback', //frontend url
                cancelUrl: 'http://localhost:3000/subscriptions/cancel', //frontend url
                paymentMethods: ['CARD', 'GOOGLE_PAY', 'APPLE_PAY'],
                metadata: {
                    orderId,
                },
                phoneNumberRequired: false,
            },
        };
        try {
            const response = await axios.post<XpayResponse>(url, options.body, { headers: options.headers });

            if (response?.status === 200) {
                await this.orderRepository.update(orderId, { xpay_intent_id: response?.data?.xIntentId });
                return response?.data;
            } else {
                console.log('No Success');
                await this.orderRepository.update(orderId, { status: OrderStatus.FAILED });
                throw new DisplayError('An Error Occured While Initiating The Payment');
            }
        } catch (error) {
            console.log('Error', error);
            await this.orderRepository.update(orderId, { status: OrderStatus.FAILED });
            throw new DisplayError('An Error Occured While Initiating The Payment');
        }
    }
}
