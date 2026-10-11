-- M2 task 3.7: domain-owned account access state.

create table if not exists app.user_access_controls (
  user_id text primary key references "user"(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'disabled')),
  disabled_at timestamptz,
  reason text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active' and disabled_at is null) or (status = 'disabled' and disabled_at is not null))
);
create index if not exists user_access_controls_status_idx on app.user_access_controls (status);

insert into app.user_access_controls (user_id, status, disabled_at, created_at, updated_at)
select id,
       case when disabled_at is null then 'active' else 'disabled' end,
       disabled_at,
       created_at,
       updated_at
from "user"
on conflict (user_id) do nothing;

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 6)
on conflict (key) do update
set owner = excluded.owner,
    version = excluded.version;
