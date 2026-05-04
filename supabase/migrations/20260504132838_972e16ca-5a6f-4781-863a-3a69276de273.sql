-- Begränsa EXECUTE på SECURITY DEFINER-funktionerna till endast authenticated
REVOKE ALL ON FUNCTION public.is_project_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.has_project_role(uuid, uuid, public.project_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_project_role(uuid, uuid, public.project_role) TO authenticated;