import ClentoAPI from '../../utils/apiUtil';
import { LeadListService } from '../../services/LeadListService';
import { Request, Response } from 'express';
import '../../utils/expressExtensions';

class LeadListAPI extends ClentoAPI {
    public path = '/api/lead-lists/edit';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private leadListService = new LeadListService();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        try {
            const organizationId = req.organizationId;
            const userId = req.userId;
            const reqBody = req.getBody();
            const leadListId = reqBody.getParamAsString('list_id');
            const connectedAccountId = reqBody.getParamAsString('connected_account_id');
            const leadListName = reqBody.getParamAsString('name');

            const leadList = await this.leadListService.getLeadListById(leadListId, organizationId);

            await this.leadListService.updateLeadList(leadListId, {
                name: leadListName,
                connected_account_id: connectedAccountId,
            }, organizationId);

            return res.sendOKResponse({
                success: true,
                data: leadList,
                message: 'Lead list updated successfully',
            });
        } catch (error) {
            throw error;
        }
    };
}

export default new LeadListAPI();
