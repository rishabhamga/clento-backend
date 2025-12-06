import { Request, Response } from 'express';
import { plans } from '../../config/plans';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';
import { SubscriptionRepository } from '../../repositories/SubscriptionRepository';
import { SubscriptionType } from '../../dto/subscriptions.dto';

class API extends ClentoAPI {
    public path = '/api/billing';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private subscriptionRepository = new SubscriptionRepository();

    public GET = async (req: Request, res: Response) => {
        const subscription = req.subscription;
        const selectedPlan = (await this.subscriptionRepository.getActiveSubscription(req.organizationId)).filter(it => it.type === SubscriptionType.PLAN).firstOrNull()?.plan_id;
        console.log(selectedPlan);
        return res.sendOKResponse({ plans, subscription, selectedPlan });
    };
}

export default new API();
