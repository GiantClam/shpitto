# Independent deployment and controlled release

## Purpose

Make the buyer-owned source release reproducible across local, managed and Docker application profiles, with explicit export boundaries, verified artifacts, coordinated migrations and recoverable operations.

## ADDED Requirements

### Requirement: REQ-REL-01 Explicit export and dependency boundaries

Release export SHALL use a positive allowlist for new root source, migrations, runtime/deploy configuration, Skills, buyer guides, local fixtures, license notices and version metadata. It MUST exclude legacy/, vendor/, internal/, .omx/, original .git/, agent personal state, secrets, caches and build artifacts; build/check/image contexts MUST exclude the frozen legacy application. Lockfile/package references SHALL contain no absent private dependency or developer-local path.

Trace: D01, D14, D16, D31, J1, J9, T45, T46, T47, T52, T62, G01, G14, G16, G31. Tasks: 9.1, 9.2, 9.3, 9.14, 9.15.

#### Scenario: SC-REL-01 Export only allowed source

- **WHEN** a release package and application image context are generated
- **THEN** manifest inspection accounts for included files and proves the excluded legacy/vendor/internal/history/secret/state/cache paths are absent; broad repository copy with a denylist is rejected

#### Scenario: SC-REL-02 Resolve dependencies independently

- **WHEN** the exported lockfile, package metadata and license inventory are inspected
- **THEN** no runtime/build/check dependency resolves to archived code, a developer checkout or unavailable private packages; source redistribution notices are present and unlicensed Enterprise packages are excluded

### Requirement: REQ-REL-02 Reproducible artifacts and clean history

A release SHALL contain template-version.json, supported migration range, exact dependency/lockfile identity, model/plan contract versions, license inventory and matching Docs version. Customer repositories SHALL be initialized from the clean export with new history, and checksum ZIP bytes SHALL match the reviewed source release. REQ-SKL-04 evidence MUST bind the exact exported/deployed candidate. All shipped recipes, configuration and buyer guides MUST be finalized before candidate freezing. A subsequent shipped-byte change SHALL invalidate the prior digest/evidence, regenerate the package and clean repository, and rerun clean installation plus affected deployment and contract checks before release.

Trace: D01, D16, D29, D30, J1, J9, T46, T47, T55, T58, G01, G16, G29, G30. Tasks: 9.3, 9.4, 9.11, 9.14, 9.15.

#### Scenario: SC-REL-03 Inspect a fresh customer artifact

- **WHEN** a release ZIP and newly initialized customer repository are opened outside the development checkout
- **THEN** their source/version/checksum and Docs/migration manifests agree, original development history is absent and installation does not require ignored developer files

#### Scenario: SC-REL-04 Block mutation after release verification

- **WHEN** the staged export or deployment content differs from its trusted passing digest
- **THEN** the supplied release/deploy entrypoint refuses it and requires matching fresh evidence rather than accepting a commit label alone; the revised candidate receives a new archive/repository digest, a repeated clean installation and renewed affected deployment/contract proof

### Requirement: REQ-REL-03 Two concrete production deployment paths

The release SHALL document and verify Vercel web with Neon PostgreSQL 17, private Cloudflare R2, Trigger.dev Cloud and Resend as its managed reference. It SHALL also support a multi-stage Next standalone Docker application image using the same external database/storage/Trigger/mail contracts, including required public and .next/static output. Buyers SHALL supply their own accounts and secrets. Docker support MUST NOT imply self-hosting all production infrastructure.

Trace: D01, D07, D15, J9, T47, T48, T62, G01, G07, G15, G31. Tasks: 9.5, 9.6, 9.7, 9.14, 9.15.

#### Scenario: SC-REL-05 Deploy the managed reference

- **WHEN** a buyer follows the managed guide using the clean release and buyer-owned accounts
- **THEN** web, database migrations, Trigger schedules/workers, private storage, mail and configured callbacks work with explicit prerequisites and recorded versions; generation never holds an HTTP request until completion

#### Scenario: SC-REL-06 Run the Docker application

- **WHEN** a buyer builds and runs the documented standalone application image
- **THEN** public/static assets and server routes work with the declared external services, and the guide clearly distinguishes application container deployment from complete infrastructure self-hosting

### Requirement: REQ-REL-04 Persistent no-cloud profile and safe production configuration

The local profile SHALL use Node/pnpm/Docker, persistent PostgreSQL, a database-polling worker, Mock provider, private local asset volume and captured SMTP mail without cloud keys. Production configuration MUST reject Mock/local task/storage drivers, demo grants, localhost origins, weak/default secrets and missing mandatory services while allowing affiliates to be disabled. Secrets MUST remain server/worker-only and diagnostics MUST reveal presence/status without values.

Trace: D01, D18, D24, J1, J9, T01, T29, T47, T48, T62, G01, G18, G24, G31. Tasks: 9.4, 9.7, 9.14, 9.15.

#### Scenario: SC-REL-07 Start and restart without cloud keys

- **WHEN** a clean customer checkout starts its documented local profile and restarts web/worker processes
- **THEN** signup, workspace, Mock success/failure/cancel, saved asset and credit history operate and persist without seller/cloud accounts; the media probe is supplied in the worker container

#### Scenario: SC-REL-08 Reject unsafe production profiles

- **WHEN** production starts with a demo driver/default secret/missing mandatory service or with affiliates disabled
- **THEN** unsafe mandatory configuration prevents startup with redacted diagnostics, while a correctly configured core application can start with optional affiliates disabled

### Requirement: REQ-REL-07 Mock demo full-flow acceptance

The local Mock profile SHALL provide a complete, repeatable demo journey for
all implemented local capabilities. From the documented seed/default demo
account, a reviewer SHALL be able to sign in, complete personal and team
workspace setup, create and accept an invitation, inspect members and access
denials, run Mock success/delay/failure/cancel and unknown-recovery outcomes,
inspect credit lineage and task history, download a private owned asset, use
local billing fixtures, inspect operations/admin views and execute the
documented recovery/restart path. Every implemented local route SHALL expose a
usable success/loading/empty/error/denied state. This evidence is explicitly
local/mock and MUST NOT be labeled real-provider, real-payment or production
evidence.

Trace: D01, D18, D24; J1, J3, J4, J9; T01, T02, T05, T12, T13, T14, T16, T17, T20, T29, T47, T48, T49, T50, T53, T56, T62; G01, G03, G06, G07, G18, G20, G22, G24, G31. Tasks: 2.5, 2.6, 3.12, 4.12, 7.14, 9.4.

#### Scenario: SC-REL-14 Complete the seeded Mock journey

- **WHEN** a clean local profile runs the documented seed and demo flow without
  cloud credentials
- **THEN** login, personal/team workspace, invitation/member management,
  generation outcomes and recovery, credits/assets, fixture billing and
  operations/admin checks complete with persisted records and sanitized
  evidence after restart

#### Scenario: SC-REL-15 Keep local evidence honest

- **WHEN** the Mock full-flow record is reviewed for a release or milestone
- **THEN** each result identifies its local/mock profile and fixture, real
  provider/payment/production rows remain explicitly pending, and a missing or
  failed local journey blocks the local demo acceptance

### Requirement: REQ-REL-05 Coordinated migrations and operational recovery

Deployment SHALL use one reviewed Drizzle migration sequence via a direct PostgreSQL connection and migration lock, with web/worker compatibility recorded from the same release. Additive expand/backfill/switch/contract changes SHALL precede destructive changes. Rollback MUST select a compatible release and MUST NOT blindly downgrade schemas or repeat paid submissions. Runbooks SHALL cover backup/restore, task and integration recovery, dependency health, redacted correlation logs, alerts and retention. RPO 15 minutes/RTO 4 hours remain objectives requiring the chosen tier and restore evidence, not availability promises.

Trace: D07, D15, D17, D20, J4, J9, T12, T48, T49, T50, T53, T60, G07, G15, G17, G20. Tasks: 9.7, 9.8, 9.9, 9.14, 9.15.

#### Scenario: SC-REL-09 Apply a compatible release migration

- **WHEN** web and worker are upgraded from a supported prior release
- **THEN** one locked migration applies before incompatible code, version/schema checks pass, and customized files are accounted for without inheriting an independent admin migration owner

#### Scenario: SC-REL-10 Restore and roll back deliberately

- **WHEN** a deployment failure requires rollback or a destructive migration is proposed
- **THEN** the operator uses recorded compatibility and tested backup/restore steps, drains/reconciles active attempts where needed and avoids blind schema downgrades or paid resubmissions; observed recovery evidence states whether objectives were met

#### Scenario: SC-REL-11 Recover using correlated operational evidence

- **WHEN** an overdue task, failed asset copy, dead-letter webhook or ledger mismatch triggers an alert
- **THEN** the runbook links workspace/task/attempt/command and release identifiers to safe domain commands with redacted logs; liveness/readiness distinguish process, DB/schema and external degradation without exposing secrets

### Requirement: REQ-REL-06 Evidence-based Beta and stable release gates

Release status SHALL be based on G01–G31 and the required T01–T62 evidence, including all promised commercial V1 capabilities. Evidence SHALL identify the exact release, environment, case, outcome and sanitized artifact, distinguishing local/mock, service-backed, payment test-mode and live results. Missing, blocked or skipped evidence MUST NOT be labeled passing. Fixed dates MUST NOT override scope or unresolved release-blocking defects; live expenditure/publication requires its own authorized execution step.

The [staged acceptance contract](../../acceptance-gates.md) SHALL govern separate M8-RC, M8-BETA and M8-STABLE records. Paid-Beta readiness SHALL require all applicable promised-scope evidence and approved commercial inputs. Stable readiness SHALL additionally require representative journey/recovery/upgrade and monitoring observations, disposition of Beta findings, current candidate evidence and no unresolved mandatory failure. Task 9.15 and the main M8 gate SHALL remain incomplete after BETA alone and close only after STABLE PASS. No fixed observation duration or customer count is implied.

Trace: D03, D19, D30, D31, J1, J2, J3, J4, J5, J6, J7, J8, J9, J10, T01, T21, T25, T30, T47, T48, T53, T55, T58, T62, G03, G19, G30, G31. Tasks: 9.13, 9.14, 9.15.

#### Scenario: SC-REL-12 Reject incomplete commercial release evidence

- **WHEN** the release matrix contains a missing real provider/mode, incomplete affiliate/admin/Docs capability or skipped required check
- **THEN** the matrix records the limitation and the commercial V1 gate remains incomplete rather than treating Mock or package presence as proof

#### Scenario: SC-REL-13 Label readiness accurately

- **WHEN** a reviewer considers a paid Beta or stable candidate
- **THEN** RC, BETA and STABLE decisions identify their candidate and required evidence separately; BETA alone leaves 9.15 open, while stable includes representative observation, closed blockers and migration/support guidance; review of this plan alone neither starts publication nor claims implementation passes

