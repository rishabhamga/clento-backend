import { Request, Response } from 'express';
import { DisplayError, ValidationError } from '../../../errors/AppError';
import { TemporalClientService } from '../../../temporal/services/temporal-client.service';
import { leadMonitorWorkflow } from '../../../temporal/workflows';
import ClentoAPI from '../../../utils/apiUtil';
import '../../../utils/expressExtensions';
import { CsvService } from '../../../services/CsvService';

class API extends ClentoAPI {
    public path = '/api/reporter/leads/monitor';
    public authType: 'REPORTER' = 'REPORTER';

    private temporalClient = TemporalClientService.getInstance();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        const reporterUserId = req.reporter?.id;
        const body = req.getBody();
        const linkedinUrl = body.getParamAsString('linkedin_url');

        const identifier = CsvService.extractLinkedInPublicIdentifier(linkedinUrl);
        if (!identifier) {
            throw new ValidationError('Invalid LinkedIn URL format');
        }

        try {
            await this.temporalClient.initialize();

            const workflowInput = {
                userId: reporterUserId,
                linkedinUrl: linkedinUrl,
            };
            const workflowId = `lead-monitor-${reporterUserId}-${identifier}-${Date.now()}`;

            const client = this.temporalClient.getClient();
            const handle = await client.workflow.start(leadMonitorWorkflow, {
                args: [workflowInput],
                taskQueue: 'lead-monitor-task-queue',
                workflowId,
            });

            return res.sendOKResponse({
                success: true,
                message: 'Lead monitoring workflow started',
                workflowId: handle.workflowId,
                runId: handle.firstExecutionRunId,
                linkedinUrl: linkedinUrl,
            });
        } catch (error: any) {
            throw new DisplayError(`Failed to start lead monitoring workflow: ${error.message}`);
        }
    };
}

export default new API();
