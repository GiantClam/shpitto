create schema if not exists app;

create table if not exists app.schema_ownership (
  key text primary key,
  owner text not null,
  version integer not null check (version > 0),
  created_at timestamptz not null default now()
);

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 1)
on conflict (key) do update
set owner = excluded.owner,
    version = excluded.version;
