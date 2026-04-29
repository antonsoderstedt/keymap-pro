// Shared helper for Google Ads API calls (REST + GAQL).
// Requires: user has connected Google with `adwords` scope, and that
// GOOGLE_ADS_DEVELOPER_TOKEN + GOOGLE_ADS_LOGIN_CUSTOMER_ID are set as secrets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGoogleAccessToken } from "./google-token.ts";

const ADS_API_VERSION = "v21";
const ADS_BASE = `https://googleads.googleapis.com/${ADS_API_VERSION}`;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface AdsContext {
  accessToken: string;
  developerToken: string;
  loginCustomerId: string; // MCC, digits only
  userId: string;
}

export async function getAdsContext(authHeader: string | null): Promise<AdsContext> {
  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")?.trim();
  const loginCustomerIdRaw = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")?.trim();
  if (!developerToken) throw new Error("CONFIG_ERROR: GOOGLE_ADS_DEVELOPER_TOKEN saknas i serverkonfiguration");
  if (!loginCustomerIdRaw) throw new Error("CONFIG_ERROR: GOOGLE_ADS_LOGIN_CUSTOMER_ID saknas i serverkonfiguration");
  const loginCustomerId = loginCustomerIdRaw.replace(/[^0-9]/g, "");
  if (loginCustomerId.length !== 10) {
    throw new Error(`MCC_INVALID: GOOGLE_ADS_LOGIN_CUSTOMER_ID måste vara 10 siffror (är: ${loginCustomerId.length})`);
  }

  const { token: accessToken, userId } = await getGoogleAccessToken(authHeader);

  // Verify scope BEFORE calling Google so we give an honest error
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data } = await admin.from("google_tokens").select("scope").eq("user_id", userId).maybeSingle();
  const scope = data?.scope || "";
  if (!scope.includes("https://www.googleapis.com/auth/adwords")) {
    throw new Error("MISSING_ADS_SCOPE: Google Ads-scope (adwords) saknas i sparad token. Koppla från Google på Översikt och anslut igen.");
  }

  return { accessToken, developerToken, loginCustomerId, userId };
}

function classifyAdsError(status: number, body: string): string {
  const lower = body.toLowerCase();
  // Google Ads API specific errors
  if (lower.includes("developer token") || lower.includes("developertoken")) {
    if (lower.includes("not approved") || lower.includes("pending")) {
      return `DEVELOPER_TOKEN_NOT_APPROVED: Google Ads developer token är inte godkänd ännu. Status [${status}]. Detalj: ${body.slice(0, 300)}`;
    }
    if (lower.includes("invalid") || lower.includes("disabled")) {
      return `DEVELOPER_TOKEN_INVALID: Google Ads developer token är ogiltig eller inaktiverad. Status [${status}]. Detalj: ${body.slice(0, 300)}`;
    }
    return `DEVELOPER_TOKEN_ERROR: Problem med developer token [${status}]. Detalj: ${body.slice(0, 300)}`;
  }
  if (lower.includes("login-customer-id") || lower.includes("login_customer_id") || lower.includes("manager")) {
    return `MCC_ERROR: Problem med MCC/login-customer-id [${status}]. Detalj: ${body.slice(0, 300)}`;
  }
  if (lower.includes("permission") || lower.includes("permission_denied")) {
    return `PERMISSION_DENIED: Användaren saknar behörighet i Google Ads [${status}]. Detalj: ${body.slice(0, 300)}`;
  }
  if (lower.includes("user_permission_denied")) {
    return `USER_PERMISSION_DENIED: Inloggad Google-användare har ingen Ads-åtkomst via MCC [${status}]. Detalj: ${body.slice(0, 300)}`;
  }
  if (status === 401) {
    return `OAUTH_INVALID: OAuth-token avvisades [${status}]. Detalj: ${body.slice(0, 300)}`;
  }
  if (status === 403) {
    return `FORBIDDEN: Google Ads API nekade förfrågan [${status}]. Detalj: ${body.slice(0, 300)}`;
  }
  return `ADS_API_ERROR [${status}]: ${body.slice(0, 400)}`;
}

export async function listAccessibleCustomers(ctx: AdsContext): Promise<string[]> {
  const res = await fetch(`${ADS_BASE}/customers:listAccessibleCustomers`, {
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "developer-token": ctx.developerToken,
      "login-customer-id": ctx.loginCustomerId,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("listAccessibleCustomers failed", { status: res.status, body: text.slice(0, 500) });
    throw new Error(classifyAdsError(res.status, text));
  }
  let data: any;
  try { data = JSON.parse(text); } catch {
    throw new Error(`ADS_API_ERROR: Oväntat svar från Google (inte JSON): ${text.slice(0, 200)}`);
  }
  return (data.resourceNames || []).map((n: string) => n.replace("customers/", ""));
}

export async function searchGaql(ctx: AdsContext, customerId: string, query: string): Promise<any[]> {
  const cid = customerId.replace(/[^0-9]/g, "");
  const res = await fetch(`${ADS_BASE}/customers/${cid}/googleAds:search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "developer-token": ctx.developerToken,
      "login-customer-id": ctx.loginCustomerId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("searchGaql failed", { customerId: cid, status: res.status, body: text.slice(0, 500) });
    throw new Error(classifyAdsError(res.status, text));
  }
  try {
    const data = JSON.parse(text);
    return data.results || [];
  } catch {
    throw new Error(`ADS_API_ERROR: Oväntat svar från Google (inte JSON): ${text.slice(0, 200)}`);
  }
}
