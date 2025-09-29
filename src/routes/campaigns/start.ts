import ClentoAPI from '../../utils/apiUtil';
import { Request, Response } from 'express';
import '../../utils/expressExtensions';
import { TemporalService } from '../../services/TemporalService';
import logger from '../../utils/logger';

class StartCampaignAPI extends ClentoAPI {
    public path = '/api/campaigns/start';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private temporalService = TemporalService.getInstance();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        const body = req.getBody();
        const campaignId = body.getParamAsUUID('campaignId', true);
        const organizationId = body.getParamAsUUID('organizationId', true);
        const maxConcurrentLeads = body.getParamAsNumber('maxConcurrentLeads', false);
        const leadProcessingDelay = body.getParamAsNumber('leadProcessingDelay', false);

        // const workflowHandle = await this.temporalService.startCampaign({
        //     campaignId,
        //     organizationId,
        //     maxConcurrentLeads,
        //     leadProcessingDelay,
        // });

        logger.info('Starting campaign execution', {
            campaignId,
            organizationId,
            maxConcurrentLeads,
            leadProcessingDelay,
        });
        return res.sendOKResponse({});
    };
}

export default new StartCampaignAPI();
