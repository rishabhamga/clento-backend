export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          clerk_id: string;
          email: string;
          full_name: string | null;
          company_name: string | null;
          website_url: string | null;
          smartlead_org_id: string | null;
          smartlead_org_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clerk_id: string;
          email: string;
          full_name?: string | null;
          company_name?: string | null;
          website_url?: string | null;
          smartlead_org_id?: string | null;
          smartlead_org_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clerk_id?: string;
          email?: string;
          full_name?: string | null;
          company_name?: string | null;
          website_url?: string | null;
          smartlead_org_id?: string | null;
          smartlead_org_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_profile: {
        Row: {
          user_id: string;
          company_name: string | null;
          website_url: string | null;
          site_summary: string | null;
          icp: Record<string, unknown>;
          linkedin_connected: boolean;
          completed: boolean;
          updated_at: string;
          onboarding_completed: boolean;
          onboarding_step_completed: Record<string, unknown>;
          linkedin_accounts_connected: number;
          organization_id: string | null;
        };
        Insert: {
          user_id: string;
          company_name?: string | null;
          website_url?: string | null;
          site_summary?: string | null;
          icp?: Record<string, unknown>;
          linkedin_connected?: boolean;
          completed?: boolean;
          updated_at?: string;
          onboarding_completed?: boolean;
          onboarding_step_completed?: Record<string, unknown>;
          linkedin_accounts_connected?: number;
          organization_id?: string | null;
        };
        Update: {
          user_id?: string;
          company_name?: string | null;
          website_url?: string | null;
          site_summary?: string | null;
          icp?: Record<string, unknown>;
          linkedin_connected?: boolean;
          completed?: boolean;
          updated_at?: string;
          onboarding_completed?: boolean;
          onboarding_step_completed?: Record<string, unknown>;
          linkedin_accounts_connected?: number;
          organization_id?: string | null;
        };
      };
      organizations: {
        Row: {
          id: string;
          clerk_org_id: string;
          name: string;
          slug: string | null;
          logo_url: string | null;
          website_url: string | null;
          industry: string | null;
          company_size: string | null;
          plan: string;
          billing_email: string | null;
          subscription_status: string;
          monthly_campaign_limit: number;
          monthly_lead_limit: number;
          user_limit: number;
          settings: Record<string, unknown>;
          created_at: string;
          updated_at: string;
          permissible_seats: number;
        };
        Insert: {
          id?: string;
          clerk_org_id: string;
          name: string;
          slug?: string | null;
          logo_url?: string | null;
          website_url?: string | null;
          industry?: string | null;
          company_size?: string | null;
          plan?: string;
          billing_email?: string | null;
          subscription_status?: string;
          monthly_campaign_limit?: number;
          monthly_lead_limit?: number;
          user_limit?: number;
          settings?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
          permissible_seats?: number;
        };
        Update: {
          id?: string;
          clerk_org_id?: string;
          name?: string;
          slug?: string | null;
          logo_url?: string | null;
          website_url?: string | null;
          industry?: string | null;
          company_size?: string | null;
          plan?: string;
          billing_email?: string | null;
          subscription_status?: string;
          monthly_campaign_limit?: number;
          monthly_lead_limit?: number;
          user_limit?: number;
          settings?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
          permissible_seats?: number;
        };
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: string;
          permissions: Record<string, unknown>;
          status: string;
          invited_by: string | null;
          invited_at: string | null;
          joined_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: string;
          permissions?: Record<string, unknown>;
          status?: string;
          invited_by?: string | null;
          invited_at?: string | null;
          joined_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: string;
          permissions?: Record<string, unknown>;
          status?: string;
          invited_by?: string | null;
          invited_at?: string | null;
          joined_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
