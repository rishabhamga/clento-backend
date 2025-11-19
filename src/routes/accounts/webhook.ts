import { Request, Response } from 'express';
import ClentoAPI from '../../utils/apiUtil';
import { DisplayError } from '../../errors/AppError';
import { ConnectedAccountService } from '../../services/ConnectedAccountService';

class AccountsWebhookAPI extends ClentoAPI {
    public path = '/api/accounts/webhook';
    public authType: 'NONE' = 'NONE';

    public connectedAccountService = new ConnectedAccountService();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        const webhookData = req.body;
        const reqBody = req.getBody();
        const status = reqBody.getParamAsString('status');
        const accountId = reqBody.getParamAsString('account_id');
        const name = reqBody.getParamAsString('name');

        if (webhookData.status === 'CREATION_SUCCESS') {
            console.log('Processing account creation success');
            await this.connectedAccountService.handleAccountConnected({
                unipileAccountId: accountId,
                pendingAccountId: name,
                accountData: webhookData,
            });

            console.log('Account connection webhook processed successfully', {
                unipileAccountId: accountId,
                pendingAccountId: name,
            });
        } else {
            console.warn('Unhandled webhook status', {
                status: status,
                account_id: accountId,
            });
        }

        return res.sendOKResponse({
            success: true,
            message: 'Webhook processed successfully',
        });
    };
}

export default new AccountsWebhookAPI();
