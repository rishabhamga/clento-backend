import { Request, Response } from 'express';
import { DisplayError, NotFoundError, ValidationError } from '../../../errors/AppError';
import { ReporterCompanyMonitorService } from '../../../services/ReporterCompanyMonitorService';
import { ReporterCompanyLeadRepository } from '../../../repositories/reporterRepositories/CompanyRepository';
import ClentoAPI from '../../../utils/apiUtil';
import '../../../utils/expressExtensions';

class API extends ClentoAPI {
    public path = '/api/reporter/companies/monitor';
    public authType: 'REPORTER' = 'REPORTER';

    private monitorService = new ReporterCompanyMonitorService();
    private companyRepository = new ReporterCompanyLeadRepository();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        const reporterUserId = req.reporter?.id;
        if (!reporterUserId) {
            throw new ValidationError('User ID is required');
        }

        const body = req.getBody();
        const companyId = body.getParamAsString('companyId');

        // Verify company exists and belongs to user
        const company = await this.companyRepository.findById(companyId);
        if (!company) {
            throw new NotFoundError('Company not found');
        }

        if (company.user_id !== reporterUserId) {
            throw new ValidationError('Company does not belong to user');
        }

        try {
            const result = await this.monitorService.startMonitoring({ companyId });

            return res.sendOKResponse({
                success: true,
                message: 'Company monitoring workflow started',
                workflowId: result.workflowId,
                runId: result.runId,
                companyId,
            });
        } catch (error: any) {
            throw new DisplayError(`Failed to start company monitoring workflow: ${error.message}`);
        }
    };
}

export default new API();
