-- Roller per projekt (Fas 7)

-- Enum för roller
DO $$ BEGIN
  CREATE TYPE public.project_role AS ENUM ('owner', 'editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.project_role NOT NULL DEFAULT 'viewer',
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Säker funktion för medlemskapscheck (undviker rekursiv RLS)
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id AND p.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_project_role(_project_id uuid, _user_id uuid, _role public.project_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id AND role = _role
  )
  OR (
    _role = 'owner' AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = _project_id AND p.user_id = _user_id
    )
  );
$$;

-- RLS policies
DROP POLICY IF EXISTS "members_can_view_their_project_members" ON public.project_members;
CREATE POLICY "members_can_view_their_project_members"
  ON public.project_members
  FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "owners_can_insert_members" ON public.project_members;
CREATE POLICY "owners_can_insert_members"
  ON public.project_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'owner'));

DROP POLICY IF EXISTS "owners_can_update_members" ON public.project_members;
CREATE POLICY "owners_can_update_members"
  ON public.project_members
  FOR UPDATE
  TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));

DROP POLICY IF EXISTS "owners_can_delete_members" ON public.project_members;
CREATE POLICY "owners_can_delete_members"
  ON public.project_members
  FOR DELETE
  TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_project_members_touch_updated_at ON public.project_members;
CREATE TRIGGER trg_project_members_touch_updated_at
  BEFORE UPDATE ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();