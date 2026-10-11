# upgrade-template

Plan a versioned upgrade with backup, compatibility and recovery evidence.

## Inputs
- Source/lockfile/configuration digests, migration plan and prior release metadata.

## Allowed scope
Upgrade manifests, buyer guidance and disposable compatibility rehearsals.

## Protected contracts
Do not reorder migrations, change ledger history, bypass backup/restore checks or
silently replace provider/auth/payment contracts.

## Outputs and evidence
Record before/after digests, migration result, restore result, compatibility checks and rollback patch.

## Recovery
Use the declared backup/restore path and preserve customer data and unrelated work.

## Escalation
Schema, auth, money, generation or provider changes require an engineering change.
