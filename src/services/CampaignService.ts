import { supabaseAdmin } from '../config/supabase';
import { CreateCampaignDto, CampaignResponseDto, UpdateCampaignDto } from '../dto/campaigns.dto';
import { DisplayError } from '../errors/AppError';

export class CampaignService {
    /**
     * Create a new campaign
     */
    async createCampaign(
        campaignData: CreateCampaignDto
    ): Promise<CampaignResponseDto> {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not initialized');
        }

        const { data, error } = await supabaseAdmin
            .from('campaigns')
            .insert(campaignData)
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to create campaign: ${error.message}`);
        }

        return data;
    }

    async updateCampaign(
        campaignId: string,
        campaignData: UpdateCampaignDto
    ): Promise<CampaignResponseDto> {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not initialized');
        }

        const { data, error } = await supabaseAdmin
            .from('campaigns')
            .update(campaignData)
            .eq('id', campaignId)
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to update campaign: ${error.message}`);
        }

        return data;
    }

    async deleteCampaign(
        campaignId: string
    ): Promise<void> {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not initialized');
        }
        const { error } = await supabaseAdmin
            .from('campaigns')
            .update({ is_deleted: true })
            .eq('id', campaignId);
        if (error) {
            throw new Error(`Failed to delete campaign: ${error.message}`);
        }
    }

    async getCampaigns(organization_id: string): Promise<CampaignResponseDto[]> {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not initialized');
        }
        const { data, error } = await supabaseAdmin
            .from('campaigns')
            .select('*')
            .eq('organization_id', organization_id)
            .neq('is_deleted', true)
            .order('created_at', { ascending: false });

        if (error) {
            throw new DisplayError("An Error Occured While Fetching Campaigns");
        }

        if(!data){
            return [];
        }

        return data;
    }
    async getCampaignById(campaignId: string): Promise<CampaignResponseDto | null> {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not initialized');
        }
        const { data, error } = await supabaseAdmin
            .from('campaigns')
            .select('*')
            .eq('id', campaignId).single();

        if (error) {
            throw new DisplayError("An Error Occured While Fetching Campaigns");
        }

        if(!data){
            return null;
        }

        return data;
    }
}