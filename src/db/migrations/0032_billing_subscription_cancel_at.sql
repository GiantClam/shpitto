alter table app.billing_subscriptions add column if not exists cancel_at timestamptz;

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 33)
on conflict (key) do update
set owner = excluded.owner, version = greatest(app.schema_ownership.version, excluded.version);
