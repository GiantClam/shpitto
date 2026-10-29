create table if not exists shpitto_workflow_runs (
  workflow_id text primary key,
  chat_id text,
  task_id text,
  execution_mode text not null,
  status text not null,
  contract_hash text,
  generation_lane text,
  website_surface_mode text,
  snapshot jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_shpitto_workflow_runs_chat_task
  on shpitto_workflow_runs(chat_id, task_id);

create index if not exists idx_shpitto_workflow_runs_updated
  on shpitto_workflow_runs(updated_at desc);

create or replace function shpitto_workflow_runs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists trg_shpitto_workflow_runs_updated_at on shpitto_workflow_runs;
create trigger trg_shpitto_workflow_runs_updated_at
before update on shpitto_workflow_runs
for each row
execute function shpitto_workflow_runs_set_updated_at();

alter table shpitto_workflow_runs enable row level security;

drop policy if exists "workflow runs select" on shpitto_workflow_runs;
drop policy if exists "workflow runs insert" on shpitto_workflow_runs;
drop policy if exists "workflow runs update" on shpitto_workflow_runs;

create policy "workflow runs select" on shpitto_workflow_runs
  for select
  using (true);

create policy "workflow runs insert" on shpitto_workflow_runs
  for insert
  with check (true);

create policy "workflow runs update" on shpitto_workflow_runs
  for update
  using (true)
  with check (true);

grant select, insert, update on shpitto_workflow_runs to anon;
grant select, insert, update on shpitto_workflow_runs to authenticated;
