CREATE TABLE public.google_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own google tokens"
ON public.google_tokens FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own google tokens"
ON public.google_tokens FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own google tokens"
ON public.google_tokens FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own google tokens"
ON public.google_tokens FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER touch_google_tokens_updated_at
BEFORE UPDATE ON public.google_tokens
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();