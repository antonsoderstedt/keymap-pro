// Imports an Auction Insights CSV/TSV exported from Google Ads UI.
// Accepts UTF-16 LE/BE with BOM (Google's default) or UTF-8. Tab- or comma-separated.
// Writes a new snapshot to auction_insights_snapshots with source='csv'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const { project_id, filename, content_base64, dry_run } = await req.json();
    if (!project_id || typeof project_id !== "string") return json({ error: "project_id krävs" }, 400);
    if (!content_base64 || typeof content_base64 !== "string") return json({ error: "content_base64 krävs" }, 400);
    if (content_base64.length > 8_000_000) return json({ error: "Filen är för stor (max ~6 MB)" }, 413);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isMember } = await admin.rpc("is_project_member", {
      _project_id: project_id, _user_id: userData.user.id,
    });
    if (!isMember) return json({ error: "forbidden" }, 403);

    // Decode base64 → bytes → text (try UTF-16 LE/BE BOM first, fall back to UTF-8)
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(content_base64), (c) => c.charCodeAt(0));
    } catch {
      return json({ error: "Filen kunde inte avkodas (ogiltig base64)" }, 400);
    }
    const text = decodeText(bytes);
    if (!text.trim()) return json({ error: "Filen är tom" }, 400);

    const parsed = parseAuctionCsv(text);
    const validation = validateParsed(parsed);
    if (!validation.ok) {
      return json({
        error: validation.message,
        validation: {
          missing_columns: validation.missingColumns,
          found_columns: parsed.header,
          row_count: parsed.rowCount,
          competitor_count: parsed.competitors.length,
          hint: validation.hint,
        },
      }, 400);
    }

    const start = parsed.startDate || todayMinus(30);
    const end = parsed.endDate || today();

    if (dry_run) {
      return json({
        ok: true,
        dry_run: true,
        competitors: parsed.competitors.length,
        sample: parsed.competitors.slice(0, 5),
        start_date: start, end_date: end,
        warnings: validation.warnings,
        found_columns: parsed.header,
      });
    }

    const { data: ins, error: iErr } = await admin
      .from("auction_insights_snapshots")
      .insert({
        project_id,
        start_date: start,
        end_date: end,
        source: "csv",
        rows: { competitors: parsed.competitors, campaigns: [], filename: filename || null },
      })
      .select("id")
      .single();
    if (iErr) throw iErr;

    return json({ ok: true, snapshot_id: ins.id, competitors: parsed.competitors.length, start_date: start, end_date: end });
  } catch (e: any) {
    console.error("ads-import-auction-csv", e);
    return json({ error: e.message || "internal" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  // Heuristic: lots of NUL bytes → UTF-16
  let nuls = 0;
  for (let i = 0; i < Math.min(bytes.length, 200); i++) if (bytes[i] === 0) nuls++;
  if (nuls > 20) return new TextDecoder("utf-16le").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

interface ParsedCsv {
  competitors: any[];
  rowCount: number;
  header: string[];
  startDate: string | null;
  endDate: string | null;
}

function parseAuctionCsv(text: string): ParsedCsv {
  // Normalize newlines, drop trailing whitespace lines
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { competitors: [], rowCount: 0, header: [], startDate: null, endDate: null };

  // Detect delimiter from the line that has the most fields among first 10
  const sample = lines.slice(0, 10);
  const tabScore = sample.reduce((s, l) => s + (l.split("\t").length - 1), 0);
  const commaScore = sample.reduce((s, l) => s + (l.split(",").length - 1), 0);
  const delim = tabScore >= commaScore ? "\t" : ",";

  // Try to extract date range from any preamble line like "1 mars 2026 – 31 mars 2026" or ISO dates
  let startDate: string | null = null;
  let endDate: string | null = null;
  for (const l of lines.slice(0, 6)) {
    const isoMatch = l.match(/(\d{4}-\d{2}-\d{2}).{1,5}(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) { startDate = isoMatch[1]; endDate = isoMatch[2]; break; }
  }

  // Find header row: row containing "Display URL domain" / "Visnings-URL-domän" or "Domain"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cells = splitRow(lines[i], delim);
    if (cells.some((c) => /display\s*url\s*domain|visnings.?url|^domain$|domän/i.test(c.trim()))) {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) {
    // Try first row that has >= 3 cells
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      if (splitRow(lines[i], delim).length >= 3) { headerIdx = i; break; }
    }
  }
  if (headerIdx === -1) return { competitors: [], rowCount: lines.length, header: [], startDate, endDate };

  const header = splitRow(lines[headerIdx], delim).map((h) => h.trim());
  const idx = matchColumns(header);

  const competitors: any[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitRow(lines[i], delim);
    if (cells.length < 2) continue;

    const rawDomain = (idx.domain >= 0 ? cells[idx.domain] : cells[0]) || "";
    const domain = rawDomain.toLowerCase().trim().replace(/^"|"$/g, "");
    if (!domain) continue;
    // Skip aggregate rows
    if (/^you$|^du$|total|summa|^--$/i.test(domain)) continue;
    // Skip section dividers (single non-data cell)
    if (cells.filter((c) => c.trim().length > 0).length < 2) continue;

    competitors.push({
      domain,
      impressionShare:  pct(cells[idx.imprShare]),
      overlapRate:      pct(cells[idx.overlap]),
      positionAbove:    pct(cells[idx.posAbove]),
      topOfPage:        pct(cells[idx.topOfPage]),
      absTopOfPage:     pct(cells[idx.absTop]),
      outrankingShare:  pct(cells[idx.outranking]),
      campaigns: [],
    });
  }

  // Dedupe by domain (keep highest impression_share)
  const map = new Map<string, any>();
  for (const c of competitors) {
    const prev = map.get(c.domain);
    if (!prev || (c.impressionShare ?? 0) > (prev.impressionShare ?? 0)) map.set(c.domain, c);
  }
  const out = Array.from(map.values()).sort((a, b) => (b.impressionShare ?? 0) - (a.impressionShare ?? 0));

  return { competitors: out, rowCount: lines.length - headerIdx - 1, header, startDate, endDate };
}

function splitRow(line: string, delim: string): string[] {
  // Handle simple quoted CSV fields (commas inside quotes). For tabs, simple split is fine.
  if (delim === "\t") return line.split("\t");
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === delim && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function matchColumns(header: string[]) {
  const find = (...patterns: RegExp[]) => {
    for (let i = 0; i < header.length; i++) {
      const h = header[i].toLowerCase();
      if (patterns.some((p) => p.test(h))) return i;
    }
    return -1;
  };
  return {
    domain:     find(/display\s*url\s*domain/, /visnings.?url.?dom/, /^dom(an|än|ain)$/),
    imprShare:  find(/impr.*share|exponering.*andel|visning.*andel/),
    overlap:    find(/overlap|överlapp|overlapprate/),
    posAbove:   find(/position\s*above|position\s*över|position.*above/),
    topOfPage:  find(/top\s*of\s*page|överst.*sida|top\s*page/),
    absTop:     find(/abs.*top|absolut.*överst|abs(?:olute)?\s*top/),
    outranking: find(/outranking|överträffa|rangordning/),
  };
}

function pct(v: any): number | null {
  if (v == null) return null;
  let s = String(v).trim().replace(/^"|"$/g, "");
  if (!s || s === "--" || s === "-" || s.toLowerCase() === "n/a") return null;
  const hasPct = s.includes("%");
  s = s.replace(/%/g, "").replace(/\s/g, "").replace(/<\s*/g, "").replace(/>\s*/g, "");
  // Swedish decimals
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  s = s.replace(/[^\d.\-]/g, "");
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return hasPct || n > 1 ? n / 100 : n;
}

function today(): string { return new Date().toISOString().slice(0, 10); }
function todayMinus(d: number): string {
  const t = new Date(); t.setDate(t.getDate() - d);
  return t.toISOString().slice(0, 10);
}
