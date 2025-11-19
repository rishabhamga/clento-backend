import ClentoAPI from '../../utils/apiUtil';
import { LeadListService } from '../../services/LeadListService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import '../../utils/expressExtensions';

/**
 * Lead List API - Main lead list management endpoints
 */
class LeadListAPI extends ClentoAPI {
    public path = '/api/lead-lists';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private leadListService = new LeadListService();

    /**
     * Get lead lists
     */
    public GET = async (req: Request, res: Response): Promise<Response> => {
        try {
            const organizationId = req.organizationId;

            const query = req.getQuery();
            const withStats = query.getParamAsBoolean('with_stats', false) || false;

            if (!organizationId) {
                throw new NotFoundError('Organization not found');
            }

            let result;
            if (withStats) {
                result = await this.leadListService.getLeadListsWithStats(organizationId, req.query as any);
            } else {
                result = await this.leadListService.getLeadLists(organizationId, req.query as any);
            }

            return res.sendOKResponse({
                success: true,
                data: result,
                message: 'Lead lists retrieved successfully',
            });
        } catch (error) {
            throw error;
        }
    };

    /**
     * Create lead list
     */
    public POST = async (req: Request, res: Response): Promise<Response> => {
        try {
            const organizationId = req.organizationId;
            const userId = req.userId;

            const leadList = await this.leadListService.createLeadList(req.body, organizationId, userId);

            return res.sendOKResponse({
                success: true,
                data: leadList,
                message: 'Lead list created successfully',
            });
        } catch (error) {
            throw error;
        }
    };
}

export default new LeadListAPI();
