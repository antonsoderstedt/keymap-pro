// SHA-256 hex hashing using Web Crypto. Works in Deno, Node 20+, and browsers.
// Used for content_hash on embeddings, inputs_hash on decision_context, and
// evidence_hash on clusters.

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Canonical JSON serializer — sorts keys recursively so two equivalent payloads
// produce the same hash. Used for inputs_hash computation.
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJSON).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return "{" + keys
    .map((k) => JSON.stringify(k) + ":" + canonicalJSON((value as Record<string, unknown>)[k]))
    .join(",") + "}";
}

export async function hashCanonical(value: unknown): Promise<string> {
  return sha256Hex(canonicalJSON(value));
}
