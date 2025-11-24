import { Request, Response } from 'express';
import ClentoAPI, { CheckNever } from '../../../utils/apiUtil';
import axios from 'axios';
import { DisplayError } from '../../../errors/AppError';

enum Command {
    TEST_WEBHOOK = 'TEST_WEBHOOK',
    CREATE = 'CREATE',
}

class API extends ClentoAPI {
    public path = '/api/integrations';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    public POST = async (req: Request, res: Response): Promise<Response> => {
        const reqBody = req.getBody();
        const command = reqBody.getParamAsEnumValue(Command, 'command');
        const url = reqBody.getParamAsString('webhookUrl');

        switch (command) {
            case Command.TEST_WEBHOOK:
                const regex = /^https?:\/\/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/;

                if (!regex.test(url)) {
                    throw new DisplayError('Invalid Url');
                }

                const forwardBody = {
                    leadId: '123',
                    leadName: 'john doe',
                    mobile: '+12345',
                };

                const testReq = await axios.post(url, forwardBody);

                return res.sendOKResponse({ webhookResponse: JSON.stringify(testReq.data, null, 4) });
            case Command.CREATE:
                return res.sendOKResponse({ created: true });
            default:
                return CheckNever(command);
        }
    };
}

export default new API();
