-- M3 tasks 4.2-4.3: one-time dispatch claims, provider evidence, quarantine, and owned assets.

alter table app.generation_tasks add column if not exists dispatch_identity uuid;
alter table app.generation_tasks add column if not exists provider_cost_state text;
alter table app.generation_tasks add column if not exists provider_cost_minor bigint;
alter table app.generation_tasks add column if not exists provider_cost_currency text;
alter table app.generation_tasks drop constraint if exists generation_tasks_provider_cost_check;
alter table app.generation_tasks add constraint generation_tasks_provider_cost_check
  check (provider_cost_state is null or provider_cost_state in ('unknown', 'known', 'not_applicable'));

create table if not exists app.submission_attempts (
  id uuid primary key,
  task_id uuid not null,
  workspace_id uuid not null,
  attempt_no integer not null check (attempt_no > 0),
  provider text not null,
  client_reference uuid not null,
  provider_request_id text,
  state text not null check (state in ('claimed', 'submitted', 'running', 'materializing', 'succeeded', 'failed', 'submission_unknown')),
  started_at timestamptz not null,
  reconcile_deadline timestamptz not null,
  probe_count integer not null default 0 check (probe_count >= 0),
  cost_minor bigint,
  cost_currency text,
  cost_state text not null default 'unknown' check (cost_state in ('unknown', 'known', 'not_applicable')),
  constraint submission_attempts_task_workspace_fk foreign key (task_id, workspace_id)
    references app.generation_tasks(id, workspace_id) on delete restrict
);
create unique index if not exists submission_attempts_task_no_uq on app.submission_attempts(task_id, attempt_no);
create unique index if not exists submission_attempts_client_reference_uq on app.submission_attempts(client_reference);
create unique index if not exists submission_attempts_provider_request_uq
  on app.submission_attempts(provider, provider_request_id) where provider_request_id is not null;

create table if not exists app.generation_quarantine (
  id uuid primary key,
  task_id uuid not null,
  workspace_id uuid not null,
  event_type text not null,
  event_key text not null,
  payload jsonb not null,
  created_at timestamptz not null,
  constraint generation_quarantine_task_workspace_fk foreign key (task_id, workspace_id)
    references app.generation_tasks(id, workspace_id) on delete restrict
);
create unique index if not exists generation_quarantine_event_uq on app.generation_quarantine(task_id, event_key);
create index if not exists generation_quarantine_workspace_idx on app.generation_quarantine(workspace_id, created_at);

create table if not exists app.assets (
  id uuid primary key,
  workspace_id uuid not null references app.workspaces(id) on delete restrict,
  task_id uuid,
  purpose text not null check (purpose in ('input', 'output')),
  state text not null default 'pending' check (state in ('pending', 'ready', 'quarantined', 'deleted')),
  object_key text not null,
  created_by text not null references "user"(id) on delete restrict,
  mime text,
  bytes bigint check (bytes is null or bytes >= 0),
  sha256 text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  upload_expires_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint assets_task_workspace_fk foreign key (task_id, workspace_id)
    references app.generation_tasks(id, workspace_id) on delete restrict
);
create index if not exists assets_workspace_state_idx on app.assets(workspace_id, state, created_at);

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 13)
on conflict (key) do update set owner = excluded.owner, version = excluded.version;

