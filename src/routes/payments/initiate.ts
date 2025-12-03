import { Request, Response } from 'express';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';
import { Xpay } from '../../utils/xpay';
import { DisplayError } from '../../errors/AppError';
import { plans } from '../../config/plans';

class API extends ClentoAPI {
    public path = '/api/payments/initiate';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private xpay = new Xpay();

    private calculatAmount = (plan: { id: string; name: string; description: string; interval: string; seatPriceCents: number; purchasable: boolean }, seats: number) => {

        return seats * plan.seatPriceCents;
    };

    public POST = async (req: Request, res: Response) => {
        const organization_id = req.organizationId;
        const reqBody = req.getBody();
        const planId = reqBody.getParamAsUUID('planId');
        const plan = plans.find(plan => plan.id === planId);
        if (!plan) {
            throw new DisplayError('Plan Not Found');
        }
        if (!plan.purchasable) {
            throw new DisplayError('Plan Is Not Purchasable');
        }
        const seats = reqBody.getParamAsNumber('seats', false) ?? Math.max(plan.maxSeats, 1);
        const intentConfig = {
            amount: this.calculatAmount(plan, seats),
            currency: 'USD',
            organization_id,
        };
        const testConfig = {
            amount: 50_00,
            currency: 'INR',
            organization_id,
        };
        const response = await this.xpay.createIntent(testConfig);
        return res.sendOKResponse({ fwdUrl: response?.fwdUrl });
    };
}

export default new API();
