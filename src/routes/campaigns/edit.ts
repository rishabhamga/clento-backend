import ClentoAPI from '../../utils/apiUtil';
import { Request, Response } from 'express';
import { DisplayError, ForbiddenError, NotFoundError } from '../../errors/AppError';
import { CampaignService } from '../../services/CampaignService';
import { CreateCampaignDto, UpdateCampaignDto } from '../../dto/campaigns.dto';
import '../../utils/expressExtensions'; // Import extensions
import { StorageService } from '../../services/StorageService';
import { EAction, EApproach, ECallToAction, EFocus, EFormality, EIntention, ELanguage, EMessageLength, EPathType, EPersonalization, ETone, EWorkflowNodeType } from './create';

/**
 * Create Campaign API - Create new campaign endpoint
 */
class CreateCampaignAPI extends ClentoAPI {
    public path = '/api/campaigns/edit';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private campaignService = new CampaignService();
    private storageService = new StorageService();
    private bucketName = 'campaign-flow';
    /**
     * Create new campaign
     */
    public POST = async (req: Request, res: Response): Promise<Response> => {
        try {
            const reqBody = req.getBody();
            const organizationId = req.organizationId;
            const campaignId = reqBody.getParamAsString('campaignId');
            const campaignPrev = await this.campaignService.getCampaignById(campaignId);
            if(!campaignPrev){
                throw new NotFoundError('Campaign not found');
            }
            if(campaignPrev?.organization_id !== organizationId){
                throw new ForbiddenError('You are not allowed to edit this campaign');
            }
            const detail = reqBody.getParamAsNestedBody('detail');

            //   detail
            const name = detail.getParamAsString("name");
            const description = detail.getParamAsString("description");
            const senderAccount = detail.getParamAsString("senderAccount");
            const prospectList = detail.getParamAsString("prospectList");
            const startDate = detail.getParamAsString("startDate");
            const leadsPerDay = detail.getParamAsNumber("leadsPerDay");
            const startTime = detail.getParamAsString("startTime");
            const endTime = detail.getParamAsString("endTime");
            const timezone = detail.getParamAsString("timezone");

            //Flow
            const flow = reqBody.getParamAsNestedBody('flow');
            const nodesRaw = flow.getParamAsArrayOfNestedBodies('nodes');
            const edgesRaw = flow.getParamAsArrayOfNestedBodies('edges');

            // Nodes
            const nodes = nodesRaw.map(it => {
                //Positions
                const position = it.getParamAsNestedBody('position');
                const positionX = position.getParamAsString('x');
                const positionY = position.getParamAsString('y');

                //measured
                const measured = it.getParamAsNestedBody('measured');
                const measuredWidth = measured.getParamAsNumber("width");
                const measuredHeight = measured.getParamAsNumber("height");

                //data
                const data = it.getParamAsNestedBody('data')
                const type = data.getParamAsEnumValue(EWorkflowNodeType, 'type', false)
                const label = data.getParamAsString('label', false)
                const isConfigured = data.getParamAsBoolean('isConfigured', false)
                const pathType = data.getParamAsType<EPathType>('string', 'pathType', false)
                //Config
                const config = data.getParamAsNestedBody('config', false)
                let useAI, numberOfPosts, recentPostDays, configureWithAI, commentLength, tone, language, customGuidelines, customComment, customMessage, formality, approach, focus, intention, callToAction, personalization, engageWithRecentActivity, smartFollowups, aiWritingAssistant, messageLength, messagePurpose;
                if (config) {
                    useAI = config.getParamAsBoolean('useAI', false);
                    numberOfPosts = config.getParamAsNumber('numberOfPosts', false);
                    recentPostDays = config.getParamAsNumber('recentPostDays', false);
                    configureWithAI = config.getParamAsBoolean('configureWithAI', false);
                    commentLength = config.getParamAsEnumValue(EMessageLength, 'commentLength', false);
                    tone = config.getParamAsEnumValue(ETone, 'tone', false);
                    language = config.getParamAsEnumValue(ELanguage, 'language', false);
                    customGuidelines = config.getParamAsString('customGuidelines', false);
                    customComment = config.getParamAsString('customComment', false);
                    customMessage = config.getParamAsString('customMessage', false);
                    formality = config.getParamAsEnumValue(EFormality, 'formality', false);
                    approach = config.getParamAsEnumValue(EApproach, 'approach', false);
                    focus = config.getParamAsEnumValue(EFocus, 'focus', false);
                    intention = config.getParamAsEnumValue(EIntention, 'intention', false);
                    callToAction = config.getParamAsEnumValue(ECallToAction, 'callToAction', false);
                    personalization = config.getParamAsEnumValue(EPersonalization, 'personalization', false);
                    engageWithRecentActivity = config.getParamAsBoolean('engageWithRecentActivity', false);
                    smartFollowups = config.getParamAsBoolean('smartFollowups', false)
                    aiWritingAssistant = config.getParamAsBoolean('aiWritingAssistant', false)
                    messageLength = config.getParamAsEnumValue(EMessageLength, 'messageLength', false)
                    messagePurpose = config.getParamAsString('messagePurpose', false)
                }


                return {
                    id: it.getParamAsString('id'),
                    type: it.getParamAsEnumValue(EAction, 'type'),
                    position: {
                        x: positionX,
                        y: positionY
                    },
                    data: {
                        type,
                        label,
                        isConfigured,
                        pathType,
                        config: {
                            useAI,
                            numberOfPosts,
                            recentPostDays,
                            configureWithAI,
                            commentLength,
                            tone,
                            language,
                            customGuidelines,
                            customComment,
                            customMessage,
                            formality,
                            approach,
                            focus,
                            intention,
                            callToAction,
                            personalization,
                            engageWithRecentActivity,
                            smartFollowups,
                            aiWritingAssistant,
                            messageLength,
                            messagePurpose
                        }
                    },
                    measured: {
                        height: measuredHeight,
                        width: measuredWidth
                    },
                    selected: it.getParamAsBoolean('selected'),
                    deletable: it.getParamAsBoolean('deletable', false)
                }
            })

            const edges = edgesRaw.map(it => {
                const data = it.getParamAsNestedBody("data");
                const delay = data.getParamAsString("delay", false);
                const isPositive = data.getParamAsBoolean("isPositive", false);
                const isConditionalPath = data.getParamAsBoolean("isConditionalPath", false);
                // Delay Data
                const delayData = data.getParamAsNestedBody("delayData", false);
                let delayDataDelay, delayDataUnit;
                if (delayData) {
                    delayDataDelay = delayData.getParamAsString("delay", false);
                    delayDataUnit = delayData.getParamAsString("unit", false);
                }
                return {
                    id: it.getParamAsString("id"),
                    source: it.getParamAsString("source"),
                    target: it.getParamAsString("target"),
                    type: it.getParamAsString("type"),
                    animated: it.getParamAsBoolean("animated"),
                    selected: it.getParamAsBoolean("selected", false),
                    data: {
                        delay,
                        isPositive,
                        isConditionalPath,
                        delayData: {
                            delay: delayDataDelay,
                            unit: delayDataUnit
                        }
                    }
                }
            })

            const updateCampaignDto: UpdateCampaignDto = {
                name,
                description,
                sender_account: senderAccount,
                prospect_list: prospectList,
                start_date: startDate,
                leads_per_day: leadsPerDay,
                start_time: startTime,
                end_time: endTime,
                timezone
            }

            const campaign = await this.campaignService.updateCampaign(campaignId, updateCampaignDto);
            const worflowJson = {
                nodes,
                edges
            }
            if (campaign) {
                await this.storageService.uploadJson(worflowJson, organizationId, `${campaign.id}.json`, this.bucketName);
            }else{
                throw new DisplayError("Error while updating the campaign")
            }

            const campaignUpdateDto: UpdateCampaignDto = {
                file_name: `${campaign.id}.json`,
                bucket: this.bucketName
            }

            await this.campaignService.updateCampaign(campaignId, campaignUpdateDto);

            return res.sendOKResponse({
                message: 'Campaign Updated successfully',
            });
        } catch (error) {
            throw error;
        }
    };
}

export default new CreateCampaignAPI();
