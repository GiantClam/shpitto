create table if not exists shpitto_chat_sessions (
  id text primary key,
  owner_user_id uuid,
  title text not null default 'Untitled Session',
  archived boolean not null default false,
  pinned boolean not null default false,
  last_task_id uuid references shpitto_chat_tasks(id) on delete set null,
  last_message text,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_shpitto_chat_sessions_owner_updated
  on shpitto_chat_sessions(owner_user_id, updated_at desc);

create index if not exists idx_shpitto_chat_sessions_owner_archived
  on shpitto_chat_sessions(owner_user_id, archived, pinned, updated_at desc);

create or replace function shpitto_chat_sessions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists trg_shpitto_chat_sessions_updated_at on shpitto_chat_sessions;
create trigger trg_shpitto_chat_sessions_updated_at
before update on shpitto_chat_sessions
for each row
execute function shpitto_chat_sessions_set_updated_at();

alter table shpitto_chat_sessions enable row level security;

drop policy if exists "chat sessions select" on shpitto_chat_sessions;
drop policy if exists "chat sessions insert" on shpitto_chat_sessions;
drop policy if exists "chat sessions update" on shpitto_chat_sessions;

create policy "chat sessions select" on shpitto_chat_sessions
  for select using (true);

create policy "chat sessions insert" on shpitto_chat_sessions
  for insert with check (true);

create policy "chat sessions update" on shpitto_chat_sessions
  for update using (true) with check (true);

grant select, insert, update on shpitto_chat_sessions to anon;
grant select, insert, update on shpitto_chat_sessions to authenticated;
