CREATE TABLE public.briefing_email_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'to',
  enabled BOOLEAN NOT NULL DEFAULT true,
  auto_send BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT briefing_recip_role_chk CHECK (role IN ('to','cc','bcc')),
  CONSTRAINT briefing_recip_unique UNIQUE (project_id, email)
);

CREATE INDEX briefing_recip_project_idx ON public.briefing_email_recipients (project_id);

ALTER TABLE public.briefing_email_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view briefing recipients"
  ON public.briefing_email_recipients FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners insert briefing recipients"
  ON public.briefing_email_recipients FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners update briefing recipients"
  ON public.briefing_email_recipients FOR UPDATE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners delete briefing recipients"
  ON public.briefing_email_recipients FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE TRIGGER briefing_recip_touch
  BEFORE UPDATE ON public.briefing_email_recipients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();