-- M3 task 4.6: durable submit timeout marker for ambiguous provider outcomes.
alter table app.generation_tasks add column if not exists submission_started_at timestamptz;
insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 15)
on conflict (key) do update set owner = excluded.owner, version = excluded.version;
