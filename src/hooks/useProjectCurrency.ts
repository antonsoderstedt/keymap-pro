import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Currency, isSupportedCurrency } from "@/lib/revenue";

/**
 * Hämtar projektets valuta från project_revenue_settings.
 * Faller tillbaka på SEK om inget är satt.
 */
export function useProjectCurrency(projectId: string | undefined): Currency {
  const [currency, setCurrency] = useState<Currency>("SEK");

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("project_revenue_settings")
        .select("currency")
        .eq("project_id", projectId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.currency && isSupportedCurrency(data.currency)) {
        setCurrency(data.currency);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return currency;
}
