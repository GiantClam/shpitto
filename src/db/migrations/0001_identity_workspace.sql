-- M2 identity, workspace and tenant-lineage foundation.
-- Better Auth keeps text IDs; application/domain IDs are UUIDs; all timestamps are UTC timestamptz.

create table if not exists "user" (
  id text primary key,
  name text not null,
  email text not null,
  email_verified boolean not null default false,
  image text,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_email_uq on "user" (email);

create table if not exists "session" (
  id text primary key,
  expires_at timestamptz not null,
  token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  user_id text not null references "user"(id) on delete cascade
);
create unique index if not exists session_token_uq on "session" (token);
create index if not exists session_user_id_idx on "session" (user_id);

create table if not exists "account" (
  id text primary key,
  account_id text not null,
  provider_id text not null,
  user_id text not null references "user"(id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, account_id)
);
create index if not exists account_user_id_idx on "account" (user_id);

create table if not exists "verification" (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists verification_identifier_idx on "verification" (identifier);

create table if not exists app.workspaces (
  id uuid primary key,
  kind text not null check (kind in ('personal', 'team')),
  name text not null,
  created_by text not null references "user"(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspaces_created_by_idx on app.workspaces (created_by);
create index if not exists workspaces_status_idx on app.workspaces (status);
create unique index if not exists workspaces_personal_creator_uq on app.workspaces (created_by) where kind = 'personal';

create table if not exists app.workspace_members (
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  user_id text not null references "user"(id) on delete restrict,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_workspace_idx on app.workspace_members (user_id, workspace_id);

create table if not exists app.workspace_setups (
  id uuid primary key,
  user_id text not null unique references "user"(id) on delete cascade,
  workspace_id uuid references app.workspaces(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.credit_accounts (
  workspace_id uuid primary key references app.workspaces(id) on delete restrict,
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.credit_grants (
  id uuid primary key,
  workspace_id uuid not null references app.workspaces(id) on delete restrict,
  source text not null check (source in ('subscription', 'purchase', 'compensation', 'manual', 'demo')),
  issued bigint not null check (issued >= 0),
  available bigint not null check (available >= 0),
  reserved bigint not null check (reserved >= 0),
  consumed bigint not null check (consumed >= 0),
  expired bigint not null check (expired >= 0),
  voided bigint not null check (voided >= 0),
  expires_at timestamptz,
  business_key text not null unique,
  created_at timestamptz not null default now(),
  check (issued = available + reserved + consumed + expired + voided),
  unique (id, workspace_id)
);
create unique index if not exists credit_grants_id_workspace_uq on app.credit_grants (id, workspace_id);
create index if not exists credit_grants_workspace_expiry_idx on app.credit_grants (workspace_id, expires_at, id);

create table if not exists app.credit_allocations (
  id uuid primary key,
  workspace_id uuid not null references app.workspaces(id) on delete restrict,
  grant_id uuid not null,
  amount bigint not null check (amount > 0),
  source_expiry timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  constraint credit_allocations_grant_workspace_fk
    foreign key (grant_id, workspace_id) references app.credit_grants(id, workspace_id)
);

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 2)
on conflict (key) do update
set owner = excluded.owner,
    version = excluded.version;
