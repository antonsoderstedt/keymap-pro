create table public.keyword_planner_ideas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid not null,
  seed_keyword text,
  seed_url text,
  keyword text not null,
  language_code text not null,
  location_code text not null,
  avg_monthly_searches integer,
  competition text,
  competition_index integer,
  low_top_of_page_bid_micros bigint,
  high_top_of_page_bid_micros bigint,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_kpi_project_keyword on public.keyword_planner_ideas (project_id, keyword);
create index idx_kpi_project_run on public.keyword_planner_ideas (project_id, run_id, fetched_at desc);
create unique index uq_kpi_project_run_keyword on public.keyword_planner_ideas (project_id, run_id, keyword);

alter table public.keyword_planner_ideas enable row level security;

create policy "members can read kpi"
  on public.keyword_planner_ideas
  for select
  using (public.is_project_member(project_id, auth.uid()));

create policy "service role writes kpi"
  on public.keyword_planner_ideas
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');