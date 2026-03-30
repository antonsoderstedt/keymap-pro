
-- Create projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  domain TEXT,
  market TEXT NOT NULL DEFAULT 'se-sv',
  products TEXT,
  known_segments TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- Create customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  sni TEXT,
  domain TEXT,
  revenue TEXT,
  frequency TEXT,
  products TEXT
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view customers of own projects" ON public.customers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = customers.project_id AND projects.user_id = auth.uid())
);
CREATE POLICY "Users can create customers for own projects" ON public.customers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = customers.project_id AND projects.user_id = auth.uid())
);
CREATE POLICY "Users can update customers of own projects" ON public.customers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = customers.project_id AND projects.user_id = auth.uid())
);
CREATE POLICY "Users can delete customers of own projects" ON public.customers FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = customers.project_id AND projects.user_id = auth.uid())
);

-- Create analyses table
CREATE TABLE public.analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  options JSONB NOT NULL DEFAULT '{}',
  result_json JSONB,
  scan_data_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view analyses of own projects" ON public.analyses FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = analyses.project_id AND projects.user_id = auth.uid())
);
CREATE POLICY "Users can create analyses for own projects" ON public.analyses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = analyses.project_id AND projects.user_id = auth.uid())
);
CREATE POLICY "Users can update analyses of own projects" ON public.analyses FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = analyses.project_id AND projects.user_id = auth.uid())
);
