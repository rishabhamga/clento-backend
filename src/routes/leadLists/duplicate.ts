import ClentoAPI from '../../utils/apiUtil';
import { LeadListService } from '../../services/LeadListService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import '../../utils/expressExtensions';

/**
 * Lead List Duplicate API - Duplicate lead list endpoint
 */
class LeadListDuplicateAPI extends ClentoAPI {
    public path = '/api/lead-lists/duplicate';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private leadListService = new LeadListService();

    /**
     * Duplicate lead list
     */
    public POST = async (req: Request, res: Response): Promise<Response> => {
        try {
            const query = req.getQuery();
            const id = query.getParamAsString('id', true);
            const organizationId = req.organizationId;
            const userId = req.userId;

            if (!organizationId || !userId) {
                throw new NotFoundError('Organization or user not found');
            }

            const body = req.getBody();
            const name = body.getParamAsString('name', true);

            const leadList = await this.leadListService.duplicateLeadList(id, name, organizationId, userId);

            return res.sendOKResponse({
                success: true,
                data: leadList,
                message: 'Lead list duplicated successfully',
            });
        } catch (error) {
            throw error;
        }
    };
}

export default new LeadListDuplicateAPI();
