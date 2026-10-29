-- M4 task 5.4: authenticated provider observations are durable before processing.
create table if not exists app.provider_webhook_inbox (
  id uuid primary key,
  provider text not null check(provider in ('replicate', 'fal')),
  external_event_id text not null,
  attempt_nonce text not null,
  provider_request_id text not null,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null,
  status text not null default 'received' check(status in ('received', 'processed', 'failed')),
  received_at timestamptz not null,
  processed_at timestamptz,
  constraint provider_webhook_inbox_identity_uq unique(provider, external_event_id),
  constraint provider_webhook_inbox_identity_check check(
    length(external_event_id) between 1 and 255 and
    length(attempt_nonce) between 1 and 255 and
    length(provider_request_id) between 1 and 255
  )
);
create index if not exists provider_webhook_inbox_request_idx
  on app.provider_webhook_inbox(provider, provider_request_id, received_at);
insert into app.schema_ownership(key,owner,version) values('domain','shpitto-domain',20)
on conflict(key) do update set owner=excluded.owner,version=excluded.version;
