import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BrandPalette {
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  neutral_bg: string;
  neutral_fg: string;
}

export interface BrandFonts {
  heading: string;
  body: string;
  heading_url?: string | null;
  body_url?: string | null;
}

export interface BrandKit {
  id: string;
  project_id: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  icon_url: string | null;
  palette: BrandPalette;
  fonts: BrandFonts;
  tone: string;
  voice_guidelines: string | null;
  image_style: string | null;
  layout_template: string;
  updated_at: string;
}

const DEFAULT_PALETTE: BrandPalette = {
  primary: "#1E2761",
  secondary: "#CADCFC",
  accent: "#F96167",
  success: "#10B981",
  warning: "#F59E0B",
  neutral_bg: "#FFFFFF",
  neutral_fg: "#0F172A",
};

const DEFAULT_FONTS: BrandFonts = {
  heading: "Inter",
  body: "Inter",
};

export function useBrandKit(projectId: string | undefined) {
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { data } = await supabase
      .from("brand_kits")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    setBrandKit(data as unknown as BrandKit | null);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (updates: Partial<Omit<BrandKit, "id" | "project_id" | "updated_at">>) => {
    if (!projectId) return;
    if (brandKit) {
      const { data, error } = await supabase
        .from("brand_kits")
        .update(updates as any)
        .eq("id", brandKit.id)
        .select()
        .maybeSingle();
      if (!error && data) setBrandKit(data as unknown as BrandKit);
      return { data, error };
    } else {
      const { data, error } = await supabase
        .from("brand_kits")
        .insert({
          project_id: projectId,
          palette: DEFAULT_PALETTE as any,
          fonts: DEFAULT_FONTS as any,
          ...updates,
        } as any)
        .select()
        .maybeSingle();
      if (!error && data) setBrandKit(data as unknown as BrandKit);
      return { data, error };
    }
  };

  return {
    brandKit,
    loading,
    save,
    reload: load,
    palette: brandKit?.palette ?? DEFAULT_PALETTE,
    fonts: brandKit?.fonts ?? DEFAULT_FONTS,
  };
}
