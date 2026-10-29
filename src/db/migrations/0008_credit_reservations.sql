-- M2 task 3.10: immutable server quote snapshots and atomic FEFO reservations.

create table if not exists app.credit_reservations (
  id uuid primary key,
  workspace_id uuid not null references app.workspaces(id) on delete restrict,
  actor_user_id text not null references "user"(id) on delete restrict,
  command_name text not null,
  idempotency_key text not null,
  model_id text not null,
  catalog_version integer not null check (catalog_version > 0),
  quantity bigint not null check (quantity > 0),
  unit_cost bigint not null check (unit_cost > 0),
  total_cost bigint not null check (total_cost > 0),
  quote_hash text not null,
  status text not null default 'active' check (status in ('active', 'released', 'consumed')),
  created_at timestamptz not null,
  unique (id, workspace_id),
  unique (workspace_id, command_name, idempotency_key),
  check (total_cost = quantity * unit_cost)
);
create index if not exists credit_reservations_workspace_created_idx on app.credit_reservations (workspace_id, created_at);

alter table app.credit_allocations
  add column if not exists reservation_id uuid;

-- Historical installations predate reservation lineage. Preserve those rows by
-- attaching a deterministic synthetic reservation before enforcing NOT NULL.
-- The migration deliberately keeps the allocation amount and timestamp, and
-- uses the workspace creator as the recorded actor because the old schema did
-- not retain the original command identity.
insert into app.credit_reservations (
  id,
  workspace_id,
  actor_user_id,
  command_name,
  idempotency_key,
  model_id,
  catalog_version,
  quantity,
  unit_cost,
  total_cost,
  quote_hash,
  status,
  created_at
)
select
  md5('shpitto:legacy-reservation:' || allocation.id::text)::uuid,
  allocation.workspace_id,
  workspace.created_by,
  'credits.legacy-allocation',
  'legacy:' || allocation.id::text,
  'legacy-migrated',
  1,
  allocation.amount,
  1,
  allocation.amount,
  md5('shpitto:legacy-quote:' || allocation.id::text),
  'released',
  allocation.created_at
from app.credit_allocations allocation
join app.workspaces workspace on workspace.id = allocation.workspace_id
where allocation.reservation_id is null
on conflict (workspace_id, command_name, idempotency_key) do nothing;

update app.credit_allocations allocation
set reservation_id = reservation.id
from app.credit_reservations reservation
where allocation.reservation_id is null
  and reservation.workspace_id = allocation.workspace_id
  and reservation.command_name = 'credits.legacy-allocation'
  and reservation.idempotency_key = 'legacy:' || allocation.id::text;

do $$
begin
  if exists (select 1 from app.credit_allocations where reservation_id is null) then
    raise exception 'credit_allocations.reservation_id backfill left unresolved historical rows';
  end if;
end $$;

alter table app.credit_allocations
  alter column reservation_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'credit_allocations_reservation_workspace_fk'
  ) then
    alter table app.credit_allocations
      add constraint credit_allocations_reservation_workspace_fk
      foreign key (reservation_id, workspace_id)
      references app.credit_reservations(id, workspace_id) on delete restrict;
  end if;
end $$;

create unique index if not exists credit_allocations_reservation_grant_uq
  on app.credit_allocations (reservation_id, grant_id);

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 9)
on conflict (key) do update
set owner = excluded.owner,
    version = excluded.version;
