-- M3 task 4.5: durable outbox lease columns and fencing metadata.
alter table app.outbox_events add column if not exists available_at timestamptz;
update app.outbox_events set available_at = created_at where available_at is null;
alter table app.outbox_events alter column available_at set not null;
alter table app.outbox_events add column if not exists lease_until timestamptz;
alter table app.outbox_events add column if not exists lease_owner text;
alter table app.outbox_events add column if not exists lease_token uuid;
alter table app.outbox_events add column if not exists lease_generation bigint not null default 0;
alter table app.outbox_events add column if not exists attempts integer not null default 0;
create index if not exists outbox_events_available_idx on app.outbox_events(status, available_at, created_at);
insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 14)
on conflict (key) do update set owner = excluded.owner, version = excluded.version;
