import { supabaseAdmin } from '../config/supabase';
import { CreateCampaignDto, CampaignResponseDto, UpdateCampaignDto } from '../dto/campaigns.dto';
import { BadRequestError, DisplayError, NotFoundError } from '../errors/AppError';
import { WorkflowJson } from '../types/workflow.types';
import { StorageService } from './StorageService';

export class CampaignService {
    private storageService = new StorageService();
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

        if (!data) {
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

        if (!data) {
            return null;
        }

        return data;
    }
    async getWorkflow(campaign: CampaignResponseDto) {
        // Download the workflow file as buffer
        if (!campaign.organization_id) {
            throw new DisplayError("Cannot Make a Workflow without Organization id")
        }
        if (!campaign.file_name || !campaign.bucket) {
            throw new BadRequestError('Campaign workflow file not found');
        }
        if (campaign.is_deleted) {
            throw new NotFoundError('Campaign not found');
        }
        const file = await this.storageService.downloadFileAsBuffer(
            campaign.organization_id,
            campaign.id,
            campaign.file_name,
            campaign.bucket,
            `workflows/${campaign.organization_id}/${campaign.file_name}`
        );

        // Parse the JSON workflow data
        const fileString = file.buffer.toString('utf8');
        const workflowData: WorkflowJson = JSON.parse(fileString);
        return { workflowData, file }
    }
}