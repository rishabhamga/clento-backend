import { Request, Response } from 'express';
import ClentoAPI, { CheckNever } from '../../../utils/apiUtil';
import axios from 'axios';
import { DisplayError } from '../../../errors/AppError';
import { WebhookRepository } from '../../../repositories/WebhookRepository';

enum Command {
    TEST_WEBHOOK = 'TEST_WEBHOOK',
    CREATE = 'CREATE',
}

class API extends ClentoAPI {
    public path = '/api/integrations/webhooks';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private webhookRepository = new WebhookRepository();

    public GET = async (req: Request, res: Response) => {
        const orgId = req.organization.id;
        const webhooks = await this.webhookRepository.findByField('organization_id', orgId);
        return res.sendOKResponse({ webhooks });
    };

    public POST = async (req: Request, res: Response): Promise<Response> => {
        const reqBody = req.getBody();
        const orgId = req.organization.id;
        const command = reqBody.getParamAsEnumValue(Command, 'command');
        const url = reqBody.getParamAsString('webhookUrl');

        const regex = /^https?:\/\/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/;

        if (!regex.test(url)) {
            throw new DisplayError('Invalid Url');
        }

        switch (command) {
            case Command.TEST_WEBHOOK:
                const forwardBody = {
                    leadId: '123',
                    leadName: 'john doe',
                    mobile: '+12345',
                };

                const testReq = await axios.post(url, forwardBody);

                return res.sendOKResponse({ webhookResponse: JSON.stringify(testReq.data, null, 4) });
            case Command.CREATE:
                const name = reqBody.getParamAsString('name');

                const webhook = this.webhookRepository.create({
                    organization_id: orgId,
                    name: name,
                    url: url,
                    success_rate: 100,
                });
                return res.sendOKResponse({ created: true });
            default:
                return CheckNever(command);
        }
    };
}

export default new API();
