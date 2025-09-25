import ClentoAPI from '../../utils/apiUtil';
import { Request, Response } from 'express';
import { DisplayError, NotFoundError } from '../../errors/AppError';
import { CampaignService } from '../../services/CampaignService';
import { CreateCampaignDto, UpdateCampaignDto } from '../../dto/campaigns.dto';
import '../../utils/expressExtensions'; // Import extensions
import { StorageService } from '../../services/StorageService';

// Enums
enum EAction {
    action = "action",
    addStep = "addStep"
}

enum EWorkflowNodeType {
    profile_visit = 'profile_visit',
    like_post = 'like_post',
    follow_profile = 'follow_profile',
    comment_post = 'comment_post',
    send_invite = 'send_invite',
    send_followup = 'send_followup',
    withdraw_request = 'withdraw_request',
    send_inmail = 'send_inmail',
    follow_company = 'follow_company',
    send_connection_request = 'send_connection_request'
}

enum EPathType {
    accepted = 'accepted',
    not_accepted = 'not_accepted'
}

enum EMessageLength {
    short = 'short',
    medium = 'medium',
    long = 'long'
}

enum ETone {
    professional = 'professional',
    friendly = 'friendly',
    casual = 'casual',
    enthusiastic = 'enthusiastic',
    supportive = 'supportive',
    cold = 'cold',
    moderate = 'moderate',
    warm = 'warm'
}

enum ELanguage {
    english = 'english',
    spanish = 'spanish',
    french = 'french',
    german = 'german',
    portuguese = 'portuguese'
}

enum EFormality {
    casual = 'casual',
    approachable = 'approachable',
    professional = 'professional'
};
enum EApproach {
    direct = 'direct',
    diplomatic = 'diplomatic',
    indirect = 'indirect'
}

enum EFocus {
    personal = 'personal',
    relational = 'relational',
    business = 'business'
}
enum EIntention {
    networking = 'networking',
    partnership = 'partnership',
    collaboration = 'collaboration'
}
enum ECallToAction {
    strong = 'strong',
    confident = 'confident',
    subtle = 'subtle'
}
enum EPersonalization {
    specific = 'specific',
    generic = 'generic'
}


/**
 * Create Campaign API - Create new campaign endpoint
 */
class CreateCampaignAPI extends ClentoAPI {
    public path = '/api/campaigns/create';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private campaignService = new CampaignService();
    private storageService = new StorageService();
    private bucketName = 'campaign-flow';
    /**
     * Create new campaign
     */
    public POST = async (req: Request, res: Response): Promise<Response> => {
        try {
            const organizationId = req.organizationId;
            const userId = req.userId;
            const reqBody = req.getBody();

            const detail = reqBody.getParamAsNestedBody('detail', true);

            //   detail
            const name = detail.getParamAsString("name", true);
            const description = detail.getParamAsString("description", true);
            const senderAccount = detail.getParamAsString("senderAccount", true);
            const prospectList = detail.getParamAsString("prospectList", true);
            const startDate = detail.getParamAsString("startDate", true);
            const endDate = detail.getParamAsString("endDate", true);
            const startTime = detail.getParamAsString("startTime", true);
            const endTime = detail.getParamAsString("endTime", true);
            const timezone = detail.getParamAsString("timezone", true);

            //Flow
            const flow = reqBody.getParamAsNestedBody('flow', true);
            const nodesRaw = flow.getParamAsArrayOfNestedBodies('nodes', true);
            const edgesRaw = flow.getParamAsArrayOfNestedBodies('edges', true);

            // Nodes
            const nodes = nodesRaw.map(it => {
                //Positions
                const position = it.getParamAsNestedBody('position', true);
                const positionX = position.getParamAsString('x', true);
                const positionY = position.getParamAsString('y', true);

                //measured
                const measured = it.getParamAsNestedBody('measured', true);
                const measuredWidth = measured.getParamAsNumber("width", true);
                const measuredHeight = measured.getParamAsNumber("height", true);

                //data
                const data = it.getParamAsNestedBody('data', true)
                const type = data.getParamAsEnumValue(EWorkflowNodeType, 'type', false)
                const label = data.getParamAsString('label', false)
                const isConfigured = data.getParamAsBoolean('isConfigured', false)
                const pathType = data.getParamAsEnumValue(EPathType, 'pathType', false)
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
                    id: it.getParamAsString('id', true),
                    type: it.getParamAsEnumValue(EAction, 'type', true),
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
                    selected: it.getParamAsBoolean('selected', true),
                    deletable: it.getParamAsBoolean('deletable', false)
                }
            })

            const edges = edgesRaw.map(it => {
                const data = it.getParamAsNestedBody("data", true);
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
                    id: it.getParamAsString("id", true),
                    source: it.getParamAsString("source", true),
                    target: it.getParamAsString("target", true),
                    type: it.getParamAsString("type", true),
                    animated: it.getParamAsBoolean("animated", true),
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

            const campaignCreateDto: CreateCampaignDto = {
                organization_id: organizationId,
                name,
                description,
                sender_account: senderAccount,
                prospect_list: prospectList,
                start_date: startDate,
                end_date: endDate,
                start_time: startTime,
                end_time: endTime,
                timezone
            }

            const campaign = await this.campaignService.createCampaign(campaignCreateDto);
            const worflowJson = {
                nodes,
                edges
            }
            if (campaign) {
                await this.storageService.uploadJson(worflowJson, organizationId, `${campaign.id}.json`, this.bucketName);
            }else{
                throw new DisplayError("Error while creating the campaign")
            }

            const campaignUpdateDto: UpdateCampaignDto = {
                file_name: `${campaign.id}.json`,
                bucket: this.bucketName
            }
            
            await this.campaignService.updateCampaign(campaign.id, campaignUpdateDto);

            return res.sendOKResponse({
                message: 'Campaign created successfully',
            });
        } catch (error) {
            throw error;
        }
    };
}

export default new CreateCampaignAPI();
