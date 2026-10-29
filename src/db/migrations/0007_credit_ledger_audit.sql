-- M2 task 3.9: immutable credit explanations and atomic audit/outbox effects.

create table if not exists app.credit_ledger_entries (
  id uuid primary key,
  workspace_id uuid not null references app.workspaces(id) on delete restrict,
  grant_id uuid not null,
  entry_type text not null check (entry_type in ('grant_issued', 'reserve', 'release', 'refund', 'consume', 'expire', 'void', 'compensation')),
  available_delta bigint not null,
  reserved_delta bigint not null,
  consumed_delta bigint not null,
  expired_delta bigint not null,
  voided_delta bigint not null,
  business_key text not null unique,
  created_at timestamptz not null,
  constraint credit_ledger_entries_grant_workspace_fk
    foreign key (grant_id, workspace_id) references app.credit_grants(id, workspace_id)
);
create index if not exists credit_ledger_entries_grant_idx on app.credit_ledger_entries (workspace_id, grant_id, created_at);

create table if not exists app.audit_events (
  id uuid primary key,
  actor_user_id text not null references "user"(id) on delete restrict,
  workspace_id uuid references app.workspaces(id) on delete restrict,
  command_name text not null,
  command_key text not null,
  semantic_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null,
  unique (actor_user_id, workspace_id, command_name, command_key)
);
create index if not exists audit_events_workspace_idx on app.audit_events (workspace_id, created_at);

create table if not exists app.outbox_events (
  id uuid primary key,
  workspace_id uuid references app.workspaces(id) on delete restrict,
  event_type text not null,
  aggregate_id uuid,
  business_key text not null unique,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'published', 'failed')),
  created_at timestamptz not null
);
create index if not exists outbox_events_pending_idx on app.outbox_events (status, created_at);

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 8)
on conflict (key) do update
set owner = excluded.owner,
    version = excluded.version;
