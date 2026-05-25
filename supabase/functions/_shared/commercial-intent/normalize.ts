// Pure keyword normalization. No I/O. Used everywhere a keyword is keyed.
//
// Rules (locked v1):
//   - NFKC normalize
//   - lowercase (Swedish-safe via toLocaleLowerCase("sv"))
//   - collapse whitespace
//   - strip leading/trailing non-alphanumeric chars
//   - keep word order (semantic), do not sort
//   - tokens split on whitespace + hyphens
//
// Bumping this changes content_hash for every keyword → requires MODEL_VERSION
// bump on `commercial-intent-v*`.

export function normalizeKeyword(input: string): string {
  if (!input) return "";
  const nfkc = input.normalize("NFKC");
  const lower = nfkc.toLocaleLowerCase("sv");
  const collapsed = lower.replace(/\s+/g, " ").trim();
  // Strip surrounding punctuation but keep internal hyphens, apostrophes, &.
  return collapsed.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function tokenize(normalized: string): string[] {
  if (!normalized) return [];
  return normalized
    .split(/[\s\-]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}&']+/gu, ""))
    .filter((t) => t.length > 0);
}

// Exact-token containment, case-insensitive (input expected normalized).
export function hasToken(normalized: string, token: string): boolean {
  const t = normalizeKeyword(token);
  if (!t) return false;
  return tokenize(normalized).includes(t);
}

export function hasAnyToken(normalized: string, tokens: readonly string[]): string | null {
  const set = new Set(tokenize(normalized));
  for (const t of tokens) {
    const n = normalizeKeyword(t);
    if (n && set.has(n)) return n;
  }
  return null;
}
