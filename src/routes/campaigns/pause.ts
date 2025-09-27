/**
 * Pause Campaign API
 * 
 * API endpoint for pausing campaign execution.
 */

import ClentoAPI from '../../utils/apiUtil';
import { Request, Response } from 'express';
import '../../utils/expressExtensions';
import { TemporalService } from '../../services/TemporalService';
import { logger } from '../../utils/logger';

class PauseCampaignAPI extends ClentoAPI {
    public path = '/api/campaigns/pause';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private temporalService = TemporalService.getInstance();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        try {
            const body = req.getBody();
            const campaignId = body.getParamAsUUID('campaignId', true);
            const reason = body.getParamAsString('reason', false);

            logger.info('Pausing campaign execution', {
                campaignId,
                reason,
            });

            // Pause campaign using Temporal service
            await this.temporalService.pauseCampaign(campaignId, reason);

            logger.info('Campaign paused successfully', {
                campaignId,
                reason,
            });

            return res.sendOKResponse({
                data: {
                    campaignId,
                    status: 'paused',
                    reason,
                    message: 'Campaign execution paused successfully',
                },
            });

        } catch (error: any) {
            logger.error('Failed to pause campaign', {
                error: error.message,
                stack: error.stack,
            });

            return res.sendErrorResponse(
                500,
                'Failed to pause campaign execution',
                {
                    error: error.message,
                }
            );
        }
    };
}

export default new PauseCampaignAPI();
