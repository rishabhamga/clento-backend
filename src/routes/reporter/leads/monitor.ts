import { Request, Response } from 'express';
import { DisplayError, NotFoundError, ValidationError } from '../../../errors/AppError';
import { ReporterLeadMonitorService } from '../../../services/ReporterLeadMonitorService';
import { ReporterLeadRepository } from '../../../repositories/reporterRepositories/LeadRepository';
import ClentoAPI from '../../../utils/apiUtil';
import '../../../utils/expressExtensions';

class API extends ClentoAPI {
    public path = '/api/reporter/leads/monitor';
    public authType: 'REPORTER' = 'REPORTER';

    private monitorService = new ReporterLeadMonitorService();
    private leadRepository = new ReporterLeadRepository();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        const reporterUserId = req.reporter?.id;
        if (!reporterUserId) {
            throw new ValidationError('User ID is required');
        }

        const body = req.getBody();
        const leadId = body.getParamAsString('leadId');

        // Verify lead exists and belongs to user
        const lead = await this.leadRepository.findById(leadId);
        if (!lead) {
            throw new NotFoundError('Lead not found');
        }

        if (lead.user_id !== reporterUserId) {
            throw new ValidationError('Lead does not belong to user');
        }

        try {
            const result = await this.monitorService.startMonitoring({ leadId });

            return res.sendOKResponse({
                success: true,
                message: 'Lead monitoring workflow started',
                workflowId: result.workflowId,
                runId: result.runId,
                leadId,
            });
        } catch (error: any) {
            throw new DisplayError(`Failed to start lead monitoring workflow: ${error.message}`);
        }
    };
}

export default new API();
