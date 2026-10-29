-- M2 task 3.6: explicit global operator roles and session-bound trusted step-up.

create table if not exists app.operator_roles (
  user_id text primary key references "user"(id) on delete cascade,
  role text not null check (role in ('support', 'operator', 'superadmin')),
  granted_at timestamptz not null,
  revoked_at timestamptz,
  updated_at timestamptz not null
);
create index if not exists operator_roles_active_idx on app.operator_roles (role, revoked_at);

create table if not exists app.operator_step_ups (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  session_id text not null references "session"(id) on delete cascade,
  method text not null check (method = 'trusted_second_factor'),
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  check (expires_at > verified_at)
);
create index if not exists operator_step_ups_active_session_idx
  on app.operator_step_ups (user_id, session_id, expires_at);
create unique index if not exists operator_step_ups_identity_uq
  on app.operator_step_ups (id, user_id, session_id);

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 4)
on conflict (key) do update
set owner = excluded.owner,
    version = excluded.version;
