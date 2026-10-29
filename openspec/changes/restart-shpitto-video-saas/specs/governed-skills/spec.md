# Governed external-agent Skills

## Purpose

Deliver twelve discoverable coding-agent Skills that customize and extend the buyer-owned AI video SaaS while preserving business contracts, independently trusted validation and recoverable customer work.

## ADDED Requirements

### Requirement: REQ-SKL-01 Complete external-agent Skill catalog

The customer package SHALL include canonical skills/<name>/SKILL.md files for quick-start, add-provider, add-generation-task, configure-credits, extend-assets, deploy-template, security-review, upgrade-template, customize-brand, create-page, modify-page and customize-site. Each SHALL declare supported inputs, allowed paths/contracts, outputs, required evidence and recovery. Documented thin discovery adapters SHALL support Codex, Claude Code and OpenCode with actual capability differences stated. The application MUST operate without any coding-agent CLI or embedded end-user agent.

Trace: D09, D18, D28, D29, J1, J2, J9, T01, T42, T43, T50, G09, G18, G28, G29. Tasks: 8.1, 8.2, 8.3, 8.15.

#### Scenario: SC-SKL-01 Inspect every shipped Skill

- **WHEN** a buyer inspects the clean exported Skill catalog
- **THEN** all twelve named Skills exist with inputs, scope, outputs, evidence and recovery; quick-start covers persistent no-cloud setup, deploy-template covers supported deployments, security-review reports boundary-owned findings, and upgrade-template covers backup, compatibility and local changes

#### Scenario: SC-SKL-02 Discover Skills without runtime coupling

- **WHEN** a buyer follows each supported agent's discovery instructions and starts the exported application without an agent process
- **THEN** the documented adapter resolves canonical Skills, unsupported agent behavior is disclosed, and the application starts without depending on Codex, Claude Code or OpenCode

#### Scenario: SC-SKL-03 Extend business capabilities through dedicated Skills

- **WHEN** add-provider, add-generation-task, configure-credits or extend-assets proposes a scoped extension
- **THEN** the Skill records provider capabilities and safe submission/reconciliation, task state/DTO/credit/asset impacts, versioned tariff/expiry compatibility, or asset ownership/ingestion/retention as applicable; core changes receive explicit engineering scope and regression evidence

### Requirement: REQ-SKL-02 Four bounded personalization workflows

The four personalization Skills SHALL modify the buyer's own AI SaaS marketing and product presentation through declared brand, content, theme, route and component surfaces. They MUST preserve real authentication, workspace, billing, generation and download behavior and existing internationalization boundaries. General-purpose independent website generation and a browser visual editor are outside this capability.

Trace: D06, D28, D29, J2, T32, T33, T34, T35, G06, G28, G29. Tasks: 8.4, 8.5, 8.9, 8.15.

#### Scenario: SC-SKL-04 Customize brand consistently

- **WHEN** customize-brand changes name, colors, logo or fonts
- **THEN** declared tokens/assets/copy change consistently across shared shells with responsive/accessibility evidence and preserved business actions

#### Scenario: SC-SKL-05 Create a supported page

- **WHEN** create-page adds a use-case or product presentation page
- **THEN** the page follows allowed routes, navigation, metadata and existing components without changing authentication or billing contracts

#### Scenario: SC-SKL-06 Modify a functional pricing page

- **WHEN** modify-page changes a pricing section
- **THEN** presentation changes retain approved catalog/price bindings and real checkout actions rather than hard-coded prices or mock payment success

#### Scenario: SC-SKL-07 Customize the whole supported site

- **WHEN** customize-site changes shared theme and page composition
- **THEN** marketing and product shells remain coherent and responsive, while sign-in, workspace navigation, generation, download and billing journeys remain functional

### Requirement: REQ-SKL-07 Default presentation baseline and shared-shell customization

The exported template SHALL ship with a usable default presentation baseline,
including named brand colors, typography, spacing/control sizes, surface and
border tokens, focus/disabled/status states and a shared shell contract used by
marketing, auth, product and operations routes. Navigation and menu controls
SHALL use consistent dimensions and interaction states across those shells.
The `customize-brand` and `customize-site` Skills SHALL identify these tokens
and shared-shell surfaces as their supported edit points, with responsive and
accessibility evidence. Customization MUST preserve auth, workspace,
generation, billing, admin and download contracts.

Trace: D06, D28, D29; J2, J9; T32, T33, T34, T35, T56; G06, G28, G29. Tasks: 2.6, 8.4, 8.5, 8.9, 8.15.

#### Scenario: SC-SKL-18 Inspect the default UI baseline

- **WHEN** a buyer starts a clean template without customization
- **THEN** marketing, auth, product and admin shells use the documented brand
  tokens, navigation controls have consistent sizing, and success/loading/
  empty/error/denied states expose readable focus and disabled treatment

#### Scenario: SC-SKL-19 Customize shared presentation safely

- **WHEN** `customize-brand` or `customize-site` changes declared tokens or
  shared-shell presentation
- **THEN** the change is visible across supported shells with responsive and
  keyboard evidence, and protected auth/workspace/generation/billing/admin
  journeys still pass their semantic checks

### Requirement: REQ-SKL-03 Classify scope and preserve semantic contracts

Before editing, every modifying Skill SHALL inspect the release baseline, dirty work, intended outcome and protected contracts and record a scoped manifest. Authentication, memberships, billing/webhooks, credits, generation states, database and validation/export policies MUST be classified as dedicated engineering changes. Validation SHALL check semantic behavior and import/schema boundaries in addition to file paths. Imported resources MUST be adapted to actual integrations.

Trace: D28, D29, J2, T36, T37, T38, T43, G28, G29. Tasks: 8.6, 8.9, 8.15.

#### Scenario: SC-SKL-08 Reclassify a protected change

- **WHEN** a visual request or resulting diff changes a protected business contract
- **THEN** ordinary customization cannot claim completion; the change is moved into a scoped engineering/extension workflow with impact and verification requirements

#### Scenario: SC-SKL-09 Reject unsafe imported behavior

- **WHEN** an imported block contains a mock payment callback, alternate auth or unapproved dependency
- **THEN** the workflow adapts it to approved contracts or reports an out-of-scope dependency/change; it cannot silently replace real behavior

#### Scenario: SC-SKL-10 Catch behavior breakage outside protected paths

- **WHEN** a presentation-only diff breaks a required checkout, authorization or generation journey
- **THEN** semantic validation fails even when the file allowlist passes, and completion/export remains blocked

### Requirement: REQ-SKL-04 Trust validation independently of candidate edits

The supported validator SHALL execute from a pinned trusted release/worktree outside the candidate diff. Evidence SHALL bind the exact staged source, lockfile, contracts and relevant configuration digest to the validator/policy version and required results. Export and deployment MUST reject missing, failed or stale evidence. Candidate edits MUST NOT self-certify by changing checks. Legitimate policy changes require independent review against the prior trusted baseline and deliberate rebaselining; buyer-owned source is not claimed to be unmodifiable.

Trace: D16, D29, J2, J9, T39, T40, T54, T55, G16, G29. Tasks: 8.7, 8.8, 8.9, 8.15.

#### Scenario: SC-SKL-11 Reject a candidate validator bypass

- **WHEN** a candidate weakens validation rules, replaces expected outcomes or skips required checks
- **THEN** the trusted external validator rejects or reclassifies the policy change and cannot accept the candidate's self-issued passing result

#### Scenario: SC-SKL-12 Reject stale or missing evidence

- **WHEN** source, lockfile, contract or relevant configuration bytes change after successful validation, or evidence is missing/failed
- **THEN** the supplied exporter/deployer rejects the candidate until the required checks produce matching evidence for the exact staged digest

#### Scenario: SC-SKL-13 Review an intentional policy revision

- **WHEN** an engineering change legitimately needs a new validation policy
- **THEN** independent review against the previous trusted baseline records rationale, scope and evidence before deliberate rebaselining; an ordinary visual Skill cannot perform that approval itself

### Requirement: REQ-SKL-05 Preserve customer work during recovery

A modifying Skill SHALL report changed files, check results, remaining risks and a scoped recovery patch. The workflow MUST preserve unrelated pre-existing work and MUST resolve overlapping ownership before destructive rollback. It SHALL NOT use repository-wide reset as ordinary customization recovery.

Trace: D29, J2, J9, T41, T50, G29. Tasks: 8.10, 8.15.

#### Scenario: SC-SKL-14 Roll back only attributable changes

- **WHEN** a failed customization has unrelated pre-existing dirty files
- **THEN** recovery removes only the customization's attributable changes and preserves the unrelated files byte-for-byte

#### Scenario: SC-SKL-15 Handle overlapping dirty work

- **WHEN** a rollback would overwrite overlapping pre-existing edits
- **THEN** the workflow identifies the overlap and obtains a concrete merge/recovery resolution before destructive action rather than resetting the whole file or repository

### Requirement: REQ-SKL-06 Reuse licensed resources with provenance

The Skill package SHALL reuse selected shadcn guidance/components with pinned source revision or content hash, adaptation records and redistribution notices. Other open-source resources SHALL require file-level provenance/license suitability. Legacy concepts may be adapted, but legacy runtime contracts/history MUST NOT enter the customer runtime or release.

Trace: D09, D14, D16, D31, J2, J9, T36, T46, T52, T62, G09, G14, G16, G31. Tasks: 8.11, 9.2, 8.15.

#### Scenario: SC-SKL-16 Deliver traceable reused components

- **WHEN** approved upstream guidance or blocks are included in the release
- **THEN** the source revision/hash, license notice and project-specific adaptation are recorded; pinning only the shadcn CLI is insufficient to freeze fetched resources

#### Scenario: SC-SKL-17 Exclude unverified or legacy resources

- **WHEN** a resource has unclear redistribution rights or imports legacy agent/runtime dependencies
- **THEN** it is excluded until provenance and adaptation are resolved, and the exported app stays independent of the legacy generation runtime

