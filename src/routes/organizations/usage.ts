import ClentoAPI from '../../utils/apiUtil';
import { OrganizationService } from '../../services/OrganizationService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import '../../utils/expressExtensions';

/**
 * Organization Usage API - Organization usage statistics endpoint
 */
class OrganizationUsageAPI extends ClentoAPI {
  public path = '/api/organizations/:id/usage';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private organizationService = new OrganizationService();

  /**
   * Get organization usage statistics
   */
  public GET = async (req: Request, res: Response): Promise<Response> => {
    try {
      const pathParams = req.getPathParams();
      const id = pathParams.getParamAsString('id', true);
      const userId = req.userId;

      const query = req.getQuery();
      const month = query.getParamAsString('month', false);

      const usage = await this.organizationService.getUsageStats(id, userId, month || undefined);

      return res.sendOKResponse({
        data: usage,
        message: 'Usage statistics retrieved successfully'
      });
    } catch (error) {
      throw error;
    }
  };
}

export default new OrganizationUsageAPI();
