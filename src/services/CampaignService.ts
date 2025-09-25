import { supabaseAdmin } from '../config/supabase';
import {CreateCampaignDto, CampaignResponseDto, UpdateCampaignDto} from '../dto/campaigns.dto';

export class CampaignService    {
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
}