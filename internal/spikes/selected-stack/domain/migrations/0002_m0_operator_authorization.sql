-- M0 disposable operator authorization boundary.
-- The final release role/step-up policy remains an M1 implementation concern.

create table if not exists m0_prod_operator_role (
  user_id text primary key references "user"(id) on delete cascade,
  role text not null check (role in ('support_read', 'support_write', 'superadmin')),
  active boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists m0_prod_operator_role_active_idx
  on m0_prod_operator_role (active, role, user_id);
