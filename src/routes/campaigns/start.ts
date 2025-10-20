import { Request, Response } from 'express';
import { TemporalService } from '../../services/TemporalService';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';

class StartCampaignAPI extends ClentoAPI {
    public path = '/api/campaigns/start';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private temporalService = TemporalService.getInstance();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        const body = req.getBody();
        const campaignId = body.getParamAsUUID('campaignId', true);

        await this.temporalService.startCampaign(campaignId);

        return res.sendOKResponse({message: "Campaign Started"});
    };
}

export default new StartCampaignAPI();
