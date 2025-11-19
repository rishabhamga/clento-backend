import { CampaignStepResponseDto, CreateCampaignStepDto, UpdateCampaignStepDto } from '../dto/campaigns.dto';
import { DatabaseError } from '../errors/AppError';
import logger from '../utils/logger';
import { BaseRepository } from './BaseRepository';

export class CampaignStepRepository extends BaseRepository<CampaignStepResponseDto, CreateCampaignStepDto, UpdateCampaignStepDto> {
    constructor() {
        super('campaign_steps');
    }

    public async findByCampaignId(campaignId: string): Promise<CampaignStepResponseDto[]> {
        const { data, error } = await this.client.from(this.tableName).select('*').eq('campaign_id', campaignId).order('step_index', { ascending: true });
        if (error) throw error;
        return data as CampaignStepResponseDto[];
    }

    public async findByCampaignIdAndStepIndex(campaignId: string, stepIndex: number): Promise<CampaignStepResponseDto | null> {
        const { data, error } = await this.client.from(this.tableName).select('*').eq('campaign_id', campaignId).eq('step_index', stepIndex).single();
        if (error) throw error;
        return data as CampaignStepResponseDto;
    }

    public async getRecentCampaignStepsByOrgIdAndDays(organizationId: string, days: number): Promise<CampaignStepResponseDto[]> {
        const now = new Date();
        const daysAgo = new Date();
        daysAgo.setDate(now.getDate() - days);
        const { data, error } = await this.client.from(this.tableName).select('*').eq('organization_id', organizationId).gte('created_at', daysAgo.toISOString()).lte('created_at', now.toISOString()).order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    }

    public async getMostRecentStepsPerCampaign(organizationId: string, days: number) {
        const now = new Date();
        const daysAgo = new Date();
        daysAgo.setDate(now.getDate() - days);
        const { data, error } = await this.client.from(this.tableName).select('*, campaign_id').eq('organization_id', organizationId).gte('created_at', daysAgo.toISOString()).lte('created_at', now.toISOString()).order('step_index', { ascending: false }).order('created_at', { ascending: false }).limit(1000);

        if (error) {
            logger.error('Error fetching recent steps per campaign', { error, organizationId });
            throw new DatabaseError('Failed to fetch recent steps per campaign');
        }

        const uniqueCampaignSteps: Record<string, CampaignStepResponseDto> = {};

        if (data) {
            for (const step of data as CampaignStepResponseDto[]) {
                if (!uniqueCampaignSteps[step.campaign_id]) {
                    uniqueCampaignSteps[step.campaign_id] = step;
                }
            }
        }

        return uniqueCampaignSteps;
    }
}
