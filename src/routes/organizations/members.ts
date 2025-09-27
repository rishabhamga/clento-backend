import ClentoAPI from '../../utils/apiUtil';
import { OrganizationService } from '../../services/OrganizationService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import '../../utils/expressExtensions';

/**
 * Organization Members API - Organization member management endpoints
 */
class OrganizationMembersAPI extends ClentoAPI {
  public path = '/api/organizations/members';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private organizationService = new OrganizationService();

  /**
   * Get organization members
   */
  public GET = async (req: Request, res: Response): Promise<Response> => {
    try {
      const query = req.getQuery();
      const id = query.getParamAsString('id', true);
      const userId = req.userId;
      const page = query.getParamAsNumber('page', false) || 1;
      const limit = query.getParamAsNumber('limit', false) || 20;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const result = await this.organizationService.getOrganizationMembers(
        id,
        userId,
        page,
        limit
      );

      return res.sendOKResponse({
        success: true,
        data: result.data,
        meta: {
          page: page,
          limit: limit,
          total: result.count,
          total_pages: Math.ceil(result.count / limit),
        },
        message: 'Organization members retrieved successfully'
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Add member to organization
   */
  public POST = async (req: Request, res: Response): Promise<Response> => {
    try {
      const query = req.getQuery();
      const id = query.getParamAsString('id', true);
      const userId = req.userId;
      const body = req.getBody();
      const user_id = body.getParamAsString('user_id', true);
      const role = body.getParamAsString('role', true);

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const member = await this.organizationService.addMember(id, user_id, role, userId);

      return res.sendOKResponse({
        success: true,
        message: 'Member added successfully',
        data: member,
      });
    } catch (error) {
      throw error;
    }
  };
}

export default new OrganizationMembersAPI();
