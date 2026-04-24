// Lists Google Ads customer accounts the connected user can access (under their MCC).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAdsContext, listAccessibleCustomers, searchGaql } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    const ctx = await getAdsContext(auth);
    const ids = await listAccessibleCustomers(ctx);

    // Enrich with descriptive names via GAQL on each customer
    const accounts: Array<{ id: string; name: string; currency?: string; isManager?: boolean }> = [];
    for (const id of ids.slice(0, 25)) {
      try {
        const rows = await searchGaql(ctx, id,
          "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1");
        const c = rows[0]?.customer;
        accounts.push({
          id,
          name: c?.descriptiveName || `Konto ${id}`,
          currency: c?.currencyCode,
          isManager: c?.manager === true,
        });
      } catch (e) {
        accounts.push({ id, name: `Konto ${id}` });
      }
    }

    return json({ accounts });
  } catch (e: any) {
    console.error("ads-list-customers", e);
    return json({ error: e.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
