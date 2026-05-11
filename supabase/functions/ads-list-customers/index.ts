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
    const message = e.message || "Unknown error";
    const codeMatch = message.match(/^([A-Z_]+):/);
    const code = codeMatch ? codeMatch[1] : (message === "Google not connected" ? "GOOGLE_NOT_CONNECTED" : message === "Not authenticated" ? "NOT_AUTHENTICATED" : "UNKNOWN");

    if (["GOOGLE_NOT_CONNECTED", "GOOGLE_REAUTH_REQUIRED", "OAUTH_INVALID", "MISSING_ADS_SCOPE"].includes(code)) {
      return json({
        accounts: [],
        reauthRequired: true,
        code,
        error: message,
      });
    }

    const statusMap: Record<string, number> = {
      NOT_AUTHENTICATED: 401,
      GOOGLE_NOT_CONNECTED: 400,
      MISSING_ADS_SCOPE: 403,
      DEVELOPER_TOKEN_NOT_APPROVED: 400,
      DEVELOPER_TOKEN_INVALID: 400,
      DEVELOPER_TOKEN_ERROR: 400,
      MCC_INVALID: 400,
      MCC_ERROR: 400,
      CONFIG_ERROR: 500,
      PERMISSION_DENIED: 403,
      USER_PERMISSION_DENIED: 403,
      OAUTH_INVALID: 401,
      FORBIDDEN: 403,
      ADS_API_ERROR: 502,
    };
    const status = statusMap[code] ?? 500;
    return json({ error: message, code }, status);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
