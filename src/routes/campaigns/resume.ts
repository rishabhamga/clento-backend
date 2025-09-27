/**
 * Resume Campaign API
 * 
 * API endpoint for resuming paused campaign execution.
 */

import ClentoAPI from '../../utils/apiUtil';
import { Request, Response } from 'express';
import '../../utils/expressExtensions';
import { TemporalService } from '../../services/TemporalService';
import { logger } from '../../utils/logger';

class ResumeCampaignAPI extends ClentoAPI {
    public path = '/api/campaigns/resume';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private temporalService = TemporalService.getInstance();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        try {
            const body = req.getBody();
            const campaignId = body.getParamAsUUID('campaignId', true);

            logger.info('Resuming campaign execution', {
                campaignId,
            });

            // Resume campaign using Temporal service
            await this.temporalService.resumeCampaign(campaignId);

            logger.info('Campaign resumed successfully', {
                campaignId,
            });

            return res.sendOKResponse({
                data: {
                    campaignId,
                    status: 'active',
                    message: 'Campaign execution resumed successfully',
                },
            });

        } catch (error: any) {
            logger.error('Failed to resume campaign', {
                error: error.message,
                stack: error.stack,
            });

            return res.sendErrorResponse(
                500,
                'Failed to resume campaign execution',
                {
                    error: error.message,
                }
            );
        }
    };
}

export default new ResumeCampaignAPI();
