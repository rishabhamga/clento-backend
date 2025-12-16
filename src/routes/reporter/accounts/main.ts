import { Request, Response } from 'express';
import { DisplayError } from '../../../errors/AppError';
import { ReporterConnectedAccountService } from '../../../services/ReporterConnectedAccountService';
import ClentoAPI from '../../../utils/apiUtil';
import '../../../utils/expressExtensions';

class API extends ClentoAPI {
    public path = '/api/reporter/accounts';
    public authType: 'REPORTER' = 'REPORTER';

    private connectedAccountService = new ReporterConnectedAccountService();

    public GET = async (req: Request, res: Response): Promise<Response> => {
        const reporterUserId = req.reporter.id;
        if (!reporterUserId) {
            throw new DisplayError('Authentication required');
        }

        const query = req.getQuery();
        const provider = query.getParamAsString('provider', false);

        try {
            const accounts = await this.connectedAccountService.getUserAccounts(reporterUserId, provider || undefined);

            return res.sendOKResponse({
                success: true,
                accounts: accounts,
                count: accounts.length,
            });
        } catch (error) {
            throw new DisplayError('Failed to get connected accounts');
        }
    };
}

export default new API();
