import { Request, Response } from 'express';
import ClentoAPI from '../../../utils/apiUtil';
import { ReporterConnectedAccountService } from '../../../services/ReporterConnectedAccountService';
import logger from '../../../utils/logger';
import '../../../utils/expressExtensions';

class API extends ClentoAPI {
    public path = '/api/reporter/accounts/webhook';
    public authType: 'NONE' = 'NONE';

    private connectedAccountService = new ReporterConnectedAccountService();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        const webhookData = req.body;
        const reqBody = req.getBody();
        const status = reqBody.getParamAsString('status');
        const accountId = reqBody.getParamAsString('account_id');
        const name = reqBody.getParamAsString('name');

        if (!name || !name.startsWith('reporter-')) {
            return res.sendOKResponse({
                success: true,
                message: 'Webhook not for reporter service',
            });
        }

        const pendingAccountId = name.replace('reporter-', '');

        if (webhookData.status === 'CREATION_SUCCESS') {
            try {
                await this.connectedAccountService.handleAccountConnected({
                    unipileAccountId: accountId,
                    pendingAccountId: pendingAccountId,
                    accountData: webhookData,
                });
            } catch (error) {
                console.log('Error', error);
            }
        } else {
            console.log('Unhandled reporter webhook status', {
                status,
                accountId,
                pendingAccountId: pendingAccountId,
            });
        }

        return res.sendOKResponse({
            success: true,
            message: 'Webhook processed successfully',
        });
    };
}

export default new API();
