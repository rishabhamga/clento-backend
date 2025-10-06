import { Request, Response } from 'express';
import { ForbiddenError } from '../../errors/AppError';
import { CampaignService } from '../../services/CampaignService';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions'; // Import extensions


/**
 * Create Campaign API - Create new campaign endpoint
 */
class CreateCampaignAPI extends ClentoAPI {
    public path = '/api/campaigns/delete';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private campaignService = new CampaignService();

    /**
     * Create new campaign
     */
    public POST = async (req: Request, res: Response): Promise<Response> => {
        const reqBody = req.getBody();
        const organizationId = req.organizationId;
        const campaignId = reqBody.getParamAsString('campaignId');
        const campaign = await this.campaignService.getCampaignById(campaignId);
        if(organizationId !== campaign?.organization_id){
            throw new ForbiddenError('You are not allowed to delete this campaign');
        }
        await this.campaignService.deleteCampaign(campaignId);
        return res.sendOKResponse({})
    };
}

export default new CreateCampaignAPI();
