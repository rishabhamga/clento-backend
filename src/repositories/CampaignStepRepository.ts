import { CampaignStepResponseDto, CreateCampaignStepDto, UpdateCampaignStepDto } from "../dto/campaigns.dto";
import { DatabaseError } from "../errors/AppError";
import logger from "../utils/logger";
import { BaseRepository } from "./BaseRepository";

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
}