-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Projects Table
create table if not exists shpitto_projects (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null, -- Supabase User ID
  source_app text default 'shpitto', -- 'shpitto' or other app names
  name text not null,
  config jsonb not null, -- Stores ProjectBlueprint (Puck JSON)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Deployments Table
create table if not exists shpitto_deployments (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references shpitto_projects(id),
  environment text not null, -- 'preview' or 'production'
  status text not null,
  url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Project Site Bindings (one generated website <-> one Shpitto project)
create table if not exists shpitto_project_sites (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references shpitto_projects(id) on delete cascade,
  tenant_id uuid not null,
  source_app text not null default 'shpitto',
  site_key text not null,
  deployment_host text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(project_id),
  unique(site_key),
  unique(deployment_host)
);

-- Contact Form Submissions
create table if not exists shpitto_contact_submissions (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references shpitto_projects(id) on delete cascade,
  tenant_id uuid not null,
  source_app text not null default 'shpitto',
  site_key text not null references shpitto_project_sites(site_key),
  submission_data jsonb not null,
  visitor_ip text,
  user_agent text,
  origin text,
  referer text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_shpitto_projects_tenant_source
  on shpitto_projects(tenant_id, source_app);
create index if not exists idx_shpitto_deployments_project
  on shpitto_deployments(project_id);
create index if not exists idx_shpitto_project_sites_tenant_source
  on shpitto_project_sites(tenant_id, source_app);
create index if not exists idx_shpitto_contact_submissions_tenant_created
  on shpitto_contact_submissions(tenant_id, created_at desc);
create index if not exists idx_shpitto_contact_submissions_project_created
  on shpitto_contact_submissions(project_id, created_at desc);

-- RLS Policies
alter table shpitto_projects enable row level security;
alter table shpitto_deployments enable row level security;
alter table shpitto_project_sites enable row level security;
alter table shpitto_contact_submissions enable row level security;

drop policy if exists "Users can view own projects" on shpitto_projects;
drop policy if exists "Users can insert own projects" on shpitto_projects;
drop policy if exists "Users can update own projects" on shpitto_projects;
drop policy if exists "Users can view own deployments" on shpitto_deployments;
drop policy if exists "Users can insert own deployments" on shpitto_deployments;
drop policy if exists "Users can view own project site bindings" on shpitto_project_sites;
drop policy if exists "Users can insert own project site bindings" on shpitto_project_sites;
drop policy if exists "Users can update own project site bindings" on shpitto_project_sites;
drop policy if exists "Users can view own contact submissions" on shpitto_contact_submissions;

create policy "Users can view own projects" on shpitto_projects
  for select using (auth.uid() = tenant_id and source_app = 'shpitto');

create policy "Users can insert own projects" on shpitto_projects
  for insert with check (auth.uid() = tenant_id and source_app = 'shpitto');

create policy "Users can update own projects" on shpitto_projects
  for update using (auth.uid() = tenant_id and source_app = 'shpitto');

create policy "Users can view own deployments" on shpitto_deployments
  for select using (
    project_id in (select id from shpitto_projects where tenant_id = auth.uid())
  );

create policy "Users can insert own deployments" on shpitto_deployments
  for insert with check (
    project_id in (
      select id from shpitto_projects
      where tenant_id = auth.uid() and source_app = 'shpitto'
    )
  );

create policy "Users can view own project site bindings" on shpitto_project_sites
  for select using (auth.uid() = tenant_id and source_app = 'shpitto');

create policy "Users can insert own project site bindings" on shpitto_project_sites
  for insert with check (auth.uid() = tenant_id and source_app = 'shpitto');

create policy "Users can update own project site bindings" on shpitto_project_sites
  for update using (auth.uid() = tenant_id and source_app = 'shpitto');

create policy "Users can view own contact submissions" on shpitto_contact_submissions
  for select using (auth.uid() = tenant_id and source_app = 'shpitto');

-- Public contact ingest entrypoint.
-- SECURITY DEFINER lets us keep project-site binding private while still accepting public submissions.
create or replace function shpitto_submit_contact(
  p_site_key text,
  p_submission_data jsonb,
  p_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_tenant_id uuid;
  v_source_app text;
  v_submission_id uuid;
begin
  select ps.project_id, ps.tenant_id, ps.source_app
    into v_project_id, v_tenant_id, v_source_app
  from shpitto_project_sites ps
  where ps.site_key = p_site_key
    and ps.source_app = 'shpitto'
  limit 1;

  if v_project_id is null then
    raise exception 'Invalid site key';
  end if;

  insert into shpitto_contact_submissions (
    project_id,
    tenant_id,
    source_app,
    site_key,
    submission_data,
    visitor_ip,
    user_agent,
    origin,
    referer
  )
  values (
    v_project_id,
    v_tenant_id,
    v_source_app,
    p_site_key,
    coalesce(p_submission_data, '{}'::jsonb),
    coalesce(p_meta->>'ip', ''),
    coalesce(p_meta->>'user_agent', ''),
    coalesce(p_meta->>'origin', ''),
    coalesce(p_meta->>'referer', '')
  )
  returning id into v_submission_id;

  return v_submission_id;
end;
$$;

grant execute on function shpitto_submit_contact(text, jsonb, jsonb) to anon;
grant execute on function shpitto_submit_contact(text, jsonb, jsonb) to authenticated;
