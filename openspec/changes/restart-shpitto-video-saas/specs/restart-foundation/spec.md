## Purpose

Establish a recoverable, independently owned foundation for the replacement AI video SaaS template while preserving legacy work and validating selected dependencies before migration.

## ADDED Requirements

### Requirement: REQ-FND-01 Recoverable source preservation

The restart SHALL inventory tracked files, selected untracked and ignored authored files, Git state and path ownership before relocation. It SHALL preserve bytes and a restoration map, keep `.git` at the root, and preserve secrets privately outside exports. Relocation SHALL NOT stop an existing online service implicitly.

Trace: D02, D14; J1, J9; T44, T46; G02, G14.

#### Scenario: SC-FND-01 Inventory-driven relocation
- **WHEN** the approved relocation map is executed against the recorded inventory
- **THEN** every mapped file has a verified destination/hash or recorded retained location, history remains reachable at the root, and no unmapped file is overwritten.

#### Scenario: SC-FND-02 Preservation conflict stops migration
- **WHEN** a source hash changes, a destination contains conflicting work or a required local file is missing from the preservation record
- **THEN** relocation stops before destructive replacement, reports the conflict and preserves both versions for recovery.

#### Scenario: SC-FND-03 Source relocation and service lifetime
- **WHEN** old source is archived under `legacy/shpitto-platform/`
- **THEN** no running deployment, hosted project, account or remote resource is deleted or disabled by that action.

### Requirement: REQ-FND-02 New root and explicit legacy isolation

The root SHALL contain an independently runnable template. Install, build, lint, typecheck, formatting, test discovery, container context and export SHALL explicitly exclude legacy and vendor-only code unless a separately named vendor command targets the vendor site. New root guidance SHALL describe the template and preserve the old harness with legacy source.

Trace: D01, D02, D14, D16; J1, J9; T44-T47; G01, G02, G14, G16.

#### Scenario: SC-FND-04 Legacy sentinel remains outside checks
- **WHEN** a disposable legacy fixture contains invalid source or dependencies and new root commands run
- **THEN** the fixture is neither installed, compiled, discovered as a test, formatted, bundled nor exported by those commands.

#### Scenario: SC-FND-05 Guidance has a clear owner
- **WHEN** a developer opens the new root or the archived source
- **THEN** each has its appropriate guidance and the new workflow refers to OpenSpec without applying unrelated old website-generation repair rules.

### Requirement: REQ-FND-03 Selected stack requires evidence

Implementation SHALL use the selected version baseline or a reviewed replacement decision. Dependency resolution, peer compatibility, redistribution licenses, admin adapters, migration ownership, documentation build and packaging SHALL have recorded evidence. Upstream metadata SHALL NOT count as runtime integration verification.

Trace: D15, D31; J1, J7, J9, J10; T59-T62; G15, G31.

#### Scenario: SC-FND-06 Compatible frozen baseline
- **WHEN** M0 evaluates the selected configuration in an isolated disposable prototype
- **THEN** it records the lockfile, dependency/license inventory, integration evidence and justified substitutions without unsupported peer overrides concealing incompatibility.

#### Scenario: SC-FND-07 Unsupported component blocks its gate
- **WHEN** a dependency, license permission or required external contract cannot be validated
- **THEN** its gate remains unresolved, a responsible owner revises the component or records a permitted deferral, and selection alone cannot mark it passed.

### Requirement: REQ-FND-04 Persistent local prerequisites

A customer with Node, pnpm and Docker SHALL initialize declared local services without cloud credentials. Database, mail capture, worker/media tools and assets SHALL be reproducible and persistent. Demo drivers SHALL be identified and rejected in production configuration.

Trace: D07, D15, D18; J1, J3, J9; T01, T47, T48, T62; G07, G15, G18, G31.

#### Scenario: SC-FND-08 Credential-free initialization
- **WHEN** a fresh copy starts with the documented local environment and no external service keys
- **THEN** database, mail capture, worker and storage initialize through supported commands without an undisclosed global tool or private checkout dependency.

#### Scenario: SC-FND-09 Restart preserves local state
- **WHEN** the local app and dependency containers restart without deleting declared volumes
- **THEN** account/workspace setup, domain records and stored assets remain and pending work is recoverable by the worker.

#### Scenario: SC-FND-10 Production rejects demo configuration
- **WHEN** production selects Mock generation, demo credits, local mail/storage or sample secrets
- **THEN** startup/deployment validation rejects the configuration with actionable redacted errors before accepting customer traffic.

### Requirement: REQ-FND-05 Single ownership and transactional foundations

Domain and Better Auth schema changes SHALL share one reviewed Drizzle migration sequence. Framework/admin routes SHALL NOT introduce competing membership, credit, payment or task authorities. Cross-module mutations SHALL follow documented transactions/lock ordering. HTTP requests SHALL NOT run database migrations.

Trace: D05, D15, D22, D31; J5, J7; T04, T59-T61; G05, G15, G22, G31.

#### Scenario: SC-FND-11 Migration ownership is explicit
- **WHEN** two deployment instances attempt an auth/domain migration
- **THEN** one migration owner and deployment lock serialize the reviewed sequence without a second CMS schema engine or request-time schema push.

#### Scenario: SC-FND-12 Integration slice fails atomically
- **WHEN** an admin prototype command encounters an injected domain, ledger, audit or outbox failure
- **THEN** no partial successful business mutation remains and retry cannot duplicate the intended effect.

### Requirement: REQ-FND-06 Milestone evidence and scoped inputs

Each milestone SHALL record prerequisites, observed evidence, unresolved inputs and recovery points. Missing, simulated or blocked evidence SHALL NOT satisfy a real-execution gate. Credentials, commercial terms and budgets SHALL block dependent external/release tasks while independent local work may proceed.

Milestones SHALL follow the [staged acceptance contract](../../acceptance-gates.md), with independent review, profile-specific assertions and a recorded integrator decision. Mandatory checks SHALL all pass; failed or blocked dependencies SHALL prevent dependent completion. Changed relevant source/schema/configuration/policy bytes SHALL mark affected evidence stale until reviewed and revalidated. A task checkbox SHALL NOT replace a gate record.

Trace: D03, D10, D19, D31; J3, J9; T01, T48, T49, T62; G03, G10, G19, G31.

#### Scenario: SC-FND-13 External evidence unavailable
- **WHEN** provider/affiliate credentials, account qualification or an authorized budget are absent
- **THEN** the dependent task remains blocked with an owner/reason, local work may proceed and no real-provider or paid-Beta gate is marked passed.

#### Scenario: SC-FND-14 Document readiness differs from implementation
- **WHEN** OpenSpec validation succeeds but implementation tasks lack observed evidence
- **THEN** only plan validity is reported, implementation remains incomplete, stage records remain NOT_STARTED without implementation evidence, and no archive/deployment/release completion is claimed; independent review and current profile-specific evidence are required before any implementation gate passes.

### Requirement: REQ-FND-07 Demonstrable local template experience

The foundation SHALL include a default UI/brand/shared-shell baseline and a
credential-free Mock demo path that can be exercised before real provider,
payment or production accounts are available. The baseline and demo path SHALL
be treated as implementation contracts with concrete browser/API evidence,
while external account-dependent obligations remain separately gated.

Trace: D01, D06, D18, D28; J1, J2, J3, J4, J9; T01, T32, T47, T48, T56, T62; G01, G06, G18, G28, G31. Tasks: 2.5, 2.6, 4.12, 8.4, 8.5, 9.4.

#### Scenario: SC-FND-15 Fresh checkout is usable before external onboarding

- **WHEN** a buyer follows the local setup with only Node, pnpm and Docker
- **THEN** the default shells render coherently, the seeded Mock account can
  complete the supported local journey, and the app clearly labels external
  provider/payment/production evidence as deferred rather than failing the
  local experience
