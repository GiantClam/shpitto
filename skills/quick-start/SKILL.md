# quick-start

Set up and inspect the persistent local no-cloud demo.

## Inputs
- Clean or explicitly recorded dirty repository baseline.
- Node 24, pnpm 12.6, Docker PostgreSQL and the checked-in `.env.example`.

## Allowed scope
Local environment files, documented setup commands and buyer guidance.

## Protected contracts
Do not change authentication, migrations, ledger, generation state, provider
adapters or validation policy through this Skill.

## Outputs and evidence
Record commands, service readiness, migration result, demo seed result and the
browser/API smoke path. Do not record secrets.

## Recovery
Stop local services and remove only the disposable local volumes created by the
setup instructions. Preserve unrelated repository changes.

## Escalation
Report a protected or production configuration request as an engineering or
deployment change.
