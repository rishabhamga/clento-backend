import { Request, Response } from 'express';
import { DisplayError } from '../../../errors/AppError';
import { ReporterConnectedAccountService } from '../../../services/ReporterConnectedAccountService';
import ClentoAPI from '../../../utils/apiUtil';
import '../../../utils/expressExtensions';

interface Account {
    id: string;
    display_name?: string;
    profile_picture_url?: string;
    status?: string;
    last_synced_at?: string | Date;
    created_at?: string | Date;
    metadata?: {
        connection_status?: string;
        connected_at?: string | Date;
        last_synced_at?: string | Date;
        profile_data?: {
            first_name?: string;
            last_name?: string;
            profile_picture_url?: string;
            occupation?: string;
        };
    };
}

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
                accounts: accounts.map(it => ({
                    id: it.id,
                    display_name: it.display_name,
                    profile_picture_url: it.profile_picture_url,
                    status: it.status,
                    last_synced_at: it.last_synced_at,
                    created_at: it.created_at,
                    metadata: it.metadata,
                })),
                count: accounts.length,
            });
        } catch (error) {
            throw new DisplayError('Failed to get connected accounts');
        }
    };
}

export default new API();
