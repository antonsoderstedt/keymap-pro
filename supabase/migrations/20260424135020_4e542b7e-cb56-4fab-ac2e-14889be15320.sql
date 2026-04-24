ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS competitors text;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS keyword_universe_json jsonb;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS universe_scale text;