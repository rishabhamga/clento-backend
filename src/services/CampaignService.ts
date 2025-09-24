import { supabaseAdmin } from '../config/supabase';

export interface CreateCampaignDto {
  name: string;
  description?: string;
  leadListId: string;
  settings?: any;
  scheduledAt?: Date;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  leadListId: string;
  organizationId: string;
  userId: string;
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';
  settings?: any;
  scheduledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class CampaignService    {
  /**
   * Create a new campaign
   */
  async createCampaign(
    campaignData: CreateCampaignDto,
    organizationId: string,
    userId: string
  ): Promise<Campaign> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }

    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .insert({
        name: campaignData.name,
        description: campaignData.description || null,
        lead_list_id: campaignData.leadListId,
        organization_id: organizationId,
        user_id: userId,
        status: 'draft',
        settings: campaignData.settings || null,
        scheduled_at: campaignData.scheduledAt || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create campaign: ${error.message}`);
    }

    return data;
  }
}