import { supabase } from "@/integrations/supabase/client";

// In-memory cache (lifetime = page session) with sessionStorage fallback
// så att navigation mellan vyer slipper extra Supabase-rundresor.
const memory = new Map<string, any[]>();
const STORAGE_PREFIX = "kw_universe_cache:";
const TTL_MS = 1000 * 60 * 30; // 30 min

type StoredEntry = { ts: number; universe: any[] };

function readStorage(analysisId: string): any[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + analysisId);
    if (!raw) return null;
    const parsed: StoredEntry = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > TTL_MS) return null;
    return Array.isArray(parsed.universe) ? parsed.universe : null;
  } catch {
    return null;
  }
}

function writeStorage(analysisId: string, universe: any[]) {
  try {
    sessionStorage.setItem(
      STORAGE_PREFIX + analysisId,
      JSON.stringify({ ts: Date.now(), universe } satisfies StoredEntry),
    );
  } catch {
    // Storage kan vara full eller blockerad — strunta i det, memory räcker.
  }
}

function normalize(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.keywords)) return raw.keywords;
  return [];
}

export async function getKeywordUniverse(analysisId: string): Promise<any[]> {
  if (!analysisId) return [];
  const mem = memory.get(analysisId);
  if (mem) return mem;
  const stored = readStorage(analysisId);
  if (stored) {
    memory.set(analysisId, stored);
    return stored;
  }
  const { data } = await supabase
    .from("analyses")
    .select("keyword_universe_json")
    .eq("id", analysisId)
    .maybeSingle();
  const universe = normalize(data?.keyword_universe_json);
  memory.set(analysisId, universe);
  writeStorage(analysisId, universe);
  return universe;
}

export function setKeywordUniverse(analysisId: string, raw: any) {
  if (!analysisId) return;
  const universe = normalize(raw);
  memory.set(analysisId, universe);
  writeStorage(analysisId, universe);
}

export function invalidateKeywordUniverse(analysisId?: string) {
  if (!analysisId) {
    memory.clear();
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith(STORAGE_PREFIX))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch { /* ignore */ }
    return;
  }
  memory.delete(analysisId);
  try { sessionStorage.removeItem(STORAGE_PREFIX + analysisId); } catch { /* ignore */ }
}
