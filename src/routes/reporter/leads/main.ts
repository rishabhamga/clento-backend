import { Request, Response } from 'express';
import { DisplayError, NotFoundError, ValidationError } from '../../../errors/AppError';
import { ReporterLeadService } from '../../../services/ReporterLeadService';
import { ReporterLeadMonitorService } from '../../../services/ReporterLeadMonitorService';
import { ReporterLeadRepository } from '../../../repositories/reporterRepositories/LeadRepository';
import ClentoAPI, { CheckNever } from '../../../utils/apiUtil';
import '../../../utils/expressExtensions';
import { CreateReporterLeadDto } from '../../../dto/reporterDtos/leads.dto';

enum ECommand {
    UPLOAD = 'UPLOAD',
    DELETE = 'DELETE',
    PAUSE = 'PAUSE',
    RESUME = 'RESUME',
}

class API extends ClentoAPI {
    public path = '/api/reporter/leads';
    public authType: 'REPORTER' = 'REPORTER';

    private leadService = new ReporterLeadService();
    private monitorService = new ReporterLeadMonitorService();
    private leadRepository = new ReporterLeadRepository();

    private handlePauseCampaign = async (req: Request, res: Response) => {
        const userId = req.reporter?.id;

        const body = req.getBody();
        const leadId = body.getParamAsString('leadId');

        // Verify lead exists and belongs to user
        const lead = await this.leadRepository.findById(leadId);
        if (!lead) {
            throw new NotFoundError('Lead not found');
        }

        if (lead.user_id !== userId) {
            throw new ValidationError('Lead does not belong to user');
        }

        try {
            await this.monitorService.pauseMonitoring(leadId, userId);

            return res.sendOKResponse({
                success: true,
                message: 'Lead monitoring paused successfully',
                leadId,
            });
        } catch (error: any) {
            throw new DisplayError(`Failed to pause lead monitoring: ${error.message}`);
        }
    };

    private handleResumeCampaign = async (req: Request, res: Response) => {
        const userId = req.reporter?.id;
        if (!userId) {
            throw new ValidationError('User ID is required');
        }

        const body = req.getBody();
        const leadId = body.getParamAsString('leadId', true);

        const lead = await this.leadRepository.findById(leadId);
        if (!lead) {
            throw new NotFoundError('Lead not found');
        }

        if (lead.user_id !== userId) {
            throw new ValidationError('Lead does not belong to user');
        }

        try {
            await this.monitorService.resumeMonitoring(leadId, userId);

            return res.sendOKResponse({
                success: true,
                message: 'Lead monitoring resumed successfully',
                leadId,
            });
        } catch (error: any) {
            throw new DisplayError(`Failed to resume lead monitoring: ${error.message}`);
        }
    };

    public GET = async (req: Request, res: Response) => {
        const userId = req.reporter.id;

        const leads = await this.leadRepository.getUserLeads(userId);

        const leadsWithStatus = await leads.mapAsyncOneByOne(async lead => {
            const status = await this.monitorService.getMonitoringStatus(lead.id);
            return {
                ...lead,
                status,
            };
        });

        return res.sendOKResponse({
            success: true,
            message: 'Leads fetched successfully',
            leads: leadsWithStatus,
        });
    };

    public POST = async (req: Request, res: Response) => {
        const reqBody = req.getBody();
        const userId = req.reporter.id;
        const command = reqBody.getParamAsEnumValue(ECommand, 'command');

        switch (command) {
            case ECommand.UPLOAD:
                const urls = reqBody.getParamAsStringArray('linkedin_urls');

                const leads: CreateReporterLeadDto[] = urls.map(url => ({
                    user_id: userId,
                    linkedin_url: url,
                    full_name: null,
                    profile_image_url: null,
                    headline: null,
                    location: null,
                    last_job_title: null,
                    last_company_name: null,
                    last_company_id: null,
                }));
                this.leadRepository.bulkCreate(leads);
                return res.sendOKResponse({
                    success: true,
                    message: 'Leads uploaded successfully',
                    data: leads,
                });
            case ECommand.DELETE:
                throw new DisplayError('Deleting leads is not allowed for now');
            case ECommand.PAUSE:
                return await this.handlePauseCampaign(req, res);
            case ECommand.RESUME:
                return await this.handleResumeCampaign(req, res);
            default:
                CheckNever(command);
        }

        return res.sendOKResponse({});
    };
}

export default new API();
