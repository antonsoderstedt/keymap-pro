
CREATE TABLE public.data_source_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'not_connected',
  last_synced_at timestamptz,
  last_error text,
  ttl_seconds integer NOT NULL DEFAULT 1800,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, source)
);

ALTER TABLE public.data_source_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view data source status"
  ON public.data_source_status FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Owners insert data source status"
  ON public.data_source_status FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = data_source_status.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Owners update data source status"
  ON public.data_source_status FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = data_source_status.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Owners delete data source status"
  ON public.data_source_status FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = data_source_status.project_id AND p.user_id = auth.uid()
  ));

CREATE TRIGGER touch_data_source_status_updated_at
  BEFORE UPDATE ON public.data_source_status
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Helper used by edge functions (service role) to upsert status atomically.
CREATE OR REPLACE FUNCTION public.mark_source_status(
  _project_id uuid,
  _source text,
  _status text,
  _last_error text DEFAULT NULL,
  _meta jsonb DEFAULT '{}'::jsonb,
  _bump_synced boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.data_source_status (project_id, source, status, last_error, meta, last_synced_at)
  VALUES (
    _project_id,
    _source,
    _status,
    _last_error,
    COALESCE(_meta, '{}'::jsonb),
    CASE WHEN _bump_synced AND _status = 'ok' THEN now() ELSE NULL END
  )
  ON CONFLICT (project_id, source) DO UPDATE
  SET status = EXCLUDED.status,
      last_error = EXCLUDED.last_error,
      meta = data_source_status.meta || EXCLUDED.meta,
      last_synced_at = CASE
        WHEN _bump_synced AND EXCLUDED.status = 'ok' THEN now()
        ELSE data_source_status.last_synced_at
      END,
      updated_at = now();
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.data_source_status;
ALTER TABLE public.data_source_status REPLICA IDENTITY FULL;
