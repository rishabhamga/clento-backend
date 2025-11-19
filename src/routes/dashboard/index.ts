import { Request, Response } from 'express';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';
import { CampaignService } from '../../services/CampaignService';
import { DisplayError } from '../../errors/AppError';
import { ConnectedAccountService } from '../../services/ConnectedAccountService';

class DashboardAPI extends ClentoAPI {
    public path = '/api/dashboard';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private campaignService = new CampaignService();
    private connectedAccountService = new ConnectedAccountService();

    public GET = async (req: Request, res: Response): Promise<Response> => {
        const orgId = req.organization?.id;
        if (!orgId) {
            throw new DisplayError('No Organization Found');
        }

        const recentStats = await this.campaignService.getRecentStats(orgId, 7);
        const recentCampaigns = await this.campaignService.getRecentCampaigns(orgId);
        const senderAccountsIds: string[] = recentCampaigns.filter(it => it.sender_account).map(it => it.sender_account || '');
        const senderAccounts = await this.connectedAccountService.getAccountsByIdIn(senderAccountsIds);

        const recentAccountsWithSenders = recentCampaigns.map(it => {
            const sender = senderAccounts.find(s => s.id === it.sender_account);
            return {
                ...it,
                sender_account_detail: {
                    name: sender?.display_name,
                    profile_picture_url: sender?.profile_picture_url,
                    status: sender?.status,
                    provider: sender?.provider,
                },
            };
        });

        return res.sendOKResponse({
            data: { recentCampaigns: recentAccountsWithSenders, stats: recentStats },
            message: 'Dashboard data fetched successfully',
        });
    };
}

export default new DashboardAPI();
