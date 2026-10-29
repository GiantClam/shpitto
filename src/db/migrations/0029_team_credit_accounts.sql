-- Restore the missing credit-account row for teams created before the
-- workspace command initialized it. Do not issue grants or alter history.
insert into app.credit_accounts (workspace_id, version, created_at, updated_at)
select workspace.id, 0, now(), now()
from app.workspaces workspace
where workspace.kind = 'team'
  and not exists (
    select 1 from app.credit_accounts account
    where account.workspace_id = workspace.id
  )
on conflict (workspace_id) do nothing;
