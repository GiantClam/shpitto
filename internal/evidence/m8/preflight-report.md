# M8 local preflight report

Date: 2026-10-07

Profile: `local-preflight-only`

The local preflight confirms the release boundary, deployment recipe, production
guard, migration, backup/restore, health and operations foundations that can be
checked without buyer-owned accounts. It does not create a release candidate,
promote an M8 checkpoint, or claim a managed/Docker production deployment.

## Passing local checks

- 9.1 export allowlist and excluded roots: `internal/evidence/m8/export-scan/`
- 9.2 boundary tests and notice baseline: `internal/evidence/m8/export-scan/`
- 9.5 managed deployment reference preflight: `internal/evidence/m8/managed-preflight/`
- 9.6 Docker context and standalone packaging preflight: `internal/evidence/m8/docker-preflight/`
- 9.7 production configuration and migration typecheck: `internal/evidence/m8/config-migration/`
- 9.8 backup/restore command presence and runbook preflight: `internal/evidence/m8/restore-preflight/`
- 9.9 health and operational recovery preflight: `internal/evidence/m8/operations-preflight/`

The command that regenerates these records is:

```sh
corepack pnpm verify:m8-local
```

## Deferred gates

9.3/9.4 remain dependent on the final unchanged candidate and its clean install.
9.10 and 9.13 require the vendor sales account, merchant eligibility and
approved commercial terms. 9.11/9.12 depend on that vendor setup. 9.14/9.15
remain open until the exact candidate is exercised in the required profiles.
M4/M5/M6 real provider, payment and affiliate gates are intentionally deferred.
