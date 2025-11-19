import ClentoAPI from '../../utils/apiUtil';
import { LeadListService } from '../../services/LeadListService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import '../../utils/expressExtensions';
import { LeadService } from '../../services/LeadService';
import { CampaignStepRepository } from '../../repositories/CampaignStepRepository';

class LeadListDetailAPI extends ClentoAPI {
    public path = '/api/leads';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private leadService = new LeadService();
    private campaignStepRepository = new CampaignStepRepository();

    public GET = async (req: Request, res: Response): Promise<Response> => {
        try {
            const orgId = req.organization.id;
            const recentLeads = await this.leadService.getRecentLeads(orgId);
            const leadIds = recentLeads.data.map(it => it.id);

            const leadSteps = await this.campaignStepRepository.findByIdIn(leadIds);
            const finalLeads = recentLeads.data.map(it => ({
                id: it.id,
                full_name: it.full_name,
                email: it.email,
                phone: it.phone,
                title: it.title,
                company: it.company,
                industry: it.industry,
                location: it.location,
                linkedin_url: it.linkedin_url,
                status: it.status,
                steps: leadSteps.filter(step => step.lead_id === it.id).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
            }));

            return res.sendOKResponse({
                success: true,
                recentLeads: finalLeads,
                message: 'Lead list retrieved successfully',
            });
        } catch (error) {
            throw error;
        }
    };
}

export default new LeadListDetailAPI();
