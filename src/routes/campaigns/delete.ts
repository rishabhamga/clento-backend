import ClentoAPI from '../../utils/apiUtil';
import { Request, Response } from 'express';
import { DisplayError, ForbiddenError, NotFoundError } from '../../errors/AppError';
import { CampaignService } from '../../services/CampaignService';
import { CreateCampaignDto, UpdateCampaignDto } from '../../dto/campaigns.dto';
import '../../utils/expressExtensions'; // Import extensions
import { StorageService } from '../../services/StorageService';
import { EAction, EApproach, ECallToAction, EFocus, EFormality, EIntention, ELanguage, EMessageLength, EPathType, EPersonalization, ETone, EWorkflowNodeType } from './create';

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
