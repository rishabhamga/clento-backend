import ClentoAPI from '../../utils/apiUtil';
import { OrganizationService } from '../../services/OrganizationService';
import { Request, Response } from 'express';
import { NotFoundError, UnauthorizedError } from '../../errors/AppError';
import '../../utils/expressExtensions';

/**
 * Organization Detail API - Individual organization management endpoints
 */
class OrganizationDetailAPI extends ClentoAPI {
    public path = '/api/organizations/detail';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private organizationService = new OrganizationService();

    /**
     * Get organization by ID
     */
    public GET = async (req: Request, res: Response): Promise<Response> => {
        try {
            const query = req.getQuery();
            const id = query.getParamAsString('id', true);
            const userId = req.userId;
            if (!userId) {
                throw new UnauthorizedError('User Not Found');
            }

            const organization = await this.organizationService.getOrganization(id, userId);

            return res.sendOKResponse({
                success: true,
                data: organization,
                message: 'Organization retrieved successfully',
            });
        } catch (error) {
            throw error;
        }
    };

    /**
     * Update organization
     */
    public PUT = async (req: Request, res: Response): Promise<Response> => {
        try {
            const query = req.getQuery();
            const id = query.getParamAsString('id', true);
            const userId = req.userId;

            if (!userId) {
                throw new NotFoundError('User not found');
            }

            // Using express extensions for parameter validation
            const body = req.getBody();
            const updateData = {
                name: body.getParamAsString('name', false) || undefined,
                slug: body.getParamAsString('slug', false) || undefined,
                logo_url: body.getParamAsString('logo_url', false) || undefined,
                website_url: body.getParamAsString('website_url', false) || undefined,
                plan: body.getParamAsString('plan', false) || undefined,
                billing_email: body.getParamAsString('billing_email', false) || undefined,
                subscription_status: body.getParamAsString('subscription_status', false) || undefined,
                monthly_campaign_limit: body.getParamAsNumber('monthly_campaign_limit', false) || undefined,
                monthly_lead_limit: body.getParamAsNumber('monthly_lead_limit', false) || undefined,
                user_limit: body.getParamAsNumber('user_limit', false) || undefined,
                settings: body.getParamAsNestedBody('settings', false)?.rawJSON() || undefined,
            };

            // Filter out undefined values
            const filteredUpdateData = Object.fromEntries(Object.entries(updateData).filter(([_, value]) => value !== undefined));

            const organization = await this.organizationService.updateOrganization(id, filteredUpdateData, userId);

            return res.sendOKResponse({
                success: true,
                message: 'Organization updated successfully',
                data: organization,
            });
        } catch (error) {
            throw error;
        }
    };

    /**
     * Delete organization
     */
    public DELETE = async (req: Request, res: Response): Promise<Response> => {
        try {
            const query = req.getQuery();
            const id = query.getParamAsString('id', true);
            const userId = req.userId;

            if (!userId) {
                throw new NotFoundError('User not found');
            }

            if (!id) {
                throw new NotFoundError('Organization ID is required');
            }

            await this.organizationService.deleteOrganization(id, userId);

            return res.sendOKResponse({
                success: true,
                message: 'Organization deleted successfully',
            });
        } catch (error) {
            throw error;
        }
    };
}

export default new OrganizationDetailAPI();
