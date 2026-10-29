# Shpitto AI Video SaaS Template: Restart Plan

Date: 2026-09-27
Status: Product requirements D01-D31 remain confirmed. Engineering selections and implementation contracts are now fixed in the detailed technical design linked below. React-admin OSS is selected; Payload and Refine are rejected V1 alternatives. M0 validates the selected baseline. Selection is not installation or runtime validation. Historical D01-D29 reviews remain scoped to that revision; the new design records its own review evidence.
Scope: Planning only. No source relocation, application implementation, package installation, live generation, payout, or publication has been performed by this plan.

## 1. Authority, outcome, and companion documents

The user confirmed requirements D01-D29 after the grill-me interview and subsequently added D30, developer documentation covering the template, Skills and APIs, and D31, favoring mature open-source capabilities to reduce unnecessary custom development. Those decisions govern this plan; the original product-design attachment remains reference input. The intended outcome is a commercially deliverable, independently deployable source template with governed coding-agent workflows for personalizing the buyer's own AI video SaaS and developer documentation aligned with the released product. D31 confirms a reuse principle, not a particular admin product or an automatic change to the D15 stack.

- OpenSpec entry: [restart proposal](../../openspec/changes/restart-shpitto-video-saas/proposal.md) and [current design E01-E05](../../openspec/changes/restart-shpitto-video-saas/design.md). Authority is explicit product decisions, then OpenSpec behavior/design, then the detailed technical register, then this historical phase plan. Selected engineering defaults are not retrospective user confirmations.
- Detailed technical design: [selected stack, data model, APIs, transactions and deployment](../../docs/plans/2026-09-27-shpitto-detailed-technical-design.md). Use it with the current OpenSpec design; earlier pending choices below are normalized to that baseline.
- Requirements: `docs/plans/2026-09-27-shpitto-restart-requirements.md`.
- PRD: `.omx/plans/prd-shpitto-restart.md`.
- Acceptance and test specification: `.omx/plans/test-spec-shpitto-restart.md`.
- Planning context: `.omx/context/shpitto-restart-20260927T025618Z.md`.
- Admin-foundation assessment: [open-source reuse and candidate evaluation](../../docs/plans/2026-09-27-shpitto-admin-foundation-assessment.md).
- Requirement acceptance references below use G01-G31 from the companion specification.

This plan retains phase context and historical rationale; the OpenSpec task list owns actionable execution dependencies. Explicitly selected engineering defaults remain distinct from product confirmations, unverified integration behavior and unresolved commercial prices/terms. Previously acquired versions must remain operational when update/support entitlement expires.

## 2. RALPLAN-DR decision summary

### Principles

1. Deliver one buyer-owned product with independently configurable service accounts.
2. Preserve financial and tenant-isolation invariants across retries, customization, and operational recovery.
3. Make the first local experience real and persistent without requiring cloud credentials.
4. Prefer mature open-source capabilities where compatibility, licensing and net maintenance savings are demonstrated; reuse bounded capabilities with provenance and remove dependency on the legacy platform.
5. Release against observable outcomes, with reversible migration and explicit export boundaries.

### Top three decision drivers

| Driver | Consequence for the plan |
| --- | --- |
| A maintainable source product, not a hosted site factory | Root application, modular domain boundaries, external coding-agent Skills, clean customer history. |
| Paid asynchronous video has uncertain outcomes and real upstream cost | Durable submission attempts, reconciliation, grant-level reservations, idempotent business effects, operator visibility. |
| Buyers must customize quickly without breaking the template | Declared customization surfaces, project-owned contracts, actual-diff validation, business regression gates. |

### Viable architectural alternatives

| Option | Benefits | Costs and risks | Decision |
| --- | --- | --- | --- |
| A. Root Next.js modular monolith with explicit domain modules and external production services | Matches the confirmed stack; one source product; shared local/production domain services; low operational overhead. | Requires disciplined imports and transactions; long jobs still need a separate worker runtime. | Selected implementation direction. |
| B. Root web app plus separately deployed API/ledger/worker services | Strong process isolation; independent scaling; useful when teams or transaction load justify it. | More deployment, auth, tracing, versioning, and local setup burden for template buyers; no current requirement needs those services. | Defer; keep adapter boundaries so future extraction is possible. |
| C. Extract and comprehensively refactor the old image template into the new root | Existing auth/payment/UI patterns may reduce initial work. | Old assumptions, licensing, dependencies, and platform output contracts can be inherited unintentionally; missing video and new ledger guarantees remain. | Use selected reviewed source only; do not treat extraction as the architecture. |

The existing-platform-in-place approach would preserve a runtime the user explicitly chose to freeze. It is not an equivalent compliant alternative. Docker deployment of the application does not require replacing Trigger.dev or fully self-hosting all production services.

### Three failure pre-mortems

| Failure imagined after launch | Early warning | Prevention and evidence | Owner |
| --- | --- | --- | --- |
| A buyer receives duplicate charges or loses credits during provider timeouts | Unknown submission attempts retried as new jobs; mutable balance-only implementation; unrelated callback identifiers. | Attempt/outbox model; reconcile before resubmit; unique settlement keys; race, crash, replay, and expiry cases before Beta. | Domain + integrations lanes. |
| A page-editing Skill breaks paid generation while claiming visual success | UI replaces service calls with local mocks; widened scopes; disabled checks; only screenshots reviewed. | Contracts and protected paths; before/after diff manifest; independent validation; negative customization scenarios; release blocks on failure. | Skills/UI + reviewer lanes. |
| Archive or customer export leaks private state or depends on legacy code | Broad copy/glob operations; ignored docs absent from inventory; customer Git cloned from development history. | Explicit inventory and file allowlist; no source-history clone; separate secret preservation; exported clean-room install/build and content scan. | Release lane + independent reviewer. |

## 3. Current evidence and interpretation

These anchors describe the pre-migration checkout; M0 records archived equivalents before paths change.

| Evidence | Observed fact | Planning consequence |
| --- | --- | --- |
| `README.md:1`, `README.md:7` | Existing product is the AI Portal Generation Platform with a Next.js/Puck/chat application. | A new video product must have new guidance, routes, and operational contracts. |
| `package.json:5`, `package.json:9`, `package.json:21`; `pnpm-workspace.yaml:1` | Current commands/workspaces include old apps/packages and root-wide formatting. | Replace active manifests; exclude legacy from formatting as well as builds and checks. |
| `turbo.json:3`, `turbo.json:7` | Existing task graph and broad output/environment globs target the old workspace. | Archive or replace configuration; explicit new application inputs/outputs only. |
| `.gitignore:14`, `.gitignore:56`, `.gitignore:59` | Environment files, docs, and OMX state are ignored. | A clean Git status is not a preservation inventory; protect planning artifacts separately. |
| `.gitignore:71`; tracked `.cache/awesome-design-md/**` | A cache-named directory contains tracked snapshots despite the ignore rule. | Classify by actual content/tracking, not directory name; preserve tracked snapshots. |
| `railway.json:8`, `vercel.json:2`, `.vercelignore` | Existing deployment entry points target the current root/web app and lack new archive isolation. | Review local and hosted build roots/hooks; write explicit legacy exclusions without changing remote services implicitly. |
| `AGENTS.md:15`, `AGENTS.md:31` | Normative docs are English; current repair order references old website-generation paths. | Keep English documentation; archive historical guidance and write new ownership rules. |
| `apps/web/skills/template-operations/template-modify/SKILL.md:8` | Existing Skill classifies edits and reads contracts first. | Reuse scope classification after adapting it to the new domain. |
| `apps/web/skills/template-operations/template-modify/SKILL.md:10` | Business preservation, no real-to-Mock replacement, validation and rollback are explicit. | Preserve these rules and add executable checks around the new code. |
| `apps/web/skills/template-operations/template-inspect/SKILL.md:8` | Existing inspection includes manifests, routes, migrations, and environment examples. | Reuse inspection concepts without reading or printing secret values. |
| `apps/web/skills/website-refinement-workflow/SKILL.md:3`, `:66` | Refinement targets static HTML/CSS/JS. | Do not import its output conventions into React/Next.js unchanged. |
| `apps/web/skills/open-design-saas-landing/NOTICE.open-design.md:5` | Imported Open Design has recorded upstream provenance and an Apache-2.0 notice. | Verify the pinned selected files and all asset licenses before redistribution. |
| `apps/web/package.json:13`, `:14`; image-template `template-manifest.json:67` | Template inspection/export commands and capability metadata already exist. | Study reusable patterns; old image-template export does not prove the new release is clean. |

## 4. Target repository and application boundaries

Use one root application with cohesive domain modules. Avoid a monorepo task framework unless a demonstrated requirement remains after the migration.

```text
/
  AGENTS.md, README.md, package.json, pnpm-lock.yaml
  .env.example, .gitignore, next.config.*, tsconfig.json
  src/
    app/(marketing)/, (auth)/, (app)/, (admin)/, api/
    modules/identity/, workspaces/, credits/, generation/
    modules/assets/, billing/, affiliates/, operations/
    adapters/providers/replicate/, fal/, mock/
    adapters/tasks/trigger/, local/
    adapters/storage/s3/, local/, mail/resend/, smtp/
    components/ui/, marketing/, product/
    config/brand.*, navigation.*, plans.*, capabilities.*
    content/, styles/, db/schema/, db/migrations/
  trigger/                     production task entry points
  skills/<skill-name>/          shipped external-agent workflows
  .shpitto/contracts/           route, customization, business, export contracts
  scripts/                     setup, validation, inventory, export tooling
  tests/unit/, integration/, e2e/, contracts/
  docs/                        versioned developer content; selected buyer guides exported
  deploy/                      Docker and selected managed deployment
  vendor/                      source-license sales and docs presentation; not exported
  internal/                    engineering records; not exported
  legacy/shpitto-platform/      frozen old source; never active or exported
  .git/                        original development history, stays at root
```

File families are design targets, not preexisting paths. Use directories only when needed; do not add a generic plugin framework, commission engine, or duplicated business-service layer.

| Boundary | Owns | Does not own |
| --- | --- | --- |
| App routes/actions | Validated input, sessions, workspace context, presentation, response shaping | Provider SDK rules, direct credit arithmetic, raw cross-workspace DB access. |
| Domain modules | State transitions, permissions, ledger commands, business invariants | React components, task-runtime SDKs, vendor-specific payloads. |
| Adapters | Provider/task/storage/mail/payment integration and normalized results | Independent balance/refund decisions or alternate authorization rules. |
| Database | Durable state, uniqueness, transactions, migrations | Event delivery guarantees from remote systems. |
| Skills/contracts/scripts | Supported modification rules, validation, release evidence | Runtime dependence on coding agents or prevention of every manual source edit. |

Enforce server-only boundaries for secrets and privileged services. Route groups are organization, not authorization: authorization occurs in server use cases. Domain interfaces stay small and concrete; only integration seams need adapters.

React-admin OSS owns the operator presentation, with Better Auth session adaptation and domain query/command endpoints. Drizzle remains the single migration and transaction owner. The detailed technical design specifies files, packages, permissions and initialization.

## 5. Migration, preservation, and rollback

### M0 inventory before the first move

Record each entry's relative path, class, tracked/ignored status, size/hash where useful, destination, preservation method, and reason. Collect filenames and metadata for secrets, never values. Inventory Git status, untracked files, ignored files, active processes, configured local deployment state, root scripts, and imports into old code.

| Class | Planned handling |
| --- | --- |
| Tracked legacy source and configuration | Relocate by an explicit manifest into `legacy/shpitto-platform/`; include `apps/web`, old workers, `packages/db`, `packages/schema`, `builder`, `sites`, tracked snapshots and notices. |
| `.git` and repository history | Remain at the root. No reinitialization, history rewrite, or copying into the legacy archive. |
| Current ignored requirements/plans/evidence | Copy verified UTF-8 artifacts into a deliberately tracked internal documentation location before broad docs moves; retain originals until verified. |
| `.env*`, credentials, local DBs and meaningful runtime state | Preserve through a secure local backup/mapping; keep ignored; never place values in inventory, commits, or customer export. |
| `.codex`, `.agents`, `.omx`, editor and agent state | Classify individually. Preserve session/user state; archive old product guidance separately; replace root product instructions intentionally. |
| `.vercel`, Cloudflare bindings, deployment references | Inventory privately; do not move or mutate indiscriminately; document online services and local mappings independently. |
| Dependencies, caches, generated outputs | Generated dependency/build caches are not source requirements. Preserve tracked snapshots, authored content, needed evidence and user data even inside a cache-named directory; do not delete by default. |
| Root notes and temporary trees | Classify `plan.md`, `task_plan*`, findings/progress notes, `apps/.tmp`, and similar entries individually; preserve user work and relevant evidence. |
| New product/customer documentation | Explicitly track intended files; replace broad docs ignore with targeted policy during migration. Preserve private records outside export. |

### Safe move sequence

1. Establish the execution branch and review the exact relocation manifest against the current working tree.
2. Record a source baseline and private preservation manifest; include local modifications and ignored authored documents that Git cannot recover.
3. Check absolute source/destination containment inside the named workspace; reject collisions, symlink surprises, and recursive moves into descendants.
4. Use native PowerShell literal-path operations for the approved manifest. Move source in small reversible groups; keep `.git` in place.
5. Preserve historical root `AGENTS.md` with legacy; write the new root contract around the video template and governed customization.
6. Replace root package/workspace/check/deploy globs so `legacy/**` cannot enter installation, formatting, linting, typechecking, testing, bundling, image contexts, or export.
7. Compare the post-move manifest and hashes, inspect active imports/configuration, and account for every required file.
8. Validate the new root in a clean checkout/export. Do not require legacy installation, compilation, or runtime operation.

Do not move `node_modules` into the archive and accidentally make it a release input. New installation regenerates the root dependency tree after old tooling is isolated. Do not reuse old environment variables implicitly in the new application.

Inspect configured hosted build roots, branch settings, hooks and service dependencies read-only before executing migration. No local/tracked `.github` workflow was found in the evidence pass; that does not prove external automation is absent. Record unavailable hosted information as a decision dependency.

Rollback before new application work uses the inverse relocation manifest and preserved source baseline. Rollback after implementation preserves new work separately, restores tracked source from the recorded baseline, and restores ignored files from their private preservation location. Never blanket-reset or delete unrelated user changes. Online-service retirement requires its own decision and is not an archive side effect.

## 6. Domain and persistence contracts

### Main records

| Domain | Proposed records and stable keys |
| --- | --- |
| Identity/workspaces | Users, sessions, workspaces, memberships, invitations; membership unique by workspace/user; separate global operator role. |
| Credits | Grants, immutable ledger entries, reservations, reservation allocations, settlement/refund operations; unique business-operation keys and grant lineage. |
| Generation | Tasks, immutable submission attempts, provider identifiers, normalized events, dispatch outbox, reconciliation records. |
| Assets | Input uploads, durable outputs, object keys, ownership, metadata, retention state; every access derives workspace authorization. |
| Billing | Workspace billing accounts, provider customer mappings, subscriptions, orders, invoice/payment references, webhook inbox, grant-period keys. |
| Affiliates | Local referral metadata and workspace attribution/eligibility references; third-party IDs and synchronization state, not a second commission ledger. |
| Operations | Administrative audit records, webhook processing outcomes, redacted diagnostics, configuration health and provider-cost evidence. |

Use database transactions for operations spanning tasks, reservations, and outbox records. Unique constraints enforce one effect per business key. Amounts use integer credit units and explicit currency minor units; do not mix provider currency charges with end-user credit units.

### Workspace and authorization

- Create a personal workspace with account registration; support invited owner/member teams with shared billing, tasks, credits, and assets.
- Apply membership and role checks inside server use cases and storage-download authorization; never trust a workspace ID supplied by the browser.
- Selected E01 default: a personal workspace has only its immutable creator-owner and no invitations, ownership transfer or conversion; a separate team permits member generation/reads and owner membership/billing control. Team transfer targets an existing active verified member, and concurrent changes cannot remove the final owner. E02 separately defines user disablement, workspace suspension and billing holds.
- Revoke access on membership removal and account suspension, including new signed-download requests. Define short-lived existing URL behavior in the storage contract.
- Operators use an explicit global role; tenant ownership never implies administration. Sensitive admin actions require reason, actor, target, and result audit records.

### Task lifecycle and submission

```text
queued -> dispatching -> submitted -> running -> materializing -> succeeded
queued -> cancelled
dispatching/submitted/running/materializing -> failed (determined delivery failure)
dispatching -> submission_unknown -> reconciliation -> submitted | failed
submission_unknown -> failed (bounded recovery exhausted; upstream outcome may stay unknown)
```

Provider adapters normalize their different upstream states into domain events; terminal transitions must be monotonic. A provider success is insufficient: `succeeded` requires durable, usable output and an authorized asset record.

Task creation atomically reserves the quoted credits and enqueues dispatch. Pre-dispatch cancellation and dispatch contend on the same row/version; only one wins. Once dispatch claims the attempt, the UI no longer offers cancellation. Local/production drivers share this rule.

Persist an attempt before network submission. A timeout after possible submission creates an unknown outcome, not an automatic retry/refund. Preserve request identity and available upstream identifiers; reconcile through supported provider APIs and operator evidence. Do not assume upstream idempotency support. Use retries for safe retrieval, ingestion, and known unsubmitted attempts; define provider-specific retryability explicitly.

Uncertainty cannot reserve a customer's credits indefinitely. Before M4, select a finite reconciliation deadline, retrieval/ingestion retry budget, escalation point, and responsible operator for every supported model. Base these on verified provider behavior and cost/output limits; record them in the model contract rather than inventing universal durations. Persist the deadline from the original attempt so worker retries or manual reassignment cannot reset it.

Keep upstream outcome and customer delivery disposition distinct. When the bounded recovery policy is exhausted without a usable delivered asset, atomically record an auditable terminal delivery failure and restore the full reservation exactly once, applying D21 compensation lineage where required. The provider outcome/cost may remain unknown and belongs to the operator's reconciliation record; it does not extend the customer's reservation indefinitely. This disposition must never automatically create another paid submission.

Quarantine late callbacks and assets for operator investigation after terminal delivery failure. They may update upstream diagnostic/cost evidence, but cannot reopen the customer's task, debit restored credits, attach a newly billable delivery, or renew compensation. The release gate includes deadline exhaustion followed by late provider success, as specified in T53.

Webhook and poll paths converge through one idempotent transition function. Verify signatures where supported; validate timestamps/event identity as applicable; fetch authoritative provider state when needed. Repeated or reordered events cannot overwrite a terminal success/failure. Limit input/output URLs, MIME types, file sizes and fetch destinations to prevent unsafe asset ingestion.

### Credits and failure compensation

1. Persist grants with source, original origin, remaining amount and expiry; purchased grants have no expiry.
2. Reserve eligible grants by earliest expiry, then deterministic creation/id order. Lock or atomically allocate balances to prevent concurrent overspend.
3. Reservations preserve each grant allocation while it is in use; period expiry removes free availability but does not erase an in-flight allocation.
4. Durable success commits consumption exactly once. Determined failure releases/refunds every reserved unit through one idempotent operation.
5. Refund an unexpired subscription allocation to its original expiry; refund purchased credits without expiry.
6. An expired subscription allocation from a failed task produces one compensation grant expiring seven days after the first effective refund operation.
7. Refunds of compensation preserve that compensation grant's original expiry, including when it has already passed; they never restart the clock.
8. Pre-dispatch cancellation releases original allocations; the D21 failure exception is not silently extended to ordinary cancellation.
9. Record operator-incurred provider cost separately even when the user receives a full credit refund. Subjective dissatisfaction uses the support policy.

The ledger is the audit history; derived balances must reconcile to grants, reservations, and terminal operations. Expiry and admin corrections append evidence instead of deleting history. Admin adjustments cannot mutate past entries or bypass lineage constraints.

### Billing

Stripe checkout and webhooks call billing use cases. Trust verified server-side events, not the browser success redirect. Deduplicate incoming events and the underlying invoice/payment/grant business identities because different events may describe the same payment.

Periodic grants use canonical paid invoice-line/service-period keys and the line's original period end; permanent packs use the canonical confirmed payment key. The selected E04 baseline is monthly-only with one recurring price, no annual/multi-item billing, scheduled plan change or proration. Cancellation at period end preserves issued credits; replacement purchase waits until the prior subscription ends and the Checkout guard passes. Catalog changes affect future purchases or an explicitly reviewed migration. Status/trial/incomplete events grant nothing, and one invoice cannot issue an initial plus renewal grant for the same entitlement.

Keep paid-order refunds/disputes separate from generation-credit restoration. Select an explicit policy for credits already consumed when a paid order is refunded; do not create negative balances or revoke other grants accidentally. Store cash and credit adjustments with their respective source references.

## 7. Providers, task drivers, storage, and local experience

| Capability | Required production evidence |
| --- | --- |
| Replicate text-to-video | Real approved model invocation, provider ID, delivered stored video, final task/credit record. |
| Replicate image-to-video | Same evidence plus validated input upload and supported image-input contract. |
| fal.ai text-to-video | Real approved endpoint invocation, queue/result mapping, durable video and final accounting. |
| fal.ai image-to-video | Same evidence plus validated image-input mapping and asset ownership. |

Select concrete endpoints after checking official model schemas, available accounts, commercial terms, costs, limits, latency, and output behavior. One provider may use distinct endpoints for the two modes. Pin supported model configuration and accepted parameters; avoid exposing every raw provider option.

Adapter operations should cover capability discovery, submission, status/result retrieval, event normalization and diagnostic/cost extraction where available. Provider-side cancellation support does not change D13's end-user cancellation boundary. Record unavailable cost data as unknown rather than zero.

Production uses Trigger.dev for durable task orchestration. Trigger entry points invoke the same domain services as local jobs. Persist critical domain state in PostgreSQL so a task-runtime retry cannot independently charge credits or create a second upstream attempt.

The cloud-free demo uses Docker PostgreSQL, real local authentication/workspaces, a development-only durable task driver, deterministic Mock Provider fixtures, and local storage through the same asset interface. Proposed local email sink records development invite/reset links without external delivery. No additional production queue or self-hosted task system is promised.

The local driver claims persisted outbox work, resumes after process restart, and exercises success, failure, pre-dispatch cancellation, and expiry compensation. Mock output must be an actual playable fixture with redistributable provenance, not a broken URL. The mode must be explicit and rejected as production configuration.

Production S3-compatible storage ingests provider outputs promptly and exposes workspace-authorized downloads. Temporary upstream URLs are not the durable library. Establish timeouts, retry/backoff, output validation, storage failure handling, cleanup, and retention before release.

## 8. Product surfaces, operator backend, and affiliates

The shipped SaaS includes English marketing/pricing pages, authentication, workspace switcher, generation composer, queue/history, asset details/downloads, billing/credit views, workspace settings, and operator administration. D22 requires template-owned operator capabilities, which may reuse an open-source foundation rather than hand-coding every generic admin component. Do not ship public API-key pages or embedded chat-agent controls without the deferred functionality.

| Operator surface | Required action and restriction |
| --- | --- |
| Users/workspaces | Inspect membership and account state; scoped status changes are audited. |
| Billing/credits | Link provider orders/subscriptions; explain grants/reservations/expiry; apply reasoned compensating adjustments. |
| Tasks/assets | Inspect attempts and durable outputs; reconcile unknown jobs; retry safe operations without duplicate generation charges. |
| Provider configuration | Display capabilities and redacted health; no plaintext secret readback or unsupported automatic failover. |
| Audit/integration health | Inspect webhook outcomes, dispatch backlog, failures and cost uncertainty; redact sensitive payload fields. |
| Affiliates | Configuration health, program/portal links and necessary synchronized status; no native payout engine. |

The buyer SaaS selects FirstPromoter V2 API tracking as its optional third-party affiliate integration. Stable workspace UID, canonical payment IDs, native first-charge configuration and supported operator payout review are specified in detailed design Section 10. Rewardful was considered; FirstPromoter offers a clearer documented UID-based fit.

Selected mapping: one active Stripe customer per workspace with all historical mappings retained. Before first-sale export, wait five minutes and reconcile complete paid history across those mappings, ordering canonical payments by (paid_at,payment_id), not event arrival. Persist first-effective-payment identity under workspace serialization; later members/payers/customer changes cannot reset it. A verified older payment discovered after export creates a persistent conflict hold and repair case.

The selected FirstPromoter V2 server Tracking API sends stable workspace UID and canonical payment/refund IDs with duplicate native Stripe sale tracking disabled. Configure native By count=1 and local first_payment policy; hold and deny returned non-first-payment commissions before approval/handoff. A deliberate provider_campaign revision must match reviewed provider configuration. M0/M6 validate these contracts; incompatibility requires a documented design revision, not silent weakening of D25-D26 or a competing commission ledger.

Selected E05 attribution uses the creator's last valid touch in the 30 days before workspace creation, held in a signed Secure/HttpOnly first-party token and verified for the configured provider/program. Seal that creator reference at creation; discard invalid/expired references and hold transient verification failures for the original captured reference only. Later touches/members cannot replace it. Export unique incremental cash reversals against the original sale without resetting first-payment eligibility. A won dispute after commission denial/reversal remains in a manual correction hold until provider-verified repair and audit; failed-generation credit refunds do not reverse cash commission.

Operators review commissions and initiate payment through the supported third-party process. V1 may link to provider management screens when that is the supported flow; document exact handoff and status visibility. Separate tracking from disbursement, fees, funding, geography, and account eligibility. No live transfer is part of default verification.

Shpitto source sales select Lemon Squeezy hosted checkout and its separate affiliate program, with per-customer clean private GitHub repositories and version ZIP delivery. Vendor data/accounts and source-license entitlements are independent of the delivered SaaS.

### Open-source-first admin foundation (D31)

Select React-admin OSS for business lists, forms, filters and the operator shell. Select Fumadocs with versioned MDX for developer Docs. Refine would require more UI assembly; Payload adds CMS/auth/schema ownership for content workflows absent from V1. Their comparison is retained in the assessment as decision rationale. M0 validates the selected React-admin integration rather than running an open-ended framework competition.

The common boundary is unchanged: Better Auth owns customer identity; server domain services authorize workspace and operator actions; Drizzle-owned transactions enforce ledger, billing, task and audit rules. Reuse lists, filters, forms and navigation where justified, but keep business views behind domain queries and privileged changes behind explicitly authorized domain commands. Data-adapter UI candidates do not inherently require a second identity store or migration owner.

| Boundary | Required control for any selected foundation |
| --- | --- |
| Identity and authorization | Better Auth owns customer identity and sessions; existing workspace domain services and persistence contracts own workspaces and memberships. This does not require transferring those domains to an authentication plugin. Verify the global operator's current privileges on the server, including revocation, and record a stable actor ID. Matching an email, hiding navigation or displaying an admin page is not authorization. |
| Business commands | Credit adjustments, task retries/reconciliation, suspension, membership changes, payment/entitlement repair, private-asset access and affiliate eligibility use dedicated domain commands. No generic table editing may replace these rules. |
| Transactions and audit | Where atomicity is required, business changes and corresponding audit/outbox records commit in the same domain transaction. Do not assume a UI framework or CMS transaction shares Drizzle's transaction. Content edit history cannot replace financial or privileged-operation audit. |
| Configuration | Presentation copy and approved non-sensitive content may use CRUD. Prices, grant rules, model availability, concurrency and retention require validated, audited publication with an explicit effective scope; existing tasks/orders preserve applicable snapshots. No plaintext-readable secret fields. |
| All entry points | Authorize custom views, server handlers and applicable REST/GraphQL/Local API calls independently. Core objects receive no unrestricted generic writes, and private read models preserve tenant/operator checks. Disable or reliably deny unnecessary interfaces using verified supported configuration. |
| Product boundaries | D08 still defers public generation APIs and customer API keys. D24 still delegates commission accounting and payout to the selected third party. D15's core stack and the confirmed business rules remain unchanged. |

#### Selected operator integration

Use a client-only React-admin app under /admin, a Better Auth authProvider and a domain-backed dataProvider. The server resolves the current global operator role and two-factor state on every privileged call. Customer identity, workspace identity, ledger, tasks and billing remain in the application database. Generic financial/state writes are forbidden. No Payload runtime, CMS database or additional migration owner is introduced. See the detailed design for the command contracts and DTO mapping.

#### M0 validation of the selected baseline

| Evidence group | Required result and future acceptance reference |
| --- | --- |
| Identity and entry-point protection | Prove operator login/revocation and reject visitors, customer users and workspace owners without global privileges across views, commands and every applicable API path; T59. |
| Migration, transaction and audit failure | Prove one domain-owned PostgreSQL database and reviewed Drizzle migration chain for auth/application tables, including initialization, upgrade and backup boundaries. Inject failures around privileged commands and prove atomic business/audit outcomes and recoverable synchronization; T60. |
| Core CRUD bypass and idempotency | Attempt direct ledger/task/entitlement/eligibility writes through available interfaces; require refusal or the same authorized domain command. Duplicates must not duplicate credits, paid submissions or eligible affiliate payments; T61. |
| Version, licensing and deliverability | Pin compatible versions, review paid-source redistribution/notices and compare total implementation/maintenance effort on the same prototype. Demonstrate customer-local/Docker setup and clean export without vendor data or a hosted Shpitto CMS dependency; T62. |

M0 validates one React-admin slice: a read-only task list, a low-risk configuration form and an audited credit-adjustment command. Record reuse, custom adapter work, authorization failures, license/lockfile evidence and migration ownership. M1 integrates this chosen foundation; M6 completes operations; M8 proves delivery. Reopen the choice only on documented incompatibility, not merely because implementation validation is pending.

### Developer documentation center (D30)

The template sales website must include developer-facing documentation introducing the template, explaining Skill use, and documenting API integration and extension contracts. This documentation is part of the V1 delivery scope. It serves developers evaluating, installing, customizing, and operating the template.

| Documentation area | Required content and boundary |
| --- | --- |
| Template | Product capabilities and architecture, quick start, local demo versus production, environment/configuration, deployment, upgrades and recovery. Describe the released product and its actual prerequisites. |
| Skills | All twelve shipped Skills: supported Codex/Claude Code/OpenCode invocation paths, prerequisites, inputs, outputs, examples, declared modification scope, protected boundaries, validation and scoped recovery. Do not promise identical agent tool APIs. |
| API and integrations | Existing internal application interfaces and authorization boundaries, provider/API integration, and development extension contracts. For interfaces actually present in the release, document parameters, response structures, errors, permissions, asynchronous states, and applicable Webhook verification, replay and idempotency rules. Mark examples and fixtures clearly; never invent available endpoints. |

D08 remains unchanged: documentation does not introduce a public generation API, a customer API-key feature, or a new public compatibility promise for internal application interfaces. Distinguish internal interfaces requiring the application's existing session/workspace authorization from provider-facing integrations and future functionality. Do not present a documentation route as an executable API endpoint or publish secrets in examples.

Selected information architecture: public `/docs` with Template, Skills, APIs and Releases, release navigation, static search, section anchors and copyable examples. Fumadocs/MDX is selected in the detailed design; M0/M1 validates its compatible pinned setup. This selected design does not imply an installed dependency or a verified runtime.

Selected implementation: trusted release-tagged MDX in `content/docs/<release>/` is the shared source for sales-site Docs and portable buyer guides. The vendor presentation shell and commercial code stay outside the customer export. Shared content introduces no vendor runtime dependency; version labels, links and examples match released interfaces/Skills and limitations.

D30 uses the selected source-owned Fumadocs/MDX publication path. V1 introduces no runtime Docs CMS, CMS database or editorial migration engine. Release snapshots and export manifests bind the website and buyer guides to the same approved content version. Previously released documentation is not silently replaced by current content, and guides remain usable without a seller-hosted content service.

M1 establishes the documentation information architecture and content/export boundary. M7 completes the Skill and API references against stable contracts. M8 accepts the sales-site documentation center and version-matched documentation in the clean customer package. G30 and future cases T56-T58 cover documentation coverage/navigation, truthful Skill/API contracts with D08 intact, and version/export isolation. No additional milestone is introduced.

## 9. Governed customization and open-source reuse

### Modification classes and executable boundaries

| Class | Allowed surfaces | Required control |
| --- | --- | --- |
| Brand/presentation | `src/config/brand.*`, content, theme tokens, approved components and routes | Schema checks, actual changed-file scope, responsive/a11y evidence, existing action/data contracts. |
| Product extension | Dedicated provider/task/credit/asset/deployment extension points | Explicit interface changes, migrations where needed, targeted domain and integration evidence. |
| Protected core | Auth, authorization, webhooks, ledger, task machine, schema, validation/release policy | Reclassify to an explicit engineering change; declare impact and independent validation. |

Maintain machine-readable contracts for editable configuration, required routes/actions, protected modules, business assertions, extension points, and delivery allowlists. Project-owned Skills compose upstream resources within these contracts. Their examples must not override task scope or install dependencies implicitly.

Supported workflow: inspect version and existing changes; classify scope; record intended files/routes/invariants; establish a baseline; edit; compare actual diff including new/deleted files; run required checks; preview representative states; publish a change/evidence/rollback summary. Reclassification is necessary when the requested outcome crosses the original boundary.

Record initial dirty/untracked changes separately from the proposed customization diff. They are preserved user work, not trusted policy updates or an automatic exemption from final validation. Recovery reverts only changes attributed to the workflow; avoid blanket reset/checkout operations. Capture reversible edits or a scoped patch without exposing secrets. A failed validation keeps the result incomplete and blocks the supported release command.

Load validation policy, required-suite definitions and validator tooling from a pinned trusted template-release baseline outside the candidate edit set, such as a verified read-only reference copy. Check its version and content digest before use. Candidate edits to scripts, contracts, lockfiles or configuration cannot redefine the required checks or approve themselves. Changes to that trusted baseline require an explicit engineering scope, independent review, and a recorded rebaseline; ordinary personalization cannot perform this promotion.

Produce validation evidence bound to the final staged source digest, lockfile, applicable contracts, relevant nonsecret build/deployment configuration, trusted validator/policy version, required suite IDs and outcomes. Recompute the digest immediately before export/deployment; missing, incomplete, stale or mismatched evidence blocks the supported operation. Any post-validation source/configuration mutation requires the affected checks and evidence to be regenerated. Validate the final export staging directory independently so file selection or transformation cannot reuse evidence from a different tree.

Use import-boundary checks, route/action contract checks, configuration schema validation, type/build checks, and targeted financial/tenant regression scenarios. Include scope crossing, broken checks, tampered validator/policy rejection (T54), and source mutation after validation (T55). Visual evidence complements functional checks and cannot replace them.

These are supported-tooling protections. Buyers own source and can edit or bypass them manually; do not advertise an unbreakable editing sandbox. There is no embedded browser visual editor in V1.

### Initial twelve shipped Skills

| Skill | Primary output | Acceptance example |
| --- | --- | --- |
| `quick-start` | Environment inspection, demo configuration, startup summary | Fresh buyer checkout runs the persistent cloud-free demo. |
| `add-provider` | Adapter, capability configuration, integration contract | New adapter preserves normalized task/credit behavior. |
| `add-generation-task` | Task type, validated inputs, UI mapping, lifecycle rules | Extension follows reservations, dispatch and asset semantics. |
| `configure-credits` | Pricing/grant configuration and policy impact summary | Pricing display agrees with runtime grants and expiry. |
| `extend-assets` | Asset metadata/view/storage extension | Workspace authorization and durable downloads remain valid. |
| `deploy-template` | Selected deployment configuration and readiness evidence | Managed or Docker application path has explicit dependencies. |
| `security-review` | Evidence-based review and remediation scope | Auth, tenant access, secrets, webhook and input boundaries inspected. |
| `upgrade-template` | Version comparison, migration/customization conflict report | Buyer changes survive a documented template upgrade. |
| `customize-brand` | Brand configuration, tokens and consistent copy/assets | Marketing and product views share the new brand. |
| `create-page` | Approved route/page composed from curated components | Navigation, accessibility and required flows remain intact. |
| `modify-page` | Bounded section/layout/interaction diff | Target changes without replacing real handlers or data. |
| `customize-site` | Coherent shell, page structure and visual system | Multiple pages stay consistent and critical flows still work. |

Shared inspect/validate/preview/report operations support all twelve Skills; they need not become four extra product features. Deliver canonical English guidance with thin, documented discovery adapters for Codex, Claude Code and OpenCode. Verify real supported invocation paths rather than promising identical tool APIs.

### Reuse candidates and licensing gates

| Candidate | Selective reuse | Gate and exclusions |
| --- | --- | --- |
| React-admin OSS | Selected operator lists/forms/navigation and data/auth adapters | Pin OSS dependencies; T59-T62 verify server authorization, migration ownership and export. |
| Payload / Refine | Rejected V1 alternatives; assessment retains rationale | Reconsider only if requirements or evidenced compatibility failures justify a new ADR. |
| Existing template-inspect/template-modify and design/responsive/QA Skills | Scope, preservation, review and rollback concepts | Remove old platform orchestration/static output assumptions; audit origin/license before customer export. |
| shadcn/ui official Skills/components/blocks | Source-based UI composition, theme conventions and curated sections | Pin selected upstream revision/license; evaluate compatibility; candidate dependency requires explicit selection. |
| shadcn registry format | Optional packaging of curated project components | No extra hosted registry service required; use only if it simplifies delivery. |
| Imported Open Design resources | Selected landing-page guidance, design references and examples | Reconcile activation/provenance metadata; preserve required notices; review assets individually. |
| Puck | Future reference only | Browser editor is outside confirmed V1; do not import its runtime to satisfy external-agent Skills. |

Maintain a third-party inventory of source URL, revision, selected files, license, modifications, asset provenance, and required notices. Review license compatibility with paid source redistribution; do not infer every asset's license from a repository's top-level license. No bulk fork of an unrelated application is needed for this plan.

## 10. Milestones, dependencies, ownership, and evidence

Milestones express acceptance gates, not fixed dates. M0 resolves feasibility before irreversible or costly choices; later work may overlap only after shared contracts are stable.

| Milestone | Depends on | Owner lanes and target files | Observable exit and evidence |
| --- | --- | --- | --- |
| M0. Inventory and decision spikes | Confirmed D01-D31 | Lead/release; inventory and ADR docs, selected upstream contracts, selected React-admin integration slice | Complete relocation/preservation map; root/export classification; provider and affiliate feasibility matrix; selected version/dependency compatibility recorded; open-source reuse decision supported by compatible versions, licensing, boundaries and net custom-work savings on a shared prototype, including the T59-T62 PoC slice. |
| M1. Archive and root scaffold | M0 | Release + foundation; root tooling, `legacy/`, `deploy/`, new guidance, documentation structure, selected admin foundation only after M0 | Preserved source/history/ignored authored docs; legacy excluded; clean root starts; PostgreSQL and local prerequisites reproducible; developer-docs information architecture and content/export boundary defined; configure React-admin's identity/data-access boundaries and the single domain-owned Drizzle migration chain; no CMS database or separate migration engine. |
| M2. Identity/workspaces and ledger | M1 | Domain; identity/workspaces/credits, schema/migrations | Personal/team permissions, invitation/removal, audited grants/reservations and expiry/compensation invariants; G05/G12/G21 evidence. |
| M3. Persistent local product flow | M2 | Domain + UI; generation/assets, local adapters, app routes | Cloud-free login-to-Mock-video flow, restart recovery, failure refund and cancellation, playable stored fixture; G18 evidence. |
| M4. Real providers and production tasks | M3 and selected models/budget/recovery limits | Integrations; Replicate/fal adapters, Trigger entry points, S3 adapter | All four real paths, finite reconciliation/late-event handling, durable ingestion, callbacks/polling and cost diagnostics; G03/G10/G13/G20 and T53 evidence. |
| M5. Stripe billing | M2/M3 and pricing policy | Billing/domain; checkout, webhook inbox, subscriptions, plans | Test-mode subscriptions/packs/renewals/refunds; idempotent grants, explicit expiry and workspace ownership; G11/G12 evidence. |
| M6. Admin and affiliates | M4/M5 plus validation of selected FirstPromoter rules/account and React-admin boundaries | Operations/integrations; admin, audit, affiliates and selected foundation integration | Real operator views/commands preserve identity, domain, transaction and audit boundaries; complete referral-to-first-payment flow, refund rules and review/payment handoff; G22-G27 plus applicable G31/T59-T61 evidence. |
| M7. Governed customization Skills | Contracts start M1; final M3-M6 interfaces | Skills/UI; twelve Skills, contracts, components, trusted validation tooling, Skill/API documentation | Four demonstrated personalizations, protected-boundary reclassification, failed/tampered-check rejection, source-bound evidence, scoped rollback and upgrade conflict evidence; complete Skill/API references aligned with released contracts; G09/G28/G29/G30 and T54/T55/T57. |
| M8. Deployment, clean delivery and release | M4-M7 | Release + reviewer; deploy, export, docs, vendor surface | Clean customer package/private-repo preparation, independent install/build, managed/Docker evidence including React-admin prerequisites and the single application database's migration/backup duties, support/license decisions, sales-site developer docs and version-aligned buyer-docs export with vendor isolation; G30/G31 and T56-T62; paid Beta then stable gates. |

M4 and M5 can run concurrently after M3 when schema and ledger contracts have one owner. Admin UI scaffolding may begin on M3 stable interfaces; M6 is complete only after real integrations. M7 design/content work can overlap M4-M6, while its release checks await stable business workflows.

Each milestone ends with a change inventory, acceptance evidence, remaining decisions, and a recoverable source checkpoint. A failed gate returns to its owning lane; it is not waived merely to hit a calendar date.

### Execution staffing: at most four concurrent agents

| Slot | Responsibility and limits |
| --- | --- |
| Lead/integrator | Own requirements, shared schemas/contracts, integration sequence, review decisions and final acceptance. |
| Lane A | Domain/auth/ledger/billing implementation within explicitly assigned file families. |
| Lane B | Provider/task/storage/release integrations; do not independently alter ledger rules. |
| Lane C | UI/Skills or independent review, depending on stage; reviewer does not approve their own changes. |

Use the four slots including the lead, not four children. Allocate only independent bounded tasks, declare ownership, and avoid concurrent edits to schemas/contracts/root manifests. Rotate implementation and review responsibility; no recursive delegation is needed. Use a persistent owner for coupled correctness work instead of forcing parallel changes.

| Responsibility | Role and effort guidance |
| --- | --- |
| Bounded implementation | Executor; higher effort for financial, security and model-state contracts, normal effort for well-scoped UI/configuration/docs. |
| Cross-module decisions | Architect; higher effort for trust boundaries, concurrency and integration tradeoffs. |
| Independent challenge/review | Critic or code-reviewer; inspect acceptance completeness and changed behavior without approving their own implementation. |
| Evidence and test design | Verifier or test-engineer; prioritize mandatory failure/isolation cases and artifact-bound evidence. |
| Focused repository facts | Explorer; narrow read-only lookup, returning paths and evidence without changing scope. |

Roles rotate through the available slots rather than adding agents above the four-total limit. Inherit the current model or select a currently supported host configuration; do not hard-code catalog model IDs. This staffing design launches no execution mode during the planning turn.

## 11. Verification design and release gates

The companion test specification expands cases and evidence; this is the execution strategy, not a claim that tests have run during planning.

| Layer | Required coverage |
| --- | --- |
| Unit/state-model | Grant order/expiry, compensation lineage, first-payment eligibility, task transitions, quote rules, event normalization, role checks. |
| Database integration | Real PostgreSQL transactions/constraints, concurrent reservations, duplicate grants, dispatch-cancel races, outbox/inbox recovery and membership revocation. |
| Service integration | Stripe test mode, provider fixture contracts and real four-mode smoke evidence, Trigger recovery, S3 ingestion, email links, selected affiliate supported test/sandbox path. |
| End-to-end | Fresh local setup; signup/team invite; success/failure/cancel; credits/billing; admin denial; tenant isolation; customization and exported product operation. |
| Adversarial/recovery | Duplicate/out-of-order callbacks, finite uncertain-submit disposition and late success (T53), worker crash, storage failure after provider success, expired refund, attempted cross-workspace access and unsafe customization. |
| Release/artifact | Export allowlist and secret scan, independent install/build, no legacy/history/vendor dependencies, trusted-validator tampering and source-evidence mismatch rejection (T54/T55), version/migration docs, deployment runbooks and provenance notices; developer documentation coverage/navigation, accurate Skill/API references, and version/export isolation (T56-T58); selected admin-foundation compatibility/licensing, identity/API boundaries, migration/transaction fault handling, idempotency and customer-local/Docker delivery (T59-T62). |

Critical ledger, authorization and task-transition branches need case-based coverage, not a single percentage claim. Record any quantitative coverage target and exclusions in the test specification. Separate Mock, contract fixtures, sandbox and live-provider evidence so none silently substitutes for another.

Observability must correlate task, workspace, attempt, provider request, billing event and ledger operation without logging secrets or unnecessary personal data. Track dispatch backlog, unknown attempts, latency, failed ingestion, refunds/compensation, webhook retries and provider cost uncertainty. Provide reconcile/replay runbooks with audit records; alerts must identify a responsible operator and safe action.

Paid Beta requires all confirmed V1 surfaces, four real generation paths, billing and tenant correctness, admin/affiliate integration with the chosen foundation's verified boundaries, governed Skills, the developer documentation center with version-matched buyer guides, clean export and two deployment paths. G31 requires the selected React-admin configuration and its authorization, transaction, licensing and delivery evidence; an evidenced incompatibility requires a recorded design amendment before substitution. Stable release additionally requires closure of Beta-critical defects, documented upgrade/rollback evidence, supported dependency versions, service/account limitations and support procedures. No fixed 90-day release promise supersedes these gates.

## 12. Customer export, commercial delivery, and support

Build a fresh staging directory from an explicit file allowlist. Include only the root template, approved Skills/contracts, migrations, selected docs/deploy files, sample configuration and license notices. Exclude `legacy/`, `vendor/`, `internal/`, `.omx/`, personal agent state, secrets, caches, generated customer data and the development `.git` directory.

D30 documentation may share canonical content between the sales website and delivered guides. Export the selected buyer-facing template, Skill and API references at the package's version, preserving their examples and local links without requiring the sales-site shell or commercial `vendor/` code. Validate the content allowlist and version mapping independently; a shared documentation source is not permission to include the entire sales site.

For the selected React-admin OSS integration, include required customer source/configuration, pinned dependencies, operator bootstrap instructions and applicable notices in the allowlist. Document the existing single PostgreSQL/Drizzle initialization, migration, backup and upgrade path; there is no separate CMS database. Exclude all vendor records, accounts, credentials and sales operations. Local, managed and Docker acceptance includes the admin without depending on a seller-hosted CMS.

Validate the staged product independently with only its declared dependencies and environment example, using the pinned trusted validator/policy baseline. Scan both contents and path inventory. Bind required passing evidence to the staged source/lockfile/contracts/configuration digest and verify it again before packaging or deployment; reject a stale report after any mutation. Produce a versioned archive with manifest/checksum and migration notes. When publication is authorized, initialize/publish a separate clean private customer repository; never push a branch of the old development history as the delivery shortcut.

Selected delivery uses Lemon Squeezy hosted source-license checkout, manual Beta provisioning and one clean private GitHub repository per customer plus checksum-versioned ZIPs. Record paid order, buyer GitHub identity, acquired release, purchase date and twelve-month update end independently of SaaS billing. Deliver later releases only while update entitlement is active; retain acquired versions after expiry. A shared repository exposing all future commits is excluded. Merchant/account qualification, license limits, prices and support commitments remain release inputs.

Acquired versions remain usable and retain no runtime dependency on a Shpitto entitlement service. Twelve-month updates/basic support are an access/support policy; renewal governs later versions. Customer customization and premium deployment services have separate scope and pricing. The vendor demo should exercise the released template, not an unrelated richer internal build.

## 13. Selected engineering baseline and remaining commercial inputs

Engineering choices below are selected design decisions, detailed in the technical supplement. Account access, actual execution evidence and explicitly marked commercial policies remain release inputs. These statuses must not be conflated.

| Decision | Selected engineering default or unresolved commercial input | Validation/release owner |
| --- | --- | --- |
| Dependency/runtime versions | Selected versions are recorded in detailed design Section 2; generate and validate the frozen lockfile. | Selected design; M0/M1 validate, relevant milestone proves runtime behavior. |
| Additional UI/validation dependencies | Selected shadcn/Tailwind product UI, React-admin OSS/MUI operations, Fumadocs/MDX documentation and Zod validation; record source provenance. | Selected design; M0/M1 validate, relevant milestone proves runtime behavior. |
| Open-source admin foundation | Selected React-admin OSS; Better Auth sessions plus separate global operator authorization; one Drizzle migration owner. | Selected design; M0/M1 validate, relevant milestone proves runtime behavior. |
| Conditional Payload identity/database controls | Rejected for V1: no Payload runtime, operator collection, CMS database or secondary migration system. | Selected design; M0/M1 validate, relevant milestone proves runtime behavior. |
| Concrete provider models | Selected four Wan 2.2 provider/mode endpoints and versioned schemas in detailed design Section 10; validate real account availability and results. | Selected design; M0/M1 validate, relevant milestone proves runtime behavior. |
| Uncertain-submission recovery limits | 60-minute deadline, at most 24 reconciliation probes, no blind paid resubmit; materialization 30 minutes/8 attempts; see detailed state machine. | Selected design; M0/M1 validate, relevant milestone proves runtime behavior. |
| Live validation accounts/spend | Use operator-owned test accounts and a defined small spend cap; no paid calls until credentials/budget are authorized. | Before M4 live evidence, owner. |
| Workspace member powers | E01 fixes immutable personal ownership and separate team invitation/transfer/final-owner rules; E02 fixes user/workspace/billing restrictions. | Selected engineering design; validate M2/M6 permission matrix. |
| Subscription intervals and proration | E04: monthly, one recurring price; no annual/multi-item billing, scheduled changes or proration. Portal plan switching disabled; cancel at period end, then repurchase only after termination and Checkout guard. | Selected engineering design; validate M5; prices remain commercial input. |
| Prices, credit quotes and pack sizes | Configurable integer units based on measured provider costs plus margin; no invented market-price promise. | Before M5/Beta, owner. |
| Paid-order refunds after spending | Confirmed full unused/unreserved refunds revoke only associated available credits. Consumed/reserved, partial-refund or dispute exposure opens a recovery case and holds new generation/Checkout while active tasks settle. No automatic negative credits or second charge. | Selected engineering design; validate M5; cash-refund eligibility/terms remain commercial input. |
| Video SaaS affiliate service | Selected FirstPromoter V2 API integration, stable workspace uid, native first-charge campaign cap, hosted operator payout workflow. | Selected design; M0/M1 validate, relevant milestone proves runtime behavior. |
| Workspace referral source | E05: last valid creator touch within 30 days, signed Secure/HttpOnly first-party token, provider/program verification, immutable creation-time binding. Later members/touches cannot replace it; transient verification failure holds only the captured candidate. | Selected engineering design; validate M0/M6 account/campaign behavior. |
| First payment without a referral | Consume the workspace's first-payment slot without commission; late attribution cannot make a renewal eligible. | Selected engineering design; validate M6 no-referral and late-referral cases. |
| Attribution window/self-referrals | Thirty-day bound; invalid/expired references discarded, verified self-identity match held for review, and missing signals remain unknown. | Selected engineering design; validate M0/M6 supported evidence and privacy configuration. |
| Multiple workspaces and abuse | Preserve legitimate per-workspace eligibility; more than three newly attributed workspaces per affiliate/24h or a repeated lawfully available verified payment fingerprint flags review. Audit legitimate release; no global user lifetime cap or raw card storage. | Selected engineering design; validate M6 hold/release and unknown-signal cases. |
| Commission amount/basis | Percentage of eligible payment after discounts, excluding tax/refunds; select rate against unit economics, not an arbitrary hard-coded value. | Before M6, owner; unconfirmed. |
| Refund/dispute eligibility | Unique incremental cash reversals reference the original sale; no reset of first-payment eligibility and no reversal from task-credit refunds. A won dispute after commission denial/reversal remains held for verified provider correction and audit. | Selected engineering design; validate M5/M6 loss deduplication and correction cases. |
| Commission hold and payout cycle | Proposed 30-day hold and monthly operator review, with provider-supported minimum/method selected after account eligibility review. | Before M6/Beta, owner; unconfirmed. |
| Storage and cost limits | Configurable per-workspace concurrency, upload size, retention and spend visibility; choose concrete limits from models/plans. | M4/M5, integrations/product. |
| Managed hosting/storage/mail path | Selected Vercel + Neon PostgreSQL 17 + private R2 + Trigger.dev Cloud + Resend; Docker web uses the same external contracts; SMTP remains supported. | Selected design; M0/M1 validate, relevant milestone proves runtime behavior. |
| Developer-docs presentation | Selected Fumadocs/MDX, public versioned /docs, template/Skills/API sections and static search; same versioned body source exported to buyers. | Selected design; M0/M1 validate, relevant milestone proves runtime behavior. |
| Source license and delivery access | Lemon Squeezy hosted checkout, per-customer clean private GitHub repository plus checksum ZIP, manual Beta access, twelve-month future-update eligibility and retained acquired versions are selected. Project/seat/redistribution limits, price and support response terms remain open. | M8 validates delivery; owner resolves commercial terms/account qualification before paid Beta. |
| Vendor source-sales affiliates | Selected separate Lemon Squeezy merchant affiliate program; vendor attribution/rate/payout economics remain to be configured independently. | Owner confirms merchant eligibility and commercial rules before vendor affiliate launch. |

## 14. D01-D31 traceability

| Requirement | Implementation locus | Milestone and acceptance |
| --- | --- | --- |
| D01 Standalone source product | Root application, own service accounts, clean delivery | M1/M8; G01. |
| D02 Frozen legacy | Inventory, archive, preserved history and state | M0/M1; G02. |
| D03 Two providers and two modes | Four real provider paths | M4; G03. |
| D04 Lightweight vendor sales | Separate vendor surface and existing channel | M8; G04. |
| D05 Personal/team workspaces | Identity, roles, shared domain resources | M2/M3; G05. |
| D06 Overseas/English | English UI/content and i18n extension boundary | M3/M7/M8; G06. |
| D07 Managed and Docker | Two reproducible application deployment guides | M8; G07. |
| D08 Public API deferred | Internal endpoints only; no placeholder API-key surface | M3/M8; G08. |
| D09 External-agent Skills | Canonical Skills with agent discovery adapters | M7; G09. |
| D10 Replicate/fal | Explicit provider adapters and model configuration | M4; G10. |
| D11 Subscriptions and packs | Billing periods/orders/webhook grants | M5; G11. |
| D12 Credit expiry/order | Grants and earliest-expiry allocation | M2/M5; G12. |
| D13 Pre-dispatch cancel | Atomic cancel/dispatch boundary | M3/M4; G13. |
| D14 Root and archive layout | Replacement root tooling and exclusions | M1/M8; G14. |
| D15 Stack | Pinned compatible baseline and ADRs | M0-M8; G15. |
| D16 Clean private delivery | Allowlisted staging, fresh customer history/packages | M8; G16. |
| D17 Twelve-month updates/support | Entitlement delivery and durable version rights | M8; G17. |
| D18 Cloud-free local demo | PostgreSQL, local driver/storage/mail, Mock fixture | M3; G18. |
| D19 Gate-driven schedule | Milestone evidence and Beta/stable gates | Every milestone; G19. |
| D20 Full failed-task credit refund | Idempotent refund and separate upstream cost | M2/M4; G20. |
| D21 One-time compensation | Grant lineage and nonrenewing seven-day expiry | M2/M3; G21. |
| D22 Management backend | Separate operator role and audited operations; generic UI/content may reuse a selected open-source foundation | M6; G22. |
| D23 Two affiliate businesses | Isolated vendor and buyer programs | M6/M8; G23. |
| D24 Third-party affiliate integration | One optional supported adapter; no own payout ledger | M6; G24. |
| D25 First-payment default | Configured eligibility/payment synchronization | M6; G25. |
| D26 Workspace eligibility | Stable workspace identity across payer/customer changes | M6; G26. |
| D27 Operator settlement | Documented review/payment initiation and status | M6; G27. |
| D28 Four personalization Skills | Brand/create/modify/site workflows | M7; G28. |
| D29 Governed customization | Contracts, actual-diff checks, regression/release gates | M7/M8; G29. |
| D30 Developer documentation center | Sales-site template/Skills/API docs, actual-interface references, versioned shared content and isolated buyer-docs export; D08 unchanged | M1/M7/M8; G30 and T56-T58. |
| D31 Open-source-first implementation | Recorded candidate comparison and net reuse benefit; validate the selected React-admin foundation at M0 without surrendering domain ownership or buyer-local delivery | M0/M1/M6/M8; G31 and T59-T62. |

## 15. Architecture decision record

**Decision:** Build a root Next.js modular monolith around workspace-owned domain services, production task/provider adapters, a persistent local demonstration driver, and contract-governed external-agent Skills. Freeze the old platform and export the new product into clean customer history.

**Drivers:** Independent deployment, correct asynchronous money/credit behavior, reproducible first use, protected customization, and maintainable paid-source distribution.

**Why chosen:** Option A satisfies the confirmed root-product and deployment scope while keeping one authoritative set of workspace, ledger and task rules. Its adapter boundaries support both the local demo and production services without importing the old platform runtime or requiring buyers to operate a new microservice estate.

**Alternatives considered:** Separate API/microservices; wholesale refactor of the old image template; preserve the current site-generation platform as a runtime. The first two retain useful extraction/reuse options but add unnecessary current scope or inherited risk. The last conflicts with the frozen-legacy direction.

**Strongest extraction counterargument and synthesis:** Option C could ship faster by retaining working auth, checkout, UI and deployment code, and a rewrite can discard behavior already learned in production. Therefore Option A does not require rewriting every module: selectively extract audited, compatible source where license, domain-contract and regression evidence establish reuse value. Retain its useful behavior and tests while replacing old platform coupling and unsupported assumptions. The tradeoff is explicit extraction review effort, accepted to avoid both wholesale inheritance and gratuitous reimplementation.

**Consequences:** One deployable application is easier for buyers, but module boundaries and transaction discipline must be enforced. The local driver adds a small development adapter whose parity is checked at domain contracts. Buyer-owned source remains editable; supported Skills and release tooling provide safeguards rather than an absolute lock.

**Follow-up records:** The detailed technical design fixes the stack, admin, Docs, deployment, provider endpoints and affiliate adapter. M0 records compatibility and account evidence against those choices. Commercial prices, license terms and paid execution budgets remain explicit release inputs. Failed validation requires a documented amendment, not silent changes to D01-D31.

## 16. Planning handoff

Architect review precedes Critic review. Review preservation completeness, domain invariants, the third-party affiliate fit, achievable customization enforcement, milestone dependencies, decision deadlines, and evidence quality against the PRD/test specification.

Current review: the D01-D31 detailed technical design passed Architect re-review and then independent Critic review on 2026-09-27. [Current review record](./shpitto-detailed-design-review.md) documents the three repaired contracts and approval scope. The older review narrative below remains historical D01-D29 evidence; no review is a runtime test result.

Review changelog: the first Architect review requested finite uncertain-submission disposition and validator trust independent of candidate edits. The revised plan adds per-model recovery deadlines, terminal delivery failure/refund with late-event quarantine, a pinned validation baseline, final-source-bound evidence and tamper/staleness rejection; companion cases T53-T55 specify the required future acceptance evidence. The ADR states why Option A was chosen and retains Option C's strongest reuse argument through selective audited extraction. Architect re-review returned APPROVE, followed sequentially by an independent Critic APPROVE with no material blockers. Pending-review metadata was then updated without changing the reviewed design.

Completion of this planning package yields a reviewable execution baseline. The next execution increment is M0, followed by the manifest-driven M1 migration. No repository move or application rebuild is included in this planning turn.

## 17. Planning verification and ownership record

- Owner layer: requirements/specification. This work defines the replacement product and its Skill/validation contracts before implementation.
- Upstream files inspected: confirmed D01-D29 and subsequent D30 developer-documentation and D31 open-source-first requests, the original attachment, root `AGENTS.md`, `docs/codex-harness-engineering.md`, `docs/website-generation-multi-skill-architecture-plan.zh-CN.md`, `docs/chat-full-lifecycle-optimization-plan.md`, current architecture notes, template-inspect/template-modify and related refinement/design contracts, root build/deploy/ignore configuration, selected provenance notices, and the official Payload documentation linked in section 8 with the companion admin-foundation assessment.
- Why not a higher layer: the user requested a restart plan and confirmed the requirements; requirement/specification is the highest owner layer for this task. No old runtime patch is needed to express the new architecture.
- Verification record: the earlier D01-D29 package received read-only repository inventory, mapping of 29 distinct requirements to 29 gates, 55 specified future scenarios, local Markdown-link and UTF-8 checks, and Architect then independent Critic document review. D30/D31 extend the intended traceability to 31 requirements/31 gates and 62 future scenarios, including T56-T62, without claiming those historical reviews cover the additions. Payload capability facts cited here come from the linked official documentation; selected-package runtime compatibility, measured reuse benefit and implementation outcomes remain unverified. No application tests, live provider calls, funds transfers, code relocation, dependency installation, or deployment were performed.
- Persistence note: current `docs/` and `.omx/` ignore rules mean this planning bundle is locally saved but not tracked. M0 explicitly preserves and intentionally tracks the approved engineering artifacts before migration. Internal planning records remain outside customer exports.
