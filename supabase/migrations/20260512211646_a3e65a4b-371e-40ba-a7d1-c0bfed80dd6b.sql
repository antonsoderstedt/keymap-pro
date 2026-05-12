CREATE TABLE public.keyword_serp_cache (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword       text NOT NULL,
  location_code integer NOT NULL DEFAULT 2752,
  result_json   jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);

CREATE UNIQUE INDEX idx_kw_serp_cache_kw
  ON public.keyword_serp_cache(keyword, location_code);

CREATE INDEX idx_kw_serp_cache_expires
  ON public.keyword_serp_cache(expires_at);

ALTER TABLE public.keyword_serp_cache ENABLE ROW LEVEL SECURITY;

-- Ingen policy = ingen åtkomst för anon/authenticated. Service role bypassar RLS.