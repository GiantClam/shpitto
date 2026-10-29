-- M2 task 3.11: retain the allocation that caused a compensation grant.

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'credit_ledger_entries_entry_type_check') then
    alter table app.credit_ledger_entries drop constraint credit_ledger_entries_entry_type_check;
  end if;
  alter table app.credit_ledger_entries
    add constraint credit_ledger_entries_entry_type_check
    check (entry_type in ('grant_issued', 'reserve', 'release', 'refund', 'consume', 'expire', 'void', 'compensation'));
end $$;

alter table app.credit_grants
  add column if not exists origin_allocation_id uuid;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'credit_grants_origin_allocation_fk') then
    alter table app.credit_grants drop constraint credit_grants_origin_allocation_fk;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'credit_grants_origin_allocation_workspace_fk') then
    alter table app.credit_grants
      add constraint credit_grants_origin_allocation_workspace_fk
      foreign key (origin_allocation_id, workspace_id)
      references app.credit_allocations(id, workspace_id) on delete restrict;
  end if;
end $$;

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 10)
on conflict (key) do update
set owner = excluded.owner,
    version = excluded.version;

