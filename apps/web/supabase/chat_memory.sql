create table if not exists shpitto_chat_thread_memory (
  thread_id text primary key,
  stage text not null check (stage in ('drafting', 'previewing', 'deployed', 'deploying')),
  intent text,
  intent_confidence double precision,
  recent_summary text,
  active_scope text,
  revision_pointer jsonb not null default '{}'::jsonb,
  requirement_state jsonb not null default '{}'::jsonb,
  workflow_context jsonb,
  version bigint not null default 1,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_shpitto_chat_thread_memory_stage_updated
  on shpitto_chat_thread_memory(stage, updated_at desc);

create index if not exists idx_shpitto_chat_thread_memory_updated
  on shpitto_chat_thread_memory(updated_at desc);

create table if not exists shpitto_chat_user_preferences (
  owner_user_id text primary key,
  preferred_locale text,
  primary_visual_direction text,
  secondary_visual_tags jsonb not null default '[]'::jsonb,
  deployment_provider text,
  deployment_domain text,
  target_audience jsonb not null default '[]'::jsonb,
  tone text,
  version bigint not null default 1,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_shpitto_chat_user_preferences_updated
  on shpitto_chat_user_preferences(updated_at desc);

create or replace function shpitto_chat_memory_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists trg_shpitto_chat_thread_memory_updated_at on shpitto_chat_thread_memory;
create trigger trg_shpitto_chat_thread_memory_updated_at
before update on shpitto_chat_thread_memory
for each row
execute function shpitto_chat_memory_set_updated_at();

drop trigger if exists trg_shpitto_chat_user_preferences_updated_at on shpitto_chat_user_preferences;
create trigger trg_shpitto_chat_user_preferences_updated_at
before update on shpitto_chat_user_preferences
for each row
execute function shpitto_chat_memory_set_updated_at();

alter table shpitto_chat_thread_memory enable row level security;
alter table shpitto_chat_user_preferences enable row level security;

drop policy if exists "chat thread memory select" on shpitto_chat_thread_memory;
drop policy if exists "chat thread memory insert" on shpitto_chat_thread_memory;
drop policy if exists "chat thread memory update" on shpitto_chat_thread_memory;

create policy "chat thread memory select" on shpitto_chat_thread_memory
  for select using (true);

create policy "chat thread memory insert" on shpitto_chat_thread_memory
  for insert with check (true);

create policy "chat thread memory update" on shpitto_chat_thread_memory
  for update using (true) with check (true);

drop policy if exists "chat user preferences select" on shpitto_chat_user_preferences;
drop policy if exists "chat user preferences insert" on shpitto_chat_user_preferences;
drop policy if exists "chat user preferences update" on shpitto_chat_user_preferences;

create policy "chat user preferences select" on shpitto_chat_user_preferences
  for select using (true);

create policy "chat user preferences insert" on shpitto_chat_user_preferences
  for insert with check (true);

create policy "chat user preferences update" on shpitto_chat_user_preferences
  for update using (true) with check (true);

grant select, insert, update on shpitto_chat_thread_memory to anon;
grant select, insert, update on shpitto_chat_thread_memory to authenticated;
grant select, insert, update on shpitto_chat_user_preferences to anon;
grant select, insert, update on shpitto_chat_user_preferences to authenticated;
