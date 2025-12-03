import { Request, Response } from 'express';
import { OrderStatus } from '../../dto/orders.dto';
import { DisplayError } from '../../errors/AppError';
import { OrderRepository } from '../../repositories/OrderRepository';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';

class API extends ClentoAPI {
    public path = '/api/payments/cancel';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private orderRepository = new OrderRepository();

    public POST = async (req: Request, res: Response) => {
        const reqBody = req.getBody();
        const xIntentId = reqBody.getParamAsString('xIntentId');

        const order = await this.orderRepository.findOneByField('xpay_intent_id', xIntentId);
        if (!order) {
            throw new DisplayError('Order Not Found');
        }
        if (order.status === OrderStatus.INITIATED) {
            await this.orderRepository.update(order.id, { status: OrderStatus.FAILED });
            return res.sendOKResponse({ success: true });
        }
        return res.sendOKResponse({ success: false });
    };
}

export default new API();
