-- M3 task 4.1: durable generation task contract and task-bound reservation.

create table if not exists app.generation_tasks (
  id uuid primary key,
  workspace_id uuid not null references app.workspaces(id) on delete restrict,
  requested_by text not null references "user"(id) on delete restrict,
  mode text not null,
  model_key text not null,
  catalog_version integer not null check (catalog_version > 0),
  catalog_snapshot jsonb not null,
  input_snapshot jsonb not null,
  policy_snapshot jsonb not null,
  quoted_credits bigint not null check (quoted_credits > 0),
  status text not null default 'queued' check (status in ('queued', 'dispatching', 'submission_unknown', 'submitted', 'running', 'materializing', 'succeeded', 'failed', 'cancelled')),
  failure_code text,
  deadline_at timestamptz not null,
  queue_deadline_at timestamptz not null,
  stage_deadline_at timestamptz,
  overall_deadline_at timestamptz,
  next_action_at timestamptz not null,
  dispatch_started_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (status <> 'failed' or failure_code is not null)
);
create index if not exists generation_tasks_workspace_created_idx
  on app.generation_tasks (workspace_id, created_at, id);
create index if not exists generation_tasks_recovery_idx
  on app.generation_tasks (status, next_action_at, id);

-- The table is new in this migration, but keep reruns safe for a partially
-- materialized local database from an earlier task attempt.
alter table app.generation_tasks add column if not exists catalog_snapshot jsonb;
update app.generation_tasks set catalog_snapshot = jsonb_build_object('catalogVersion', catalog_version)
where catalog_snapshot is null;
alter table app.generation_tasks alter column catalog_snapshot set not null;

alter table app.credit_reservations add column if not exists task_id uuid;
create unique index if not exists credit_reservations_task_uq
  on app.credit_reservations (task_id)
  where task_id is not null;

-- Composite tenant references require a matching unique key on the parent.
create unique index if not exists generation_tasks_id_workspace_uq
  on app.generation_tasks (id, workspace_id);
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'credit_reservations_task_workspace_fk'
  ) then
    alter table app.credit_reservations
      add constraint credit_reservations_task_workspace_fk
      foreign key (task_id, workspace_id)
      references app.generation_tasks(id, workspace_id) on delete restrict;
  end if;
end $$;

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 12)
on conflict (key) do update
set owner = excluded.owner,
    version = excluded.version;
