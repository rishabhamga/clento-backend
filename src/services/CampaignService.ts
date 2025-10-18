import { CreateCampaignDto, CampaignResponseDto, UpdateCampaignDto, CreateCampaignStepDto, CampaignStepResponseDto } from '../dto/campaigns.dto';
import { BadRequestError, DisplayError, NotFoundError } from '../errors/AppError';
import { EWorkflowNodeType, WorkflowJson } from '../types/workflow.types';
import { StorageService } from './StorageService';
import { CampaignStepRepository } from '../repositories/CampaignStepRepository';
import { CampaignRepository } from '../repositories/CampaignRepository';

export class CampaignService {
    private storageService = new StorageService();
    private campaignStepRepository = new CampaignStepRepository();
    private campaignRepository = new CampaignRepository();
    /**
     * Create a new campaign
     */
    async createCampaign(
        campaignData: CreateCampaignDto
    ): Promise<CampaignResponseDto> {
        return this.campaignRepository.create(campaignData);
    }

    async updateCampaign(
        campaignId: string,
        campaignData: UpdateCampaignDto
    ): Promise<CampaignResponseDto> {
        return this.campaignRepository.update(campaignId, campaignData);
    }

    async deleteCampaign(
        campaignId: string
    ): Promise<void> {
        return this.campaignRepository.softDelete(campaignId);
    }

    async getCampaigns(organization_id: string): Promise<CampaignResponseDto[]> {
        try {
            return await this.campaignRepository.findByOrganizationId(organization_id);
        } catch (error) {
            throw new DisplayError("An Error Occured While Fetching Campaigns");
        }
    }
    async getRecentCampaigns(organization_id: string){
        try {
            const recentStepCampaigns = await this.campaignStepRepository.getMostRecentStepsPerCampaign(organization_id, 7)
            // Retrieves the campaign IDs from the recentStepCampaigns object and selects the first 5.
            const campaignIds = Object.keys(recentStepCampaigns).slice(0, 5);

            const campaigns = await this.campaignRepository.findByIdIn(campaignIds)

            return campaigns
        } catch (error) {
            throw new DisplayError("An Error Occured While Fetching Campaigns");
        }
    }
    async getCampaignById(campaignId: string): Promise<CampaignResponseDto | null> {
        try {
            return await this.campaignRepository.findById(campaignId);
        } catch (error) {
            throw new DisplayError("An Error Occured While Fetching Campaigns");
        }
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

    async createCampaignStep(campaignStep: CreateCampaignStepDto): Promise<CampaignStepResponseDto> {
        return this.campaignStepRepository.create(campaignStep);
    }
    async getCampaignSteps(campaignId: string): Promise<CampaignStepResponseDto[]> {
        return this.campaignStepRepository.findByCampaignId(campaignId);
    }
    async getRecentStats(organization_id: string, days: number){
        try {
            const recentSteps = await this.campaignStepRepository.getRecentCampaignStepsByOrgIdAndDays(organization_id, days)
            const stats ={
                success_rate: (recentSteps.filter(step => step.success).length * 100) / recentSteps.length,
                requests_sent: recentSteps.filter(step => step.type === EWorkflowNodeType.send_connection_request).length,
                total_steps: recentSteps.length
            }
            return stats
        } catch (error) {
            throw new DisplayError("An Error Occured While Fetching Campaigns");
        }
    }
}