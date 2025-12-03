import { Request, Response } from 'express';
import { plans } from '../../config/plans';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';

class API extends ClentoAPI {
    public path = '/api/billing';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    public GET = async (req: Request, res: Response) => {
        return res.sendOKResponse({ plans });
    };
}

export default new API();
