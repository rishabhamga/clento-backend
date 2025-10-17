import { Request, Response } from 'express';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';
import { CampaignService } from '../../services/CampaignService';

class DashboardAPI extends ClentoAPI {
    public path = '/api/dashboard';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private campaignService = new CampaignService();

    public GET = async (req: Request, res: Response): Promise<Response> => {
        const recentCampaigns = await this.campaignService.getRecentCampaigns(req.organizationId);

        return res.sendOKResponse({
            data: {},
            message: 'Dashboard data fetched successfully',
        });
    };
}

export default new DashboardAPI();
