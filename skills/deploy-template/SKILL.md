# deploy-template

Prepare a supported deployment configuration from the checked-in deployment contract.

## Inputs
- Target profile, buyer-owned prerequisites, environment names and secret references.

## Allowed scope
Deployment templates, health checks, runbooks and redacted configuration guidance.

## Protected contracts
Never place secrets in source, enable demo drivers in production, or change migration
ordering, worker fencing or callback authentication through this Skill.

## Outputs and evidence
Record preflight checks, service readiness, migration/worker compatibility and rollback steps.

## Recovery
Use the scoped deployment rollback/runbook. Do not reset the repository or delete
unrelated infrastructure records.

## Escalation
Production changes require an authorized deployment action and separate release evidence.
