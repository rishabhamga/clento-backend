import { Request, Response } from 'express';
import ClentoAPI from '../../../utils/apiUtil';
import { ReporterConnectedAccountService } from '../../../services/ReporterConnectedAccountService';
import { DisplayError } from '../../../errors/AppError';
import logger from '../../../utils/logger';
import '../../../utils/expressExtensions';

/**
 * Reporter Accounts Sync API - Sync account data with Unipile
 */
class ReporterAccountsSyncAPI extends ClentoAPI {
    public path = '/api/reporter/accounts/sync';
    public authType: 'REPORTER' = 'REPORTER'; // TODO: Change to 'REPORTER' when auth is implemented

    private connectedAccountService = new ReporterConnectedAccountService();

    /**
     * Sync a connected account with Unipile
     */
    public POST = async (req: Request, res: Response): Promise<Response> => {
        // Get reporter user ID from session/auth
        // TODO: Replace with actual reporter auth when implemented
        const reporterUserId = req.reporter?.id;
        if (!reporterUserId) {
            throw new DisplayError('Authentication required');
        }

        const body = req.getBody();
        const accountId = body.getParamAsString('account_id', true);

        logger.info('Syncing reporter account', {
            reporterUserId,
            accountId,
        });

        try {
            const account = await this.connectedAccountService.syncAccount(accountId, reporterUserId);

            return res.sendOKResponse({
                success: true,
                message: 'Account synced successfully',
                data: account,
            });
        } catch (error) {
            logger.error('Error syncing reporter account', { error, reporterUserId, accountId });
            throw new DisplayError('Failed to sync account');
        }
    };
}

export default new ReporterAccountsSyncAPI();
