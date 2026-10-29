# M2 repaired candidate

Candidate: `working-tree-20260929-m2-repair`. Source, schema, configuration,
contract, validator and lockfile digests are in the candidate JSON and expanded
file footprints. These include test sources. Earlier 3.11/3.12 records are STALE.

## Fixed defects and test evidence

| Finding | Repair | Evidence |
| --- | --- | --- |
| Reviewer dispatch selected a fixed obsolete specialist model | Generic native agent explicitly selects gpt-6-sol | Independent reviewer dispatch and report |
| Historical grants have no ledger | Pre-ledger snapshot capture and forward 0010 opening entries; compare every captured field | Disposable pre-0007 upgrade, spend, raw migration replay and cleanup probe |
| Missing modern ledger could be mistaken for history | Capture only when the ledger table does not exist; require captured baseline | Modern missing and partial ledger grants remain held |
| Held grants could still settle or expire | Check reconciliation after the account lock | All terminal outcomes and expiry reject without effects |
| Compensation test missed expiry and repeated events | Controlled before/at/after seven-day boundary and 20 identical reordered replays | Refund probe; changed semantic evidence conflicts |
| Verification/reset mail silently discarded | Connect real local Mailpit adapter; verified email required; reset revokes sessions | Real auth handler and actual Next HTTP/Mailpit probes |
| Auth route returns 500 | Give Better Auth Next adapter a callable lazy handler | HTTP session regression and complete real HTTP lifecycle |
| Refreshed session treated as recent credentials | Use session createdAt for transfer freshness | Old createdAt/fresh updatedAt denies; new session succeeds |
| Malformed onboarding JSON ignored | Reject malformed request with 400 before setup | HTTP probe snapshots verify no side effects |
| Member principal could request worker/operator operations | Explicitly deny reserved operations to member principals | Complete E02 principal/state matrix, reproduced before repair |
| Tenant FK probe accepted unrelated NOT NULL failure | Supply valid reservation; require PostgreSQL 23503 and exact grant/workspace FK | Foundation probe |
| Credit-only coverage incorrectly labeled as aggregate | Include all delivered domain modules, auth, mail, quote and HTTP contracts | 575/620 branches, 92.74%; no missing LCOV files |

## Verification

- `verification-attempt1/commands.json`: real timestamps, complete output and exit
  codes for 28 passing tests and three reset repetitions of four race probes.
- Overspend and duplicate command races use ten attempts. Two-owner mutations
  use ten attempts, exactly one successful transition and one remaining owner.
  Invitation acceptance uses ten attempts, one membership and nine denied replays.
- `api-isolation.log`: 35 denied requests, five workspace routes and eight method
  variants, global operator denial and ownership freshness. Rejected requests
  compare durable business state before/after.
- `auth-http.log`: actual local Next routes, Mailpit links, verification, login,
  onboarding retry, reset completion page, reset token reuse and disabled login.
- `auth-lifecycle.log`: real library handler with restarted auth/database instance,
  persistent session and workspace, expired/invalid token rejection and reset
  session revocation. Recording mail is labeled separately from live Mailpit.
- `verify.log`: typecheck, lint, format, configuration and source boundaries,
  OpenSpec strict validation and optimized production build all pass.
- `ui/checks.json` and nine screenshots: signup, login, reset request and reset
  completion at 1440x900 and 390x844. Inputs and buttons have 44px minimum targets,
  no horizontal overflow, visible focus and associated labels. Keyboard Tab/Enter
  checks and a client-only password-mismatch alert pass. Initial browser inspection
  exposed inline cramped inputs; scoped form CSS corrected the layout.
- `coverage-carry-equivalence.json`: all 40 owned-domain/test inputs match the
  independently measured footprint after the form class/CSS-only correction.
  Production verification was rerun on the final UI source.
- Failed first HTTP attempts and build-check attempts are retained. The former
  exposed the auth route defect; the latter exposed a stale placeholder check
  and historical record compatibility. Neither is presented as a passing run.
- `check-acceptance-record.py --current` recomputes current byte digests. Default
  mode remains compatible with historical evidence; current promotion additionally
  rejects unresolved mandatory criteria and sub-threshold coverage.

## Upgrade and stage limits

Use `corepack pnpm db:migrate` for upgrades. It captures the legacy baseline
before applying ledger migrations while holding the canonical migration lock.
Direct third-party migration invocation bypasses that preflight and is not the
supported upgrade command. Databases already upgraded without a captured baseline
stay held: do not infer lost history from timestamps or release unknown reserved
credits. Preserve a backup and use a later audited recovery procedure. This
candidate tests both held modern discrepancies and usable proven legacy balances.

T49 operator event-location/recovery and browser workspace journeys remain tasks
4.11/4.13. Tests here validate domain settlement using disposable reservations;
they do not claim delivered generation tasks, real providers or payment issuance.
Production email transport is explicitly unavailable until its adapter is supplied;
production cannot quietly use local capture. No new dependency, commit, push or
deployment was performed. The existing unrelated worktree changes are preserved.

Independent review and integrator decisions are recorded separately in the new
task-level and aggregate records. The source report alone does not promote M2.
