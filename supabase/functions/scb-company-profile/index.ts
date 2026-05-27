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

    const body = await req.json().catch(() => ({} as any));
    const { project_id, org_number, force = false, debug } = body;
    if (debug === "categories") {
      const cats = await fetchScbCategories();
      return json({ categories: cats });
    }
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

function sanitizePem(input: string, kinds: string[]): string {
  const blocks: string[] = [];
  for (const kind of kinds) {
    const re = new RegExp(
      `-----BEGIN ${kind}-----([\\s\\S]*?)-----END ${kind}-----`,
      "g",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      // Strip everything that isn't base64 (handles collapsed whitespace/newlines)
      const body = m[1].replace(/[^A-Za-z0-9+/=]/g, "");
      // Re-wrap body to 64-char lines as required by PEM parsers
      const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? "";
      blocks.push(`-----BEGIN ${kind}-----\n${wrapped}\n-----END ${kind}-----`);
    }
  }
  return blocks.join("\n");
}


function loadPem(
  rawEnv: string,
  b64Env: string,
  kinds: string[],
): string | null {
  let raw = Deno.env.get(rawEnv)?.trim();
  if (!raw) {
    const b64 = Deno.env.get(b64Env)?.trim();
    if (b64) {
      try {
        raw = new TextDecoder().decode(
          Uint8Array.from(atob(b64.replace(/\s+/g, "")), (c) => c.charCodeAt(0)),
        );
      } catch (_) {
        return null;
      }
    }
  }
  if (!raw) return null;
  const cleaned = sanitizePem(raw, kinds);
  return cleaned.length > 0 ? cleaned : null;
}


async function fetchScb(org: string): Promise<unknown> {
  const url = "https://privateapi.scb.se/nv0101/v1/sokpavar/api/je/hamtaforetag";

  const certFull = loadPem("SCB_API_CLIENT_CERT_PEM", "SCB_API_CLIENT_CERT_PEM_B64", ["CERTIFICATE"]);
  const key = loadPem("SCB_API_CLIENT_KEY_PEM", "SCB_API_CLIENT_KEY_PEM_B64", ["PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY"]);
  if (!certFull || !key) throw new Error("SCB klientcert/key saknas i secrets");

  // Split chain: leaf = first cert, rest = CA chain
  const certBlocks = certFull.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  if (certBlocks.length === 0) throw new Error("Inga CERTIFICATE-block i SCB_API_CLIENT_CERT_PEM");
  const leafCert = certBlocks[0];
  const caCerts = certBlocks.slice(1);

  const payload = JSON.stringify({
    ["Företagsstatus"]: "1",
    Registreringsstatus: "1",
    AntalPoster: 1,
    StartPost: 1,
    Kategorier: [],
    OrgNr: [org],
  });



  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json,text/plain,*/*",
  };
  const apiId = Deno.env.get("SCB_API_ID")?.trim();
  if (apiId) headers["X-Api-Id"] = apiId;

  // mTLS via Deno.createHttpClient
  // deno-lint-ignore no-explicit-any
  const clientOpts: any = { cert: leafCert, key };
  if (caCerts.length > 0) clientOpts.caCerts = caCerts;
  let client: unknown;
  try {
    client = (Deno as any).createHttpClient?.(clientOpts);
  } catch (e) {
    console.error("createHttpClient failed", {
      err: String(e instanceof Error ? e.message : e),
      leafLen: leafCert.length,
      leafHead: leafCert.slice(0, 40),
      leafTail: leafCert.slice(-40),
      keyLen: key.length,
      keyHead: key.slice(0, 40),
      keyTail: key.slice(-40),
      caCount: caCerts.length,
    });
    throw e;
  }
  if (!client) throw new Error("Deno.createHttpClient ej tillgänglig i denna runtime");


  const res = await fetch(url, {
    method: "POST",
    headers,
    body: payload,
    // deno-lint-ignore no-explicit-any
    client,
  } as any);

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

async function fetchScbCategories(): Promise<unknown> {
  const certFull = loadPem("SCB_API_CLIENT_CERT_PEM", "SCB_API_CLIENT_CERT_PEM_B64", ["CERTIFICATE"]);
  const key = loadPem("SCB_API_CLIENT_KEY_PEM", "SCB_API_CLIENT_KEY_PEM_B64", ["PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY"]);
  if (!certFull || !key) throw new Error("SCB klientcert/key saknas i secrets");
  const certBlocks = certFull.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  const leafCert = certBlocks[0];
  const caCerts = certBlocks.slice(1);
  // deno-lint-ignore no-explicit-any
  const clientOpts: any = { cert: leafCert, key };
  if (caCerts.length > 0) clientOpts.caCerts = caCerts;
  const client = (Deno as any).createHttpClient(clientOpts);

  const urls = [
    "https://privateapi.scb.se/nv0101/v1/sokpavar/api/Je/HamtaKategorier",
    "https://privateapi.scb.se/nv0101/v1/sokpavar/api/Kategori",
    "https://privateapi.scb.se/nv0101/v1/sokpavar/api/Kategorier",
    "https://privateapi.scb.se/nv0101/v1/sokpavar/api/je/HamtaAllaKategorier",
    "https://privateapi.scb.se/nv0101/v1/sokpavar/api/je/Metadata",
    "https://privateapi.scb.se/nv0101/v1/sokpavar/api/je",
    "https://privateapi.scb.se/nv0101/v1/sokpavar/api/help",
    "https://privateapi.scb.se/nv0101/v1/sokpavar/api/Help",
  ];
  const out: Record<string, unknown> = {};
  for (const u of urls) {
    try {
      const r = await fetch(u, { method: "GET", client } as any);
      const t = await r.text();
      out[u] = { status: r.status, body: t.slice(0, 2000) };
    } catch (e) {
      out[u] = { error: String(e) };
    }
  }
  return out;
}



function normalizeScbPayload(org: string, payload: unknown): ScbProfile {
  const node = findCompanyNode(payload);

  const phones = pickMany(node, [
    "HAE_Telefon", "Telefon", "telefon", "telefonnummer", "phone", "tel",
  ]);
  const emails = pickMany(node, [
    "HAE_Epost", "E-post", "Epost", "epost", "email", "mail",
  ]);

  return {
    org_number: org,
    company_name: pickFirst(node, ["Företagsnamn", "foretagsnamn", "Firma", "namn", "juridiskt_namn"]),
    sni_code: pickFirst(node, ["Bransch_1, kod", "HAE_Bransch_1, kod", "sni_kod", "branschkod"]),
    sni_text: pickFirst(node, ["Bransch_1", "HAE_Bransch_1", "naringsgren", "bransch"]),
    municipality: pickFirst(node, ["HAE_kommun", "Kommun", "kommun"]),
    county: pickFirst(node, ["HAE_län", "Län", "lan", "lansnamn"]),
    status: pickFirst(node, ["Företagsstatus", "Bolagsstatus", "bolagsstatus", "status"]),
    owner_category: pickFirst(node, ["Juridisk form", "agarkategori", "agarkat"]),
    turnover_class: pickFirst(node, ["Omsättning, år", "omsattning", "oms_klass"]),
    phones,
    emails,
    raw: payload,
    fetched_at: new Date().toISOString(),
  };
}

function findCompanyNode(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload) && payload.length > 0 && typeof payload[0] === "object") {
    return asObject(payload[0]);
  }
  const root = asObject(payload);
  const candidates = ["data", "result", "Foretag", "foretag", "company", "item", "items", "records", "Hits"];
  for (const key of candidates) {
    const val = root[key];
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") return asObject(val[0]);
    if (val && typeof val === "object" && !Array.isArray(val)) return asObject(val);
  }
  return root;
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
  return k
    .toLowerCase()
    .replace(/å|ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/é|è/g, "e")
    .replace(/[^a-z0-9]/g, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
