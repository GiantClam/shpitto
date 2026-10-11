-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Projects Table
create table if not exists shpitto_projects (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null, -- Supabase User ID
  source_app text default 'shpitto', -- 'shpitto' or other app names
  name text not null,
  config jsonb not null, -- Stores ProjectBlueprint (Puck JSON)
  project_status text not null default 'active',
  deleted_at timestamp with time zone,
  archived_at timestamp with time zone,
  cleanup_started_at timestamp with time zone,
  cleanup_completed_at timestamp with time zone,
  cleanup_status text,
  cleanup_error text,
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

-- Auth email mirror and one-time token tables.
-- These tables are service-role only. They let Shpitto send verification/reset
-- emails through Cloudflare Email Service instead of Supabase managed email.
create table if not exists shpitto_auth_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  email_verified boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists shpitto_email_verification_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamp with time zone not null,
  used_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists shpitto_password_reset_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamp with time zone not null,
  used_at timestamp with time zone,
  requested_ip text,
  user_agent text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists shpitto_billing_plans (
  id text primary key,
  code text not null unique,
  name text not null,
  site_limit integer not null,
  base_monthly_price_minor integer not null,
  currency text not null,
  min_months integer not null default 12,
  is_one_time boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists shpitto_entitlements (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null,
  status text not null,
  site_limit integer not null,
  valid_from timestamp with time zone not null,
  valid_until timestamp with time zone not null,
  current_period_months integer not null,
  auto_renew boolean not null default false,
  paypal_subscription_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists shpitto_checkout_sessions (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null,
  plan_code text not null,
  months integer not null,
  site_limit integer not null,
  currency text not null,
  amount_minor integer not null,
  discount_factor numeric not null,
  price_snapshot jsonb not null,
  status text not null,
  paypal_order_id text unique,
  paypal_subscription_id text,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists shpitto_billing_ledger (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id uuid references shpitto_entitlements(id),
  checkout_session_id uuid references shpitto_checkout_sessions(id),
  entry_type text not null,
  amount_minor integer not null,
  currency text not null,
  service_days integer not null default 0,
  service_start timestamp with time zone,
  service_end timestamp with time zone,
  paypal_order_id text,
  paypal_capture_id text unique,
  paypal_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists shpitto_paypal_events (
  id text primary key,
  event_type text not null,
  resource_id text,
  payload jsonb not null,
  processed_at timestamp with time zone,
  processing_error text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists shpitto_billing_project_usages (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_app text not null default 'shpitto',
  source_project_id text not null,
  project_name text not null default '',
  project_status text not null default 'active',
  deleted_at timestamp with time zone,
  archived_at timestamp with time zone,
  cleanup_started_at timestamp with time zone,
  cleanup_completed_at timestamp with time zone,
  cleanup_status text,
  cleanup_error text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  unique(owner_user_id, source_app, source_project_id)
);

create index if not exists idx_shpitto_projects_tenant_source
  on shpitto_projects(tenant_id, source_app);
create index if not exists idx_shpitto_projects_billable_tenant
  on shpitto_projects(tenant_id, cleanup_completed_at);
create index if not exists idx_shpitto_deployments_project
  on shpitto_deployments(project_id);
create index if not exists idx_shpitto_project_sites_tenant_source
  on shpitto_project_sites(tenant_id, source_app);
create index if not exists idx_shpitto_contact_submissions_tenant_created
  on shpitto_contact_submissions(tenant_id, created_at desc);
create index if not exists idx_shpitto_contact_submissions_project_created
  on shpitto_contact_submissions(project_id, created_at desc);
create index if not exists idx_shpitto_email_verification_tokens_user
  on shpitto_email_verification_tokens(user_id);
create index if not exists idx_shpitto_password_reset_tokens_user
  on shpitto_password_reset_tokens(user_id);
create index if not exists idx_shpitto_entitlements_owner
  on shpitto_entitlements(owner_user_id, status, valid_until desc);
create index if not exists idx_shpitto_checkout_sessions_owner
  on shpitto_checkout_sessions(owner_user_id, created_at desc);
create index if not exists idx_shpitto_billing_ledger_owner
  on shpitto_billing_ledger(owner_user_id, created_at desc);
create index if not exists idx_shpitto_billing_project_usages_owner
  on shpitto_billing_project_usages(owner_user_id, cleanup_completed_at);

-- RLS Policies
alter table shpitto_projects enable row level security;
alter table shpitto_deployments enable row level security;
alter table shpitto_project_sites enable row level security;
alter table shpitto_contact_submissions enable row level security;
alter table shpitto_auth_users enable row level security;
alter table shpitto_email_verification_tokens enable row level security;
alter table shpitto_password_reset_tokens enable row level security;
alter table shpitto_billing_plans enable row level security;
alter table shpitto_entitlements enable row level security;
alter table shpitto_checkout_sessions enable row level security;
alter table shpitto_billing_ledger enable row level security;
alter table shpitto_paypal_events enable row level security;
alter table shpitto_billing_project_usages enable row level security;

drop policy if exists "Users can view own projects" on shpitto_projects;
drop policy if exists "Users can insert own projects" on shpitto_projects;
drop policy if exists "Users can update own projects" on shpitto_projects;
drop policy if exists "Users can view own deployments" on shpitto_deployments;
drop policy if exists "Users can insert own deployments" on shpitto_deployments;
drop policy if exists "Users can view own project site bindings" on shpitto_project_sites;
drop policy if exists "Users can insert own project site bindings" on shpitto_project_sites;
drop policy if exists "Users can update own project site bindings" on shpitto_project_sites;
drop policy if exists "Users can view own contact submissions" on shpitto_contact_submissions;
drop policy if exists "Users can view billing plans" on shpitto_billing_plans;
drop policy if exists "Users can view own entitlements" on shpitto_entitlements;
drop policy if exists "Users can view own checkout sessions" on shpitto_checkout_sessions;
drop policy if exists "Users can view own billing ledger" on shpitto_billing_ledger;
drop policy if exists "Users can view own billing project usages" on shpitto_billing_project_usages;

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

create policy "Users can view billing plans" on shpitto_billing_plans
  for select using (active = true);

create policy "Users can view own entitlements" on shpitto_entitlements
  for select using (auth.uid() = owner_user_id);

create policy "Users can view own checkout sessions" on shpitto_checkout_sessions
  for select using (auth.uid() = owner_user_id);

create policy "Users can view own billing ledger" on shpitto_billing_ledger
  for select using (auth.uid() = owner_user_id);

create policy "Users can view own billing project usages" on shpitto_billing_project_usages
  for select using (auth.uid() = owner_user_id);

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
