import ClentoAPI from '../../../utils/apiUtil';
import { ReporterConnectedAccountService } from '../../../services/ReporterConnectedAccountService';
import { Request, Response } from 'express';
import { DisplayError } from '../../../errors/AppError';
import logger from '../../../utils/logger';
import '../../../utils/expressExtensions';

/**
 * Reporter Account Connect API - Create hosted authentication link for connecting accounts
 */
class ReporterAccountConnectAPI extends ClentoAPI {
    public path = '/api/reporter/accounts/connect';
    public authType: 'REPORTER' = 'REPORTER';

    private connectedAccountService = new ReporterConnectedAccountService();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        const reporterUserId = req.reporter.id;
        const provider = 'linkedin';
        const successRedirectUrl = 'http://localhost:3000/dashboard/accounts';
        const failureRedirectUrl = 'http://localhost:3000/dashboard/accounts';
        const notifyUrl = 'https://34c8c9603e64.ngrok-free.app/api/reporter/accounts/webhook';

        try {
            const result = await this.connectedAccountService.createHostedAuthLink({
                reporterUserId,
                provider,
                successRedirectUrl: successRedirectUrl || undefined,
                failureRedirectUrl: failureRedirectUrl || undefined,
                notifyUrl: notifyUrl || undefined,
            });

            return res.sendOKResponse({ success: true, message: 'Authentication link created successfully', url: result.url });
        } catch (error) {
            throw new DisplayError('An Error Occurred');
        }
    };
}

export default new ReporterAccountConnectAPI();
