// Shared helper for Google Ads API calls (REST + GAQL).
// Requires: user has connected Google with `adwords` scope, and that
// GOOGLE_ADS_DEVELOPER_TOKEN + GOOGLE_ADS_LOGIN_CUSTOMER_ID are set as secrets.
import { getGoogleAccessToken } from "./google-token.ts";

const ADS_API_VERSION = "v17";
const ADS_BASE = `https://googleads.googleapis.com/${ADS_API_VERSION}`;

export interface AdsContext {
  accessToken: string;
  developerToken: string;
  loginCustomerId: string; // MCC, digits only
}

export async function getAdsContext(authHeader: string | null): Promise<AdsContext> {
  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")?.trim();
  const loginCustomerIdRaw = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")?.trim();
  if (!developerToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN not configured");
  if (!loginCustomerIdRaw) throw new Error("GOOGLE_ADS_LOGIN_CUSTOMER_ID not configured");
  const loginCustomerId = loginCustomerIdRaw.replace(/[^0-9]/g, "");
  const accessToken = await getGoogleAccessToken(authHeader);
  return { accessToken, developerToken, loginCustomerId };
}

export async function listAccessibleCustomers(ctx: AdsContext): Promise<string[]> {
  const res = await fetch(`${ADS_BASE}/customers:listAccessibleCustomers`, {
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "developer-token": ctx.developerToken,
      "login-customer-id": ctx.loginCustomerId,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`listAccessibleCustomers failed [${res.status}]: ${JSON.stringify(data)}`);
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
    body: JSON.stringify({ query, pageSize: 10000 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`GAQL failed [${res.status}]: ${JSON.stringify(data)}`);
  return data.results || [];
}
