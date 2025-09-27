/**
 * Start Campaign API
 * 
 * API endpoint for starting campaign execution using Temporal workflows.
 */

import ClentoAPI from '../../utils/apiUtil';
import { Request, Response } from 'express';
import '../../utils/expressExtensions';
import { TemporalService } from '../../services/TemporalService';
import { logger } from '../../utils/logger';

class StartCampaignAPI extends ClentoAPI {
    public path = '/api/campaigns/start';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private temporalService = TemporalService.getInstance();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        try {
            const body = req.getBody();
            const campaignId = body.getParamAsUUID('campaignId', true);
            const organizationId = body.getParamAsUUID('organizationId', true);
            const maxConcurrentLeads = body.getParamAsNumber('maxConcurrentLeads', false);
            const leadProcessingDelay = body.getParamAsNumber('leadProcessingDelay', false);

            logger.info('Starting campaign execution', {
                campaignId,
                organizationId,
                maxConcurrentLeads,
                leadProcessingDelay,
            });

            // Start campaign using Temporal service
            const workflowHandle = await this.temporalService.startCampaign({
                campaignId,
                organizationId,
                maxConcurrentLeads,
                leadProcessingDelay,
            });

            logger.info('Campaign started successfully', {
                campaignId,
                workflowId: workflowHandle.workflowId,
                runId: workflowHandle.firstExecutionRunId,
            });

            return res.sendOKResponse({
                data: {
                    campaignId,
                    workflowId: workflowHandle.workflowId,
                    runId: workflowHandle.firstExecutionRunId,
                    status: 'started',
                    message: 'Campaign execution started successfully',
                },
            });

        } catch (error: any) {
            logger.error('Failed to start campaign', {
                error: error.message,
                stack: error.stack,
            });

            return res.sendErrorResponse(
                500,
                'Failed to start campaign execution',
                {
                    error: error.message,
                }
            );
        }
    };
}

export default new StartCampaignAPI();
