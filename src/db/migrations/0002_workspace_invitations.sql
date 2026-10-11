-- M2 task 3.4: one-use team invitations and durable mail intents.

create table if not exists app.workspace_invitations (
  id uuid primary key,
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  email_normalized text not null,
  role text not null default 'member' check (role = 'member'),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by text references "user"(id) on delete restrict,
  inviter_id text not null references "user"(id) on delete restrict,
  created_at timestamptz not null,
  check (expires_at = created_at + interval '7 days')
);
create unique index if not exists workspace_invitations_pending_email_uq
  on app.workspace_invitations (workspace_id, email_normalized)
  where accepted_at is null;
create index if not exists workspace_invitations_workspace_idx
  on app.workspace_invitations (workspace_id, created_at);
create index if not exists workspace_invitations_token_hash_idx
  on app.workspace_invitations (token_hash);

create table if not exists app.mail_outbox (
  id uuid primary key,
  kind text not null check (kind = 'workspace_invitation'),
  invitation_id uuid not null unique references app.workspace_invitations(id) on delete cascade,
  business_key text not null unique,
  recipient_email text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  available_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null
);
create index if not exists mail_outbox_status_available_idx
  on app.mail_outbox (status, available_at);

insert into app.schema_ownership (key, owner, version)
values ('domain', 'shpitto-domain', 3)
on conflict (key) do update
set owner = excluded.owner,
    version = excluded.version;
