import { Request, Response } from 'express';
import ClentoAPI, { CheckNever } from '../../../utils/apiUtil';
import { DisplayError, NotFoundError, ValidationError } from '../../../errors/AppError';
import { ReporterWebhookRepository } from '../../../repositories/reporterRepositories/WebhookRepository';
import '../../../utils/expressExtensions';
import { UpdateReporterWebhookDto } from '../../../dto/reporterDtos/webhooks.dto';

enum Command {
    CREATE = 'CREATE',
    EDIT = 'EDIT',
    DELETE = 'DELETE',
}

class API extends ClentoAPI {
    public path = '/api/reporter/webhooks';
    public authType: 'REPORTER' = 'REPORTER';

    private webhookRepository = new ReporterWebhookRepository();

    public GET = async (req: Request, res: Response): Promise<Response> => {
        const reporterUserId = req.reporter?.id;
        if (!reporterUserId) {
            throw new ValidationError('User ID is required');
        }

        try {
            const webhooks = await this.webhookRepository.getUserWebhooks(reporterUserId);
            return res.sendOKResponse({ webhooks, count: webhooks.length });
        } catch (error: any) {
            throw new DisplayError('Failed to get webhooks');
        }
    };

    public POST = async (req: Request, res: Response): Promise<Response> => {
        const reporterUserId = req.reporter?.id;
        if (!reporterUserId) {
            throw new ValidationError('User ID is required');
        }

        const body = req.getBody();
        const command = body.getParamAsEnumValue(Command, 'command', true);

        const urlRegex = /^https?:\/\/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/;

        switch (command) {
            case Command.CREATE: {
                const name = body.getParamAsString('name', true);
                const url = body.getParamAsString('url', true);

                if (!urlRegex.test(url)) {
                    throw new ValidationError('Invalid URL format');
                }

                const webhooks = await this.webhookRepository.getUserWebhooks(reporterUserId);

                if(webhooks.length >= 3){
                    throw new DisplayError(`Only 3 webhooks are allowed at a time`);
                }

                const webhook = await this.webhookRepository.create({
                    reporter_user_id: reporterUserId,
                    name,
                    url,
                    success_rate: 100,
                });

                return res.sendOKResponse({
                    success: true,
                    message: 'Webhook created successfully',
                    webhook,
                });
            }

            case Command.EDIT: {
                const webhookId = body.getParamAsString('id', true);
                const name = body.getParamAsString('name', false);
                const url = body.getParamAsString('url', false);
                // const successRate = body.getParamAsNumber('success_rate', false);

                // Verify webhook exists and belongs to user
                const existingWebhook = await this.webhookRepository.findById(webhookId);
                if (!existingWebhook) {
                    throw new NotFoundError('Webhook not found');
                }

                if (existingWebhook.reporter_user_id !== reporterUserId) {
                    throw new ValidationError('Webhook does not belong to user');
                }

                // Build update data
                const updateData: UpdateReporterWebhookDto = {
                    updated_at: new Date().toISOString(),
                };

                if (name) {
                    updateData.name = name;
                }

                if (url) {
                    if (!urlRegex.test(url)) {
                        throw new ValidationError('Invalid URL format');
                    }
                    updateData.url = url;
                }

                const updatedWebhook = await this.webhookRepository.update(webhookId, updateData);

                return res.sendOKResponse({
                    success: true,
                    message: 'Webhook updated successfully',
                    webhook: updatedWebhook,
                });
            }

            case Command.DELETE: {
                const webhookId = body.getParamAsString('id', true);

                // Verify webhook exists and belongs to user
                const existingWebhook = await this.webhookRepository.findById(webhookId);
                if (!existingWebhook) {
                    throw new NotFoundError('Webhook not found');
                }

                if (existingWebhook.reporter_user_id !== reporterUserId) {
                    throw new ValidationError('Webhook does not belong to user');
                }

                await this.webhookRepository.softDelete(webhookId);

                return res.sendOKResponse({
                    success: true,
                    message: 'Webhook deleted successfully',
                });
            }

            default:
                return CheckNever(command);
        }
    };
}

export default new API();
