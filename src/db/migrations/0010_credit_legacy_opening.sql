-- Establish an explicit accounting boundary for installations that predate the
-- immutable ledger. This snapshot is not a reconstruction of historical events.
-- Existing ledger rows, including incomplete or discrepant ones, are never
-- repaired by this migration and continue to trigger reconciliation holds.

lock table app.credit_grants, app.credit_ledger_entries in share row exclusive mode;

create table if not exists app.credit_legacy_baselines (
  grant_id uuid primary key,
  snapshot jsonb not null,
  captured_at timestamptz not null default transaction_timestamp()
);

alter table app.credit_ledger_entries
  drop constraint if exists credit_ledger_entries_entry_type_check;
alter table app.credit_ledger_entries
  drop constraint if exists credit_ledger_entries_type_check;
alter table app.credit_ledger_entries
  add constraint credit_ledger_entries_type_check
  check (entry_type in ('grant_issued', 'reserve', 'release', 'refund', 'consume', 'expire', 'void', 'compensation', 'opening_snapshot'));

-- Preserve all buckets exactly. In particular, legacy reserved credits remain
-- reserved and unavailable for spending. Synthetic historical reservations are
-- intentionally terminal; resolving unknown prior reservations requires an
-- explicit, audited operator decision, not an inferred release during upgrade.
-- Use migration time for the snapshot, preserving the original grant and
-- allocation timestamps rather than inventing historical issuance timestamps.
insert into app.credit_ledger_entries (
  id, workspace_id, grant_id, entry_type,
  available_delta, reserved_delta, consumed_delta, expired_delta, voided_delta,
  business_key, created_at
)
select
  md5('shpitto:credit-opening:' || grant_row.id::text)::uuid,
  grant_row.workspace_id,
  grant_row.id,
  'opening_snapshot',
  grant_row.available,
  grant_row.reserved,
  grant_row.consumed,
  grant_row.expired,
  grant_row.voided,
  'legacy-opening:' || grant_row.id::text,
  transaction_timestamp()
from app.credit_grants grant_row
join app.credit_legacy_baselines baseline on baseline.grant_id = grant_row.id
-- origin_allocation_id was added after the captured pre-ledger schema. Compare
-- every recorded field; no clock cutoff or business-key heuristic proves age.
where baseline.snapshot <@ to_jsonb(grant_row)
and not exists (
  select 1 from app.credit_ledger_entries ledger
  where ledger.grant_id = grant_row.id
);

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 11)
on conflict (key) do update
set owner = excluded.owner,
    version = excluded.version;
