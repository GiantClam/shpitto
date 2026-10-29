create table if not exists shpitto_chat_tasks (
  id uuid primary key,
  chat_id text not null,
  owner_user_id uuid,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  result jsonb,
  retry_count integer not null default 0,
  last_error_code text,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table shpitto_chat_tasks add column if not exists retry_count integer not null default 0;
alter table shpitto_chat_tasks add column if not exists last_error_code text;

create index if not exists idx_shpitto_chat_tasks_chat_created
  on shpitto_chat_tasks(chat_id, created_at desc);

create index if not exists idx_shpitto_chat_tasks_status_updated
  on shpitto_chat_tasks(status, updated_at desc);

create index if not exists idx_shpitto_chat_tasks_expires
  on shpitto_chat_tasks(expires_at);

create or replace function shpitto_chat_tasks_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists trg_shpitto_chat_tasks_updated_at on shpitto_chat_tasks;
create trigger trg_shpitto_chat_tasks_updated_at
before update on shpitto_chat_tasks
for each row
execute function shpitto_chat_tasks_set_updated_at();

alter table shpitto_chat_tasks enable row level security;

drop policy if exists "chat tasks select" on shpitto_chat_tasks;
drop policy if exists "chat tasks insert" on shpitto_chat_tasks;
drop policy if exists "chat tasks update" on shpitto_chat_tasks;

create policy "chat tasks select" on shpitto_chat_tasks
  for select
  using (
    expires_at is null or expires_at > timezone('utc'::text, now())
  );

create policy "chat tasks insert" on shpitto_chat_tasks
  for insert
  with check (true);

create policy "chat tasks update" on shpitto_chat_tasks
  for update
  using (true)
  with check (true);

grant select, insert, update on shpitto_chat_tasks to anon;
grant select, insert, update on shpitto_chat_tasks to authenticated;
