import { Request, Response } from 'express';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';
import { UserRepository } from '../../repositories/reporterRepositories/UserRepository';
import crypto from 'crypto';
import { BadRequestError, DisplayError } from '../../errors/AppError';

class API extends ClentoAPI {
    public path = '/api/reporter/superLogin';
    public authType: 'REPORTER' = 'REPORTER';

    private userRepository = new UserRepository();

    public GET = async (req: Request, res: Response) => {
        const userId = req.reporter.id;
        const user = await this.userRepository.findById(userId);
        return res.sendOKResponse({ available: user?.is_superuser ?? false });
    };

    public POST = async (req: Request, res: Response) => {
        const reqBody = req.getBody();
        const userId = req.reporter.id;

        const user = await this.userRepository.findById(userId);
        if (!user || !user.is_superuser) {
            throw new BadRequestError('No Such Resource');
        }
        const email = reqBody.getParamAsString('email');
        const toLogin = await this.userRepository.findOneByField('email', email);

        if (!toLogin) {
            throw new DisplayError('No User By this email');
        }

        req.reporter = {
            id: toLogin.id,
            name: toLogin.first_name + ' ' + toLogin.last_name,
            email: toLogin.email,
        };
        return res.sendOKResponse({ success: true });
    };
}

export default new API();
