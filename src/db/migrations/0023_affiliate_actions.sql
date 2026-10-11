-- Durable reviewed affiliate intents; this table stores no commission-money balance.
alter table app.affiliate_settings add column approved_dashboard_origin text;
alter table app.affiliate_settings add column last_sync_attempt_at timestamptz;
alter table app.affiliate_correction_cases add column version integer not null default 1 check(version > 0);
alter table app.affiliate_review_records drop constraint affiliate_review_records_status_check;
alter table app.affiliate_review_records add constraint affiliate_review_records_status_check check(status in ('eligible','held','approve_pending','deny_pending','denied','approved'));
create table app.affiliate_review_actions (
  id uuid primary key,
  workspace_id uuid not null references app.workspaces(id) on delete restrict,
  review_id uuid not null references app.affiliate_review_records(id) on delete restrict,
  actor_user_id text not null references "user"(id) on delete restrict,
  action text not null check(action in ('approve','deny')),
  payload jsonb not null,
  payload_digest text not null,
  policy_version integer not null,
  review_version integer not null,
  status text not null default 'pending' check(status in ('pending','submitted','succeeded','failed')),
  provider_batch_reference text,
  provider_status text,
  attempts integer not null default 0,
  lease_token text,
  lease_until timestamptz,
  next_action_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check(policy_version > 0 and review_version > 0 and attempts >= 0)
);
create index affiliate_review_actions_pending_idx on app.affiliate_review_actions(status,next_action_at);
insert into app.schema_ownership(key,owner,version) values('domain','shpitto-domain',28)
on conflict(key) do update set owner=excluded.owner,version=greatest(app.schema_ownership.version,excluded.version);
