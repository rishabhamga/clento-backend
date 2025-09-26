import ClentoAPI from '../../utils/apiUtil';
import { Request, Response } from 'express';
import { BadRequestError, DisplayError, ForbiddenError, NotFoundError } from '../../errors/AppError';
import { CampaignService } from '../../services/CampaignService';
import { CreateCampaignDto, UpdateCampaignDto } from '../../dto/campaigns.dto';
import '../../utils/expressExtensions'; // Import extensions
import { StorageService } from '../../services/StorageService';
import { LeadListService } from '../../services/LeadListService';
import { ConnectedAccountService } from '../../services/ConnectedAccountService';

/**
 * Campaigns API - Manage campaigns and download workflow files
 */
class CampaignsAPI extends ClentoAPI {
    public path = '/api/campaigns';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private campaignService = new CampaignService();
    private leadListService = new LeadListService();
    private connectedAccountService = new ConnectedAccountService();
    private storageService = new StorageService();
    /**
     * Get all campaigns for the organization
     */
    public GET = async (req: Request, res: Response): Promise<Response> => {
        const organization_id = req.organizationId;
        const campaigns = await this.campaignService.getCampaigns(organization_id);
        const leadsIds = campaigns.map(it => it.prospect_list).filter(it => it !== null);
        const senderIds = campaigns.map(it => it.sender_account).filter(it => it !== null);
        const sender_accountData = await this.connectedAccountService.getAccountsByIdIn(senderIds);
        const listData = await this.leadListService.getLeadListByIdIn(leadsIds);

        const campaignData = campaigns.map(it => {
            const list = listData.find(list => list.id === it.prospect_list);
            const sender = sender_accountData.find(sender => sender.id === it.sender_account);
            return {
                ...it,
                list_data: {
                    total: list?.total_leads,
                    name: list?.name
                },
                senderData: {
                    name: sender?.display_name,
                    profile_picture_url: sender?.profile_picture_url,
                    status: sender?.status,
                    provider: sender?.provider
                }
            }
        })

        return res.sendOKResponse({ campaigns: campaignData });
    };
    public POST = async (req: Request, res: Response): Promise<Response> => {
        try {
            const reqBody = req.getBody();
            const organizationId = req.organizationId;
            const campaignId = reqBody.getParamAsString('campaignId', true);

            const campaign = await this.campaignService.getCampaignById(campaignId);
            if(organizationId !==  campaign?.organization_id){
                throw new ForbiddenError('You are not allowed to access this campaign');
            }
            if (!campaign) {
                throw new NotFoundError('Campaign not found');
            }

            if (!campaign.file_name || !campaign.bucket) {
                throw new BadRequestError('Campaign workflow file not found');
            }
            if(campaign.is_deleted){
                throw new NotFoundError('Campaign not found');
            }

            // Download the workflow file as buffer
            const file = await this.storageService.downloadFileAsBuffer(
                organizationId,
                campaign.id,
                campaign.file_name,
                campaign.bucket,
                `workflows/${organizationId}/${campaign.file_name}`
            );

            // Parse the JSON workflow data
            const fileString = file.buffer.toString('utf8');
            const workflowData = JSON.parse(fileString);


            return res.sendOKResponse({
                campaign,
                workflow: workflowData,
                fileMetadata: file.metadata
            });
        } catch (error) {
            throw error;
        }
    }
}

export default new CampaignsAPI();