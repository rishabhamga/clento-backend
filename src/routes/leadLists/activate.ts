import ClentoAPI from '../../utils/apiUtil';
import { LeadListService } from '../../services/LeadListService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import '../../utils/expressExtensions';

/**
 * Lead List Activate API - Activate lead list endpoint
 */
class LeadListActivateAPI extends ClentoAPI {
  public path = '/api/lead-lists/activate';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private leadListService = new LeadListService();

  /**
   * Activate lead list
   */
  public POST = async (req: Request, res: Response): Promise<Response> => {
    try {
      const query = req.getQuery();
      const id = query.getParamAsString('id', true);
      const organizationId = req.organizationId;

      if (!organizationId) {
        throw new NotFoundError('Organization not found');
      }

      const leadList = await this.leadListService.activateLeadList(id, organizationId);

      return res.sendOKResponse({
        data: leadList,
        message: 'Lead list activated successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

export default new LeadListActivateAPI();
