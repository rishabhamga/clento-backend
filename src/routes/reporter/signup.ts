import { Request, Response } from 'express';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';
import { UserRepository } from '../../repositories/reporterRepositories/UserRepository';
import crypto from 'crypto';
import { DisplayError } from '../../errors/AppError';

class API extends ClentoAPI {
    public path = '/api/reporter/signup';
    public authType: 'NONE' = 'NONE';

    private userRepository = new UserRepository();

    public POST = async (req: Request, res: Response) => {
        const reqBody = req.getBody();
        const firstName = reqBody.getParamAsString('firstName');
        const lastName = reqBody.getParamAsString('lastName');
        const email = reqBody.getParamAsString('email');
        const password = reqBody.getParamAsString('password');

        const existing = await this.userRepository.findOneByField('email', email);
        if (existing) {
            throw new DisplayError('Email Already Exists. Please Login');
        }

        const passwordMd5 = crypto.createHash('md5').update(password).digest('hex');

        const user = await this.userRepository.create({
            first_name: firstName,
            last_name: lastName,
            email,
            password_md5: passwordMd5,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
        });

        req.reporter = {
            id: user.id,
            name: user.first_name + ' ' + user.last_name,
            email: user.email,
        };
        return res.sendOKResponse({ success: true, redirect: '/dashboard' });
    };
}

export default new API();
