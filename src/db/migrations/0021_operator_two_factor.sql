alter table "user" add column if not exists two_factor_enabled boolean not null default false;

create table if not exists two_factor (
  id text primary key,
  secret text not null,
  backup_codes text not null,
  user_id text not null references "user"(id) on delete cascade,
  verified boolean not null default true,
  failed_verification_count integer not null default 0,
  locked_until timestamptz
);
create index if not exists two_factor_user_id_idx on two_factor(user_id);
create index if not exists two_factor_secret_idx on two_factor(secret);
