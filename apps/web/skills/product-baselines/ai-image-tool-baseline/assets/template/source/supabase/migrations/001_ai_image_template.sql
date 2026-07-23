create table if not exists generation_jobs (
  id text primary key,
  user_id text not null,
  prompt text not null,
  image_url text not null,
  provider text not null,
  model text not null,
  status text not null,
  storage_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists generation_jobs_user_created_idx on generation_jobs(user_id, created_at desc);
create table if not exists template_entitlements (
  provider_event_id text primary key,
  user_id text not null,
  credits integer not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists template_charge_orders (
  id text primary key,
  user_id text not null,
  product_id text not null,
  amount_minor integer not null check (amount_minor >= 0),
  credit_amount integer not null check (credit_amount > 0),
  currency text not null default 'USD',
  provider text not null,
  provider_order_id text unique,
  provider_payment_id text unique,
  status text not null check (status in ('pending', 'paid', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists template_charge_orders_user_created_idx on template_charge_orders(user_id, created_at desc);
alter table template_charge_orders add column if not exists provider_payment_id text;
create unique index if not exists template_charge_orders_provider_payment_id_idx on template_charge_orders(provider_payment_id) where provider_payment_id is not null;
create table if not exists template_gift_codes (
  code text primary key,
  credit_amount integer not null check (credit_amount > 0),
  expires_at timestamptz,
  used_by text,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists template_entitlements_user_updated_idx on template_entitlements(user_id, updated_at desc);
create table if not exists template_entitlement_ledger (
  id text primary key,
  user_id text not null,
  delta integer not null,
  reason text not null,
  provider_event_id text unique,
  created_at timestamptz not null default now()
);
create index if not exists template_entitlement_ledger_user_created_idx on template_entitlement_ledger(user_id, created_at desc);
create or replace function redeem_template_gift_code(p_code text, p_user_id text) returns integer language plpgsql security definer set search_path = public as $$
declare gift record; begin
  select * into gift from template_gift_codes where code = upper(trim(p_code)) for update;
  if gift.code is null or gift.used_by is not null or (gift.expires_at is not null and gift.expires_at < now()) then return 0; end if;
  update template_gift_codes set used_by = p_user_id, used_at = now() where code = gift.code;
  insert into template_entitlement_ledger(id, user_id, delta, reason, provider_event_id) values ('gift:' || gift.code, p_user_id, gift.credit_amount, 'gift_code', 'gift:' || gift.code) on conflict do nothing;
  return gift.credit_amount;
end; $$;
create table if not exists generation_usage_reservations (
  id text primary key,
  user_id text not null,
  units integer not null check (units > 0),
  status text not null check (status in ('reserved', 'consumed', 'released')),
  idempotency_key text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace function reserve_generation_credits(p_user_id text, p_reservation_id text, p_idempotency_key text, p_units integer) returns boolean language plpgsql security definer set search_path = public as $$
declare available integer; existing_status text; begin
  select status into existing_status from generation_usage_reservations where idempotency_key = p_idempotency_key;
  if existing_status in ('reserved', 'consumed') then return true; end if;
  select coalesce(sum(delta), 0) into available from template_entitlement_ledger where user_id = p_user_id;
  if available < p_units then return false; end if;
  insert into template_entitlement_ledger(id, user_id, delta, reason) values (p_reservation_id || ':debit', p_user_id, -p_units, 'generation_reservation');
  insert into generation_usage_reservations(id, user_id, units, status, idempotency_key) values (p_reservation_id, p_user_id, p_units, 'reserved', p_idempotency_key);
  return true;
exception when unique_violation then return true; end; $$;
create or replace function release_generation_credits(p_reservation_id text) returns boolean language plpgsql security definer set search_path = public as $$
declare reservation record; begin
  select * into reservation from generation_usage_reservations where id = p_reservation_id for update;
  if reservation.status is null or reservation.status <> 'reserved' then return false; end if;
  insert into template_entitlement_ledger(id, user_id, delta, reason) values (p_reservation_id || ':release', reservation.user_id, reservation.units, 'generation_release') on conflict do nothing;
  update generation_usage_reservations set status = 'released', updated_at = now() where id = p_reservation_id;
  return true; end; $$;
alter table generation_jobs enable row level security;
alter table template_entitlements enable row level security;
alter table template_charge_orders enable row level security;
alter table template_gift_codes enable row level security;
alter table template_entitlement_ledger enable row level security;
alter table generation_usage_reservations enable row level security;
revoke all on table generation_jobs, template_entitlements, template_charge_orders, template_gift_codes, template_entitlement_ledger, generation_usage_reservations from public, anon, authenticated;
drop policy if exists generation_jobs_server_only on generation_jobs;
create policy generation_jobs_server_only on generation_jobs as restrictive for all to authenticated using (false) with check (false);
drop policy if exists template_entitlements_server_only on template_entitlements;
create policy template_entitlements_server_only on template_entitlements as restrictive for all to authenticated using (false) with check (false);
drop policy if exists template_charge_orders_server_only on template_charge_orders;
create policy template_charge_orders_server_only on template_charge_orders as restrictive for all to authenticated using (false) with check (false);
drop policy if exists template_gift_codes_server_only on template_gift_codes;
create policy template_gift_codes_server_only on template_gift_codes as restrictive for all to authenticated using (false) with check (false);
drop policy if exists template_entitlement_ledger_server_only on template_entitlement_ledger;
create policy template_entitlement_ledger_server_only on template_entitlement_ledger as restrictive for all to authenticated using (false) with check (false);
drop policy if exists generation_usage_reservations_server_only on generation_usage_reservations;
create policy generation_usage_reservations_server_only on generation_usage_reservations as restrictive for all to authenticated using (false) with check (false);
revoke all on function redeem_template_gift_code(text, text) from public, anon, authenticated;
revoke all on function reserve_generation_credits(text, text, text, integer) from public, anon, authenticated;
revoke all on function release_generation_credits(text) from public, anon, authenticated;
grant execute on function redeem_template_gift_code(text, text) to service_role;
grant execute on function reserve_generation_credits(text, text, text, integer) to service_role;
grant execute on function release_generation_credits(text) to service_role;
