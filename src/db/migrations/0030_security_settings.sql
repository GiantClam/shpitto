create table if not exists app.security_settings (
  id text primary key,
  email_verification_enabled boolean not null default false,
  two_factor_required boolean not null default false,
  turnstile_enabled boolean not null default false,
  turnstile_site_key text,
  turnstile_secret_ciphertext text,
  smtp_enabled boolean not null default false,
  smtp_url_ciphertext text,
  smtp_from_email text,
  smtp_from_name text,
  version integer not null default 1,
  updated_at timestamptz not null,
  check (version > 0)
);

insert into app.security_settings (id, email_verification_enabled, two_factor_required, updated_at)
select 'default', exists (
  select 1 from "user"
), exists (
  select 1 from app.operator_roles where revoked_at is null
), now()
on conflict (id) do nothing;

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 31)
on conflict (key) do update
set owner = excluded.owner, version = greatest(app.schema_ownership.version, excluded.version);
