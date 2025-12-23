import { Request, Response } from 'express';
import ClentoAPI from '../../utils/apiUtil';
import { ReporterLeadAlertRepository } from '../../repositories/reporterRepositories/LeadAlertRepository';
import { EAlertPriority } from '../../dto/reporterDtos/leadAlerts.dto';
import { ReporterLeadRepository } from '../../repositories/reporterRepositories/LeadRepository';

class API extends ClentoAPI {
    public path = '/api/reporter/alerts';
    public authType: 'REPORTER' = 'REPORTER';

    private alertRepository = new ReporterLeadAlertRepository();
    private leadRepository = new ReporterLeadRepository();

    public GET = async (req: Request, res: Response) => {
        const userId = req.reporter.id;
        const query = req.getQuery();
        const page = query.getParamAsNumber('page', false);
        const limit = query.getParamAsNumber('limit', false);
        const acknowledged = query.getParamAsBoolean('acknowledged', false);
        const priority = query.getParamAsEnumValue(EAlertPriority, 'priority', false);
        const leadId = query.getParamAsString('leadId', false);

        const result = await this.alertRepository.getUserAlertsPaginated(userId, page ?? 1, limit ?? 20, acknowledged, priority, leadId);

        const leadIds = result.alerts.map(it => it.lead_id);
        const leads = await this.leadRepository.findByIdIn(leadIds);

        const alertsWithLeads = result.alerts.map(it => {
            const lead = leads.find(lead => lead.id === it.lead_id);
            return {
                ...it,
                leadName: lead?.full_name || 'Unknown',
                linkedinUrl: lead?.linkedin_url,
            };
        });

        return res.sendOKResponse({
            alerts: alertsWithLeads,
            pagination: {
                page: result.page,
                limit: result.limit,
                count: result.count,
                total_pages: result.total_pages,
                has_more: result.has_more,
            },
        });
    };
}

export default new API();
