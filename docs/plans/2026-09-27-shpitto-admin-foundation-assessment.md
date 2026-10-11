# Shpitto: Open-Source Admin Foundation Assessment

Date: 2026-09-27  
Status: V1 selection complete: React-admin OSS. This assessment preserves alternative analysis and rejected-option risks; the detailed technical design governs implementation. Dependency installation, prototypes, application tests and deployment remain unperformed.

Companions: [requirements](./2026-09-27-shpitto-restart-requirements.md), [restart plan](../../.omx/plans/shpitto-restart-plan.md), [acceptance specification](../../.omx/plans/test-spec-shpitto-restart.md), [Chinese review edition](./2026-09-27-shpitto-admin-foundation-assessment.zh-CN.md).

## 1. Recommendation

Adopt an open-source-first implementation policy for reusable administration, identity, UI, documentation and infrastructure integration. A maintained dependency can reduce generic implementation work; stability of the assembled product still needs evidence from its own integration and domain tests.

Decision: select React-admin OSS 5.15.4 for its supplied operational UI, retaining Better Auth sessions and domain services. Refine needs more UI composition; Payload adds content/auth/migration ownership without a matching V1 content workflow. Select Fumadocs with MDX for developer Docs. M0 validates the chosen configuration and boundaries, replacing the earlier three-way competition.

This recommendation is an architectural inference: D22 primarily covers users, workspaces, billing, credits, generation tasks and recovery, while D15 already assigns customer identity to Better Auth and business persistence to Drizzle. D30 requires versioned developer documentation, which does not itself require a runtime CMS. Payload's broader scope therefore needs to earn its additional integration and operational cost.

“Provide our operator backend” in D22/D24 means owning and delivering the required operating capability. It does not require writing generic tables, forms, navigation, content editing or authentication from scratch. D24 still delegates commission accounting and payouts to the selected external affiliate service.

[Current detailed technical design](./2026-09-27-shpitto-detailed-technical-design.md) specifies versions, routes, interfaces and deployment steps. Historical candidate comparisons and conditional risks below do not leave Payload or Refine open for V1, nor require prototypes of rejected alternatives.

## 2. Candidate comparison

| Candidate | Existing capabilities to reuse | Project work that remains | Fit for this plan |
| --- | --- | --- | --- |
| React-admin open-source core | Resource lists, forms, filtering and data/auth provider contracts. The documented Next.js integration uses a client-side admin application. | Domain API/data-provider mapping, Better Auth or operator identity adapter, server authorization, and custom financial/task commands. | Start here when ready-made operational CRUD screens are the main saving. Confirm UI-library and client-bundle implications. |
| Refine Core | Headless data, authentication and access-control providers with React/Next.js integration. | Compose the chosen UI, connect providers, and implement protected domain commands and server checks. | Compare when preserving the template's UI system and interaction control has more value than a fully supplied admin presentation. |
| Payload | Config-driven admin/CMS plus its own authentication, database adapters, generated APIs and content capabilities. | Select an operator identity approach, isolate schema ownership, secure every enabled access path, and create domain-backed operational views. | Stronger candidate when substantial content operations share the admin; measure custom-view and additional backend ownership costs. |

Capability references: [React-admin data providers](https://marmelab.com/react-admin/DataProviders.html), [authentication](https://marmelab.com/react-admin/Authentication.html), [Next.js integration](https://marmelab.com/react-admin/NextJs.html); [Refine concepts](https://refine.dev/core/docs/guides-concepts/general-concepts/), [Next.js integration](https://refine.dev/core/docs/routing/integrations/next-js/); [Payload overview](https://payloadcms.com/docs/getting-started/what-is-payload), [admin](https://payloadcms.com/docs/admin/overview), [content versions](https://payloadcms.com/docs/versions/overview).

The open-source cores use MIT licenses, but that does not establish the rights or cost of every plugin, asset or enterprise module. Check the exact selected versions and redistribution terms before including them in a paid source template. Do not assume one enterprise subscription licenses redistribution of private module source to every buyer. No enterprise module is required or selected by this assessment. [Payload license](https://github.com/payloadcms/payload/blob/main/LICENSE.md), [React-admin license](https://github.com/marmelab/react-admin/blob/master/LICENSE.md), [Refine Core license](https://refine.dev/core/docs/further-readings/license/), [React-admin enterprise terms](https://react-admin-ee.marmelab.com/MARMELAB_Services_Terms_2025_01_29.pdf), [Refine enterprise modules](https://refine.dev/core/docs/enterprise-edition/multitenancy/).

## 3. Shared architecture for any chosen admin

```text
Customer application -> Better Auth -> workspace authorization -> domain queries/commands

Chosen admin UI -> verified operator identity -> operator authorization
                                             -> domain queries/commands

Domain command -> one owned database transaction
                  -> business state + ledger effect + business audit + outbox as applicable

Optional CMS -> its own content/administrator records and migrations
```

Customer identity, memberships, credits, billing, generation attempts and private assets retain one authoritative implementation. The admin supplies the interface and invokes the same domain services used elsewhere. A framework's client-side permission checks are presentation controls; privileged requests still require current server authorization.

| Operation/data | Reuse approach | Required project boundary |
| --- | --- | --- |
| Navigation, lists, filters, forms and pagination | Framework components and data adapters | Adapt approved query results; do not expose arbitrary tables or secrets. |
| Announcements, FAQ, marketing text and public media | Structured content CRUD when needed | Separate from private generation assets and from Shpitto's own sales data. This does not introduce a browser page-builder requirement. |
| Customer/workspace/order/task inspection | Read models through domain queries | Workspace and global operator permissions; sensitive field redaction. |
| Credit adjustment, task recovery, account/member changes | Custom action invoking a domain command | Verified actor, reason, idempotency, authorized target and current state; atomic business audit. |
| Prices, credit rules, model enablement and retention limits | Validated configuration commands | Explicit effective version and audit; preserve snapshots of accepted orders/tasks. These are not harmless content edits. |
| Stripe entitlements and affiliate status | Existing integration adapters and provider references | Payment events remain authoritative; no manual state edit granting paid benefits or competing commission ledger. |
| Provider credentials | Controlled secret configuration | Never return plaintext secrets through generic content forms or APIs. |

Do not provide generic write/delete operations for ledger entries, balances, reservations, payment events, task attempts or terminal task states. Admin access does not grant permission to bypass business invariants. Content version history is not a substitute for an immutable, attributable financial and operational audit.

## 4. Technical risks of the rejected Payload alternative

### Identity and authorization

Keep Better Auth for end users. Choose between a separate Payload operator collection and a verified custom authentication strategy; do not assume an official plug-and-play Better Auth bridge. Separate operator login can be simpler than synchronizing all customer identities. Both choices must produce a stable server-verified operator principal and honor role/session revocation. Never map privilege solely by matching email addresses. Payload documents both admin authentication collections and custom strategies. [Admin authentication](https://payloadcms.com/docs/admin/overview), [custom strategies](https://payloadcms.com/docs/authentication/custom-strategies).

Payload's Local API defaults to overriding access checks, and its custom views require explicit protection. Treat those as integration responsibilities. Calls acting for a user need the appropriate verified user context and `overrideAccess: false`; exceptional privileged server jobs need a narrowly scoped, reviewed service path. Verify custom views, actions, custom endpoints and every enabled REST/GraphQL route independently. [Local API](https://payloadcms.com/docs/local-api/overview), [custom-view security](https://payloadcms.com/docs/custom-components/custom-views).

Generated admin/CMS APIs do not create a public generation API product. Retain D08; avoid route collisions with the existing application and expose only explicitly authorized operations. UI hiding is insufficient.

### Database and transaction ownership

Payload's Postgres adapter uses Drizzle internally, but its configuration also drives schema management. Official documentation currently marks `schemaName` experimental and enables development schema push by default. Sharing the database engine does not demonstrate safe ownership of existing application tables. [Postgres adapter](https://payloadcms.com/docs/database/postgres).

Recommended prototype boundary: separate application and Payload databases on the same local PostgreSQL instance, with distinct migration ownership and restricted database credentials. This adds database configuration, backup and upgrade work, but need not add a cloud service. Shared schemas are an alternative only after the pinned adapter version proves migration isolation. Disable automatic schema push in the controlled migration path. Do not let either migration system mutate the other's tables.

Keep business mutation, credit effects and the canonical business audit in the domain-owned transaction. Do not assume a Payload request transaction and an independently opened Drizzle transaction commit atomically together. Optional CMS projections or notifications synchronize through a retryable idempotent outbox; they do not decide whether a refund succeeded. Payload has transaction facilities, but the integration must deliberately use a compatible ownership boundary. [Payload transactions](https://payloadcms.com/docs/database/transactions).

### Delivery and content scope

If selected for the buyer's backend, the approved Payload integration, initialization, pinned dependencies and migrations are part of the customer's independent source delivery. It must run locally without a Shpitto-hosted CMS or a mandatory cloud account. Shpitto's vendor instance and private sales records remain separate.

Keep technical Docs and Skills associated with their released source version. Prefer the existing versioned content source for D30. If CMS authoring is later justified, publish explicit versioned snapshots for both the sales-site docs and packaged guides. An editor's content revision is not automatically a template release version. Do not create competing copies of prices, runtime configuration or technical documentation.

## 5. Reuse strategy across the template

| Area | Planned reuse | Project responsibility |
| --- | --- | --- |
| Web foundation | Confirmed Next.js/React/TypeScript stack | Product composition and supported-version compatibility. |
| Identity | Better Auth | Workspace/operator authorization and account lifecycle integration. |
| Persistence | PostgreSQL and Drizzle | Schema ownership, domain transactions, idempotency and recovery. |
| Admin | Selected React-admin OSS 5.15.4; M0 integration evidence | Domain query/command adapters and access boundaries. |
| UI and personalization | Evaluated open-source components and selected existing Skills | Template-specific contracts and safe customization; retain provenance. |
| Documentation | Selected Fumadocs/MDX with versioned source | Correct template/Skill/API examples and synchronized customer guides. |
| Payment, jobs, storage, mail and models | Confirmed services and official supported SDKs/adapters | Normalize events; preserve credit, task and authorization rules. These services are not all open-source software. |
| Affiliate program | One supported third-party integration | Workspace-first-payment eligibility and synchronization; third party owns commission accounting/payout workflow. |

Prefer supported extension points and released packages over a broad upstream fork. Copy reviewed source only when the license and maintenance benefit justify it. Record upstream versions, selected packages, notices, maintenance responsibility and an upgrade path. Popularity, a polished demo or an upstream test suite alone is not product stability evidence.

## 6. Selected-baseline M0 validation and stabilization gates

Validate the selected React-admin configuration using synthetic data and the representative tasks below. Record version, adapter effort, dependencies, identity/migration boundaries, licenses, build behavior and upgrade work. Rejected alternatives do not require implementation prototypes.

1. Render a workspace/task list with filters through an authorized domain query.
2. Execute an audited credit adjustment through a domain command; replay it and confirm one effect.
3. Edit a low-risk content item if ongoing content editing is a real requirement; otherwise record that a CMS is providing little reuse value.
4. Check denied customer/member access, revoked operator access and direct API calls, including framework-specific access paths.
5. Exercise a failure during a business transaction and, if applicable, an independent CMS migration or synchronization; preserve business state and audit consistency.
6. Initialize a clean local export and document Docker/managed deployment, required dependencies, licenses and migration order.

| Gate | Future evidence |
| --- | --- |
| T59 | Operator identity and all enabled admin access paths respect current permissions and revocation. |
| T60 | Each data structure has one migration owner; domain transaction failure does not split business effects and audit. Framework-specific migration isolation is proven when relevant. |
| T61 | No generic CRUD route bypasses ledger, payment or task commands; repeats are idempotent and attributable. |
| T62 | Pinned dependencies/licenses, independent customer export, cloud-free local setup and supported deployment paths are reproducible. |
| G31 | A documented open-source selection shows net reuse value and passes applicable integration gates, with unresolved limitations visible. |

M0 validates the selected React-admin configuration. M1 integrates it, M6 completes operations, and M8 validates independent delivery. Exact primary versions are fixed in the detailed design; installation and runtime evidence remain future work.

Concentrate stabilization on the selected configuration, new adapters and critical product workflows, using upstream-supported capabilities. Keep the existing financial, isolation and task-recovery cases mandatory. Reuse should reduce how much new code needs proving, not remove the need to prove the assembled product.

## 7. Decision status and review focus

- **Confirmed implementation preference:** D31, prefer maintained reusable open-source foundations with suitable source-delivery rights.
- **Selected:** React-admin OSS for operations and Fumadocs/MDX for developer documentation; alternatives retained as rationale.
- **Pending evidence:** lockfile resolution, actual build, identity/domain adapters, source-license validation and independent delivery of the selected version. Framework selection is complete.
- **Completed here:** official-document research, current-plan analysis and planning-document updates.
- **Not yet performed:** candidate installation, prototype execution, application tests, dependency/security validation of a chosen release, migrations or deployment.

Owner layer: requirements/specification. Inspected upstream inputs: the confirmed requirements, PRD, restart plan, acceptance specification and official sources linked above. This decision concerns the planned replacement product; no legacy runtime change is needed. Verification of this assessment is documentary consistency review; future integration evidence is defined by G31 and T59-T62.
