import { Request, Response } from 'express';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';
import { DisplayError } from '../../errors/AppError';
import crypto from 'crypto';
import { UserRepository } from '../../repositories/reporterRepositories/UserRepository';

class API extends ClentoAPI {
    public path = '/api/reporter/login';
    public authType: 'NONE' = 'NONE';

    private userRepository = new UserRepository();

    public POST = async (req: Request, res: Response) => {
        const reqBody = req.getBody();
        const email = reqBody.getParamAsString('email');
        const password = reqBody.getParamAsString('password');

        const user = await this.userRepository.findOneByField('email', email);

        if (!user) {
            throw new DisplayError('User not found');
        }

        const passwordMd5 = crypto.createHash('md5').update(password).digest('hex');

        if (user.password_md5 !== passwordMd5) {
            throw new DisplayError('Invalid password');
        }

        req.reporter = {
            id: user.id,
            name: user.first_name + ' ' + user.last_name,
            email: user.email,
        };
        return res.sendOKResponse({ redirect: '/dashboard' });
    };
}

export default new API();
