import ClentoAPI from '../../utils/apiUtil';
import { OrganizationService } from '../../services/OrganizationService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';

/**
 * Organization Member Detail API - Individual member management endpoints
 */
export class OrganizationMemberDetailAPI extends ClentoAPI {
  public path = '/api/organizations/:id/members/:userId';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private organizationService: OrganizationService;

  constructor() {
    super();
    this.organizationService = new OrganizationService();

    this.requestParams = {
      PATCH: {
        bodyParams: {
          role: 'required'
        },
        queryParams: {},
        pathParams: { id: 'required', userId: 'required' },
      },
      DELETE: {
        bodyParams: {},
        queryParams: {},
        pathParams: { id: 'required', userId: 'required' },
      },
      GET: this.getDefaultExpressRequestParams(),
      POST: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Update organization member
   */
  public PATCH = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id, userId: userIdToUpdate } = req.params;
      const requesterId = req.userId;
      const { role } = req.body;

      if (!requesterId) {
        throw new NotFoundError('User not found');
      }

      const member = await this.organizationService.updateMemberRole(id, userIdToUpdate, role, requesterId);

      return res.sendOKResponse({
        success: true,
        message: 'Member updated successfully',
        data: member,
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Remove organization member
   */
  public DELETE = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id, userId: userIdToRemove } = req.params;
      const requesterId = req.userId;

      if (!requesterId) {
        throw new NotFoundError('User not found');
      }

      await this.organizationService.removeMember(id, userIdToRemove, requesterId);

      return res.sendOKResponse({
        success: true,
        message: 'Member removed successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

export default new OrganizationMemberDetailAPI();
