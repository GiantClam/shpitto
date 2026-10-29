-- M2 task 3.7: durable billing hold state for the shared access matrix.

create table if not exists app.billing_accounts (
  workspace_id uuid primary key references app.workspaces(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'hold')),
  hold_reason text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_accounts_status_idx on app.billing_accounts (status);

insert into app.billing_accounts (workspace_id, status, created_at, updated_at)
select id, 'active', created_at, updated_at
from app.workspaces
on conflict (workspace_id) do nothing;

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 5)
on conflict (key) do update
set owner = excluded.owner,
    version = excluded.version;
