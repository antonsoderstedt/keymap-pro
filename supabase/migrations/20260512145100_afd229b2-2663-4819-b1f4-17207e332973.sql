ALTER PUBLICATION supabase_realtime ADD TABLE public.analyses;
ALTER TABLE public.analyses REPLICA IDENTITY FULL;