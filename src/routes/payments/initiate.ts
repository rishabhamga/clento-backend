import { Request, Response } from 'express';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';
import { Xpay } from '../../utils/xpay';
import { DisplayError } from '../../errors/AppError';
import { plans } from '../../config/plans';
import { SubscriptionRepository } from '../../repositories/SubscriptionRepository';
import { SubscriptionType } from '../../dto/subscriptions.dto';

class API extends ClentoAPI {
    public path = '/api/payments/initiate';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private xpay = new Xpay();
    private subscriptionRepository = new SubscriptionRepository();

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
        const subscription = (await this.subscriptionRepository.getActiveSubscription(organization_id)).filter(it => it.type === SubscriptionType.PLAN).firstOrNull();

        if (plan.type === SubscriptionType.PLAN && subscription) {
            throw new DisplayError('You Already Have A Plan, If you need seats try getting an addon');
        }

        if (subscription?.plan_id === '873ad1c7-42ee-4e75-b813-77178070aa43' && plan.type === SubscriptionType.ADDON) {
            throw new DisplayError('You cannot buy Addons on Trail Plan');
        }

        if(planId === '873ad1c7-42ee-4e75-b813-77178070aa43'){
            const trailPlans = await this.subscriptionRepository.getPrevTrailPlans(organization_id);
            if(trailPlans.length > 0){
                throw new DisplayError('You have already bought a trail plan, Please upgrade your plan to buy more seats');
            }
            await this.subscriptionRepository.create({
                organization_id,
                plan_id: planId,
                type: SubscriptionType.PLAN,
                parent_id: planId,
                numberOfSeats: 1,
                period_start: new Date().toISOString(),
                period_end: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            });
        }

        const seats = reqBody.getParamAsNumber('seats', false) ?? Math.max(plan.maxSeats, 1);
        const intentConfig = {
            amount: this.calculatAmount(plan, seats),
            numberOfSeats: seats,
            currency: 'USD',
            organization_id,
            planId: plan.id,
        };
        const testConfig = {
            amount: 50_00,
            numberOfSeats: seats,
            currency: 'INR',
            organization_id,
            planId: plan.id,
        };
        const response = await this.xpay.createIntent(testConfig);
        return res.sendOKResponse({ fwdUrl: response?.fwdUrl });
    };
}

export default new API();
