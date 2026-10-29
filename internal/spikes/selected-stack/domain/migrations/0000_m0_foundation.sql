-- M0 production-shaped boundary: one reviewed Drizzle migration chain owns these tables.
-- The probe applies this file to disposable PostgreSQL only. It does not create runtime roles.

create table if not exists m0_prod_workspace (
  id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists m0_prod_workspace_member (
  workspace_id text not null references m0_prod_workspace(id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists m0_prod_credit_ledger (
  id bigint generated always as identity primary key,
  workspace_id text not null references m0_prod_workspace(id) on delete restrict,
  idempotency_key text not null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table if not exists m0_prod_audit_event (
  id bigint generated always as identity primary key,
  workspace_id text not null references m0_prod_workspace(id) on delete restrict,
  idempotency_key text not null,
  action text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table if not exists m0_prod_outbox_event (
  id bigint generated always as identity primary key,
  workspace_id text not null references m0_prod_workspace(id) on delete restrict,
  idempotency_key text not null,
  topic text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create index if not exists m0_prod_workspace_member_user_idx
  on m0_prod_workspace_member (user_id, workspace_id);

create or replace function m0_prod_set_workspace_context(workspace_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if workspace_id is null or workspace_id = '' then
    raise exception 'workspace context is required';
  end if;
  perform set_config('app.workspace_id', workspace_id, false);
end;
$$;

alter table m0_prod_workspace enable row level security;
alter table m0_prod_workspace force row level security;
alter table m0_prod_workspace_member enable row level security;
alter table m0_prod_workspace_member force row level security;
alter table m0_prod_credit_ledger enable row level security;
alter table m0_prod_credit_ledger force row level security;
alter table m0_prod_audit_event enable row level security;
alter table m0_prod_audit_event force row level security;
alter table m0_prod_outbox_event enable row level security;
alter table m0_prod_outbox_event force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'm0_prod_workspace' and policyname = 'm0_prod_workspace_scope') then
    create policy m0_prod_workspace_scope on m0_prod_workspace
      using (id = current_setting('app.workspace_id', true))
      with check (id = current_setting('app.workspace_id', true));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'm0_prod_workspace_member' and policyname = 'm0_prod_workspace_member_scope') then
    create policy m0_prod_workspace_member_scope on m0_prod_workspace_member
      using (workspace_id = current_setting('app.workspace_id', true))
      with check (workspace_id = current_setting('app.workspace_id', true));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'm0_prod_credit_ledger' and policyname = 'm0_prod_credit_ledger_scope') then
    create policy m0_prod_credit_ledger_scope on m0_prod_credit_ledger
      using (workspace_id = current_setting('app.workspace_id', true))
      with check (workspace_id = current_setting('app.workspace_id', true));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'm0_prod_audit_event' and policyname = 'm0_prod_audit_event_scope') then
    create policy m0_prod_audit_event_scope on m0_prod_audit_event
      using (workspace_id = current_setting('app.workspace_id', true))
      with check (workspace_id = current_setting('app.workspace_id', true));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'm0_prod_outbox_event' and policyname = 'm0_prod_outbox_event_scope') then
    create policy m0_prod_outbox_event_scope on m0_prod_outbox_event
      using (workspace_id = current_setting('app.workspace_id', true))
      with check (workspace_id = current_setting('app.workspace_id', true));
  end if;
end;
$$;
