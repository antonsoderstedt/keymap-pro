CREATE TABLE public.keyword_metrics (
  keyword text NOT NULL,
  location_code integer NOT NULL DEFAULT 2752,
  search_volume integer,
  cpc_sek numeric,
  competition numeric,
  trend_json jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (keyword, location_code)
);

CREATE INDEX idx_keyword_metrics_updated ON public.keyword_metrics(updated_at);

ALTER TABLE public.keyword_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read keyword metrics"
ON public.keyword_metrics
FOR SELECT
TO authenticated
USING (true);