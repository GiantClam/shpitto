# Implementation Tasks: Replace the Template Administration UI Foundation

**Change ID:** `replace-template-admin-ui-foundation`

All tasks are implementation work. The current proposal and delta spec do not claim that the remaining release gates have been completed.

## Phase 1: Contract and Inventory

- [x] 1.1 Inventory the current administration entrypoint, routes, shell, resources, auth provider, data provider, command clients, styles, tests, and export paths under `src/admin`, `src/components/shell`, `src/app/admin`, `.shpitto/contracts`, and `package.json`. Record the current behavior baseline. Predecessor: none. Evidence: reviewed inventory and resource/command matrix.
- [x] 1.2 Define the shared administration capability contract for image and video templates, including common navigation, role-gated resources, variant resources, fields, filters, actions, and unsupported controls. Predecessor: 1.1. Evidence: `src/admin/capabilities.ts` and capability fixture test.
- [x] 1.3 Resolve the exact shadcn/ui, Tailwind, icon, table/form helper, and peer dependency set. Record source provenance, versions, licenses, notices, and redistribution permissions. Predecessor: 1.1. Evidence: `internal/restart/admin-ui-provenance.md`; the foundation uses local dependency-free primitives and removes the prior UI dependency tree.
- [x] 1.4 Freeze the preserved backend contract: Better Auth sessions, global roles, allowlisted reads, named commands, idempotency, audit, transactions, migrations, and export boundaries. Predecessor: 1.1. Evidence: preserved adapters/commands, operator-administration delta spec, and unchanged server routes.

## Phase 2: Project-Owned Foundation

- [x] 2.1 Add the required project-owned shadcn/ui primitives and shared styling tokens in the established component boundary. Predecessor: 1.3. Evidence: `src/components/ui`, `src/admin/admin.css`, provenance records, typecheck and focused tests.
- [x] 2.2 Implement the shared administration shell with sidebar/header navigation, breadcrumbs or page context, responsive collapse, role-aware navigation visibility, focus handling, and mobile layout. Predecessors: 1.2, 2.1. Evidence: `AdminShell`, route state handling, shell boundary test and production build.
- [x] 2.3 Implement shared admin composites for data tables, pagination, filters, forms, dialogs, status badges, detail sections, loading states, empty states, error states, and command result feedback. Predecessors: 1.2, 2.1. Evidence: resource view, existing command/recovery forms, focused adapter tests and production build.
- [x] 2.4 Implement the variant capability adapter used by image and video templates to select supported resources, fields, renderers, and actions. Predecessors: 1.2, 2.3. Evidence: `getAdminCapabilities` and image/video fixture test proving unsupported controls are omitted.

## Phase 3: Administration Migration

- [x] 3.1 Replace the React-admin application entrypoint and MUI presentation with application-owned administration routes and pages while preserving existing URL authorization behavior. Predecessors: 2.2, 2.3, 2.4. Evidence: application-owned `admin-app.tsx`, server guard unchanged, source-boundary check and production build.
- [x] 3.2 Migrate users/workspaces, generations/tasks, assets, billing/credits, models/providers, audit, and recovery views to the shared resource patterns. Predecessors: 3.1. Evidence: resource definitions, command/recovery panels, adapter tests and release-boundary inspection.
- [x] 3.3 Add image-specific and video-specific administration capability declarations, fields, previews, model controls, and recovery details behind the capability adapter. Predecessors: 2.4, 3.2. Evidence: the video fixture renders server-backed capability fields/actions; the image fixture explicitly omits unsupported controls until image runtime contracts exist.
- [x] 3.4 Migrate named command forms and result handling without changing server command contracts. Preserve reason, expected-version, idempotency, stale-version, duplicate-retry, and forbidden outcomes. Predecessors: 1.4, 3.2. Evidence: existing command adapter tests pass unchanged in behavior and command panels use the same clients.
- [x] 3.5 Remove React-admin, MUI, Emotion, and unused adapter code from the customer runtime and update package, lockfile, notices, source-boundary, and export contracts. Predecessors: 3.1-3.4. Evidence: package/lockfile scan, typecheck, source-boundary check, release-boundary check and export manifest inspection.

## Phase 4: Verification and Documentation

- [x] 4.1 Run focused unit, integration, browser, accessibility, and responsive checks for shared and variant administration workflows. Predecessors: 3.5. Evidence: focused admin/brand tests, full unit suite, production build, shell/source/release boundary checks, and `internal/evidence/m8/admin-ui-browser-20261021/` covering 1440x900 and 390x844 layouts, keyboard focus, and declared UI states.
- [x] 4.2 Re-run direct server authorization, role revocation, query allowlist, named-command, audit/transaction rollback, migration, and recovery checks. Predecessors: 3.5. Evidence: M6 admin-read, privileged-command, two-factor/session, recovery/rollback, workspace-details, operations/credit, and affiliate probes remain green with no UI bypass.
- [x] 4.3 Build and run clean local, managed-contract, and Docker customer profiles from the exported template. Predecessors: 4.1, 4.2. Evidence: `internal/evidence/m8/local-demo/local-candidate-20261021-admin-ui/result.json`, `internal/evidence/m8/docker/local-candidate-20261021-admin-ui/result.json`, the candidate manifest, and the existing managed deployment preflight.
- [x] 4.4 Update the active technical design, buyer documentation, dependency notices, and validation references to mark React-admin/MUI as superseded for template administration and document the shadcn/ui ownership boundary. Predecessor: 4.3. Evidence: synchronized English documentation, `internal/restart/admin-ui-provenance.md`, browser evidence manifest, and strict OpenSpec validation.

## Quality Gates

- [x] No customer administration runtime import or dependency remains for React-admin, MUI, Emotion, or a complete shadcn-admin application.
- [x] Shared image/video shell and common resource patterns are covered by tests.
- [x] Variant-specific capabilities are explicit and unsupported controls are absent.
- [x] Existing server-side authorization and domain invariants remain independently enforced.
- [x] Clean exported local, managed-contract, and Docker profiles build and run.
- [x] Provenance, licenses, notices, documentation, and OpenSpec validation are complete.
