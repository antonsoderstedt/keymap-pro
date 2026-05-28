-- Keyword scoring pipeline + research sessions + keyword master registry

create table if not exists public.keyword_scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  keyword text not null,
  score numeric not null default 0,
  confidence numeric not null default 0,
  kundfit numeric not null default 0,
  dimension text,
  intent_class text,
  volume integer,
  cpc numeric,
  kd integer,
  gsc_clicks integer,
  gsc_position numeric,
  monthly_value_sek numeric,
  sources text[] not null default '{}',
  insufficient_data boolean not null default false,
  source text,
  scored_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, keyword)
);

create index if not exists idx_keyword_scores_project_score on public.keyword_scores(project_id, score desc);
create index if not exists idx_keyword_scores_project_intent on public.keyword_scores(project_id, intent_class);

alter table public.keyword_scores enable row level security;

create policy "Members view keyword scores"
  on public.keyword_scores for select
  using (public.is_project_member(project_id, auth.uid()));

create policy "Owners insert keyword scores"
  on public.keyword_scores for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Owners update keyword scores"
  on public.keyword_scores for update
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Owners delete keyword scores"
  on public.keyword_scores for delete
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create trigger trg_keyword_scores_touch_updated_at
before update on public.keyword_scores
for each row execute function public.touch_updated_at();

create table if not exists public.keyword_research_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  seed text not null,
  mode text not null default 'keyword',
  depth text not null default 'quick',
  result_count integer,
  results jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_keyword_research_sessions_project_created on public.keyword_research_sessions(project_id, created_at desc);

alter table public.keyword_research_sessions enable row level security;

create policy "Members view keyword research sessions"
  on public.keyword_research_sessions for select
  using (public.is_project_member(project_id, auth.uid()));

create policy "Owners insert keyword research sessions"
  on public.keyword_research_sessions for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Owners delete keyword research sessions"
  on public.keyword_research_sessions for delete
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create table if not exists public.keyword_master (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  keyword text not null,
  status text not null default 'suggested',
  ads_campaign text,
  ads_adgroup text,
  ads_match_type text,
  ads_status text,
  ads_spend_30d numeric,
  ads_conversions_30d numeric,
  ads_is_negative boolean not null default false,
  ads_negative_level text,
  gsc_position numeric,
  gsc_clicks_30d integer,
  gsc_impressions_30d integer,
  kundfit numeric,
  volume integer,
  cpc numeric,
  kd integer,
  dimension text,
  intent_class text,
  conflict_flag boolean not null default false,
  notes text,
  added_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, keyword)
);

create index if not exists idx_keyword_master_project_status on public.keyword_master(project_id, status);
create index if not exists idx_keyword_master_project_conflict on public.keyword_master(project_id, conflict_flag);

alter table public.keyword_master enable row level security;

create policy "Members view keyword master"
  on public.keyword_master for select
  using (public.is_project_member(project_id, auth.uid()));

create policy "Owners insert keyword master"
  on public.keyword_master for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Owners update keyword master"
  on public.keyword_master for update
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Owners delete keyword master"
  on public.keyword_master for delete
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create trigger trg_keyword_master_touch_updated_at
before update on public.keyword_master
for each row execute function public.touch_updated_at();
