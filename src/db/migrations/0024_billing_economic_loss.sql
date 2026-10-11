alter table app.billing_cash_events add column economic_loss_key text;
alter table app.billing_cash_events add column related_external_id text;
-- The migration transaction holds the table lock throughout this derived-field
-- backfill. Restore the immutable-fact trigger before the transaction commits.
alter table app.billing_cash_events disable trigger billing_cash_events_immutable;
update app.billing_cash_events
set economic_loss_key = case when event_kind = 'refund' then 'refund:' else 'dispute:' end || external_id;
alter table app.billing_cash_events enable trigger billing_cash_events_immutable;
alter table app.billing_cash_events alter column economic_loss_key set not null;
create index billing_cash_events_loss_idx on app.billing_cash_events(provider, order_id, economic_loss_key);
