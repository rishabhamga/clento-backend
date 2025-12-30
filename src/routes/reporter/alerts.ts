import { Request, Response } from 'express';
import ClentoAPI from '../../utils/apiUtil';
import { ReporterLeadAlertRepository } from '../../repositories/reporterRepositories/LeadAlertRepository';
import { EAlertPriority } from '../../dto/reporterDtos/leadAlerts.dto';
import { ReporterLeadRepository } from '../../repositories/reporterRepositories/LeadRepository';
import { ReporterCompanyLeadRepository } from '../../repositories/reporterRepositories/CompanyRepository';

class API extends ClentoAPI {
    public path = '/api/reporter/alerts';
    public authType: 'REPORTER' = 'REPORTER';

    private alertRepository = new ReporterLeadAlertRepository();
    private leadRepository = new ReporterLeadRepository();
    private companyLeadRepository = new ReporterCompanyLeadRepository();

    public GET = async (req: Request, res: Response) => {
        const userId = req.reporter.id;
        const query = req.getQuery();
        const page = query.getParamAsNumber('page', false);
        const limit = query.getParamAsNumber('limit', false);
        const acknowledged = query.getParamAsBoolean('acknowledged', false);
        const priority = query.getParamAsEnumValue(EAlertPriority, 'priority', false);
        const leadId = query.getParamAsString('leadId', false);
        const onlyHighPriorityAlerts = query.getParamAsBoolean('highAlerts', false);

        if (onlyHighPriorityAlerts) {
            const result = await this.alertRepository.hasHighAlerts(userId);
            return res.sendOKResponse(result);
        }

        const result = await this.alertRepository.getUserAlertsPaginated(userId, page ?? 1, limit ?? 20, acknowledged, priority, leadId);

        const leadIds = result.alerts.map(it => it.lead_id);
        const leads = await this.leadRepository.findByIdIn(leadIds);
        const companyLeads = await this.companyLeadRepository.findByIdIn(leadIds);

        const leadMap = new Map(leads.map((lead: any) => [lead.id, lead]));
        const companyLeadMap = new Map(companyLeads.map((company: any) => [company.id, company]));

        const alertsWithLeads = result.alerts.map(it => {
            const lead = leadMap.get(it.lead_id) || null;
            const company = companyLeadMap.get(it.lead_id) || null;
            return {
                ...it,
                leadName: lead?.full_name || company?.name || 'Unknown',
                linkedinUrl: lead?.linkedin_url || company?.linkedin_url,
            };
        });

        return res.sendOKResponse({
            alerts: alertsWithLeads.map(it => ({
                id: it.id,
                title: it.title,
                description: it.description,
                priority: it.priority,
                created_at: it.created_at,
                leadName: it.leadName,
                linkedinUrl: it.linkedinUrl,
            })),
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
