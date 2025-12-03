import { Request, Response } from 'express';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';
import * as crypto from 'crypto';
import { env } from 'process';
import { DisplayError } from '../../errors/AppError';
import { OrderRepository } from '../../repositories/OrderRepository';
import { OrderStatus } from '../../dto/orders.dto';

class API extends ClentoAPI {
    public path = '/api/payments/callback';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private orderRepository = new OrderRepository();

    public POST = async (req: Request, res: Response) => {
        const organization_id = req.organizationId;
        const reqBody = req.getBody();
        const rawBody = req.rawBody;
        const intentId = reqBody.getParamAsString('xpay_intent_id');

        const order = await this.orderRepository.findOneByField('xpay_intent_id', intentId);
        if (!order) {
            throw new DisplayError('Order not found');
        }
        return res.sendOKResponse({status: order.status});
    };
}

export default new API();
