create table app.affiliate_notification_inbox (
  event_id uuid primary key,
  account_id text not null,
  program_id text not null,
  event_type text not null,
  entity_type text not null,
  entity_id integer not null,
  action text not null,
  payload_digest text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  lease_token text,
  lease_until timestamptz,
  next_action_at timestamptz not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null,
  processed_at timestamptz,
  constraint affiliate_notification_status_check check(status in ('pending','processed')),
  constraint affiliate_notification_counts_check check(entity_id > 0 and attempts >= 0)
);
create index affiliate_notification_pending_idx on app.affiliate_notification_inbox(status,next_action_at);
