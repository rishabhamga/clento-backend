import ClentoAPI from '../../utils/apiUtil';
import { LeadListService } from '../../services/LeadListService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import '../../utils/expressExtensions';

/**
 * Lead List Detail API - Individual lead list management endpoints
 */
class LeadListDetailAPI extends ClentoAPI {
  public path = '/api/lead-lists/:id';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private leadListService = new LeadListService();

  /**
   * Get lead list by ID
   */
  public GET = async (req: Request, res: Response): Promise<Response> => {
    try {
      const pathParams = req.getPathParams();
      const id = pathParams.getParamAsString('id', true);
      const organizationId = req.organizationId;

      if (!organizationId) {
        throw new NotFoundError('Organization not found');
      }

      const leadList = await this.leadListService.getLeadListDataById(id, organizationId);

      return res.sendOKResponse({
        success: true,
        data: leadList,
        message: 'Lead list retrieved successfully',
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Update lead list
   */
  public PUT = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId;

      if (!organizationId) {
        throw new NotFoundError('Organization not found');
      }

      const leadList = await this.leadListService.updateLeadList(id, req.body, organizationId);

      return res.sendOKResponse({
        success: true,
        data: leadList,
        message: 'Lead list updated successfully',
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Delete lead list
   */
  public DELETE = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId;

      if (!organizationId) {
        throw new NotFoundError('Organization not found');
      }

      await this.leadListService.deleteLeadList(id, organizationId);

      return res.sendOKResponse({
        success: true,
        data: null,
        message: 'Lead list deleted successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

export default new LeadListDetailAPI();
