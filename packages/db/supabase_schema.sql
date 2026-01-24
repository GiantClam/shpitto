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

-- RLS Policies (Optional but recommended)
alter table shpitto_projects enable row level security;
alter table shpitto_deployments enable row level security;

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
    project_id in (select id from shpitto_projects where tenant_id = auth.uid())
  );
