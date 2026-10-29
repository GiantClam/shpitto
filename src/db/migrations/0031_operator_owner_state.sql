create table if not exists app.operator_owner_state (
  id text primary key check (id = 'default'),
  first_user_claim_open boolean not null default false,
  initialized boolean not null default false,
  initialized_by_user_id text references "user"(id) on delete restrict,
  initialization_method text check (initialization_method is null or initialization_method in ('first_registration', 'server_bootstrap', 'preexisting')),
  initialized_at timestamptz,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null,
  check (
    (first_user_claim_open = false or initialized = false)
    and (
      (initialized = false and initialized_by_user_id is null and initialization_method is null and initialized_at is null)
      or
      (initialized = true and initialization_method is not null and initialized_at is not null)
    )
    and (initialized = false or initialization_method = 'preexisting' or initialized_by_user_id is not null)
  )
);

with installation as (
  select
    exists (select 1 from "user") as has_users,
    exists (select 1 from app.operator_roles) as has_roles,
    exists (select 1 from app.operator_roles where role = 'superadmin') as has_superadmin_roles,
    exists (
      select 1 from app.audit_events
      where command_name in ('operator.owner.bootstrap', 'operator.owner.first-registration-claim')
    ) as has_initialization_audit,
    (
      select user_id from app.operator_roles
      where role = 'superadmin'
      order by (revoked_at is null) desc, granted_at, user_id
      limit 1
    ) as existing_owner_user_id
)
insert into app.operator_owner_state (
  id,
  first_user_claim_open,
  initialized,
  initialized_by_user_id,
  initialization_method,
  initialized_at,
  version,
  updated_at
)
select
  'default',
  not has_users and not has_roles and not has_initialization_audit,
  has_superadmin_roles or has_initialization_audit,
  existing_owner_user_id,
  case when has_superadmin_roles or has_initialization_audit then 'preexisting' end,
  case when has_superadmin_roles or has_initialization_audit then now() end,
  1,
  now()
from installation
on conflict (id) do nothing;

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 32)
on conflict (key) do update
set owner = excluded.owner, version = greatest(app.schema_ownership.version, excluded.version);
