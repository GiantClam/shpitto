create table app.recovery_heartbeats (
  workspace_id uuid not null references app.workspaces(id) on delete restrict,
  worker_key text not null,
  expected_at timestamptz not null,
  last_success_at timestamptz,
  primary key (workspace_id, worker_key),
  constraint recovery_heartbeat_worker_check check (worker_key ~ '^[A-Za-z0-9._-]{1,128}$')
);

create table app.recovery_heartbeat_incidents (
  id uuid primary key,
  workspace_id uuid not null,
  worker_key text not null,
  opened_at timestamptz not null,
  last_sweep_at timestamptz,
  age_seconds integer not null,
  recovered_at timestamptz,
  delivered_at timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null,
  lease_token uuid,
  lease_until timestamptz,
  foreign key (workspace_id, worker_key) references app.recovery_heartbeats(workspace_id, worker_key) on delete restrict,
  constraint recovery_heartbeat_counts_check check (attempts >= 0 and age_seconds between 180 and 31536000),
  constraint recovery_heartbeat_lease_check check ((lease_token is null) = (lease_until is null))
);
create unique index recovery_heartbeat_open_scope_idx
  on app.recovery_heartbeat_incidents(workspace_id, worker_key) where recovered_at is null;

insert into app.schema_ownership(key, owner, version)
values ('recovery-heartbeat', 'shpitto-domain', 1)
on conflict(key) do update set owner=excluded.owner, version=excluded.version;
