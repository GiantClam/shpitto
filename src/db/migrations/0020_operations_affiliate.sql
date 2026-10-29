-- M6 local operations and optional affiliate contract.

alter table app.operator_roles add column if not exists version integer not null default 1;
alter table app.operator_roles drop constraint if exists operator_roles_version_check;
alter table app.operator_roles add constraint operator_roles_version_check check(version > 0);

create table if not exists app.operator_tenant_access (
  id uuid primary key,
  actor_user_id text not null references "user"(id) on delete restrict,
  workspace_id uuid not null references app.workspaces(id) on delete restrict,
  purpose text not null check(length(trim(purpose)) between 3 and 500),
  created_at timestamptz not null
);
create index if not exists operator_tenant_access_actor_idx on app.operator_tenant_access(actor_user_id, created_at);
create index if not exists operator_tenant_access_workspace_idx on app.operator_tenant_access(workspace_id, created_at);

create table if not exists app.operator_recovery_notes (
  id uuid primary key,
  actor_user_id text not null references "user"(id) on delete restrict,
  workspace_id uuid references app.workspaces(id) on delete restrict,
  subject_type text not null check(length(subject_type) between 1 and 64),
  subject_id text not null check(length(subject_id) between 1 and 255),
  status text not null default 'open' check(status in ('open','resolved')),
  reason text not null check(length(trim(reason)) between 3 and 500),
  created_at timestamptz not null,
  resolved_at timestamptz,
  check((status='open' and resolved_at is null) or (status='resolved' and resolved_at is not null))
);
create index if not exists operator_recovery_notes_subject_idx on app.operator_recovery_notes(subject_type, subject_id, created_at);

create table if not exists app.affiliate_settings (
  id text primary key,
  enabled text not null default 'disabled' check(enabled in ('enabled','disabled')),
  provider text not null default 'firstpromoter' check(provider = 'firstpromoter'),
  account_id text,
  program_id text,
  provider_campaign_revision text not null default 'first-payment-v1',
  commission_policy text not null default 'first_payment' check(commission_policy in ('first_payment','provider_campaign')),
  auto_payout_enabled text not null default 'disabled' check(auto_payout_enabled = 'disabled'),
  dashboard_url text,
  policy_version integer not null default 1 check(policy_version > 0),
  account_checkpoint_at timestamptz,
  updated_at timestamptz not null
);
insert into app.affiliate_settings(id, updated_at) values('default', now()) on conflict(id) do nothing;

create table if not exists app.affiliate_attributions (
  workspace_id uuid primary key references app.workspaces(id) on delete restrict,
  creator_user_id text references "user"(id) on delete restrict,
  workspace_uid text not null unique check(workspace_uid ~ '^workspace:[0-9a-f-]{36}$'),
  affiliate_id text,
  touch_reference text,
  program_id text,
  captured_at timestamptz,
  verified_at timestamptz,
  status text not null default 'unattributed' check(status in ('unattributed','pending','verified','invalid','held')),
  policy_version integer not null default 1 check(policy_version > 0),
  created_at timestamptz not null
);
create index if not exists affiliate_attributions_status_idx on app.affiliate_attributions(status, created_at);

create table if not exists app.affiliate_payments (
  id uuid primary key,
  workspace_id uuid not null references app.workspaces(id) on delete restrict,
  payment_reference text not null,
  kind text not null check(kind in ('subscription','pack')),
  paid_at timestamptz not null,
  amount_minor text not null check(amount_minor ~ '^[0-9]+$'),
  currency text not null check(currency ~ '^[a-z]{3}$'),
  history_complete text not null default 'yes' check(history_complete in ('yes','no','unknown')),
  first_payment text not null default 'unknown' check(first_payment in ('yes','no','unknown')),
  sale_status text not null default 'pending' check(sale_status in ('pending','acknowledged','held','denied','failed')),
  created_at timestamptz not null,
  unique(workspace_id, payment_reference)
);
create index if not exists affiliate_payments_order_idx on app.affiliate_payments(workspace_id, paid_at, payment_reference);

create table if not exists app.affiliate_delivery_events (
  id uuid primary key,
  workspace_id uuid not null references app.workspaces(id) on delete restrict,
  event_kind text not null,
  event_reference text not null,
  payload_digest text not null check(payload_digest ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check(status in ('pending','acknowledged','held','failed')),
  attempts integer not null default 0 check(attempts >= 0),
  next_action_at timestamptz not null,
  acknowledged_at timestamptz,
  created_at timestamptz not null,
  unique(event_kind, event_reference)
);
create index if not exists affiliate_delivery_events_workspace_idx on app.affiliate_delivery_events(workspace_id, created_at);

create table if not exists app.affiliate_review_records (
  id uuid primary key,
  workspace_id uuid not null references app.workspaces(id) on delete restrict,
  payment_reference text,
  status text not null default 'held' check(status in ('eligible','held','deny_pending','denied','approved')),
  reason text not null check(length(trim(reason)) between 1 and 500),
  policy_version integer not null check(policy_version > 0),
  account_checkpoint_at timestamptz,
  refreshed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index if not exists affiliate_review_records_workspace_idx on app.affiliate_review_records(workspace_id, updated_at);

create table if not exists app.affiliate_correction_cases (
  id uuid primary key,
  workspace_id uuid not null references app.workspaces(id) on delete restrict,
  payment_reference text,
  reason text not null,
  status text not null default 'open' check(status in ('open','resolved')),
  created_at timestamptz not null,
  resolved_at timestamptz,
  unique(workspace_id, payment_reference, reason),
  check((status='open' and resolved_at is null) or (status='resolved' and resolved_at is not null))
);

insert into app.schema_ownership(key,owner,version) values('domain','shpitto-domain',25)
on conflict(key) do update set owner=excluded.owner,version=excluded.version;
