-- M2 task 3.8: durable semantic command identity.

create table if not exists app.command_results (
  id uuid primary key,
  actor_user_id text not null references "user"(id) on delete restrict,
  workspace_id uuid references app.workspaces(id) on delete restrict,
  scope_key text not null,
  command_name text not null,
  idempotency_key text not null,
  semantic_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'committed')),
  result jsonb,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  check (char_length(idempotency_key) between 1 and 128),
  check (char_length(command_name) between 1 and 120),
  check (status = 'pending' or result is not null),
  unique (scope_key, idempotency_key)
);
create index if not exists command_results_actor_idx on app.command_results (actor_user_id, created_at);
create index if not exists command_results_workspace_idx on app.command_results (workspace_id, created_at);

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 7)
on conflict (key) do update
set owner = excluded.owner,
    version = excluded.version;
