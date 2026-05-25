// Embedding client. IMPURE — uses fetch + env vars.
//
// Talks to the Lovable AI gateway (OpenAI-compatible). Returns 1536-dim vectors
// to match the schema. Batches inputs at the call site (caller controls batch
// size; this function performs ONE API call).
//
// Idempotency is the caller's responsibility: caller computes content_hash and
// only embeds when the hash is new (or model_version changed).

import { EMBEDDING_DIMS, EMBEDDING_MODEL, EMBEDDING_MODEL_VERSION } from "./constants.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/embeddings";

export interface EmbedResult {
  vectors: number[][];
  model_version: string;
  dims: number;
}

export class EmbeddingError extends Error {
  constructor(message: string, public status?: number, public body?: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

export async function embedTexts(texts: string[], apiKey: string): Promise<EmbedResult> {
  if (texts.length === 0) return { vectors: [], model_version: EMBEDDING_MODEL_VERSION, dims: EMBEDDING_DIMS };
  if (!apiKey) throw new EmbeddingError("LOVABLE_API_KEY missing");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new EmbeddingError(`Embedding API ${res.status}`, res.status, body);
  }

  const data = await res.json();
  const items = (data?.data ?? []) as Array<{ embedding: number[]; index: number }>;
  if (items.length !== texts.length) {
    throw new EmbeddingError(
      `Embedding count mismatch: requested=${texts.length} received=${items.length}`,
    );
  }

  // Preserve input order
  const sorted = [...items].sort((a, b) => a.index - b.index);
  const vectors = sorted.map((it) => it.embedding);

  // Validate dims
  for (const v of vectors) {
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIMS) {
      throw new EmbeddingError(
        `Embedding dim mismatch: expected=${EMBEDDING_DIMS} got=${v?.length}`,
      );
    }
  }

  return { vectors, model_version: EMBEDDING_MODEL_VERSION, dims: EMBEDDING_DIMS };
}
