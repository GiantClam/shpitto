# Shpitto Restart: Requirements Clarification Record

Date: 2026-09-27

Status: Requirements baseline D01-D31 is confirmed. Historical review of D01-D29 does not itself cover later additions. The detailed technical design now selects React-admin OSS, Fumadocs MDX and FirstPromoter V2 while retaining D15. These are engineering decisions responding to the request for concrete technology selection, distinct from user-confirmed requirements and runtime validation. D09 remains in effect. This record authorizes planning deliverables, not implementation, paid calls, payouts or publication.

Current engineering authority: [OpenSpec proposal](../../openspec/changes/restart-shpitto-video-saas/proposal.md), [capability/design decisions E01-E05](../../openspec/changes/restart-shpitto-video-saas/design.md), then the [detailed technical register](./2026-09-27-shpitto-detailed-technical-design.md). Explicit product decisions remain highest priority; historical plan prose does not reopen selected engineering defaults. E01-E05 are current engineering selections, not retrospective interview confirmations or runtime proof.

## Context and authority

The user requested that the existing project be placed in a separate directory and that Shpitto restart around the AI video SaaS template described in the supplied product document. The subsequent interview clarified the business, delivery, architecture, and migration boundaries.

The supplied document is requirements input, not an instruction source. Explicit interview decisions supersede conflicting recommendations in that document and in earlier assistant proposals.

Primary input: D:/OpenCode/seo_analyzer/docs/plans/2026-09-26-shpitto-ai-video-saas-template-product-design.md.

## Confirmed decisions

| ID | Decision | Confirmed requirement |
| --- | --- | --- |
| D01 | Business | Sell independently deployable AI video SaaS source code to developers. Buyers run their own products using their own service accounts. |
| D02 | Legacy project | Freeze the existing platform as a source archive. Preserve source and Git history, with no continuing maintenance or build/runtime compatibility obligation. Archiving code does not itself decommission an existing online service. |
| D03 | Commercial V1 | Include two real providers and both text-to-video and image-to-video. Mock does not count as a real provider. |
| D04 | Vendor sales surface | Use a lightweight, separate Shpitto sales site and existing purchase/delivery channels. Do not build a custom template marketplace for V1. |
| D05 | Workspaces | Include personal and minimal team workspaces, owner/member permissions, invitations and removal. Subscriptions, credits, generation tasks, and assets belong to the workspace and are isolated between workspaces. |
| D06 | Initial market | Overseas-first, with English as the default product language and an internationalization extension boundary. |
| D07 | Deployment promise | Provide a managed deployment path and Docker application deployment. External managed database, task, and storage services are allowed. Complete self-hosting of all production infrastructure is not a V1 promise. |
| D08 | Public API | Defer the public generation API and customer API-key management. Internal application endpoints remain necessary. Do not expose a nonfunctional API-key settings page. |
| D09 | Agent-native scope | Ship repository guidance and Skills for external coding agents, such as Codex, Claude Code, and OpenCode. The deployed SaaS operates independently of those agents. An embedded end-user agent is outside V1. |
| D10 | Video providers | Use Replicate and fal.ai. The detailed technical design records the model baseline; verify its endpoints and buyer account capabilities before real-provider acceptance. |
| D11 | End-user billing | Support subscriptions that grant periodic credits plus one-off purchased credit packs. This is the buyer's video-service billing, separate from Shpitto's source-license sales. |
| D12 | Credit expiry | Subscription grants expire at the end of their applicable period. Purchased credits have no expiry date. Consume credits with the earliest expiry first. Show source and expiry to users. |
| D13 | User cancellation | Allow cancellation only before submission to the provider, releasing reserved credits. Once submission begins, await the task outcome. |
| D14 | Repository layout | The new template becomes the repository-root application. Archive the existing project under legacy/shpitto-platform/. Exclude that archive from active builds, checks, and release artifacts. |
| D15 | Technical baseline | Use Next.js App Router, React, TypeScript, PostgreSQL, Drizzle, Better Auth, Stripe, Trigger.dev, S3-compatible storage, and Resend with SMTP configuration support. Validate and pin compatible versions; discuss substantive substitutions when a real obstacle arises. |
| D16 | Customer delivery | Publish the new template to a separate, clean private customer repository and provide versioned release packages. Exclude legacy code, internal records, and development-repository history. Manual access provisioning is acceptable for the initial Beta. |
| D17 | Updates and support | Acquired versions remain usable. A purchase includes 12 months of updates and basic technical support; renewal enables subsequent updates. Custom development and deployment assistance are separately charged services. |
| D18 | First local experience | With Node, pnpm, and Docker, buyers can run a complete local demo without cloud-service accounts or keys. It includes authentication, workspaces, Mock video tasks, credit debit/refund behavior, and asset history. Real generation, payments, and production deployment require their respective external configuration. |
| D19 | Schedule | Prioritize the confirmed scope and acceptance criteria over a fixed release date. Deliver working increments, then paid Beta and stable release when gates pass. The attachment's 90-day plan is a planning reference, not a hard deadline. |
| D20 | Failed-task refunds | When the system determines a task failed without a usable delivered video, refund the end user's generation credits in full, even if the provider charged the operator. Record failures and their cost information. Dissatisfaction with an otherwise successful result is a separate support-policy matter. |
| D21 | Refunds after subscription-credit expiry | When subscription credits expire during task execution and that task fails, restore the expired refund portion as a one-time compensation grant valid for seven days. Subsequent refunds of that compensation retain its original compensation expiry and cannot renew the seven-day period. Ordinary subscription expiry remains unchanged. |
| D22 | Management backend | Explicitly include an operator management backend in commercial V1. It was present in the original product surfaces but omitted from the previous concise interview summary. Delivering this capability does not require writing its UI or CMS foundation from scratch; it may use a suitable open-source foundation under D31. The proposed operational scope is detailed below. |
| D23 | Affiliate/referral capability | Support both Shpitto source-template sales and the buyer-operated video SaaS. Vendor sales use existing channels, while the delivered template provides affiliate capability for its buyer's business. Their programs and settlements remain independent. D25 defines the video SaaS commission-frequency default and D27 defines its settlement scope; vendor-sales commission rules and service-specific payout details remain undecided. |
| D24 | Affiliate implementation | V1 provides one fully supported optional third-party affiliate integration. Deliver the operator backend using an open-source foundation without building an independent commission-accounting, settlement or disbursement system. Buyers configure and pay for their own accounts; core operation does not require affiliate configuration. The engineering design selects FirstPromoter V2; account entitlement and actual behavior remain validation gates. |
| D25 | Video SaaS commission frequency | Default to commission on only the first effective payment, whether an initial subscription purchase or a credit-pack purchase. Subsequent renewals and additional purchases do not earn further commission under this default. Template buyers may adjust their program through the selected third-party service. D26 defines the identity used to determine the first payment. This decision does not set Shpitto's source-license affiliate policy. |
| D26 | Affiliate eligibility identity | Determine first-effective-payment eligibility independently for each workspace, consistent with workspace-owned billing and credits. Changing workspace members or the payer does not reset that workspace's eligibility. A user-level lifetime cap across workspaces is not the selected default. Referral attribution and invalid-transaction handling remain separate decisions. |
| D27 | Video SaaS commission settlement | V1 supports operator review of commissions followed by operator-initiated payment through the selected third-party service's supported process. The template provides entry points and necessary status visibility. Automatic payouts are optional when supported by the service and enabled for an eligible buyer account; unattended automatic disbursement is not a V1 acceptance requirement. This defines product scope and does not authorize any actual transfer of funds. |
| D28 | Website-personalization scope | V1 includes external coding-agent Skills for brand customization, page creation, page modification, and coherent site customization of the buyer's own AI SaaS website, including marketing and product interfaces. Independent general-purpose website creation is outside this V1 scope. Evaluate selective reuse of existing project Skills and open-source resources; exact upstream selections remain implementation candidates. |
| D29 | Governed customization | Project-provided Skills must define and enforce their supported modification workflow and boundaries when composing reused open-source Skills. They must preserve template business contracts and provide controlled customization rather than unrestricted edits that can damage the template. The concrete protection and validation design is proposed below for detailed planning. |
| D30 | Developer documentation center | The developer-facing template sales website must include a Docs section explaining the template, Skill usage, and APIs. It supports developers evaluating and using the source product. API documentation describes the interfaces and integration contracts actually supported by the released template; this addition does not change D08's deferral of a public generation API and customer API-key management. |
| D31 | Open-source-first implementation | Prefer maintained, mature open-source components whose licenses permit intended source delivery and whose interfaces fit the architecture. Shpitto remains responsible for its business rules and integrations. The engineering design selects React-admin OSS 5.15.4 and records Payload/Refine as considered alternatives. M0 validates pinned configuration, licenses, identity, migration ownership and export; M1 integrates it. This choice preserves D15 and is distinct from user confirmation of the reuse principle. |

## Product surfaces

The template includes its own video-service marketing pages, pricing, authentication, dashboard, generation UI, history, asset details, workspace settings, subscription and credit management, and a basic operator administration surface.

Shpitto's vendor sales site describes source-code licenses, updates, support, and demonstrations, and includes developer documentation under D30. Its customers are template buyers. Its prices, accounts, and orders must not be confused with the subscription and credit system shipped inside the video application.

A demonstration of the video application should exercise the template that is actually released. Source-license sales tooling and internal development records are not part of the customer template delivery.

### Developer Docs: confirmed scope and proposed organization

D30 adds developer documentation to the sales website as a V1 surface. Its primary audience is developers evaluating the template and buyers working with their source copy. Product-user help inside the buyer's video application serves a different audience and does not substitute for this documentation center.

The three confirmed content areas are the template, Skill usage, and APIs. The following organization and implementation details are proposed to make that scope useful:

| Area | Proposed documentation coverage |
| --- | --- |
| Template | Product capabilities and V1 limits; architecture and directory map; prerequisites and first local Mock run; configuration and service setup; workspaces, credits and task lifecycle; deployment, upgrades, migration and troubleshooting. |
| Skills | Discovery/setup in supported external coding agents; all twelve shipped Skills; invocation examples, prerequisites, inputs/outputs and expected changes; brand/page/site workflows; protected business contracts, validation evidence, recovery and extension boundaries. |
| APIs and integrations | Implemented application interfaces and extension contracts, with intended caller, session/service authentication and workspace authorization; applicable parameters, request/response examples and errors; asynchronous task behavior and supported webhook verification/retry/idempotency rules; provider integration guidance and links to official upstream references. |

Selected information architecture: public `/docs`, with template/getting-started, Skills and API sections, version navigation, search, deep links and readable examples. Use Fumadocs Core/UI 16.15.14 with MDX 15.4.5 and the shared versioned source defined in the detailed technical design. These are engineering defaults; no dependency has been installed or runtime behavior verified by this document.

API pages must describe the supported released contracts, not invent endpoints, API-key flows or availability. Clearly label internal application interfaces and third-party service contracts, distinguish local Mock examples from real-service configuration, and use placeholder credentials rather than secrets. A future public generation API may be identified as deferred, without presenting it as available in V1.

Use a proposed single source of approved buyer-facing documentation for the sales-site pages and the versioned guides shipped in the clean customer repository/package. The developer must be able to follow the core setup and usage instructions from the delivered source; the sales website must not be the only place those instructions exist. Shared documentation content may be exported, while the vendor sales-site shell, commercial operations and internal planning records remain excluded under D16. Documentation examples, links and compatibility notes must track their stated release.

Integrate the selected documentation architecture at M1, complete Skill/API content against real interfaces at M7, and verify sales-site Docs and versioned customer export at M8. G30 and T56-T58 define observable future acceptance.

## Management backend and affiliate additions

### Operator management backend

The proposed V1 operational baseline includes:

- User and workspace administration, including member and account status.
- Subscription, payment/order, and credit-grant visibility, with references to the relevant payment-provider records.
- Auditable credit adjustments and the ledger entries associated with reservations, settlements, refunds, expiry, and compensation.
- Generation-task and asset inspection, with failure details and controlled operational recovery actions.
- Provider/model availability, configuration health, and usage/cost visibility where upstream data is available.
- Webhook processing history and administrative action logs.

Operator administrators are distinct from workspace owners and members. Granting ownership of a customer's workspace must not grant global management access. Financial and operational adjustments must retain an audit trail; administrative UI actions must preserve the task and ledger invariants.

### Open-source-first delivery and selected admin foundation

D31 confirms the preference to build on suitable mature open-source projects and reduce unnecessary custom work on generic capabilities. D22's management-backend requirement means delivering the operator capability, not implementing an entire admin UI or CMS from scratch. D24 still delegates commission accounting and disbursement to the selected third-party affiliate service. Open-source reuse does not replace verification of Shpitto-specific authorization, task, credit, billing or integration behavior.

Select React-admin OSS 5.15.4 for operations, with Better Auth sessions, a separate global operator role and domain-owned Drizzle persistence. Payload and Refine are historical alternatives in the [assessment](./2026-09-27-shpitto-admin-foundation-assessment.md); neither enters the runtime. M0 validates this configuration, redistribution rights, integration cost, authorization, migration ownership and export. A demonstrated obstacle triggers a recorded design revision; M0 is not another open three-way selection exercise. The [technical design](./2026-09-27-shpitto-detailed-technical-design.md) owns implementation details.

Proposed implementation boundaries:

| Area | Proposed responsibility and protection |
| --- | --- |
| Admin presentation and low-risk content | React-admin OSS supplies the shell, forms, lists and permitted low-risk configuration operations. Its custom dataProvider calls internal server endpoints; protected behavior changes use domain commands. |
| Core operational data | Expose users, workspaces, orders, credits and generation tasks through custom views and server-side domain use cases. Do not expose writable generic CRUD for the core credit ledger, task states, payment entitlements or workspace authorization, and do not let a framework endpoint bypass the same server-side authorization and audit requirements. |
| Identity | Better Auth sessions identify users; a separately assigned global role authorizes operators. React-admin authProvider reflects the session; every backend command rechecks current authority. Workspace ownership grants no global role. Minimal workspace/member/invitation rules remain domain-owned; the Better Auth organization plugin is not selected. |
| Database and migrations | Drizzle owns one reviewed migration sequence for auth and application tables. React-admin owns no schema or migration; no Payload database or competing schema-push process is introduced. |
| Business and delivery isolation | Keep buyer SaaS data separate from the vendor's sales and operational data. Export only the buyer's admin capabilities, required configuration and permitted dependencies, with applicable notices; exclude vendor data and credentials. |
| Developer documentation | Preserve D30's versioned, shared-source documentation and customer export. Selecting an admin framework does not automatically convert Docs into a runtime CMS or add a mandatory hosted editing service. |

M0 validates the selected foundation; M1 integrates it and its boundaries; M6 delivers operator features; M8 verifies licenses, deployment and customer export. G31 and T59-T62 retain the future evidence requirements. No prototype, installation or integration is claimed complete.

### Confirmed affiliate scope and implementation boundary

The user confirmed affiliate support for these two separate businesses:

1. Shpitto recruits affiliates to sell source-template licenses and pays commission on those sales.
2. A template buyer uses the shipped affiliate functionality to recruit promoters for their own video SaaS and pays commission on their service's eligible transactions.

Their accounts, attribution, commission records, and payouts remain independent. The existing lightweight vendor-sales decision D04 still applies: supporting vendor affiliates does not itself require building a custom marketplace. Vendor-specific sales implementation stays outside the customer source release; the reusable video-service affiliate capability belongs inside the delivered template.

D24 selects third-party integration for V1. The template must include the integration code, configuration guidance, and enable/disable behavior for one initially supported service. Application responsibilities include preserving referral attribution through registration and checkout, associating the referred payer with workspace billing, handling applicable order/refund events according to the chosen service contract, and providing operator configuration and affiliate entry points. The application owns the sealed workspace attribution and first-payment evidence; FirstPromoter records that attribution and owns commission amounts, balances and settlement under the configured program. The template must not create a competing commission-money ledger. A basic operator management backend is still part of the application.

D25 confirms the video SaaS default: only the first effective payment earns commission, whether it buys a subscription or a credit pack. Renewals and later purchases do not earn commission under this default. This is a configurable program default for template buyers, not a hard-coded restriction on every buyer's business, and it does not determine the separate source-license sales program.

D26 makes the workspace the stable identity for first-effective-payment eligibility. Members, payer or payment-provider customer changes must not reset it. D26 itself did not choose attribution or invalid-transaction handling; the current E05 engineering default now does: seal the creator's last valid verified touch within 30 days at workspace creation, retain pending verification only for that captured reference, and reject replacement by later members/touches. Cash reversals preserve consumed eligibility; won disputes after denial/reversal require provider-verified manual correction and audit.

D27 sets the settlement baseline: an operator reviews commissions and initiates payment using the selected third-party service's supported workflow. The template exposes the necessary entry points and status information. Optional automatic payment depends on the service capability, buyer eligibility, and configuration; it is not required for every buyer or for V1 acceptance.

FirstPromoter V2 and E05 attribution/reversal controls are selected engineering choices. Reviews persist across sessions, sync every five minutes and refresh within 60 seconds before approval/hosted handoff; unresolved holds, incomplete denials or stale account checkpoints block handoff. Commission rate, calculation basis, account-specific payout methods/minima and economic settlement schedules remain commercial release parameters. Cash commission is distinct from an in-app referral-credit reward; no rate or multi-level hierarchy is user-confirmed.

The buyer SaaS engineering baseline selects FirstPromoter V2 API, a stable workspace UID and the service's native one-payment commission cap. The detailed design owns attribution, conversion, deduplication and reversal contracts. Rewardful and Lemon Squeezy references preserve earlier research, not current buyer-SaaS candidates. Vendor source-license sales remain separate. Account entitlement, payout onboarding, funding and fees require release evidence.

Template buyers use their own program/accounts and bear the corresponding service and payout fees. Affiliate configuration is optional for operating their application; shipping a complete supported integration remains a V1 delivery requirement. The integration must preserve the no-cloud local core-demo experience. A video-generation failure that restores in-app credits is not automatically a refund of the original paid order and must not be mistaken for a commission-reversal event.

## Confirmed website-personalization capability

The user identified a missing product capability: help template buyers quickly create personalized websites and modify existing pages/sites using Skills. The user also asked whether existing open-source projects should be integrated. This request extends the earlier developer-workflow list, which concentrated on setup, providers, generation tasks, billing, deployment, and upgrades.

The following workflows are included under D28. Final Skill names and file layout will be defined in the implementation plan:

| Workflow | Intended buyer outcome |
| --- | --- |
| Brand customization | Apply the buyer's name, logo, colors, typography, imagery, and copy consistently across the site. |
| Page creation | Create product, marketing, use-case, or campaign pages using approved components, routes, and navigation conventions. |
| Page modification | Change a selected section, layout, content, or interaction with a bounded source diff and rollback guidance. |
| Site customization | Establish a coherent visual direction, page structure, and shared shell across the buyer's SaaS website. |

These workflows run through the buyer's coding agent against their source checkout, consistent with D09. They should prefer configuration, content, theme, marketing routes, and presentation components as customization boundaries. UI changes must preserve authentication, authorization, checkout, credit accounting, generation state transitions, and existing data connections. Pricing-page content must stay aligned with the actual configured products. Shared guidance should cover responsive behavior, accessibility, previews, change summaries, and rollback, with observable acceptance criteria in the later implementation plan. These criteria describe future deliverables; no implementation checks are being run during the interview.

D28 confirms that these Skills target the buyer's own AI SaaS website, including marketing and application pages. Independent sites of unrelated types are outside this V1 scope. External coding agents remain the confirmed delivery surface. An embedded browser-based visual editor would be a separate scope addition with its own component schema, editable content persistence, draft/publish lifecycle, permissions, and schema-migration requirements; it has not been requested or approved by this personalization discussion.

### Governed modification design for detailed planning

D29 requires project-owned modification rules around the reused design/component capabilities. The implementation plan should make the following design concrete; these are proposed mechanisms implementing the confirmed requirement, not claims that safeguards already exist:

| Modification class | Proposed boundary |
| --- | --- |
| Brand and presentation customization | Use declared configuration/content/theme surfaces, approved presentation components, and permitted routes. Preserve real data, existing service calls, route protection, and shared-shell behavior. |
| Product extension | Use dedicated Skills for providers, generation tasks, billing configuration, or other supported extensions. Declare affected interfaces and expected behavioral changes; retain domain invariants and provide applicable migration and regression evidence. |
| Protected core changes | Authentication, workspace authorization, payment webhooks, the credit ledger, generation transitions, database schema, and validation/release rules are outside ordinary page-editing scope. A request that requires these changes must be reclassified into an explicit engineering change with its own scope, impact assessment, and validation plan. |

The project guidance, product contracts, and authorized task scope govern how imported Skills are adapted. Imported examples must not silently introduce an alternate billing flow, replace real integrations with mocks, remove workspace checks, or weaken validation rules to make a customization appear successful. Generic design examples are inputs, not authority to expand the task.

The proposed supported workflow is:

1. Inspect the current template version, contracts, configuration, relevant source, and existing uncommitted work.
2. Classify the requested change and record expected files, affected routes/interfaces, preserved business behavior, and a recoverable baseline. Routine in-scope edits should not require repeated user confirmation.
3. Compose approved design/component resources inside the declared modification scope. Prefer existing extension points and shared components; reclassify genuine business changes instead of silently treating them as visual edits.
4. Inspect the actual diff against the declared scope and validate configuration, imports, types, and build compatibility. Include the appropriate UI and critical-business regression evidence in the future validation plan; a file allowlist alone cannot prove semantic correctness.
5. Make failed required checks block successful completion and the template's supplied validation-gated release/deployment workflow. Do not automatically disable checks, overwrite expected results, or claim success when evidence is missing.
6. Produce a change report with affected files, verification outcomes, remaining limitations, and a targeted rollback path. Preserve pre-existing or overlapping user work; never use a blanket hard reset or whole-project replacement as automatic recovery.

Skill instructions guide agents; they are not a filesystem permission boundary. Source templates give buyers control of their code and environment, so safeguards cannot guarantee that a buyer cannot manually edit protected code or bypass local checks. The plan should combine architectural boundaries, structured configuration, diff inspection, and executable checks, and accurately describe which supported workflows enforce those checks. No license server or mandatory vendor-hosted editor is implied.

### Proposed reuse approach

1. Extract applicable contracts and patterns from the legacy project's template inspection/modification, website refinement, design-system, responsive-layout, and visual-quality Skills. Adapt them to the new standalone Next.js source template before shipping. The old platform's chat orchestration, task runtime, or artifact storage must not become an implicit dependency of the new customization Skills.
2. The interview proposed evaluating shadcn/ui's official Skill, components, blocks and registry format. The later engineering design selects shadcn/Tailwind for product UI and pinned reusable source with provenance review. A registry remains optional packaging, with no mandatory extra hosted service. Selection is distinct from installation, and copied asset/license evidence is still required.
3. Review the already imported Open Design landing-page guidance and examples as reusable design resources. Adapt static HTML and platform-specific output assumptions to the new React/Next.js source contracts. Reconcile local activation/provenance metadata and retain the applicable upstream notices before export; the existing import does not justify copying the full upstream application.
4. Evaluate Puck's open-source React visual editor only if browser-based editing becomes part of the confirmed scope. Its existence does not make content persistence, publication, or permission integration automatic.
5. Before redistributing any reused source, Skill, block, or design asset, record its source, version, applicable license, and required notices. Review each selected asset and dependency; a project's top-level license must not be assumed to cover unrelated third-party assets or separately licensed services.

Local evidence: `apps/web/skills/template-operations/template-inspect/SKILL.md` and `template-modify/SKILL.md` already define inspection and protected template-operation boundaries. `apps/web/skills/website-refinement-workflow/SKILL.md` defines scoped changes but carries old JSON/static-HTML output conventions. The design-system, responsive, and visual-QA Skills provide reusable rules with similar adaptation needs. `apps/web/skills/open-design-saas-landing/NOTICE.open-design.md` identifies the imported Open Design source and license; imported HTML Anything material needs its own provenance review.

Open-source capabilities are implementation candidates. Shpitto still owns the product-specific workflow contracts, safe modification boundaries, and examples that connect website personalization to the delivered video SaaS.

## Decisions that supersede earlier proposals

| Earlier proposal or ambiguous input | Resolution |
| --- | --- |
| Put the new app under products/ai-video-saas-template/ | D14 places the single new product at the repository root. |
| Preserve a runnable, maintained legacy internal factory | D02 requires a frozen source archive without an ongoing runtime/build maintenance obligation. |
| Require the old project to build after the directory move | That is not a migration acceptance gate under D02. Source preservation and isolation are the gates. |
| Ship up to two providers | D03 requires two real providers; D10 selects Replicate and fal.ai. |
| Defer team workspaces | D05 includes minimal teams in V1. |
| Include API-key management in the initial settings routes | D08 explicitly defers it together with the public generation API. |
| Treat image-to-video as a later premium add-on | D03 includes image-to-video in the commercial V1. |
| Treat OpenCode CLI as a deployed application dependency | D09 places coding agents outside the SaaS runtime. |
| Assume Docker means fully self-hosted production infrastructure | D07 permits managed dependencies. |
| Treat the 90-day commercial plan as a guaranteed release date | D19 makes scope and acceptance gates authoritative. |
| Interpret building the management backend as writing all admin UI/CMS infrastructure from scratch | D22/D31 support reuse; the engineering design selects React-admin OSS while protected business operations remain domain-owned. |

## Engineering implications to carry into the implementation plan

These are derived correctness requirements, not extra product features.

1. Production uses Trigger.dev as the default task runtime. The no-cloud local demo needs a development-only task driver and Mock Provider that reuse the business services, state transitions, and credit rules. It must not silently become a second production task system.
2. Local demo authentication, workspaces, tasks, credits, and assets need real local persistence. A local demo passing does not establish that real Stripe, Trigger.dev, or provider integrations pass.
3. Submission needs an atomic dispatch boundary. An uncertain network response after submission starts cannot be treated as proof that the provider never received the task. Reconcile an existing attempt before resubmitting or refunding it.
4. Duplicate submit requests, callback retries, polling results, worker restarts, and repeated settlement/refund attempts must not create duplicate generation charges or grants. Upstream spend and end-user credits are distinct records.
5. A usable delivered result needs durable asset storage and workspace-authorized access. Provider completion and a temporary provider URL alone do not prove durable delivery.
6. Workspace checks apply to task creation, history, assets, downloads, credit operations, and billing actions. Changing or removing membership must also change access to that workspace.
7. The development repository can preserve old history, but the customer repository must start from a clean export with an explicit delivery file allowlist. Moving directories or adding ignore rules alone does not remove old history from a Git clone.
8. The migration plan must inventory tracked source, local state, environment files, deployment bindings, and generated artifacts before moving anything. Preserve secrets securely without placing them in tracked archives or customer releases. Dependencies and build caches are not archival source requirements.
9. The new root guidance and active tooling must describe the new product. Historical website-generation guidance belongs with the legacy context and must not impose website-generation runtime rules on the new video application.
10. Runtime access must not depend on a Shpitto license-server check that disables an acquired version when update eligibility expires.

## Confirmed refund behavior across an expiry boundary

D21 resolves the interaction between D12 and D20 in this case:

- A task reserves 100 valid subscription credits just before their expiry.
- The subscription credit period ends while the task is running.
- The task then fails without delivering a usable video.

The user receives 100 compensation credits valid for seven days from the refund. These are recorded separately from permanently valid purchased credits, with their origin and expiry visible. If those compensation credits are reserved for another task that also fails, the refund preserves the existing compensation expiry instead of starting another seven-day period.

Only the subscription-credit portion that expired during the failed task qualifies for this exception. A refund to an unexpired subscription grant retains its original validity; purchased credits retain their no-expiry policy. The implementation plan must preserve this grant lineage so that retries cannot produce rolling extensions.

## Proposed acceptance gates for the implementation plan

| Gate | Observable outcome |
| --- | --- |
| Legacy isolation | An inventory accounts for preserved source and history. Active installation, build, checks, and export do not include legacy/. Existing online services are not implicitly decommissioned. |
| Clean startup | A clean checkout with the documented local prerequisites can initialize and run the demo without cloud accounts, API keys, or an undocumented root configuration. |
| Demo workflow | A user can sign in, use personal/team workspaces, complete a Mock task, inspect its asset/history and credit records, and exercise failure refunds and pre-dispatch cancellation. |
| Isolation | Another workspace cannot access tasks, assets, downloads, balances, or billing data by changing identifiers. Removed members lose access. |
| Real generation | Real account-backed evidence covers Replicate text-to-video, Replicate image-to-video, fal text-to-video, and fal image-to-video. Mock evidence cannot substitute for any of these four paths. |
| Task and credit correctness | Retries, duplicate callbacks, concurrent requests, restart recovery, and ambiguous submission preserve task and balance invariants. An expired subscription-credit refund receives a single seven-day compensation period; repeated refunds cannot extend it. |
| Billing | Stripe test-mode evidence covers subscription grants, one-off credit packs, webhook replay, relevant subscription transitions, and the specified expiry behavior without duplicate grants. |
| Management backend | Authorized operators can inspect users/workspaces, billing and credit records, tasks/assets, configuration health, and relevant logs. Workspace members cannot access global administration. Credit adjustments and operational recovery actions preserve an audit trail and business invariants. |
| Affiliate/referral capability | Demonstrate the selected FirstPromoter integration: checkout attribution, stable workspace UID, first-effective-payment eligibility and native one-payment cap, duplicate-safe commission tracking, cash-order reversal rules and authorized operator/affiliate visibility. Member/payer changes must not reset eligibility. Verify supported operator review/payment-initiation using non-production evidence where available; any live transfer needs separate authorization. Core operation must work with affiliate integration disabled. Technical defaults follow the detailed design; account payout terms remain release parameters. Automatic payout is optional under D27. |
| Deployment | One concrete managed path and Docker application deployment are reproducible with all external prerequisites documented. |
| Source delivery | The exported template can install and build independently, contains its version/migration metadata and documentation, and excludes legacy code, internal records, unrelated history, secrets, and the vendor sales implementation. |
| Agent workflows | Quick-start, provider extension, task extension, credit configuration, asset extension, deployment, security review, upgrade, and D28's four website-personalization workflows have scoped inputs/outputs and demonstrable acceptance evidence. Supported agent tools are documented accurately. |
| Governed customization | Demonstrate representative brand, page, and whole-site changes that preserve critical video SaaS behavior. Include a request that crosses the declared customization boundary and a change that breaks a required check; the workflow must reclassify the former and block successful completion/release for the latter. Verify that recovery preserves unrelated pre-existing work. Evidence must distinguish advisory Skill instructions from executable validation. |
| Developer documentation | The sales website exposes template, Skills and API documentation for developers. Tutorials and examples match the declared release and supported interfaces, distinguish D08's deferred public API, and contain no secrets. Versioned buyer guides accompany the clean export without including the vendor sales implementation. G30; T56-T58. |
| Open-source foundation and admin boundaries | Record selected React-admin OSS versions, notices and redistribution rights; validate authorization adapters, domain-owned Drizzle migrations/transactions and clean customer export without vendor data or a mandatory Docs CMS. M0 verifies the chosen configuration, with M1/M6 integration and M8 delivery evidence. G31; T59-T62. |
| Release readiness | Model choices, account eligibility, usage costs, license scope, distribution service, support terms, and paid-validation resources have been resolved before making corresponding commercial promises. |

The companion acceptance specification organizes the D01-D31 baseline into 31 gates and 62 scenarios. These are future validation requirements. No application tests, migration, admin-foundation proof of concept, or live provider calls were performed while authoring this record.

## Implementation evidence and release parameters still to close

Technology choices are settled in the detailed design. The following validation evidence and commercial parameters remain; they do not reopen the selected stack:

- Resolve selected versions into a lockfile and validate operating systems/runtime paths; compatible package declarations are not runtime proof.
- Validate React-admin's session adapter, global operator authorization, domain command/transaction boundaries, Drizzle migrations, notices and clean export at M0/M1 and M6/M8.
- Validate selected model endpoints, limits, output expectations, commercial terms, current pricing and account availability.
- Approved spend limits and credentials for any live paid provider validation.
- Provision and verify the selected Vercel, Neon PostgreSQL 17, R2, Trigger.dev Cloud and Resend configuration and Docker alternative using buyer-owned accounts.
- Configure prices, integer credit quantities and quoted tariffs from measured economics. E04 already selects monthly one-price billing, no scheduled change/proration, and cancel-then-repurchase after termination; verify that behavior rather than reopening intervals. Publish applicable storage/retention limits under the selected asset defaults.
- Source-license project/seat/re-distribution scope and final purchase/support terms.
- Validate selected Lemon Squeezy hosted checkout, merchant qualification, per-customer clean private GitHub repository and checksum ZIP delivery, plus twelve-month future-update access/renewal while preserving acquired versions. The channel/access design is selected; account setup and commercial operation remain unverified.
- Validate the selected vendor-site hosting and template-release packaging recipe; seller-owned account setup and commercial publication remain separate.
- Validate selected public Fumadocs/MDX routes, search, release navigation and synchronized customer-guide export.
- Verify FirstPromoter account/API entitlement, stable workspace UID, native one-payment cap plus local eligibility denial protection, retries and supported payout workflow. Vendor source commerce separately selects Lemon Squeezy; vendor account qualification and affiliate economics remain release inputs.
- Verify the detailed design's workspace attribution, window/conflict handling, self-referral/abuse and refund/dispute defaults against the chosen account. Commission rate, calculation basis and any buyer-requested policy changes remain explicit commercial configuration.
- Validate the selected operator-review/hosted-handoff workflow and account-method prerequisites; define commercial settlement frequency/minimums and gather available non-production evidence without live transfers. Default automatic disbursement is disabled; optional buyer-enabled automation remains subject to D27 and explicit matching configuration.
- Configure the independent Lemon Squeezy source-license affiliate program's commercial attribution, rates and payout rules after merchant qualification; it does not share the buyer FirstPromoter program.

## Confirmed planning handoff

Shared understanding is confirmed. The restart plan and technical design cover archive/rollback, layout, domain data/API contracts, selected foundations, integrations, governed Skills, developer Docs, milestones, evidence and customer delivery.

The documents distinguish confirmed D01-D31 requirements, selected engineering defaults and unresolved commercial parameters. Affiliate integration preserves workspace identity and first-payment rules; D29 validation preserves business contracts without promising absolute control of buyer-owned source. D30 retains D08. React-admin/Fumadocs are now selected under D31 and preserve D15; selection does not imply installation or verification. Migration and application implementation remain separate execution work.

Planning artifacts:

- [Master restart plan](../../.omx/plans/shpitto-restart-plan.md).
- [Product requirements](../../.omx/plans/prd-shpitto-restart.md).
- [Acceptance and test specification](../../.omx/plans/test-spec-shpitto-restart.md).
- [Admin foundation assessment](./2026-09-27-shpitto-admin-foundation-assessment.md).

These artifacts are local engineering files. Preserve and intentionally track the approved baseline/OpenSpec files through a narrow allowlist while keeping unrelated private `docs/` and `.omx/` state excluded. Engineering records do not enter customer source delivery.

## Evidence consulted

- [Current repository description](../../README.md).
Historical local-only evidence paths below describe the old platform. They remain outside the reviewed restart baseline allowlist and are not prerequisites for reading the current OpenSpec contracts. M0 inventories/preserves relevant authored files before moving source; a clean clone of the new planning artifacts must not be assumed to contain these old local references.

- Current website-generation architecture: `docs/website-generation-multi-skill-architecture-current-status.md`.
- Website-generation technical solution: `docs/website-generation-technical-solution.md`.
- Harness engineering rules: `docs/codex-harness-engineering.md`.
- Historical multi-skill architecture plan: `docs/website-generation-multi-skill-architecture-plan.zh-CN.md`.
- Chat lifecycle plan: `docs/chat-full-lifecycle-optimization-plan.md`.
- [Existing image-template manifest](../../apps/web/skills/product-baselines/ai-image-tool-baseline/assets/template/template-manifest.json).
- [Replicate HTTP API](https://replicate.com/docs/reference/http).
- [fal queue and cancellation contract](https://fal.ai/docs/documentation/model-apis/inference/queue).
- [fal webhook contract](https://fal.ai/docs/documentation/model-apis/inference/webhooks).
- [ShipAny Video Lite](https://shipany.ai/templates/video-lite) and [Video Agent](https://shipany.ai/templates/video-agent): their official product descriptions list both fal and Replicate. These are adoption examples, not market-share measurements.
- [MkSaaS AI module](https://mksaas.com/blog/ai): includes both providers in an adjacent, mainly image-generation example.
- [Rewardful one-time purchases](https://help.rewardful.com/en/articles/2209928-does-rewardful-work-for-one-time-purchases) and [service overview](https://help.rewardful.com/en/articles/2044650-what-is-rewardful).
- [Rewardful managed payouts](https://help.rewardful.com/en/articles/11930611-what-is-managed-payouts) and [onboarding requirements](https://help.rewardful.com/en/articles/11930654-how-to-onboard-to-managed-payouts).
- [Lemon Squeezy affiliates for merchants](https://docs.lemonsqueezy.com/help/affiliates-for-merchants).
- [shadcn/ui official Skills](https://ui.shadcn.com/docs/skills), [blocks](https://ui.shadcn.com/blocks), [registry](https://ui.shadcn.com/docs/registry), and [repository license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md): candidates for source-based UI customization workflows.
- [Puck documentation](https://puckeditor.com/docs): open-source React visual-editor candidate if browser-based editing is confirmed.
- [Open Design repository](https://github.com/nexu-io/open-design) and [license](https://github.com/nexu-io/open-design/blob/main/LICENSE): upstream of existing imported design resources, subject to selected-file provenance review.

Local evidence links above describe the pre-migration repository. Update or preserve their archived equivalents when the planned directory migration is executed.
