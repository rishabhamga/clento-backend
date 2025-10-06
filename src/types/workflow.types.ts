// Workflow Types
export enum EAction {
    action = "action",
    addStep = "addStep"
}

export enum EWorkflowNodeType {
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

export type EPathType = 'accepted' | 'not-accepted'

export enum EMessageLength {
    short = 'short',
    medium = 'medium',
    long = 'long'
}

export enum ETone {
    professional = 'professional',
    friendly = 'friendly',
    casual = 'casual',
    enthusiastic = 'enthusiastic',
    supportive = 'supportive',
    cold = 'cold',
    moderate = 'moderate',
    warm = 'warm'
}

export enum ELanguage {
    english = 'english',
    spanish = 'spanish',
    french = 'french',
    german = 'german',
    portuguese = 'portuguese'
}

export enum EFormality {
    casual = 'casual',
    approachable = 'approachable',
    professional = 'professional'
}

export enum EApproach {
    direct = 'direct',
    diplomatic = 'diplomatic',
    indirect = 'indirect'
}

export enum EFocus {
    personal = 'personal',
    relational = 'relational',
    business = 'business'
}

export enum EIntention {
    networking = 'networking',
    partnership = 'partnership',
    collaboration = 'collaboration'
}

export enum ECallToAction {
    strong = 'strong',
    confident = 'confident',
    subtle = 'subtle'
}

export enum EPersonalization {
    specific = 'specific',
    generic = 'generic'
}

// Workflow Structure Types
export interface WorkflowPosition {
    x: string;
    y: string;
}

export interface WorkflowMeasured {
    width: number;
    height: number;
}

export interface WorkflowNodeConfig {
    useAI?: boolean | null;
    numberOfPosts?: number | null;
    recentPostDays?: number | null;
    configureWithAI?: boolean | null;
    commentLength?: EMessageLength | null;
    tone?: ETone | null;
    language?: ELanguage | null;
    customGuidelines?: string | null;
    customComment?: string | null;
    customMessage?: string | null;
    formality?: EFormality | null;
    approach?: EApproach | null;
    focus?: EFocus | null;
    intention?: EIntention | null;
    callToAction?: ECallToAction | null;
    personalization?: EPersonalization | null;
    engageWithRecentActivity?: boolean | null;
    smartFollowups?: boolean | null;
    aiWritingAssistant?: boolean | null;
    messageLength?: EMessageLength | null;
    messagePurpose?: string | null;
}

export interface WorkflowNodeData {
    type?: EWorkflowNodeType | null;
    label?: string | null;
    isConfigured?: boolean | null;
    pathType?: EPathType | null;
    config?: WorkflowNodeConfig;
}

export interface WorkflowNode {
    id: string;
    type: EAction;
    position: WorkflowPosition;
    data: WorkflowNodeData;
    measured: WorkflowMeasured;
    selected: boolean;
    deletable?: boolean | null;
}

export interface WorkflowEdgeDelayData {
    delay?: string | null;
    unit?: string | null;
}

export interface WorkflowEdgeData {
    delay?: string | null;
    isPositive?: boolean | null;
    isConditionalPath?: boolean | null;
    delayData?: WorkflowEdgeDelayData;
}

export interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    type: string;
    animated: boolean;
    selected?: boolean | null;
    data: WorkflowEdgeData;
}

export interface WorkflowJson {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
}

export const WORKFLOW_TYPES = {
    CAMPAIGN_ORCHESTRATOR: 'CampaignOrchestratorWorkflow',
    LEAD_OUTREACH: 'LeadOutreachWorkflow',
} as const;