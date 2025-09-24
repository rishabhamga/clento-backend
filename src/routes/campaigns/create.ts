import ClentoAPI from '../../utils/apiUtil';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import { CampaignService } from '../../services/CampaignService';
import '../../utils/expressExtensions'; // Import extensions

/**
 * Create Campaign API - Create new campaign endpoint
 */
class CreateCampaignAPI extends ClentoAPI {
  public path = '/api/campaigns/create';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private campaignService = new CampaignService();

  /**
   * Create new campaign
   */
  public POST = async (req: Request, res: Response): Promise<Response> => {
    try {
      const organizationId = req.organizationId;
      const userId = req.userId;
      const reqBody = req.getBody();

      const detail = reqBody.getParamAsNestedBody('detail', true);
      const name = detail.getParamAsString("name", true)
      const description = detail.getParamAsString("description", true)
      const senderAccount = detail.getParamAsString("senderAccount", true)
      const prospectList = detail.getParamAsString("prospectList", true)
      const startDate = detail.getParamAsString("startDate", true)
      const endDate = detail.getParamAsString("endDate", true)
      const startTime = detail.getParamAsString("startTime", true)
      const endTime = detail.getParamAsString("endTime", true)
      const timezone = detail.getParamAsString("timezone", true)

      return res.sendOKResponse({
        message: 'Campaign created successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

export default new CreateCampaignAPI();
