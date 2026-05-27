import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ScbProfile = {
  org_number: string;
  company_name: string | null;
  sni_code: string | null;
  sni_text: string | null;
  municipality: string | null;
  county: string | null;
  status: string | null;
  owner_category: string | null;
  turnover_class: string | null;
  phones: string[];
  emails: string[];
  raw: unknown;
  fetched_at: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const sbAdmin = createClient(url, service);

    const {
      data: { user },
    } = await sbUser.auth.getUser();
    if (!user) return json({ error: "unauthenticated" }, 401);

    const { project_id, org_number, force = false } = await req.json().catch(() => ({}));
    if (!project_id) return json({ error: "project_id required" }, 400);

    const { data: project } = await sbUser
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .maybeSingle();
    if (!project) return json({ error: "project not found" }, 404);

    const org = normalizeOrgNumber(String(org_number || ""));
    if (!org) return json({ error: "org_number required" }, 400);

    if (!force) {
      const { data: cached } = await sbAdmin
        .from("workspace_artifacts")
        .select("payload, created_at")
        .eq("project_id", project_id)
        .eq("artifact_type", "scb_profile")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const cachedOrg = ((cached as any)?.payload as any)?.org_number as string | undefined;
      const createdAt = (cached as any)?.created_at as string | undefined;
      const ageHours = createdAt ? (Date.now() - new Date(createdAt).getTime()) / 3_600_000 : null;
      if (cached && cachedOrg === org && ageHours !== null && ageHours < 24) {
        return json({ ok: true, cached: true, profile: (cached as any).payload });
      }
    }

    const raw = await fetchScb(org);
    const normalized = normalizeScbPayload(org, raw);

    await sbAdmin.from("workspace_artifacts").insert({
      project_id,
      artifact_type: "scb_profile",
      name: `SCB profile ${org}`,
      description: "SCB företagsregister berikning",
      payload: normalized,
    });

    return json({ ok: true, cached: false, profile: normalized });
  } catch (e) {
    console.error("scb-company-profile error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

async function fetchScb(org: string): Promise<unknown> {
  const proxyUrl = Deno.env.get("SCB_PROXY_URL")?.trim();
  if (proxyUrl) {
    const proxyHeaders: Record<string, string> = {
      Accept: "application/json,text/plain,*/*",
      "Content-Type": "application/json",
    };
    const proxyAuth = Deno.env.get("SCB_PROXY_AUTH_HEADER")?.trim();
    if (proxyAuth) proxyHeaders.Authorization = proxyAuth;

    const proxyRes = await fetch(proxyUrl, {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify({ org_number: org }),
    });
    const proxyText = await proxyRes.text();
    if (!proxyRes.ok) {
      throw new Error(`SCB_PROXY_ERROR [${proxyRes.status}]: ${proxyText.slice(0, 400)}`);
    }
    try {
      return JSON.parse(proxyText);
    } catch {
      return { raw_text: proxyText };
    }
  }

  const base = Deno.env.get("SCB_API_BASE_URL")?.trim();
  if (!base) {
    throw new Error("SCB_API_BASE_URL saknas");
  }

  const pathTemplate =
    Deno.env.get("SCB_API_PATH_TEMPLATE")?.trim() ||
    "/nv0101/v1/sokpavar/api/je/hamtaforetag";
  const method = (Deno.env.get("SCB_API_METHOD") || "POST").trim().toUpperCase();
  const path = pathTemplate.replaceAll("{orgnr}", encodeURIComponent(org));
  const target = `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    Accept: "application/json,text/plain,*/*",
  };

  const apiId = Deno.env.get("SCB_API_ID")?.trim();
  if (apiId) headers["X-Api-Id"] = apiId;

  const authHeader = Deno.env.get("SCB_API_AUTH_HEADER")?.trim();
  if (authHeader) {
    headers.Authorization = authHeader;
  } else {
    const username = Deno.env.get("SCB_API_USERNAME")?.trim();
    const password = Deno.env.get("SCB_API_PASSWORD")?.trim();
    if (username && password) {
      headers.Authorization = `Basic ${btoa(`${username}:${password}`)}`;
    }
  }

  const apiKey = Deno.env.get("SCB_API_KEY")?.trim();
  if (apiKey) headers["x-api-key"] = apiKey;

  let body: string | undefined;
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";

    // Default payload for SokPaVar endpoint. Can be fully overridden by env.
    const customPayload = Deno.env.get("SCB_API_POST_PAYLOAD_TEMPLATE")?.trim();
    if (customPayload) {
      body = customPayload.replaceAll("{orgnr}", org);
    } else {
      body = JSON.stringify({
        ["F\u00f6retagsstatus"]: "1",
        Registreringsstatus: "1",
        AntalPoster: 1,
        StartPost: 1,
        Kategorier: [{ Kategori: "OrgNr", Kod: [org] }],
      });
    }
  }

  const res = await fetch(target, { method, headers, body, client });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SCB_API_ERROR [${res.status}]: ${text.slice(0, 400)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw_text: text };
  }
}

function readSecretPem(plainKey: string, b64Key: string): string | null {
  const plain = Deno.env.get(plainKey);
  if (plain && plain.trim()) return plain;

  const b64 = Deno.env.get(b64Key);
  if (b64 && b64.trim()) {
    const value = b64.trim();

    // Be permissive: some environments may accidentally store raw PEM in *_B64 secrets.
    if (value.includes("-----BEGIN")) {
      return value;
    }

    try {
      return atob(value.replace(/\s+/g, ""));
    } catch {
      throw new Error(`Ogiltig base64 i ${b64Key}`);
    }
  }
  return null;
}

function extractPemBlocks(input: string, blockType: string, label: string): string | null {
  const re = new RegExp(
    `-----BEGIN ${blockType}-----[\\s\\S]*?-----END ${blockType}-----`,
    "g",
  );
  const matches = input.match(re);
  if (!matches || matches.length === 0) return null;
  const cleaned = matches.map((m) => m.trim()).join("\n");
  if (!cleaned.includes(`-----BEGIN ${blockType}-----`)) {
    throw new Error(`Kunde inte tolka ${label}`);
  }
  return cleaned;
}

function parseBoolEnv(key: string, defaultValue: boolean): boolean {
  const raw = Deno.env.get(key)?.trim().toLowerCase();
  if (!raw) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw);
}

function normalizeScbPayload(org: string, payload: unknown): ScbProfile {
  const root = asObject(payload);
  const firstObj = findNestedObject(root);
  const node = firstObj || root;

  const phones = pickMany(node, [
    "telefon", "phone", "telefonnummer", "tg22tel_je", "tg22tel_ae", "tel",
  ]);
  const emails = pickMany(node, [
    "epost", "email", "e-post", "tg09epost_je", "tg09epost_ae", "mail",
  ]);

  return {
    org_number: org,
    company_name: pickFirst(node, ["foretagsnamn", "namn", "company_name", "foretag", "juridiskt_namn"]),
    sni_code: pickFirst(node, ["sni", "sni_kod", "snikod", "naringsgren_kod", "branschkod"]),
    sni_text: pickFirst(node, ["sni_text", "naringsgren", "bransch", "naringsgren_namn"]),
    municipality: pickFirst(node, ["kommun", "kommun_namn", "municipality"]),
    county: pickFirst(node, ["lan", "lansnamn", "county"]),
    status: pickFirst(node, ["bolagsstatus", "status", "tg15stat_bol"]),
    owner_category: pickFirst(node, ["agarkategori", "agarkat", "tg08agkat"]),
    turnover_class: pickFirst(node, ["omsattning", "oms_klass", "tg07oms"]),
    phones,
    emails,
    raw: payload,
    fetched_at: new Date().toISOString(),
  };
}

function normalizeOrgNumber(input: string): string | null {
  const digits = input.replace(/[^0-9]/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && (digits.startsWith("19") || digits.startsWith("20"))) return digits.slice(2);
  return null;
}

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function findNestedObject(root: Record<string, unknown>): Record<string, unknown> | null {
  const candidates = ["data", "result", "foretag", "company", "item", "items", "records"];
  for (const key of candidates) {
    const val = root[key];
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") return asObject(val[0]);
    if (val && typeof val === "object" && !Array.isArray(val)) return asObject(val);
  }
  return null;
}

function pickFirst(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const found = Object.entries(obj).find(([k]) => normalizeKey(k) === normalizeKey(key));
    if (!found) continue;
    const value = found[1];
    if (value == null) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function pickMany(obj: Record<string, unknown>, keys: string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const found = Object.entries(obj).find(([k]) => normalizeKey(k) === normalizeKey(key));
    if (!found) continue;
    const value = found[1];
    if (typeof value === "string") out.push(value.trim());
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) out.push(item.trim());
      }
    }
  }
  return Array.from(new Set(out.filter(Boolean)));
}

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
