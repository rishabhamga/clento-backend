/**
 * Stop Campaign API
 * 
 * API endpoint for stopping campaign execution.
 */

import ClentoAPI from '../../utils/apiUtil';
import { Request, Response } from 'express';
import '../../utils/expressExtensions';
import { TemporalService } from '../../services/TemporalService';
import { logger } from '../../utils/logger';

class StopCampaignAPI extends ClentoAPI {
    public path = '/api/campaigns/stop';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private temporalService = TemporalService.getInstance();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        try {
            const body = req.getBody();
            const campaignId = body.getParamAsUUID('campaignId', true);
            const reason = body.getParamAsString('reason', false);
            const completeCurrentExecutions = body.getParamAsBoolean('completeCurrentExecutions', false) ?? true;

            logger.info('Stopping campaign execution', {
                campaignId,
                reason,
                completeCurrentExecutions,
            });

            // Stop campaign using Temporal service
            await this.temporalService.stopCampaign(campaignId, reason, completeCurrentExecutions);

            logger.info('Campaign stopped successfully', {
                campaignId,
                reason,
                completeCurrentExecutions,
            });

            return res.sendOKResponse({
                data: {
                    campaignId,
                    status: 'completed',
                    reason,
                    completeCurrentExecutions,
                    message: 'Campaign execution stopped successfully',
                },
            });

        } catch (error: any) {
            logger.error('Failed to stop campaign', {
                error: error.message,
                stack: error.stack,
            });

            return res.sendErrorResponse(
                500,
                'Failed to stop campaign execution',
                {
                    error: error.message,
                }
            );
        }
    };
}

export default new StopCampaignAPI();
