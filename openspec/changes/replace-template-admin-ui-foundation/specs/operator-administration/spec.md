# operator-administration

Delta for the `restart-shpitto-video-saas` operator-administration capability. This change supersedes the React-admin/MUI presentation selection for the customer-delivered image and video templates while preserving the existing server and domain authority.

## MODIFIED Requirements

### Requirement: REQ-OPS-06 Reusable administration foundation without competing authority

The customer-delivered administration surface SHALL use a project-owned shadcn/ui component layer and application-owned routes, layouts, and pages. The UI SHALL present the existing session-bound domain query and named-command contracts without creating another authentication owner, schema or migration owner, hosted CMS requirement, seller-owned runtime dependency, or generic CRUD authority. `shadcn-admin` MAY be used as an information-architecture and page-structure reference, but SHALL NOT be adopted as the complete application foundation. The customer-delivered admin SHALL work in the supported local, managed, and Docker profiles with approved redistribution notices.

Trace: D01, D28, D29, D31, J7, G31, T59, T60, T61, T62.

#### Scenario: SC-OPS-15 Project-owned administration source

- **WHEN** a buyer opens the delivered template source and customizes the administration shell, tokens, shared components, or resource page composition
- **THEN** the relevant shadcn/ui primitives and admin composites are present as editable project source, and the change does not require access to Shpitto, a hosted shadcn-admin application, or a seller-owned runtime service

#### Scenario: SC-OPS-16 Reference-only shadcn-admin use

- **WHEN** the administration UI is inspected for application ownership
- **THEN** its routing, authentication, data access, persistence, domain commands, and page implementations belong to the template, while any shadcn-admin influence is limited to documented page structure or information-architecture reference

#### Scenario: SC-OPS-17 Independent customer delivery

- **WHEN** a clean exported image or video template is installed and run in a supported local, managed, or Docker profile
- **THEN** the administration UI builds from the exported project source with buyer-owned configuration, required notices, and the existing Better Auth/domain/Drizzle authorities, without seller data or an external admin runtime

### Requirement: REQ-OPS-07 Shared and variant administration structure

The image and video templates SHALL share the administration shell, navigation contract, common resource patterns, and generic operational modules for overview/status, users/workspaces, generation tasks, assets, billing/credits, models/providers, audit, and recovery evidence. Each template SHALL declare its media-specific capabilities, fields, actions, renderers, and supported commands. The UI SHALL omit unsupported controls and SHALL preserve the existing server authorization for every visible or directly invoked operation.

Trace: D01, D28, D29, D31, J7, G31, T59, T61, T62.

#### Scenario: SC-OPS-18 Common module consistency

- **WHEN** the same authorized operator opens the corresponding common resource in the image and video templates
- **THEN** the shell, navigation semantics, table/filter/detail patterns, permission states, and command feedback are consistent while the resource data remains scoped to the current template capability contract

#### Scenario: SC-OPS-19 Template-specific capability rendering

- **WHEN** an image or video template does not support a field, model parameter, asset renderer, or command exposed by the other template
- **THEN** the unsupported control is absent from navigation and page actions, and a direct request for the unsupported operation is rejected by the existing server contract

#### Scenario: SC-OPS-20 Shared foundation with independent customization

- **WHEN** a buyer changes a shared admin token, layout component, or common resource composition in the delivered source
- **THEN** both applicable template variants inherit the intended shared change without requiring duplicated framework integrations, while variant-specific modules remain independently customizable

### Requirement: REQ-OPS-08 Administration UI preserves domain outcomes

The application-owned administration UI SHALL map allowlisted pagination, filtering, sorting, redacted reads, named commands, and bounded detail views to explicit loading, empty, error, forbidden, stale-version, duplicate-retry, and successful-result states. The UI SHALL NOT use optimistic or generic CRUD behavior to claim a protected business effect before the server contract confirms it.

Trace: D31, J7, G31, T59, T60, T61.

#### Scenario: SC-OPS-21 Server outcome fidelity

- **WHEN** an admin read or named command is denied, stale, duplicated, invalid, or fails after a partial external attempt
- **THEN** the UI shows the server-provided bounded outcome and recovery context, does not fabricate success, and keeps retry behavior bound to the original command identity where the contract permits retry

#### Scenario: SC-OPS-22 Responsive and accessible administration states

- **WHEN** an authorized operator uses shared and variant administration pages at the supported desktop and mobile viewports with keyboard navigation
- **THEN** navigation, tables, forms, dialogs, status feedback, focus indicators, and error/empty states remain readable, operable, and non-overlapping without changing authorization or command semantics

## REMOVED Requirements

The requirement that React-admin OSS be the selected customer administration foundation is removed from the active selection by the modified `REQ-OPS-06`. Existing server-side authorization, domain query/command, audit, transaction, migration, and independent-delivery requirements remain in force.
