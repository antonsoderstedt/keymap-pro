export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      action_items: {
        Row: {
          baseline_metrics: Json | null
          category: string
          created_at: string
          description: string | null
          due_date: string | null
          expected_impact: string | null
          id: string
          implementation_notes: string | null
          implemented_at: string | null
          implemented_by: string | null
          priority: string
          project_id: string
          source_id: string | null
          source_payload: Json | null
          source_type: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          baseline_metrics?: Json | null
          category?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          expected_impact?: string | null
          id?: string
          implementation_notes?: string | null
          implemented_at?: string | null
          implemented_by?: string | null
          priority?: string
          project_id: string
          source_id?: string | null
          source_payload?: Json | null
          source_type?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          baseline_metrics?: Json | null
          category?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          expected_impact?: string | null
          id?: string
          implementation_notes?: string | null
          implemented_at?: string | null
          implemented_by?: string | null
          priority?: string
          project_id?: string
          source_id?: string | null
          source_payload?: Json | null
          source_type?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      action_outcomes: {
        Row: {
          action_id: string
          baseline_value: number | null
          confidence: string | null
          current_value: number | null
          days_after_implementation: number
          delta: number | null
          delta_pct: number | null
          id: string
          measured_at: string
          metric_name: string
          notes: string | null
        }
        Insert: {
          action_id: string
          baseline_value?: number | null
          confidence?: string | null
          current_value?: number | null
          days_after_implementation: number
          delta?: number | null
          delta_pct?: number | null
          id?: string
          measured_at?: string
          metric_name: string
          notes?: string | null
        }
        Update: {
          action_id?: string
          baseline_value?: number | null
          confidence?: string | null
          current_value?: number | null
          days_after_implementation?: number
          delta?: number | null
          delta_pct?: number | null
          id?: string
          measured_at?: string
          metric_name?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_outcomes_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "action_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_drafts: {
        Row: {
          ad_group: string
          analysis_id: string
          created_at: string
          id: string
          payload: Json
        }
        Insert: {
          ad_group: string
          analysis_id: string
          created_at?: string
          id?: string
          payload: Json
        }
        Update: {
          ad_group?: string
          analysis_id?: string
          created_at?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      alerts: {
        Row: {
          category: string
          created_at: string
          expected_impact: string | null
          id: string
          message: string
          payload: Json | null
          project_id: string
          resolved_at: string | null
          severity: string
          status: string
          suggested_action: string | null
          title: string
          type: string
        }
        Insert: {
          category?: string
          created_at?: string
          expected_impact?: string | null
          id?: string
          message: string
          payload?: Json | null
          project_id: string
          resolved_at?: string | null
          severity?: string
          status?: string
          suggested_action?: string | null
          title: string
          type: string
        }
        Update: {
          category?: string
          created_at?: string
          expected_impact?: string | null
          id?: string
          message?: string
          payload?: Json | null
          project_id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          suggested_action?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      analyses: {
        Row: {
          created_at: string
          id: string
          keyword_universe_json: Json | null
          options: Json
          project_id: string
          result_json: Json | null
          scan_data_json: Json | null
          universe_scale: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          keyword_universe_json?: Json | null
          options?: Json
          project_id: string
          result_json?: Json | null
          scan_data_json?: Json | null
          universe_scale?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          keyword_universe_json?: Json | null
          options?: Json
          project_id?: string
          result_json?: Json | null
          scan_data_json?: Json | null
          universe_scale?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analyses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_jobs: {
        Row: {
          analysis_id: string | null
          completed_at: string | null
          created_at: string
          current_step: string | null
          error_message: string | null
          id: string
          job_type: string
          payload: Json | null
          progress_pct: number
          project_id: string
          started_at: string | null
          status: string
          steps: Json
          updated_at: string
        }
        Insert: {
          analysis_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          id?: string
          job_type: string
          payload?: Json | null
          progress_pct?: number
          project_id: string
          started_at?: string | null
          status?: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          analysis_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          id?: string
          job_type?: string
          payload?: Json | null
          progress_pct?: number
          project_id?: string
          started_at?: string | null
          status?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_insights_snapshots: {
        Row: {
          campaign: string | null
          created_at: string
          end_date: string
          id: string
          project_id: string
          rows: Json
          start_date: string
        }
        Insert: {
          campaign?: string | null
          created_at?: string
          end_date: string
          id?: string
          project_id: string
          rows?: Json
          start_date: string
        }
        Update: {
          campaign?: string | null
          created_at?: string
          end_date?: string
          id?: string
          project_id?: string
          rows?: Json
          start_date?: string
        }
        Relationships: []
      }
      audit_findings: {
        Row: {
          affected_url: string | null
          baseline_metrics: Json | null
          category: string
          created_at: string
          description: string | null
          id: string
          project_id: string
          recommendation: string | null
          resolved_at: string | null
          run_id: string
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_url?: string | null
          baseline_metrics?: Json | null
          category: string
          created_at?: string
          description?: string | null
          id?: string
          project_id: string
          recommendation?: string | null
          resolved_at?: string | null
          run_id: string
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_url?: string | null
          baseline_metrics?: Json | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          project_id?: string
          recommendation?: string | null
          resolved_at?: string | null
          run_id?: string
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "audit_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          domain: string
          error_message: string | null
          health_score: number | null
          id: string
          project_id: string
          started_at: string | null
          status: string
          totals: Json | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          domain: string
          error_message?: string | null
          health_score?: number | null
          id?: string
          project_id: string
          started_at?: string | null
          status?: string
          totals?: Json | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          domain?: string
          error_message?: string | null
          health_score?: number | null
          id?: string
          project_id?: string
          started_at?: string | null
          status?: string
          totals?: Json | null
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          mode: string
          project_id: string
          rule_type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          mode?: string
          project_id: string
          rule_type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          mode?: string
          project_id?: string
          rule_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      backlink_gaps: {
        Row: {
          analysis_id: string
          created_at: string
          domain: string
          id: string
          payload: Json
          updated_at: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          domain: string
          id?: string
          payload: Json
          updated_at?: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          domain?: string
          id?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      brand_kits: {
        Row: {
          created_at: string
          fonts: Json
          icon_url: string | null
          id: string
          image_style: string | null
          layout_template: string
          logo_dark_url: string | null
          logo_url: string | null
          palette: Json
          project_id: string
          tone: string
          updated_at: string
          voice_guidelines: string | null
        }
        Insert: {
          created_at?: string
          fonts?: Json
          icon_url?: string | null
          id?: string
          image_style?: string | null
          layout_template?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          palette?: Json
          project_id: string
          tone?: string
          updated_at?: string
          voice_guidelines?: string | null
        }
        Update: {
          created_at?: string
          fonts?: Json
          icon_url?: string | null
          id?: string
          image_style?: string | null
          layout_template?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          palette?: Json
          project_id?: string
          tone?: string
          updated_at?: string
          voice_guidelines?: string | null
        }
        Relationships: []
      }
      content_briefs: {
        Row: {
          analysis_id: string
          cluster: string
          created_at: string
          id: string
          payload: Json
          updated_at: string
        }
        Insert: {
          analysis_id: string
          cluster: string
          created_at?: string
          id?: string
          payload: Json
          updated_at?: string
        }
        Update: {
          analysis_id?: string
          cluster?: string
          created_at?: string
          id?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          domain: string | null
          frequency: string | null
          id: string
          industry: string | null
          name: string
          products: string | null
          project_id: string
          revenue: string | null
          sni: string | null
        }
        Insert: {
          domain?: string | null
          frequency?: string | null
          id?: string
          industry?: string | null
          name: string
          products?: string | null
          project_id: string
          revenue?: string | null
          sni?: string | null
        }
        Update: {
          domain?: string | null
          frequency?: string | null
          id?: string
          industry?: string | null
          name?: string
          products?: string | null
          project_id?: string
          revenue?: string | null
          sni?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ga4_snapshots: {
        Row: {
          created_at: string
          end_date: string
          id: string
          project_id: string
          property_id: string
          rows: Json
          start_date: string
          totals: Json | null
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          project_id: string
          property_id: string
          rows?: Json
          start_date: string
          totals?: Json | null
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          project_id?: string
          property_id?: string
          rows?: Json
          start_date?: string
          totals?: Json | null
        }
        Relationships: []
      }
      google_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gsc_snapshots: {
        Row: {
          created_at: string
          end_date: string
          id: string
          project_id: string
          rows: Json
          site_url: string
          start_date: string
          totals: Json | null
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          project_id: string
          rows?: Json
          site_url: string
          start_date: string
          totals?: Json | null
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          project_id?: string
          rows?: Json
          site_url?: string
          start_date?: string
          totals?: Json | null
        }
        Relationships: []
      }
      keyword_metrics: {
        Row: {
          competition: number | null
          cpc_sek: number | null
          keyword: string
          location_code: number
          search_volume: number | null
          trend_json: Json | null
          updated_at: string
        }
        Insert: {
          competition?: number | null
          cpc_sek?: number | null
          keyword: string
          location_code?: number
          search_volume?: number | null
          trend_json?: Json | null
          updated_at?: string
        }
        Update: {
          competition?: number | null
          cpc_sek?: number | null
          keyword?: string
          location_code?: number
          search_volume?: number | null
          trend_json?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      kpi_targets: {
        Row: {
          channel: string | null
          created_at: string
          direction: string
          id: string
          is_active: boolean
          label: string
          metric: string
          project_id: string
          target_value: number
          timeframe: string
          updated_at: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          direction?: string
          id?: string
          is_active?: boolean
          label: string
          metric: string
          project_id: string
          target_value: number
          timeframe?: string
          updated_at?: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          direction?: string
          id?: string
          is_active?: boolean
          label?: string
          metric?: string
          project_id?: string
          target_value?: number
          timeframe?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_google_settings: {
        Row: {
          ads_customer_id: string | null
          ads_customer_name: string | null
          created_at: string
          ga4_property_id: string | null
          ga4_property_name: string | null
          gsc_site_url: string | null
          id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          ads_customer_id?: string | null
          ads_customer_name?: string | null
          created_at?: string
          ga4_property_id?: string | null
          ga4_property_name?: string | null
          gsc_site_url?: string | null
          id?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          ads_customer_id?: string | null
          ads_customer_name?: string | null
          created_at?: string
          ga4_property_id?: string | null
          ga4_property_name?: string | null
          gsc_site_url?: string | null
          id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          company: string
          competitors: string | null
          created_at: string
          description: string | null
          domain: string | null
          id: string
          is_archived: boolean
          known_segments: string | null
          last_active_at: string
          logo_url: string | null
          market: string
          name: string
          products: string | null
          user_id: string
        }
        Insert: {
          company: string
          competitors?: string | null
          created_at?: string
          description?: string | null
          domain?: string | null
          id?: string
          is_archived?: boolean
          known_segments?: string | null
          last_active_at?: string
          logo_url?: string | null
          market?: string
          name: string
          products?: string | null
          user_id: string
        }
        Update: {
          company?: string
          competitors?: string | null
          created_at?: string
          description?: string | null
          domain?: string | null
          id?: string
          is_archived?: boolean
          known_segments?: string | null
          last_active_at?: string
          logo_url?: string | null
          market?: string
          name?: string
          products?: string | null
          user_id?: string
        }
        Relationships: []
      }
      semrush_metrics: {
        Row: {
          kd: number | null
          keyword: string
          location_code: number
          serp_features: Json | null
          top_domains: Json | null
          updated_at: string
        }
        Insert: {
          kd?: number | null
          keyword: string
          location_code?: number
          serp_features?: Json | null
          top_domains?: Json | null
          updated_at?: string
        }
        Update: {
          kd?: number | null
          keyword?: string
          location_code?: number
          serp_features?: Json | null
          top_domains?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      site_audits: {
        Row: {
          analysis_id: string
          created_at: string
          domain: string
          id: string
          payload: Json
          updated_at: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          domain: string
          id?: string
          payload: Json
          updated_at?: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          domain?: string
          id?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      strategy_drafts: {
        Row: {
          analysis_id: string
          created_at: string
          payload: Json
          updated_at: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          payload: Json
          updated_at?: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      workspace_artifacts: {
        Row: {
          artifact_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          payload: Json
          project_id: string
          source_id: string | null
        }
        Insert: {
          artifact_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          payload?: Json
          project_id: string
          source_id?: string | null
        }
        Update: {
          artifact_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          payload?: Json
          project_id?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_artifacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
