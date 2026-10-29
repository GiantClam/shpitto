# Design: Replace the Template Administration UI Foundation

**Change ID:** `replace-template-admin-ui-foundation`

## Decision

The delivered image and video templates will use a project-owned shadcn/ui component layer for administration. The component source is part of the template repository and can be changed by the buyer. `shadcn-admin` is a reference for navigation, shell composition, list/detail layouts, filters, forms, and operational page structure only.

The complete shadcn-admin application is not adopted. Its router, authentication, data provider, persistence, CMS behavior, and application-specific pages do not become part of the template.

## Preserved Authority

The UI migration does not change these existing authorities:

- Better Auth owns identity and sessions.
- Current server-side global role checks own administration authorization.
- Allowlisted domain queries own administration reads.
- Named domain commands own protected mutations.
- Domain transactions own business state, ledger effects, command results, audit, and outbox consistency.
- Drizzle owns application and authentication migrations.
- The release/export contract owns customer source boundaries and notices.

The UI must represent these outcomes truthfully. A hidden button, cached role, client-side route guard, or optimistic success state cannot grant authority or claim a committed business effect.

## Shared and Variant Information Architecture

Both template families use the same administration shell and common navigation contract. The common resource patterns cover:

- Overview and operational status.
- Users and workspaces.
- Generation tasks and attempts.
- Assets and delivery state.
- Billing, credits, and orders.
- Models, providers, and configuration health.
- Audit and recovery evidence.

The image and video templates provide variant modules where their domain capabilities differ:

- Media preview and metadata renderers.
- Model capability and parameter controls.
- Provider-specific health and task fields.
- Asset type, format, duration, dimensions, or frame metadata.
- Variant-specific recovery evidence and supported named commands.

The shared layer supplies the page structure and state handling. A variant capability declaration determines which resources, fields, filters, actions, and preview controls are available. Unsupported controls are omitted rather than rendered disabled as if the capability existed.

## UI Source Ownership

The implementation should keep primitive components in the project's UI component directory and admin composites in the project's admin component boundary, following the repository's established layout where possible. Components should be copied or generated into the project source with provenance recorded in the notices or dependency inventory.

The foundation should include only the primitives and composites needed by the administration surface. It should reuse existing project tokens, icons, validation, request helpers, and error conventions. New abstractions are justified only when they serve both image and video templates or remove repeated resource behavior.

## Interaction and Data Boundaries

Resource pages map server pagination, allowlisted filters, sorting, redacted records, and bounded detail views to application-owned table and form components. Mutations use the existing named-command clients and must collect the required reason, expected version, and idempotency key where the server contract requires them.

The UI must expose loading, empty, error, forbidden, stale-version, duplicate-retry, and successful-result states. It must not perform generic create/update/delete against protected ledger, task, order, subscription, or authorization data.

## Dependency and Delivery Rules

The implementation resolves exact versions and peer compatibility for Tailwind, shadcn/ui prerequisites, icon components, and any table/form helpers before changing the lockfile. Each added source component and dependency must have a redistribution-compatible license and a recorded source/version entry.

The customer export includes the project-owned UI source, admin routes, templates, styles, and required notices. It excludes seller services, private state, legacy source, and any requirement for an online shadcn-admin or Shpitto runtime.

## Alternatives Rejected

- **Keep React-admin/MUI:** rejected because the template buyer would receive a second UI system with weaker source-level customization and inconsistent administration/product presentation.
- **Adopt shadcn-admin as the full application:** rejected because it would introduce competing routing, authentication, data-access, and application ownership boundaries.
- **Build separate image and video admin applications:** rejected because common operational workflows and buyer customization would drift across the two template families.
- **Replace the backend contracts while changing the UI:** rejected because the decision concerns presentation and page structure; security and domain ownership are already established and require independent stability.

## Verification Strategy

Verification must prove both presentation and preserved authority:

1. Source and dependency scans show no React-admin, MUI, Emotion, or complete shadcn-admin application in the customer administration runtime.
2. Component and route tests cover shared shell navigation, resource pagination/filtering, variant capability gating, loading/error/empty/forbidden states, and named-command feedback.
3. Existing direct API authorization, role revocation, stale-version, idempotency, audit, transaction, and migration tests remain green.
4. Image and video fixtures render the shared modules and their variant modules at desktop and mobile sizes with keyboard and focus checks.
5. A clean exported template installs, builds, and runs in each supported profile without seller-owned runtime services.
