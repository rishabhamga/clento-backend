import { Request, Response } from 'express';
import { DisplayError, NotFoundError } from '../../../errors/AppError';
import { ReporterLeadService } from '../../../services/ReporterLeadService';
import { ReporterLeadMonitorService } from '../../../services/ReporterLeadMonitorService';
import { ReporterLeadRepository } from '../../../repositories/reporterRepositories/LeadRepository';
import ClentoAPI from '../../../utils/apiUtil';
import '../../../utils/expressExtensions';

class API extends ClentoAPI {
    public path = '/api/reporter/leads';
    public authType: 'REPORTER' = 'REPORTER';

    private leadService = new ReporterLeadService();
    private monitorService = new ReporterLeadMonitorService();
    private leadRepository = new ReporterLeadRepository();

    /**
     * GET /api/reporter/leads
     * Get all leads for the authenticated user
     */
    public GET = async (req: Request, res: Response): Promise<Response> => {
        const reporterUserId = req.reporter?.id;
        if (!reporterUserId) {
            throw new DisplayError('Authentication required');
        }

        try {
            const leads = await this.leadService.getUserLeads(reporterUserId);

            // Optionally get monitoring status for each lead
            const leadsWithStatus = await Promise.all(
                leads.map(async (lead: any) => {
                    const status = await this.monitorService.getMonitoringStatus(lead.id);
                    return {
                        ...lead,
                        monitoring: status,
                    };
                })
            );

            return res.sendOKResponse({
                success: true,
                leads: leadsWithStatus,
                count: leadsWithStatus.length,
            });
        } catch (error) {
            throw new DisplayError('Failed to get leads');
        }
    };

    /**
     * DELETE /api/reporter/leads
     * Delete a lead and stop monitoring
     * Query params:
     * - id: string (required) - Lead ID to delete
     */
    public DELETE = async (req: Request, res: Response): Promise<Response> => {
        const reporterUserId = req.reporter?.id;
        if (!reporterUserId) {
            throw new DisplayError('Authentication required');
        }

        const query = req.getQuery();
        const leadId = query.getParamAsString('id', true);

        try {
            // Verify lead exists and user has access
            await this.leadService.getLeadById(leadId, reporterUserId);

            // Stop monitoring first
            await this.monitorService.stopMonitoring(leadId);

            // Delete the lead
            await this.leadRepository.delete(leadId);

            return res.sendOKResponse({
                success: true,
                message: 'Lead deleted and monitoring stopped',
            });
        } catch (error: any) {
            if (error instanceof NotFoundError) {
                throw error;
            }
            throw new DisplayError('Failed to delete lead');
        }
    };
}

export default new API();
