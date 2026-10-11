-- M3 task 4.7: persist and fence the bounded materialization retry budget.
alter table app.generation_tasks add column if not exists materialization_attempts integer not null default 0;
alter table app.generation_tasks drop constraint if exists generation_tasks_materialization_attempts_check;
alter table app.generation_tasks add constraint generation_tasks_materialization_attempts_check
  check (materialization_attempts >= 0 and materialization_attempts <= 8);
insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 16)
on conflict (key) do update set owner = excluded.owner, version = excluded.version;
