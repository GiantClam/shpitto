alter table app.recovery_heartbeat_incidents add column expected_at timestamptz;

-- The v1 payload read expectedAt from its immutable scope registration, not from ageSeconds.
-- Copy that exact value: deriving it from the rounded/saturated age would change receipt hashes.
update app.recovery_heartbeat_incidents as incident
set expected_at = heartbeat.expected_at
from app.recovery_heartbeats as heartbeat
where incident.workspace_id = heartbeat.workspace_id
  and incident.worker_key = heartbeat.worker_key;

alter table app.recovery_heartbeat_incidents alter column expected_at set not null;

-- Preserve previously admitted identities without rewriting keys or breaking their incident FKs.
-- Enforce the shared slug contract for subsequent writes, including on a fresh installation.
alter table app.recovery_heartbeats drop constraint recovery_heartbeat_worker_check;
alter table app.recovery_heartbeats add constraint recovery_heartbeat_worker_check
  check (worker_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$') not valid;
