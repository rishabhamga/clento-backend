import ClentoAPI from '../../utils/apiUtil';
import { OrganizationService } from '../../services/OrganizationService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import '../../utils/expressExtensions';

/**
 * Organization API - Organization management endpoints
 */
class OrganizationAPI extends ClentoAPI {
  public path = '/api/organizations';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private organizationService = new OrganizationService();

  /**
   * Get user's organizations
   */
  public GET = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.userId;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      const organizations = await this.organizationService.getUserOrganizations(userId);

      return res.sendOKResponse({
        success: true,
        data: organizations,
        meta: {
          total: organizations.length,
        },
        message: 'Organizations retrieved successfully'
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Create a new organization
   */
  public POST = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.userId;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      // Using express extensions for parameter validation
      const body = req.getBody();
      const name = body.getParamAsString('name', true);
      const slug = body.getParamAsString('slug', false);
      const logo_url = body.getParamAsString('logo_url', false);
      const website_url = body.getParamAsString('website_url', false);
      const plan = body.getParamAsString('plan', false);
      const billing_email = body.getParamAsString('billing_email', false);

      if (!name) {
        throw new NotFoundError('Name is required');
      }

      const organizationData = {
        name,
        slug: slug || undefined,
        logo_url: logo_url || undefined,
        website_url: website_url || undefined,
        plan: plan || undefined,
        billing_email: billing_email || undefined,
      };

      const organization = await this.organizationService.createOrganization(organizationData, userId);

      return res.sendOKResponse({
        success: true,
        message: 'Organization created successfully',
        data: organization,
      });
    } catch (error) {
      throw error;
    }
  };
}

export default new OrganizationAPI();
