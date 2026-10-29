create table if not exists shpitto_chat_task_events (
  id uuid primary key,
  task_id uuid not null references shpitto_chat_tasks(id) on delete cascade,
  chat_id text not null,
  event_type text not null,
  stage text,
  payload jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_shpitto_chat_task_events_task_created
  on shpitto_chat_task_events(task_id, created_at desc);

create index if not exists idx_shpitto_chat_task_events_chat_created
  on shpitto_chat_task_events(chat_id, created_at desc);

alter table shpitto_chat_task_events enable row level security;

drop policy if exists "chat task events select" on shpitto_chat_task_events;
drop policy if exists "chat task events insert" on shpitto_chat_task_events;

create policy "chat task events select" on shpitto_chat_task_events
  for select using (true);

create policy "chat task events insert" on shpitto_chat_task_events
  for insert with check (true);

grant select, insert on shpitto_chat_task_events to anon;
grant select, insert on shpitto_chat_task_events to authenticated;

