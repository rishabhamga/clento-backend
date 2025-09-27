/**
 * Campaign Status API
 * 
 * API endpoint for getting campaign execution status and progress.
 */

import ClentoAPI from '../../utils/apiUtil';
import { Request, Response } from 'express';
import '../../utils/expressExtensions';
import { TemporalService } from '../../services/TemporalService';
import { logger } from '../../utils/logger';

class CampaignStatusAPI extends ClentoAPI {
    public path = '/api/campaigns/status';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private temporalService = TemporalService.getInstance();

    public GET = async (req: Request, res: Response): Promise<Response> => {
        try {
            const query = req.getQuery();
            const campaignId = query.getParamAsUUID('campaignId', true);

            logger.info('Getting campaign status', {
                campaignId,
            });

            // Get campaign status from Temporal service
            const campaignStatus = await this.temporalService.getCampaignStatus(campaignId);

            logger.info('Campaign status retrieved successfully', {
                campaignId,
                status: campaignStatus.status,
                totalLeads: campaignStatus.totalLeads,
                processedLeads: campaignStatus.processedLeads,
            });

            return res.sendOKResponse({
                data: campaignStatus,
            });

        } catch (error: any) {
            logger.error('Failed to get campaign status', {
                error: error.message,
                stack: error.stack,
            });

            return res.sendErrorResponse(
                500,
                'Failed to get campaign status',
                {
                    error: error.message,
                }
            );
        }
    };

    public POST = async (req: Request, res: Response): Promise<Response> => {
        try {
            const body = req.getBody();
            const campaignIds = body.getParamAsStringArray('campaignIds', true);

            logger.info('Getting multiple campaign statuses', {
                campaignIds,
                count: campaignIds.length,
            });

            // Get status for multiple campaigns
            const campaignStatuses = await Promise.allSettled(
                campaignIds.map(campaignId => 
                    this.temporalService.getCampaignStatus(campaignId)
                )
            );

            const results = campaignStatuses.map((result, index) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                } else {
                    logger.warn('Failed to get status for campaign', {
                        campaignId: campaignIds[index],
                        error: result.reason?.message,
                    });
                    
                    return {
                        campaignId: campaignIds[index],
                        status: 'error' as const,
                        error: result.reason?.message || 'Unknown error',
                        totalLeads: 0,
                        processedLeads: 0,
                        successfulLeads: 0,
                        failedLeads: 0,
                        workflows: [],
                    };
                }
            });

            logger.info('Multiple campaign statuses retrieved', {
                totalCampaigns: campaignIds.length,
                successfulRequests: results.filter(r => r.status !== 'error').length,
            });

            return res.sendOKResponse({
                data: results,
            });

        } catch (error: any) {
            logger.error('Failed to get multiple campaign statuses', {
                error: error.message,
                stack: error.stack,
            });

            return res.sendErrorResponse(
                500,
                'Failed to get campaign statuses',
                {
                    error: error.message,
                }
            );
        }
    };
}

export default new CampaignStatusAPI();
