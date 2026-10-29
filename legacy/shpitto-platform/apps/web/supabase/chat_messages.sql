create table if not exists shpitto_chat_messages (
  id uuid primary key,
  chat_id text not null,
  task_id uuid references shpitto_chat_tasks(id) on delete set null,
  owner_user_id uuid,
  role text not null check (role in ('user', 'assistant', 'system')),
  text text not null,
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_shpitto_chat_messages_chat_created
  on shpitto_chat_messages(chat_id, created_at asc);

create index if not exists idx_shpitto_chat_messages_task_created
  on shpitto_chat_messages(task_id, created_at asc);

alter table shpitto_chat_messages enable row level security;

drop policy if exists "chat messages select" on shpitto_chat_messages;
drop policy if exists "chat messages insert" on shpitto_chat_messages;

create policy "chat messages select" on shpitto_chat_messages
  for select using (true);

create policy "chat messages insert" on shpitto_chat_messages
  for insert with check (true);

grant select, insert on shpitto_chat_messages to anon;
grant select, insert on shpitto_chat_messages to authenticated;
