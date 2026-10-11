-- M5 tasks 6.3/6.4: verified local webhook deliveries and reconciliation work items.
create table app.billing_webhook_inbox (
  id uuid primary key,
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  payload_hash text not null,
  payload jsonb not null,
  status text not null default 'received',
  received_at timestamptz not null,
  processed_at timestamptz,
  constraint billing_webhook_inbox_identity_uq unique(provider, external_event_id),
  constraint billing_webhook_inbox_provider_check check(provider in ('fixture','stripe')),
  constraint billing_webhook_inbox_status_check check(status in ('received','processed','failed')),
  constraint billing_webhook_inbox_hash_check check(payload_hash ~ '^[a-f0-9]{64}$'),
  constraint billing_webhook_inbox_event_id_check check(length(external_event_id) between 1 and 255)
);

create table app.billing_reconciliation_cases (
  id uuid primary key,
  workspace_id uuid not null references app.billing_accounts(workspace_id) on delete restrict,
  provider text not null,
  external_reference text not null,
  reason text not null,
  payload jsonb not null,
  status text not null default 'open',
  created_at timestamptz not null,
  resolved_at timestamptz,
  constraint billing_reconciliation_cases_identity_uq unique(provider, external_reference, reason),
  constraint billing_reconciliation_cases_provider_check check(provider in ('fixture','stripe')),
  constraint billing_reconciliation_cases_status_check check(status in ('open','resolved')),
  constraint billing_reconciliation_cases_reference_check check(length(external_reference) between 1 and 255 and length(trim(reason)) > 0),
  constraint billing_reconciliation_cases_resolution_check check((status='open' and resolved_at is null) or (status='resolved' and resolved_at is not null))
);

create index billing_webhook_inbox_status_idx on app.billing_webhook_inbox(status, received_at);
create index billing_reconciliation_cases_workspace_idx on app.billing_reconciliation_cases(workspace_id, status, created_at);

insert into app.schema_ownership(key,owner,version) values('domain','shpitto-domain',18)
on conflict(key) do update set owner=excluded.owner,version=excluded.version;
