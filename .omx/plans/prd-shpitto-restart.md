# Shpitto Restart Product Requirements

Date: 2026-09-27
Status: D01-D31 is the confirmed product baseline. The earlier D01-D29 review does not automatically cover later additions. The current engineering design selects React-admin OSS 5.15.4, Fumadocs Core/UI 16.15.14 with MDX 15.4.5, and FirstPromoter V2 while preserving D15. These choices are now explicit; installation, application implementation and runtime verification remain future work.

Technical authority: [detailed design and selected stack](../../docs/plans/2026-09-27-shpitto-detailed-technical-design.md), including Node 24, Next.js 16.3.6, React 19.3.0 and PostgreSQL 17. Engineering choices supplement user-confirmed requirements; they do not claim separate interview approval for each dependency.

## 1. Authority and companion artifacts

- The user confirmed the original D01-D29 requirements and subsequently added D30/D31. The current [D01-D31 requirements baseline](../../docs/plans/2026-09-27-shpitto-restart-requirements.md) includes the developer documentation center and the open-source-first implementation principle.
- [Restart plan](./shpitto-restart-plan.md): implementation sequence and architecture proposals.
- [Acceptance and test specification](./test-spec-shpitto-restart.md): observable evidence required for delivery.
- [Admin foundation assessment](../../docs/plans/2026-09-27-shpitto-admin-foundation-assessment.md): candidate comparison and the evidence required before adopting a foundation.
- This PRD is an execution-planning input. No application implementation, migration, live payment, or publication is claimed by its existence.

## 2. Product and customers

Shpitto sells independently deployable AI video SaaS source code to developers. A buyer operates their own branded video service using their own infrastructure, model-provider accounts, payment account, and optional affiliate account. The initial experience and documentation target English-speaking overseas buyers.

There are two separate businesses:

1. **Shpitto vendor business:** a lightweight sales site with developer documentation pages, source-license checkout/delivery through an existing channel, independent affiliates, and customer update/support access.
2. **Buyer's video SaaS:** its own marketing website, authentication, personal/team workspaces, paid subscriptions and credit packs, video generation, assets, administration, and optionally enabled affiliates.

Source-template sales orders must not be represented as video-service credit purchases. Template delivery must not contain the vendor's operations, credentials, old project history, or legacy application.

## 3. Actors and proposed permissions

These role details operationalize D05/D22; exact route permissions will be captured in a machine-readable contract before implementation.

| Actor | Supported actions | Boundary |
| --- | --- | --- |
| Visitor | View marketing/pricing and the vendor site's developer documentation, register/sign in | No private assets, billing, or balances |
| Workspace member | Create video tasks and access authorized workspace tasks/assets | No cross-workspace access or global administration |
| Workspace owner | Member capabilities plus invitations/removal, billing and workspace settings | No direct ledger edits or global administration |
| Operator administrator | Inspect support/billing/task/configuration records and perform audited supported recovery/credit adjustments | Separate explicit global role; every privileged operation authorized on the server |
| Affiliate | View their program information through the integrated third-party workflow | No access to unrelated workspace/private billing records |
| Template buyer/developer | Use version-matched documentation to configure, customize, extend, deploy, and update their source copy | Owns the code; project safeguards describe supported workflows, not an unbypassable source lock |

## 4. V1 journeys

### J1: Acquire and run the template

Receive a clean private-repository invitation or versioned release. Follow a documented Node/pnpm/Docker path to persistent local sign-in, a workspace, a Mock generation, its saved asset, and credit history without cloud credentials. Demo mode is explicit and cannot masquerade as proof of real payment or provider integration.

### J2: Personalize the buyer's AI SaaS website

Use external coding-agent Skills for brand customization, new pages, selected-page edits, or coherent site redesign. The Skill inspects the baseline, classifies the request, declares the scope, composes approved resources, checks the actual diff, and reports verification and recovery information. Customization preserves real auth/payment/generation behavior. A request affecting a protected business contract enters its dedicated engineering/extension workflow.

### J3: Generate a video

Within an authorized workspace, choose a supported provider/mode and validated model parameters, inspect the credit quote, then submit. Credits are reserved atomically. The task progresses through a durable execution lifecycle; successful output is copied to workspace-controlled storage before it becomes delivered. An authorized user can download it through scoped access. Both Replicate and fal.ai must have genuine text-to-video and image-to-video evidence.

### J4: Cancel or recover a task

A user can cancel only before provider dispatch begins. That releases the reservation. A failed task with no usable delivered video refunds generation credits in full. Uncertain submission is reconciled without blind resubmission. Provider charges are operator cost records, separate from the customer's credit outcome.

The architecture must also resolve submissions that remain untraceable. Each model has a required reconciliation deadline, retry budget, and escalation path, selected before real-provider acceptance. Exhausted recovery may produce an audited unrecoverable-delivery disposition even while the upstream outcome remains unknown. That terminal disposition restores credits once, including applicable compensation, without automatically submitting another paid attempt. Later upstream success/events/assets are quarantined for operator review and cannot re-open the task or debit credits again. Credit reservations must not depend on indefinite successful provider reconciliation.

### J5: Purchase and spend credits

Stripe subscriptions provide periodic expiring grants; one-off purchased packs do not expire. Consumption uses earliest expiry first. Billing events are authenticated, durable, replay-safe, and mapped to a workspace. Balances expose grant source and expiry. Already reserved credits are not lost merely because their grant expires during an in-flight job.

### J6: Recover credits across expiry

On failure, still-valid subscription allocations retain their original expiry and purchased allocations remain permanent. The expired subscription portion becomes a one-time seven-day compensation grant. Refunding compensation retains the original compensation expiry rather than starting another seven-day window. An already expired compensation refund does not become a new spendable extension.

### J7: Operate teams and support

Invite/remove members and manage billing at workspace scope. Operators inspect users, tasks, assets, payments, configuration health, failure/cost records, webhook outcomes, and audit history. Recovery operations invoke the same domain services as normal operations; operators cannot bypass balance/task invariants by editing table cells.

### J8: Use affiliates

Ship one complete optional third-party integration. Each buyer brings their own account. The default commissions only the workspace's first effective payment, regardless of whether it buys a subscription or a credit pack. Renewals/additional purchases do not earn another commission. Changing members, payer, or billing-customer mapping does not reset eligibility. Human review and operator-initiated payment is sufficient; automatic disbursement is optional. In-app generation-credit refunds are not cash payment refunds.

### J9: Deploy and update

Deploy the application through one documented managed path or a Docker application path with explicit external-service prerequisites. The Docker promise does not imply self-hosting Trigger.dev or every external service. Acquired versions remain usable; purchase includes twelve months of updates/basic support. Updates declare version, migration, compatibility, and customization impact.

### J10: Discover and use developer documentation

A developer visits the sales site's docs pages to understand the template and its supported capabilities, follows tutorials for the relevant released version, uses the documented Skills, and consults API/interface references while extending or integrating their source copy. Documentation covers template use, architecture, configuration, deployment and upgrades; all twelve initial Skills, including usage, parameters, inputs/outputs, protection boundaries and rollback; and actually supported APIs, internal interfaces, extension contracts and third-party integrations.

API reference content must reflect the actual released contracts, generated from or synchronized with those contracts. It must identify internal interfaces and extension points as such, rather than presenting them as a new public API product. D08 still defers the public generation API and customer API-key management; documentation must not invent endpoints, authorization schemes or capabilities.

Use public Fumadocs/MDX Docs with navigation, search, direct links, release version navigation and copyable examples. The vendor Docs shell remains outside customer exports; buyer-essential guides accompany each clean release and derive from the same versioned content source. The technical design defines routes and publishing/export contracts.

## 5. Required surfaces and boundaries

| Surface | V1 contents |
| --- | --- |
| Marketing | Home, features/use cases, pricing, conversion links, required product/legal content configured before sale |
| Account | Sign-up/sign-in, session/account handling and workspace switcher |
| Workspace | Generation form, task progress/history, asset details/downloads, members/invitations, billing and credit records |
| Operator | User/workspace status, payment references, ledger adjustments, job/asset inspection, provider configuration health, audit and webhook outcomes |
| Affiliate | Program entry/configuration, attribution integration and appropriate third-party portal/status links |
| Vendor developer documentation | Sales-site docs introducing the template, its architecture/use/configuration/deployment/upgrades, all twelve Skills and their boundaries, and actually supported API/interface/extension/integration contracts |
| Developer delivery | Setup/doctor guidance, configuration boundaries, Skills/contracts, deployment recipes, release metadata, extension and upgrade documentation; buyer-essential docs synchronized with the vendor docs from the same source and included in the clean customer repository/release package |

The public generation API, customer API keys, embedded end-user agents, general-purpose website creation, browser-based visual editing and a custom template marketplace remain outside V1. Product presentation uses selected shadcn/ui source components and Tailwind; additional Open Design files require individual provenance/license approval.

### Open-source implementation principle and selected admin boundaries

D31 establishes a preference for maintained, mature, compatible open-source components whose licenses permit the intended source delivery, reducing custom work on general-purpose capabilities. D22 requires Shpitto to deliver operator functions, not to write every admin UI or CMS component from scratch. D24's third-party commission engine remains unchanged. Reuse does not remove responsibility for verifying the template's business behavior or its integrations.

Select React-admin OSS 5.15.4 for operations, retaining Better Auth sessions plus a separate global operator role and Drizzle-owned tables/migrations. Payload and Refine are recorded alternatives, not runtime dependencies. M0 validates the selected configuration, redistribution rights, authorization and export; M1 integrates it. Actual incompatibility requires an evidence-backed design amendment rather than silently changing D15. No install or integration is claimed complete.

| Area | Proposed boundary |
| --- | --- |
| Admin UI and low-risk content | React-admin supplies the shell, forms and lists. The custom dataProvider calls internal server endpoints; protected configuration changes use domain commands. |
| Operational records and actions | Use custom views and server-side domain use cases for users, workspaces, orders, credits and tasks. Do not expose writable generic CRUD for core ledgers, task states, payment entitlements or authorization, including through automatically supplied framework endpoints. All privileged actions retain server authorization and audit records. |
| Identity | Better Auth sessions establish identity; a separate global role authorizes operations. authProvider reflects the session, while backend endpoints recheck current authority. Minimal workspace/member/invitation logic remains domain-owned; no Better Auth organization plugin is selected. |
| Persistence and migrations | Drizzle owns one reviewed migration sequence for auth and application tables. React-admin adds no competing schema/migration system or CMS database. |
| Data and customer delivery | Separate buyer SaaS data from vendor sales/operations data. The customer export contains only its required admin source, permitted dependencies/configuration and notices, with no vendor records or credentials. |
| Developer Docs | Keep D30's versioned shared-source docs and release copy. Adopting an admin foundation does not make Docs a runtime CMS or add a mandatory hosted editor. |

The linked assessment records alternatives and rationale. The detailed technical design owns the selected implementation. M0 validates it; M1 integrates the foundation; M6 implements operator workflows; M8 checks deployment and source delivery. These are future evidence gates, not another open framework comparison.

## 6. Non-negotiable product invariants

1. Every private operation is authorized against current workspace membership or an explicit operator role.
2. Task settlement and credit effects are idempotent at the domain/database boundary, independent of delivery retries.
3. Ambiguous provider submission does not prove either success or failure; reconcile before retry/refund decisions.
4. Provider success without durable accessible output is not completed delivery.
5. Credit provenance, reservations, expiry and compensation lineage remain explainable from persisted records.
6. Cancellation and dispatch compete through one atomic boundary.
7. A UI edit cannot silently disable the checks used to certify it, create an alternate payment path, or replace real behavior with a mock.
8. Customer source export uses an explicit allowlist and clean Git history; ignore rules alone are insufficient.
9. Failed required checks block the supplied controlled release workflow. Validation policy/tooling comes from a pinned trusted baseline outside the candidate diff; passing evidence binds the validator version and required checks to a digest of the staged source, lockfile, contracts and relevant configuration. Export/deploy rejects missing, stale or mismatched evidence. Buyers can still alter their own source/environment; no absolute tamper-prevention claim is made.
10. No cloud credentials are required for the initial persistent core demo, and production cannot accidentally use demo billing/task drivers.
11. Published developer documentation and the buyer-essential release copy describe the same versioned, actually supported contracts. The vendor site's shell remains outside the customer release, and API documentation cannot silently expand D08's product boundary.
12. An adopted open-source admin foundation cannot bypass domain authorization, task/credit rules or auditing through generic data operations. Identity integration, migration ownership and clean-export obligations must be explicit; framework maturity alone is not evidence that Shpitto's integration is correct.

## 7. Phase ownership and priorities

All confirmed features belong to commercial V1. The ordering below reduces integration risk; it is not a de-scoping of later stages.

| Stage | Product outcome | Dependency |
| --- | --- | --- |
| M0 | Inventory, contracts and validation of selected dependencies/providers/admin configuration; license, identity, migration and export feasibility evidence | Confirmed D01-D31 and detailed technical design |
| M1 | Safe legacy archive and clean root scaffold/local prerequisites; integrate selected React-admin boundaries and Fumadocs content source | M0 preservation map and selected-configuration evidence |
| M2 | Persistent identity, workspaces, roles and credit ledger | M1 |
| M3 | Complete local Mock generation/cancel/failure/assets journey | M2 |
| M4 | Trigger.dev production execution and both providers in both modes | M3, real-model/account gates |
| M5 | Stripe subscriptions/packs and replay-safe workspace entitlements | M2 ledger; integrate M3/M4 |
| M6 | Domain-backed operator workflow on the selected foundation and optional affiliate integration | M3-M5 contracts/integrations and M1 admin boundaries |
| M7 | All twelve initial Skills and governed website personalization; Skills usage and actual API/interface/extension/integration documentation | Contracts begin after M1; final evidence requires M3-M6 |
| M8 | Reproducible deployments, clean customer delivery including admin dependency/license/export evidence, vendor sales-site docs and synchronized documentation export acceptance, vendor sales readiness, paid Beta then stable | All applicable acceptance gates |

M4 and M5 can proceed independently once M3/domain contracts are stable. M7 contract/component work can overlap with later integrations, but completion depends on preserving the integrated business workflows. Root schema, manifest and shared configuration edits need a single integration owner.

## 8. Requirement-to-acceptance traceability

The companion test specification defines G01-G31 and 62 scenarios, including T56-T58 for D30 and T59-T62 for D31. Each D requirement has a matching gate; evidence must be labeled local, simulated external, provider-backed, payment test-mode, or live as applicable.

| Requirement | Gate | Primary stage |
| --- | --- | --- |
| D01 Source-template business | G01 | M8 |
| D02 Frozen legacy preservation | G02 | M0-M1 |
| D03 Two providers/two modes | G03 | M4 |
| D04 Separate lightweight vendor sales | G04 | M8 |
| D05 Personal/team workspaces | G05 | M2-M3 |
| D06 English/overseas/i18n boundary | G06 | M1, M7 |
| D07 Managed/Docker application deployment | G07 | M8 |
| D08 Public API deferred | G08 | M1-M8 |
| D09 External coding-agent Skills | G09 | M7 |
| D10 Replicate/fal.ai | G10 | M4 |
| D11 Subscriptions/credit packs | G11 | M5 |
| D12 Grant expiry/consumption | G12 | M2, M5 |
| D13 Pre-dispatch cancellation | G13 | M3-M4 |
| D14 Root app/archive layout | G14 | M1, M8 |
| D15 Technical baseline | G15 | M0-M8 |
| D16 Clean private delivery/releases | G16 | M8 |
| D17 Version use/update/support policy | G17 | M8 |
| D18 Credential-free local demo | G18 | M1-M3, M8 |
| D19 Acceptance-led schedule | G19 | Every stage |
| D20 Failed-task full credit refund | G20 | M3-M4 |
| D21 One-time compensation | G21 | M2-M5 |
| D22 Management backend | G22 | M6 |
| D23 Two independent affiliate businesses | G23 | M6, M8 |
| D24 Optional third-party affiliate integration | G24 | M6 |
| D25 First-effective-payment default | G25 | M6 |
| D26 Workspace eligibility identity | G26 | M6 |
| D27 Reviewed settlement | G27 | M6 |
| D28 Four personalization Skills | G28 | M7 |
| D29 Governed customization | G29 | M7-M8 |
| D30 Developer documentation center | G30 | M1, M7-M8 |
| D31 Open-source-first implementation | G31 | M0-M1, M6, M8 |

## 9. Validation evidence and commercial release parameters

The detailed technical design fixes the stack, service reference topology, admin identity/persistence ownership and Docs source/version scheme. Remaining work validates those choices and settles commercial/account-specific parameters; no new interview is needed to restate D01-D31.

| Topic | Latest required resolution |
| --- | --- |
| Selected dependency/runtime compatibility | Resolve the pinned baseline into a lockfile and verify supported paths at M0/M1; engineering selection is complete |
| React-admin OSS authorization, licensing, transaction and export evidence | Validate selected configuration at M0; integrate at M1; verify operator commands at M6 and customer delivery at M8 |
| Selected model endpoint availability, limits, permitted use, prices and funded validation budget | Before live M4 calls; missing runtime/account proof blocks the real-provider gate |
| Subscription periods/grants, plan prices, cash-refund handling and retention limits | Before M5 production configuration and customer promises |
| FirstPromoter V2 account entitlement, workspace UID/native one-payment cap and commercial program parameters | Before M6 acceptance; preserve D25/D26, verify reversal/retry behavior and supported payout workflow |
| Vercel + Neon PostgreSQL 17 + R2 + Trigger.dev Cloud + Resend reference deployment, and Docker alternative | Provision buyer-owned accounts/configuration and obtain M8 deployment evidence |
| Source-license project/seat/redistribution terms, sales/delivery channel and renewal process | Before paid Beta source distribution |
| Open-source file provenance/version/license and notices | Before selected files enter the customer release |
| Fumadocs/MDX route/version/search/source synchronization evidence | Integrate selected source and route design at M1; complete actual API/Skill content at M7; verify vendor Docs and customer guide export at M8 |

## 10. Completion definition

The planning task completes when the confirmed baseline, a reviewed master plan, and this PRD/test specification are available with outstanding commercial gates labeled. Historical review of the D01-D29 version must not be presented as review approval for the D30/D31 additions. The future product completes V1 only when G01-G31 have appropriate evidence and the release gate passes. Planning review is not proof that the application has been built or tested.
