import { Request, Response } from 'express';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';
import { CampaignService } from '../../services/CampaignService';
import { DisplayError } from '../../errors/AppError';
import { ConnectedAccountService } from '../../services/ConnectedAccountService';
import { CampaignStepRepository } from '../../repositories/CampaignStepRepository';
import { EWorkflowNodeType } from '../../types/workflow.types';
import { getDateArrayForLastDays } from '../../utils/general';

class DashboardAPI extends ClentoAPI {
    public path = '/api/dashboard/recent-campaigns';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private campaignStepRepository = new CampaignStepRepository();

    public GET = async (req: Request, res: Response): Promise<Response> => {
        const orgId = req.organization?.id;
        const recentSteps = await this.campaignStepRepository.getRecentCampaignStepsByOrgIdAndDays(orgId, 7);

        const dateArray = getDateArrayForLastDays(7);

        const createZeroStats = (date: string) => ({
            date,
            total: 0,
            connectionsTotal: 0,
            connectionsFailed: 0,
            connectionsSuccessful: 0,
            profileVisitsTotal: 0,
            profileVisitsFailed: 0,
            profileVisitsSuccessful: 0,
            postLikedTotal: 0,
            postLikedFailed: 0,
            postLikedSuccessful: 0,
        });

        const recentStepsStats = recentSteps
            .groupBy(it => it.created_at.split('T')[0])
            .mapValues((value, key) => {
                return {
                    date: key,
                    total: value.length,
                    connectionsTotal: value.count(it => it.type === EWorkflowNodeType.send_connection_request),
                    connectionsFailed: value.count(it => it.type === EWorkflowNodeType.send_connection_request && !it.success),
                    connectionsSuccessful: value.count(it => it.type === EWorkflowNodeType.send_connection_request && it.success),

                    profileVisitsTotal: value.count(it => it.type === EWorkflowNodeType.profile_visit),
                    profileVisitsFailed: value.count(it => it.type === EWorkflowNodeType.profile_visit && !it.success),
                    profileVisitsSuccessful: value.count(it => it.type === EWorkflowNodeType.profile_visit && it.success),

                    postLikedTotal: value.count(it => it.type === EWorkflowNodeType.like_post),
                    postLikedFailed: value.count(it => it.type === EWorkflowNodeType.like_post && !it.success),
                    postLikedSuccessful: value.count(it => it.type === EWorkflowNodeType.like_post && it.success),
                };
            });
        const filledStats = dateArray.map(date => {
            return recentStepsStats.has(date) ? recentStepsStats.get(date)! : createZeroStats(date);
        });

        return res.sendOKResponse({ recentActivity: filledStats });
    };
}

export default new DashboardAPI();
