import { Request, Response } from 'express';
import ClentoAPI from '../../../utils/apiUtil';
import { ReporterConnectedAccountService } from '../../../services/ReporterConnectedAccountService';
import { DisplayError } from '../../../errors/AppError';
import logger from '../../../utils/logger';
import '../../../utils/expressExtensions';

class ReporterAccountsSyncAPI extends ClentoAPI {
    public path = '/api/reporter/accounts/sync';
    public authType: 'REPORTER' = 'REPORTER';

    private connectedAccountService = new ReporterConnectedAccountService();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        const reporterUserId = req.reporter?.id;
        if (!reporterUserId) {
            throw new DisplayError('Authentication required');
        }

        const body = req.getBody();
        const accountId = body.getParamAsString('accountId');

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
