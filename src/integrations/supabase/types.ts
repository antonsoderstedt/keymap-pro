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
      project_google_settings: {
        Row: {
          created_at: string
          ga4_property_id: string | null
          ga4_property_name: string | null
          gsc_site_url: string | null
          id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ga4_property_id?: string | null
          ga4_property_name?: string | null
          gsc_site_url?: string | null
          id?: string
          project_id: string
          updated_at?: string
        }
        Update: {
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
          domain: string | null
          id: string
          known_segments: string | null
          market: string
          name: string
          products: string | null
          user_id: string
        }
        Insert: {
          company: string
          competitors?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          known_segments?: string | null
          market?: string
          name: string
          products?: string | null
          user_id: string
        }
        Update: {
          company?: string
          competitors?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          known_segments?: string | null
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
