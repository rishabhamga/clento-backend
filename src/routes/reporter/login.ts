import { Request, Response } from 'express';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';

class API extends ClentoAPI {
    public path = '/api/reporter/login';
    public authType: 'NONE' = 'NONE';

    public POST = async (req: Request, res: Response) => {
        const reqBody = req.getBody();
        const email = reqBody.getParamAsString('email');
        const password = reqBody.getParamAsString('password');

        req.reporter = {
            id: 'somethig',
            name: 'yash',
            email: 'yash@clento.ai',
        };
        return res.sendOKResponse({ redirect: '/dashboard' });
    };
}

export default new API();
