-- M5 task 6.1: additive contracts only. No external payment or entitlement effects.
alter table app.billing_accounts
  add column reconciliation_lease_owner text,
  add column reconciliation_lease_token uuid,
  add column reconciliation_generation bigint not null default 0,
  add column reconciliation_lease_until timestamptz,
  add constraint billing_accounts_reconciliation_generation_check check (reconciliation_generation >= 0),
  add constraint billing_accounts_reconciliation_lease_check check (
    (reconciliation_lease_owner is null and reconciliation_lease_token is null and reconciliation_lease_until is null)
    or (reconciliation_lease_owner is not null and length(reconciliation_lease_owner) > 0 and reconciliation_lease_token is not null and reconciliation_lease_until is not null and reconciliation_generation > 0)
  );

create function app.billing_catalog_snapshot_valid(snapshot jsonb, product_kind text)
returns boolean language plpgsql immutable as $$
begin
  if snapshot is null or jsonb_typeof(snapshot) <> 'object'
    or not (snapshot ?& array['catalogVersion','productKey','kind','interval','credits','amountMinor','currency','creditExpiry','provider','priceReference','snapshotHash'])
    or (select count(*) from jsonb_object_keys(snapshot)) <> 11 then return false; end if;
  if jsonb_typeof(snapshot->'catalogVersion') <> 'number' or (snapshot->>'catalogVersion') !~ '^[1-9][0-9]*$'
    or jsonb_typeof(snapshot->'credits') <> 'string' or (snapshot->>'credits') !~ '^[1-9][0-9]{0,18}$'
    or jsonb_typeof(snapshot->'amountMinor') <> 'string' or (snapshot->>'amountMinor') !~ '^[1-9][0-9]{0,18}$'
    or jsonb_typeof(snapshot->'productKey') <> 'string' or (snapshot->>'productKey') !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,254}$'
    or jsonb_typeof(snapshot->'currency') <> 'string' or (snapshot->>'currency') !~ '^[a-z]{3}$'
    or jsonb_typeof(snapshot->'priceReference') <> 'string'
    or jsonb_typeof(snapshot->'snapshotHash') <> 'string' or (snapshot->>'snapshotHash') !~ '^[a-f0-9]{64}$'
    or snapshot->>'provider' not in ('fixture','stripe') or snapshot->>'provider' is null or snapshot->>'kind' is distinct from product_kind
    then return false; end if;
  if not ((snapshot->>'provider' = 'fixture' and snapshot->>'priceReference' ~ '^fixture:[A-Za-z0-9:._-]{1,247}$')
    or (snapshot->>'provider' = 'stripe' and snapshot->>'priceReference' ~ '^price_[A-Za-z0-9]{1,249}$')) then return false; end if;
  if (snapshot->>'credits')::numeric > 9223372036854775807
    or (snapshot->>'amountMinor')::numeric > 9223372036854775807
    or (snapshot->>'catalogVersion')::numeric > 9007199254740991 then return false; end if;
  return coalesce(
    (product_kind = 'subscription' and snapshot->>'interval' = 'month' and snapshot->>'creditExpiry' = 'service_period_end')
    or (product_kind = 'pack' and snapshot->'interval' = 'null'::jsonb and snapshot->>'creditExpiry' = 'never'), false);
end;
$$;

create table app.billing_customer_history (
  workspace_id uuid not null references app.billing_accounts(workspace_id) on delete restrict,
  provider text not null,
  customer_id text not null,
  previous_customer_id text,
  valid_from timestamptz not null,
  valid_until timestamptz,
  change_reason text not null,
  constraint billing_customer_history_pk primary key(provider,customer_id),
  constraint billing_customer_history_provider_check check(provider in ('fixture','stripe')),
  constraint billing_customer_history_interval_check check(valid_until is null or valid_until >= valid_from),
  constraint billing_customer_history_identity_check check(length(customer_id) between 1 and 255 and length(trim(change_reason)) > 0 and (previous_customer_id is null or previous_customer_id <> customer_id))
);
create unique index billing_customer_history_tenant_uq on app.billing_customer_history(provider,customer_id,workspace_id);
create unique index billing_customer_history_current_uq on app.billing_customer_history(workspace_id,provider) where valid_until is null;
alter table app.billing_customer_history add constraint billing_customer_history_previous_fk foreign key(provider,previous_customer_id,workspace_id) references app.billing_customer_history(provider,customer_id,workspace_id) on delete restrict;

create table app.billing_checkout_attempts (
  id uuid primary key,
  workspace_id uuid not null references app.billing_accounts(workspace_id) on delete restrict,
  provider text not null,
  customer_id text not null,
  kind text not null,
  catalog_snapshot jsonb not null,
  stripe_session_id text,
  idempotency_key text not null,
  status text not null default 'creating',
  expires_at timestamptz,
  resolved_at timestamptz,
  resolution_reference text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint billing_checkout_attempts_customer_fk foreign key(provider,customer_id,workspace_id) references app.billing_customer_history(provider,customer_id,workspace_id) on delete restrict,
  constraint billing_checkout_attempts_kind_check check(kind in ('subscription','pack')),
  constraint billing_checkout_attempts_status_check check(status in ('creating','open','unknown','paid','expired','canceled')),
  constraint billing_checkout_attempts_snapshot_check check(app.billing_catalog_snapshot_valid(catalog_snapshot,kind) and catalog_snapshot->>'provider'=provider),
  constraint billing_checkout_attempts_key_check check(length(idempotency_key) between 8 and 255),
  constraint billing_checkout_attempts_resolution_check check(
    (status in ('creating','open','unknown') and resolved_at is null and resolution_reference is null)
    or (status in ('paid','expired','canceled') and resolved_at is not null and resolution_reference is not null and length(trim(resolution_reference)) > 0)
  )
);
create unique index billing_checkout_attempts_tenant_uq on app.billing_checkout_attempts(id,workspace_id,provider);
create unique index billing_checkout_attempts_live_recurring_uq on app.billing_checkout_attempts(workspace_id) where kind='subscription' and status in ('creating','open','unknown');
create unique index billing_checkout_attempts_session_uq on app.billing_checkout_attempts(provider,stripe_session_id);
create unique index billing_checkout_attempts_key_uq on app.billing_checkout_attempts(provider,idempotency_key);

create table app.billing_subscriptions (
  id uuid primary key,
  workspace_id uuid not null references app.billing_accounts(workspace_id) on delete restrict,
  provider text not null,
  customer_id text not null,
  external_id text not null,
  catalog_snapshot jsonb not null,
  status text not null,
  period_start timestamptz,
  period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint billing_subscriptions_customer_fk foreign key(provider,customer_id,workspace_id) references app.billing_customer_history(provider,customer_id,workspace_id) on delete restrict,
  constraint billing_subscriptions_status_check check(status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  constraint billing_subscriptions_period_check check((period_start is null and period_end is null) or (period_start is not null and period_end is not null and period_end > period_start)),
  constraint billing_subscriptions_snapshot_check check(app.billing_catalog_snapshot_valid(catalog_snapshot,'subscription') and catalog_snapshot->>'provider'=provider)
);
create unique index billing_subscriptions_external_uq on app.billing_subscriptions(provider,external_id);
create unique index billing_subscriptions_tenant_uq on app.billing_subscriptions(id,workspace_id,provider);
create unique index billing_subscriptions_nonterminal_uq on app.billing_subscriptions(workspace_id) where status not in ('canceled','incomplete_expired');

create table app.billing_orders (
  id uuid primary key,
  workspace_id uuid not null references app.billing_accounts(workspace_id) on delete restrict,
  provider text not null,
  customer_id text not null,
  kind text not null,
  catalog_snapshot jsonb not null,
  status text not null default 'pending',
  currency text not null,
  paid_minor bigint not null default 0,
  refunded_minor bigint not null default 0,
  paid_at timestamptz,
  grant_business_key text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint billing_orders_customer_fk foreign key(provider,customer_id,workspace_id) references app.billing_customer_history(provider,customer_id,workspace_id) on delete restrict,
  constraint billing_orders_kind_check check(kind in ('subscription','pack')),
  constraint billing_orders_status_check check(status in ('pending','paid','refunded','held','failed')),
  constraint billing_orders_money_check check(paid_minor >= 0 and refunded_minor >= 0 and refunded_minor <= paid_minor and currency ~ '^[a-z]{3}$'),
  constraint billing_orders_snapshot_check check(app.billing_catalog_snapshot_valid(catalog_snapshot,kind) and catalog_snapshot->>'currency'=currency and catalog_snapshot->>'provider'=provider)
);
create unique index billing_orders_tenant_uq on app.billing_orders(id,workspace_id,provider);
create unique index billing_orders_cash_uq on app.billing_orders(id,workspace_id,provider,currency);
create unique index billing_orders_grant_key_uq on app.billing_orders(grant_business_key);
create index billing_orders_workspace_paid_idx on app.billing_orders(workspace_id,paid_at,id);

create table app.billing_payment_aliases (
  workspace_id uuid not null,
  provider text not null,
  object_kind text not null,
  external_id text not null,
  order_id uuid not null,
  created_at timestamptz not null,
  constraint billing_payment_aliases_pk primary key(provider,object_kind,external_id),
  constraint billing_payment_aliases_order_fk foreign key(order_id,workspace_id,provider) references app.billing_orders(id,workspace_id,provider) on delete restrict,
  constraint billing_payment_aliases_kind_check check(object_kind in ('checkout_session','invoice','payment_intent','charge')),
  constraint billing_payment_aliases_identity_check check(length(external_id) between 1 and 255)
);
create index billing_payment_aliases_order_idx on app.billing_payment_aliases(workspace_id,order_id);

create table app.billing_cash_events (
  id uuid primary key,
  workspace_id uuid not null,
  provider text not null,
  event_kind text not null,
  external_id text not null,
  order_id uuid not null,
  amount_minor bigint not null,
  currency text not null,
  status text not null default 'confirmed',
  occurred_at timestamptz not null,
  created_at timestamptz not null,
  constraint billing_cash_events_order_fk foreign key(order_id,workspace_id,provider,currency) references app.billing_orders(id,workspace_id,provider,currency) on delete restrict,
  constraint billing_cash_events_kind_check check(event_kind in ('refund','dispute_opened','dispute_lost','dispute_reversed')),
  constraint billing_cash_events_value_check check(amount_minor > 0 and status='confirmed' and length(external_id) between 1 and 255)
);
create unique index billing_cash_events_identity_uq on app.billing_cash_events(provider,event_kind,external_id);
create index billing_cash_events_order_idx on app.billing_cash_events(workspace_id,order_id,occurred_at);

-- Database immutability backs application commands; correcting observations append new identities.
create function app.billing_reject_fact_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'Confirmed billing facts and payment aliases are immutable' using errcode='23514';
end;
$$;
create trigger billing_cash_events_immutable before update or delete on app.billing_cash_events for each row execute function app.billing_reject_fact_mutation();
create trigger billing_payment_aliases_immutable before update or delete on app.billing_payment_aliases for each row execute function app.billing_reject_fact_mutation();

create function app.billing_guard_customer_history() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'Customer lineage cannot be deleted' using errcode='23514'; end if;
  if (to_jsonb(new)-'valid_until') is distinct from (to_jsonb(old)-'valid_until')
    or (old.valid_until is not null and new.valid_until is distinct from old.valid_until) then
    raise exception 'Customer history only permits closing the current interval' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger billing_customer_history_immutable before update or delete on app.billing_customer_history for each row execute function app.billing_guard_customer_history();

create function app.billing_guard_projection_identity() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'Billing identity cannot be deleted' using errcode='23514'; end if;
  if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
    or new.provider is distinct from old.provider or new.customer_id is distinct from old.customer_id
    or new.catalog_snapshot is distinct from old.catalog_snapshot or new.created_at is distinct from old.created_at then
    raise exception 'Billing projection identity and original catalog terms are immutable' using errcode='23514';
  end if;
  if tg_table_name='billing_checkout_attempts' then
    if new.kind is distinct from old.kind or new.idempotency_key is distinct from old.idempotency_key
      or (old.stripe_session_id is not null and new.stripe_session_id is distinct from old.stripe_session_id)
      or (old.status in ('paid','expired','canceled') and (new.status is distinct from old.status or new.resolved_at is distinct from old.resolved_at or new.resolution_reference is distinct from old.resolution_reference)) then
      raise exception 'Checkout identity or authoritative terminal outcome cannot change' using errcode='23514';
    end if;
  elsif tg_table_name='billing_orders' then
    if new.kind is distinct from old.kind or new.currency is distinct from old.currency
      or new.refunded_minor < old.refunded_minor
      or (old.grant_business_key is not null and new.grant_business_key is distinct from old.grant_business_key) then
      raise exception 'Order terms, grant identity and confirmed refund totals are monotonic' using errcode='23514';
    end if;
  elsif tg_table_name='billing_subscriptions' and new.external_id is distinct from old.external_id then
    raise exception 'Subscription external identity cannot change' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger billing_checkout_attempts_identity before update or delete on app.billing_checkout_attempts for each row execute function app.billing_guard_projection_identity();
create trigger billing_orders_identity before update or delete on app.billing_orders for each row execute function app.billing_guard_projection_identity();
create trigger billing_subscriptions_identity before update or delete on app.billing_subscriptions for each row execute function app.billing_guard_projection_identity();

create function app.billing_guard_reconciliation_generation() returns trigger language plpgsql as $$
begin
  if new.reconciliation_generation < old.reconciliation_generation
    or (new.reconciliation_lease_token is not null and new.reconciliation_lease_token is distinct from old.reconciliation_lease_token and new.reconciliation_generation <= old.reconciliation_generation)
    or (new.reconciliation_lease_owner is distinct from old.reconciliation_lease_owner and new.reconciliation_lease_owner is not null and new.reconciliation_generation <= old.reconciliation_generation) then
    raise exception 'Reconciliation ownership requires a strictly newer fencing generation' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger billing_accounts_reconciliation_fence before update on app.billing_accounts for each row execute function app.billing_guard_reconciliation_generation();

insert into app.schema_ownership(key,owner,version) values('domain','shpitto-domain',17)
on conflict(key) do update set owner=excluded.owner,version=excluded.version;
