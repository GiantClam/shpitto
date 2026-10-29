-- M5 task 6.9: durable local/test-mode refund intent and lost-response recovery.
create table app.billing_refund_requests (
  id uuid primary key,
  workspace_id uuid not null references app.billing_accounts(workspace_id) on delete restrict,
  order_id uuid not null,
  provider text not null,
  idempotency_key text not null,
  amount_minor bigint not null,
  currency text not null,
  reason text not null,
  status text not null default 'pending',
  external_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  resolved_at timestamptz,
  constraint billing_refund_requests_identity_uq unique(provider, idempotency_key),
  constraint billing_refund_requests_order_fk foreign key(order_id, workspace_id, provider) references app.billing_orders(id, workspace_id, provider),
  constraint billing_refund_requests_provider_check check(provider in ('fixture','stripe')),
  constraint billing_refund_requests_status_check check(status in ('pending','confirmed','failed','unknown')),
  constraint billing_refund_requests_value_check check(amount_minor > 0 and currency ~ '^[a-z]{3}$' and length(reason) between 1 and 500),
  constraint billing_refund_requests_resolution_check check((status in ('pending','unknown') and resolved_at is null) or (status in ('confirmed','failed') and resolved_at is not null)
));
create index billing_refund_requests_order_idx on app.billing_refund_requests(workspace_id, order_id, created_at);
insert into app.schema_ownership(key,owner,version) values('domain','shpitto-domain',19)
on conflict(key) do update set owner=excluded.owner,version=excluded.version;
