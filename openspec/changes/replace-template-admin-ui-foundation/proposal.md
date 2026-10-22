# Replace the Template Administration UI Foundation

**Change ID:** `replace-template-admin-ui-foundation`
**Created:** 2026-10-21
**Status:** Implemented
**Implemented:** 2026-10-21

## Problem Statement

The customer-delivered image and video templates currently carry an administration surface based on React-admin and MUI, while the template product direction uses source-owned shadcn/ui components and Tailwind design tokens. This creates a second presentation system that is harder for template buyers to customize and makes the delivered product feel inconsistent across its product and administration surfaces.

The prior restart proposal selected React-admin as an engineering default. This change supersedes that selection only for the delivered template administration presentation. It does not rewrite the prior security, domain, data, migration, or delivery contracts.

`shadcn-admin` is useful as an information-architecture and page-structure reference, but adopting it as a complete application would introduce its own routing, authentication, data-access, and application conventions. Those responsibilities must remain with the template.

## Proposed Solution

- Replace the React-admin/MUI administration presentation with application-owned routes, layouts, and pages built from a project-owned shadcn/ui component layer.
- Keep shadcn/ui primitives and template-specific admin composites as editable source in the customer template. The project may install the primitives required by those source files, but it does not depend on `shadcn-admin` as a runtime application.
- Share the administration shell, navigation contract, generic resource patterns, and common operational modules between image and video templates.
- Provide template-specific modules for media type, model capability, task parameters, provider fields, and asset preview. Unsupported controls must not be rendered for a template.
- Preserve the existing Better Auth session, global role checks, allowlisted queries, named domain commands, idempotency, audit, transaction, Drizzle migration, and clean-export boundaries.

## Scope

### In Scope

- The customer-delivered administration shell, navigation, layouts, loading/error/empty states, tables, filters, forms, dialogs, detail views, and command feedback.
- Project-owned shadcn/ui primitives and admin composite components.
- A shared administration information architecture for image and video templates.
- Template capability declarations and variant-specific administration pages or fields.
- Removal of React-admin, MUI, Emotion, and any complete shadcn-admin application foundation from the delivered template runtime.
- Tests, dependency/license checks, source-boundary checks, and clean-export verification for the new foundation.

### Out of Scope

- New operator roles, authentication flows, workspace authorization rules, database tables, migration ownership, or domain commands.
- Changes to billing, credit, generation, asset, provider, affiliate, audit, or recovery business rules.
- A hosted CMS, seller-owned runtime service, or shadcn-admin application merge.
- A general-purpose visual page builder or a promise that buyers can edit protected business behavior through the UI.
- Replacing the customer-facing product UI; this change concerns the administration surface inside the delivered image and video templates.

## Impact Analysis

| Component | Change Required | Details |
|-----------|-----------------|---------|
| Database | No | Existing Drizzle migrations and domain tables remain authoritative. |
| API | No contract change | Existing session-bound admin reads and named commands remain the UI boundary. |
| State | No domain change | Server-owned authorization, idempotency, audit, and transaction semantics remain unchanged. |
| UI | Yes | Replace the React-admin/MUI presentation with application-owned shadcn/ui-based pages and shared/variant modules. |
| Dependencies | Yes | Remove React-admin/MUI/Emotion runtime dependencies and add only the resolved shadcn/ui prerequisites required by copied source components. |
| Export | Yes | The customer runtime must contain the editable UI source and must not require Shpitto or shadcn-admin services. |
| Documentation | Yes | Update the active technical decision, buyer guidance, and validation references after implementation. |

## Architecture Considerations

The administration UI remains a presentation client of the existing application contracts:

```text
Project-owned shadcn/ui admin pages
        -> session-bound admin read/query and named-command clients
        -> Better Auth session and current global role checks
        -> domain queries/commands, audit, outbox and Drizzle transactions
```

The shared foundation owns visual composition and interaction state. It must not become an authentication owner, schema owner, migration owner, generic CRUD layer, or CMS. Image and video variants consume the same shell and common resource patterns while declaring their supported media capabilities explicitly.

The implementation should follow the repository's existing source ownership and export boundaries. Exact package versions, copied component provenance, notices, and peer compatibility are implementation evidence and must be resolved before the foundation is marked complete.

## Success Criteria

- [x] The delivered image and video templates contain editable shadcn/ui primitive and admin composite source files.
- [x] The administration surface has one shared shell and common resource patterns, with explicit image/video capability differences.
- [x] The customer runtime has no React-admin, MUI, Emotion, or complete shadcn-admin application dependency for administration.
- [x] Existing authorization, query, command, audit, transaction, migration, and export tests remain passing.
- [x] Clean local, managed-contract, and Docker profile checks pass without a seller-owned UI or hosted admin service.
- [x] Desktop and mobile administration states cover keyboard focus, loading, empty, error, denied, stale-command, and retry outcomes without overlapping content.

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Rebuilding generic resource screens takes longer than expected | Medium | Medium | Define shared table, filter, detail, and command composites before migrating resource pages. |
| UI migration weakens server authorization by relying on hidden controls | Low | High | Preserve direct server checks and run negative endpoint tests independently of the UI. |
| Image and video variants drift into separate admin products | Medium | Medium | Make shared shell/navigation and a capability manifest part of the contract. |
| Copied component provenance or dependency licensing is incomplete | Medium | High | Record exact source, version, license, notices, and clean-export evidence before release. |
| Existing operations behavior is lost during migration | Medium | High | Inventory current resources and commands, then cover each list, detail, loading, error, and retry path with focused tests. |
