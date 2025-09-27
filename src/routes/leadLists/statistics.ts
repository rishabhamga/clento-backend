import ClentoAPI from '../../utils/apiUtil';
import { LeadListService } from '../../services/LeadListService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import '../../utils/expressExtensions';

/**
 * Lead List Statistics API - Lead list statistics endpoint
 */
class LeadListStatisticsAPI extends ClentoAPI {
  public path = '/api/lead-lists/statistics';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private leadListService = new LeadListService();

  /**
   * Get lead list statistics
   */
  public GET = async (req: Request, res: Response): Promise<Response> => {
    try {
      const query = req.getQuery();
      const id = query.getParamAsString('id', true);
      const organizationId = req.organizationId;

      if (!organizationId) {
        throw new NotFoundError('Organization not found');
      }

      const statistics = await this.leadListService.getLeadListStatistics(id, organizationId);

      return res.sendOKResponse({
        data: statistics,
        message: 'Lead list statistics retrieved successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

export default new LeadListStatisticsAPI();
