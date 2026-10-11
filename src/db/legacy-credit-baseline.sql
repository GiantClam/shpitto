-- Run before migrations, under the canonical migration advisory lock. Capture
-- evidence only while the database still has no ledger table. Repeated capture
-- never rewrites an existing baseline; changes since capture remain held.
do $$
begin
  if to_regclass('app.credit_grants') is not null
     and to_regclass('app.credit_ledger_entries') is null then
    lock table app.credit_grants in share row exclusive mode;
    create table if not exists app.credit_legacy_baselines (
      grant_id uuid primary key,
      snapshot jsonb not null,
      captured_at timestamptz not null default transaction_timestamp()
    );
    insert into app.credit_legacy_baselines (grant_id, snapshot)
    select grant_row.id, to_jsonb(grant_row)
    from app.credit_grants grant_row
    on conflict (grant_id) do nothing;
  end if;
end $$;
