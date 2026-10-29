-- Local durable affiliate state. External account verification remains a separate gate.
alter table app.affiliate_settings add column if not exists account_checkpoint_version integer not null default 0;
alter table app.affiliate_settings add column if not exists account_sync_status text not null default 'pending';
alter table app.affiliate_settings add column if not exists reviewed_campaign_revision text;
alter table app.affiliate_settings add constraint affiliate_settings_checkpoint_check check(account_checkpoint_version >= 0 and account_sync_status in ('pending', 'succeeded', 'failed'));
alter table app.affiliate_attributions add column if not exists expires_at timestamptz;
create unique index affiliate_payments_first_uq on app.affiliate_payments(workspace_id) where first_payment = 'yes';
alter table app.affiliate_delivery_events add column if not exists payload jsonb not null default '{}';
alter table app.affiliate_delivery_events add column if not exists payment_reference text;
alter table app.affiliate_delivery_events add column if not exists amount_minor text;
alter table app.affiliate_delivery_events add column if not exists lease_token text;
alter table app.affiliate_delivery_events add column if not exists lease_until timestamptz;
alter table app.affiliate_delivery_events add constraint affiliate_delivery_events_amount_check check(amount_minor is null or amount_minor ~ '^[0-9]+$');
alter table app.affiliate_review_records add column if not exists review_version integer not null default 1;
alter table app.affiliate_review_records add column if not exists account_checkpoint_version integer not null default 0;
alter table app.affiliate_review_records add constraint affiliate_review_records_evidence_version_check check(review_version > 0 and account_checkpoint_version >= 0);
create unique index affiliate_review_records_payment_uq on app.affiliate_review_records(workspace_id, payment_reference);
insert into app.schema_ownership(key,owner,version) values('domain','shpitto-domain',27)
on conflict(key) do update set owner=excluded.owner,version=greatest(app.schema_ownership.version,excluded.version);
