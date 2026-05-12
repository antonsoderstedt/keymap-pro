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
          expected_impact_sek: number | null
          id: string
          implementation_notes: string | null
          implemented_at: string | null
          implemented_by: string | null
          notes: Json
          priority: string
          project_id: string
          source_id: string | null
          source_payload: Json | null
          source_type: string | null
          status: string
          title: string
          tracking_status: string | null
          updated_at: string
        }
        Insert: {
          baseline_metrics?: Json | null
          category?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          expected_impact?: string | null
          expected_impact_sek?: number | null
          id?: string
          implementation_notes?: string | null
          implemented_at?: string | null
          implemented_by?: string | null
          notes?: Json
          priority?: string
          project_id: string
          source_id?: string | null
          source_payload?: Json | null
          source_type?: string | null
          status?: string
          title: string
          tracking_status?: string | null
          updated_at?: string
        }
        Update: {
          baseline_metrics?: Json | null
          category?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          expected_impact?: string | null
          expected_impact_sek?: number | null
          id?: string
          implementation_notes?: string | null
          implemented_at?: string | null
          implemented_by?: string | null
          notes?: Json
          priority?: string
          project_id?: string
          source_id?: string | null
          source_payload?: Json | null
          source_type?: string | null
          status?: string
          title?: string
          tracking_status?: string | null
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
      ads_audits: {
        Row: {
          created_at: string
          customer_id: string | null
          health_score: number | null
          id: string
          project_id: string
          raw: Json
          summary: Json
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          health_score?: number | null
          id?: string
          project_id: string
          raw?: Json
          summary?: Json
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          health_score?: number | null
          id?: string
          project_id?: string
          raw?: Json
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ads_audits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_diagnostics_cache: {
        Row: {
          created_at: string
          customer_id: string
          hour_bucket: string
          id: string
          project_id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          customer_id: string
          hour_bucket: string
          id?: string
          project_id: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          customer_id?: string
          hour_bucket?: string
          id?: string
          project_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ads_diagnostics_cache_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_diagnostics_runs: {
        Row: {
          cache_hit: boolean
          created_at: string
          customer_id: string
          duration_ms: number | null
          id: string
          project_id: string
          report: Json
          rules_evaluated: number
          rules_fired: number
          scope: Json | null
        }
        Insert: {
          cache_hit?: boolean
          created_at?: string
          customer_id: string
          duration_ms?: number | null
          id?: string
          project_id: string
          report: Json
          rules_evaluated?: number
          rules_fired?: number
          scope?: Json | null
        }
        Update: {
          cache_hit?: boolean
          created_at?: string
          customer_id?: string
          duration_ms?: number | null
          id?: string
          project_id?: string
          report?: Json
          rules_evaluated?: number
          rules_fired?: number
          scope?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_diagnostics_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_mutations: {
        Row: {
          action_type: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          error_message: string | null
          id: string
          payload: Json
          project_id: string
          response: Json | null
          revert_payload: Json | null
          reverted_at: string | null
          source_action_item_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          error_message?: string | null
          id?: string
          payload?: Json
          project_id: string
          response?: Json | null
          revert_payload?: Json | null
          reverted_at?: string | null
          source_action_item_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          error_message?: string | null
          id?: string
          payload?: Json
          project_id?: string
          response?: Json | null
          revert_payload?: Json | null
          reverted_at?: string | null
          source_action_item_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ads_recommendation_outcomes: {
        Row: {
          applied_at: string | null
          campaign_id: string | null
          created_at: string
          diagnosis_id: string | null
          fired_at: string
          id: string
          measured_14d: Json | null
          measured_30d: Json | null
          mutation_id: string | null
          notes: string | null
          predicted: Json
          project_id: string
          reverted_at: string | null
          rule_id: string
        }
        Insert: {
          applied_at?: string | null
          campaign_id?: string | null
          created_at?: string
          diagnosis_id?: string | null
          fired_at: string
          id?: string
          measured_14d?: Json | null
          measured_30d?: Json | null
          mutation_id?: string | null
          notes?: string | null
          predicted: Json
          project_id: string
          reverted_at?: string | null
          rule_id: string
        }
        Update: {
          applied_at?: string | null
          campaign_id?: string | null
          created_at?: string
          diagnosis_id?: string | null
          fired_at?: string
          id?: string
          measured_14d?: Json | null
          measured_30d?: Json | null
          mutation_id?: string | null
          notes?: string | null
          predicted?: Json
          project_id?: string
          reverted_at?: string | null
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_recommendation_outcomes_mutation_id_fkey"
            columns: ["mutation_id"]
            isOneToOne: false
            referencedRelation: "ads_mutations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_recommendation_outcomes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
          universe_progress: Json | null
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
          universe_progress?: Json | null
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
          universe_progress?: Json | null
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
          source: string
          start_date: string
        }
        Insert: {
          campaign?: string | null
          created_at?: string
          end_date: string
          id?: string
          project_id: string
          rows?: Json
          source?: string
          start_date: string
        }
        Update: {
          campaign?: string | null
          created_at?: string
          end_date?: string
          id?: string
          project_id?: string
          rows?: Json
          source?: string
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
      briefing_email_recipients: {
        Row: {
          auto_send: boolean
          created_at: string
          email: string
          enabled: boolean
          id: string
          name: string | null
          project_id: string
          role: string
          updated_at: string
        }
        Insert: {
          auto_send?: boolean
          created_at?: string
          email: string
          enabled?: boolean
          id?: string
          name?: string | null
          project_id: string
          role?: string
          updated_at?: string
        }
        Update: {
          auto_send?: boolean
          created_at?: string
          email?: string
          enabled?: boolean
          id?: string
          name?: string | null
          project_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      channel_attribution_snapshots: {
        Row: {
          channels: Json
          created_at: string
          currency: string
          end_date: string
          id: string
          project_id: string
          sources: Json
          start_date: string
          totals: Json
        }
        Insert: {
          channels?: Json
          created_at?: string
          currency?: string
          end_date: string
          id?: string
          project_id: string
          sources?: Json
          start_date: string
          totals?: Json
        }
        Update: {
          channels?: Json
          created_at?: string
          currency?: string
          end_date?: string
          id?: string
          project_id?: string
          sources?: Json
          start_date?: string
          totals?: Json
        }
        Relationships: []
      }
      cluster_resolution_logs: {
        Row: {
          analysis_id: string
          available_clusters: Json
          created_at: string
          function_name: string
          id: string
          match_kind: string
          matched_cluster: string | null
          matched_keywords_count: number
          project_id: string | null
          requested_cluster: string
          similar_clusters: Json
        }
        Insert: {
          analysis_id: string
          available_clusters?: Json
          created_at?: string
          function_name?: string
          id?: string
          match_kind: string
          matched_cluster?: string | null
          matched_keywords_count?: number
          project_id?: string | null
          requested_cluster: string
          similar_clusters?: Json
        }
        Update: {
          analysis_id?: string
          available_clusters?: Json
          created_at?: string
          function_name?: string
          id?: string
          match_kind?: string
          matched_cluster?: string | null
          matched_keywords_count?: number
          project_id?: string | null
          requested_cluster?: string
          similar_clusters?: Json
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
      data_source_status: {
        Row: {
          created_at: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          meta: Json
          project_id: string
          source: string
          status: string
          ttl_seconds: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          meta?: Json
          project_id: string
          source: string
          status?: string
          ttl_seconds?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          meta?: Json
          project_id?: string
          source?: string
          status?: string
          ttl_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      ga4_conversion_filters: {
        Row: {
          created_at: string
          event_name: string
          id: string
          is_active: boolean
          mode: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          is_active?: boolean
          mode?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          is_active?: boolean
          mode?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ga4_filters: {
        Row: {
          created_at: string
          dimension: string
          exclude: boolean
          id: string
          is_active: boolean
          label: string
          operator: string
          project_id: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          dimension: string
          exclude?: boolean
          id?: string
          is_active?: boolean
          label: string
          operator?: string
          project_id: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          dimension?: string
          exclude?: boolean
          id?: string
          is_active?: boolean
          label?: string
          operator?: string
          project_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
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
          strategy_quadrant: string | null
          trend_json: Json | null
          updated_at: string
        }
        Insert: {
          competition?: number | null
          cpc_sek?: number | null
          keyword: string
          location_code?: number
          search_volume?: number | null
          strategy_quadrant?: string | null
          trend_json?: Json | null
          updated_at?: string
        }
        Update: {
          competition?: number | null
          cpc_sek?: number | null
          keyword?: string
          location_code?: number
          search_volume?: number | null
          strategy_quadrant?: string | null
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
      prelaunch_blueprints: {
        Row: {
          ads_plan: Json | null
          brief_id: string
          created_at: string
          forecast: Json | null
          id: string
          keyword_universe: Json | null
          market_analysis: Json | null
          personas: Json | null
          project_id: string
          selected_keywords: Json
          sitemap: Json | null
          strategy: Json | null
          updated_at: string
        }
        Insert: {
          ads_plan?: Json | null
          brief_id: string
          created_at?: string
          forecast?: Json | null
          id?: string
          keyword_universe?: Json | null
          market_analysis?: Json | null
          personas?: Json | null
          project_id: string
          selected_keywords?: Json
          sitemap?: Json | null
          strategy?: Json | null
          updated_at?: string
        }
        Update: {
          ads_plan?: Json | null
          brief_id?: string
          created_at?: string
          forecast?: Json | null
          id?: string
          keyword_universe?: Json | null
          market_analysis?: Json | null
          personas?: Json | null
          project_id?: string
          selected_keywords?: Json
          sitemap?: Json | null
          strategy?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prelaunch_blueprints_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "prelaunch_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      prelaunch_briefs: {
        Row: {
          business_idea: string | null
          competitors: string[]
          created_at: string
          error_message: string | null
          existing_sitemap: Json | null
          fact_check: Json | null
          id: string
          locations: string[]
          project_id: string
          status: string
          target_audience: string | null
          updated_at: string
          usp: string | null
        }
        Insert: {
          business_idea?: string | null
          competitors?: string[]
          created_at?: string
          error_message?: string | null
          existing_sitemap?: Json | null
          fact_check?: Json | null
          id?: string
          locations?: string[]
          project_id: string
          status?: string
          target_audience?: string | null
          updated_at?: string
          usp?: string | null
        }
        Update: {
          business_idea?: string | null
          competitors?: string[]
          created_at?: string
          error_message?: string | null
          existing_sitemap?: Json | null
          fact_check?: Json | null
          id?: string
          locations?: string[]
          project_id?: string
          status?: string
          target_audience?: string | null
          updated_at?: string
          usp?: string | null
        }
        Relationships: []
      }
      project_baselines: {
        Row: {
          created_at: string
          id: string
          is_baseline: boolean
          metrics: Json
          project_id: string
          snapshot_date: string
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_baseline?: boolean
          metrics?: Json
          project_id: string
          snapshot_date: string
          source?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_baseline?: boolean
          metrics?: Json
          project_id?: string
          snapshot_date?: string
          source?: string
        }
        Relationships: []
      }
      project_goals: {
        Row: {
          brand_terms: string[]
          conversion_label: string | null
          conversion_rate_pct: number
          conversion_type: string
          conversion_value: number
          created_at: string
          currency: string
          id: string
          primary_goal: string
          project_id: string
          strategy_split: Json
          updated_at: string
        }
        Insert: {
          brand_terms?: string[]
          conversion_label?: string | null
          conversion_rate_pct?: number
          conversion_type?: string
          conversion_value?: number
          created_at?: string
          currency?: string
          id?: string
          primary_goal?: string
          project_id: string
          strategy_split?: Json
          updated_at?: string
        }
        Update: {
          brand_terms?: string[]
          conversion_label?: string | null
          conversion_rate_pct?: number
          conversion_type?: string
          conversion_value?: number
          created_at?: string
          currency?: string
          id?: string
          primary_goal?: string
          project_id?: string
          strategy_split?: Json
          updated_at?: string
        }
        Relationships: []
      }
      project_google_settings: {
        Row: {
          ads_customer_id: string | null
          ads_customer_name: string | null
          ads_script_secret: string | null
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
          ads_script_secret?: string | null
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
          ads_script_secret?: string | null
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
      project_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_revenue_settings: {
        Row: {
          avg_order_value: number
          conversion_rate_pct: number
          created_at: string
          currency: string
          gross_margin_pct: number
          id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          avg_order_value?: number
          conversion_rate_pct?: number
          created_at?: string
          currency?: string
          gross_margin_pct?: number
          id?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          avg_order_value?: number
          conversion_rate_pct?: number
          created_at?: string
          currency?: string
          gross_margin_pct?: number
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
          workspace_type: string
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
          workspace_type?: string
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
          workspace_type?: string
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
      seo_diagnostics_cache: {
        Row: {
          analysis_id: string | null
          cache_key: string
          created_at: string
          id: string
          project_id: string
          snapshot: Json
        }
        Insert: {
          analysis_id?: string | null
          cache_key: string
          created_at?: string
          id?: string
          project_id: string
          snapshot: Json
        }
        Update: {
          analysis_id?: string | null
          cache_key?: string
          created_at?: string
          id?: string
          project_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "seo_diagnostics_cache_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_diagnostics_cache_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_diagnostics_runs: {
        Row: {
          analysis_id: string | null
          cache_hit: boolean
          created_at: string
          duration_ms: number | null
          id: string
          project_id: string
          report: Json
          rules_evaluated: number
          rules_fired: number
        }
        Insert: {
          analysis_id?: string | null
          cache_hit?: boolean
          created_at?: string
          duration_ms?: number | null
          id?: string
          project_id: string
          report: Json
          rules_evaluated?: number
          rules_fired?: number
        }
        Update: {
          analysis_id?: string | null
          cache_hit?: boolean
          created_at?: string
          duration_ms?: number | null
          id?: string
          project_id?: string
          report?: Json
          rules_evaluated?: number
          rules_fired?: number
        }
        Relationships: [
          {
            foreignKeyName: "seo_diagnostics_runs_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_diagnostics_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_recommendation_outcomes: {
        Row: {
          action_item_id: string | null
          applied_at: string | null
          created_at: string
          diagnosis_id: string
          fired_at: string
          id: string
          measured_14d: Json | null
          measured_30d: Json | null
          measured_90d: Json | null
          notes: string | null
          predicted: Json
          project_id: string
          reverted_at: string | null
          rule_id: string
        }
        Insert: {
          action_item_id?: string | null
          applied_at?: string | null
          created_at?: string
          diagnosis_id: string
          fired_at: string
          id?: string
          measured_14d?: Json | null
          measured_30d?: Json | null
          measured_90d?: Json | null
          notes?: string | null
          predicted: Json
          project_id: string
          reverted_at?: string | null
          rule_id: string
        }
        Update: {
          action_item_id?: string | null
          applied_at?: string | null
          created_at?: string
          diagnosis_id?: string
          fired_at?: string
          id?: string
          measured_14d?: Json | null
          measured_30d?: Json | null
          measured_90d?: Json | null
          notes?: string | null
          predicted?: Json
          project_id?: string
          reverted_at?: string | null
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_recommendation_outcomes_action_item_id_fkey"
            columns: ["action_item_id"]
            isOneToOne: false
            referencedRelation: "action_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_recommendation_outcomes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      share_of_voice_snapshots: {
        Row: {
          competitors: Json
          created_at: string
          end_date: string
          id: string
          project_id: string
          sources: Json
          sov_pct: number
          start_date: string
          total_market_impressions: number
          your_clicks: number
          your_domain: string | null
          your_impressions: number
        }
        Insert: {
          competitors?: Json
          created_at?: string
          end_date: string
          id?: string
          project_id: string
          sources?: Json
          sov_pct?: number
          start_date: string
          total_market_impressions?: number
          your_clicks?: number
          your_domain?: string | null
          your_impressions?: number
        }
        Update: {
          competitors?: Json
          created_at?: string
          end_date?: string
          id?: string
          project_id?: string
          sources?: Json
          sov_pct?: number
          start_date?: string
          total_market_impressions?: number
          your_clicks?: number
          your_domain?: string | null
          your_impressions?: number
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
      weekly_briefings: {
        Row: {
          actions: Json
          created_at: string
          id: string
          metadata: Json
          project_id: string
          risks: Json
          summary_md: string | null
          total_value_at_stake_sek: number
          week_start: string
          wins: Json
        }
        Insert: {
          actions?: Json
          created_at?: string
          id?: string
          metadata?: Json
          project_id: string
          risks?: Json
          summary_md?: string | null
          total_value_at_stake_sek?: number
          week_start: string
          wins?: Json
        }
        Update: {
          actions?: Json
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string
          risks?: Json
          summary_md?: string | null
          total_value_at_stake_sek?: number
          week_start?: string
          wins?: Json
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
      has_project_role: {
        Args: {
          _project_id: string
          _role: Database["public"]["Enums"]["project_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      mark_source_status: {
        Args: {
          _bump_synced?: boolean
          _last_error?: string
          _meta?: Json
          _project_id: string
          _source: string
          _status: string
        }
        Returns: undefined
      }
    }
    Enums: {
      project_role: "owner" | "editor" | "viewer"
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
    Enums: {
      project_role: ["owner", "editor", "viewer"],
    },
  },
} as const
