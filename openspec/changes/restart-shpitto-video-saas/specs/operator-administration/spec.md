# operator-administration

## Purpose

Separately authorized operator administration with auditable domain commands, truthful recovery views and an independently deliverable open-source presentation foundation.

## ADDED Requirements

### Requirement: REQ-OPS-01 Separate current global authority

Every admin entrypoint SHALL authenticate the current Better Auth session and recheck the current separate global support/operator/superadmin role on the server. Workspace ownership SHALL confer no global privilege. Support SHALL receive redacted reads only; operator/superadmin tenant support access SHALL require a recorded purpose and target, without impersonating a customer session. Role revocation SHALL take effect on the next request.

Trace: D05, D22, D31, J7, T02, T03, T04, T59, G05, G22, G31. Tasks: 7.1, 7.2.

#### Scenario: SC-OPS-01 Direct endpoint authorization

- **WHEN** a workspace owner or unprivileged user opens an admin route or invokes its API directly
- **THEN** the server denies access independently of hidden client controls, and a support role cannot invoke an operator mutation

#### Scenario: SC-OPS-02 Revocation and tenant access

- **WHEN** an active operator role is revoked or an operator opens tenant support detail
- **THEN** the next privileged request is denied after revocation; permitted tenant support access records its actor, purpose and target without creating an impersonated user session

### Requirement: REQ-OPS-02 Policy-controlled privileged sessions and one-time owner initialization

Operator sessions SHALL require verified email only while email-verification enforcement is enabled and SHALL require completed second-factor authentication only while operator 2FA enforcement is enabled. While 2FA enforcement is enabled, privileged commands SHALL additionally require the same live session's trusted server-recorded successful second-factor step-up within ten minutes. Only a superadmin SHALL grant or revoke global roles with a reason and the currently configured authentication policy. All role mutations and account disablement SHALL share an atomic guard preserving at least one active administrative owner with the superadmin role; a disabled account SHALL NOT bypass restrictions through a retained role.

A fresh installation SHALL persist an open one-time owner-claim state before registration. A successful email/password signup or login SHALL submit only the user identity returned by that successful credential response to one serialized server-side claim; exactly that persisted credential account may be appointed Superadmin in the same transaction as claim closure and audit. Failed authentication, duplicate signup, client-supplied user IDs, and client-supplied roles SHALL NOT claim or alter ownership. The client SHALL NOT choose or submit the role. Disabled SMTP, email verification, 2FA and Turnstile SHALL NOT block this initial claim or password-authenticated admin access. Once ownership is initialized, signup replay, later signup, process restart and concurrent registration SHALL NOT reopen or duplicate the claim. An installation that already contains any user when this capability is introduced SHALL keep automatic claiming closed and SHALL use the audited server bootstrap. Lost-credential recovery SHALL follow a separate documented, audited out-of-band procedure requiring independently verified administrative server access, never a public bootstrap bypass.

Trace: D22, D31, J7, T04, T59, T60, T61, G22, G31. Tasks: 7.1, 7.3, 7.4.

#### Scenario: SC-OPS-03 Step-up freshness and session binding

- **WHEN** a privileged command has expired step-up, a stamp from another session, or merely an enabled second-factor setting
- **THEN** the command fails without a business effect; a verified step-up for the current live session within ten minutes may authorize only the caller's current command permission

#### Scenario: SC-OPS-04 Bootstrap and final superadmin

- **WHEN** a signup body requests a global role, server bootstrap is rerun after initialization, or concurrent role edits would remove the final superadmin
- **THEN** the system ignores or rejects client-selected privilege, rejects repeated bootstrap, and preserves a valid administrative recovery owner with audited authorized role changes

#### Scenario: SC-OPS-14 Active administrative owner survives concurrent disablement

- **WHEN** role removal/demotion races with account disablement across the remaining active superadmins, or the sole active superadmin is targeted for disablement
- **THEN** a shared atomic guard rejects any result leaving no active administrative owner; an independently authenticated, audited out-of-band recovery procedure handles lost credentials without making public signup or the disabled bootstrap privileged

#### Scenario: SC-OPS-15 Fresh-install first owner claim

- **WHEN** two email/password registrations race on a fresh installation whose owner claim is open, with SMTP, email verification and operator 2FA disabled
- **THEN** exactly one successful password account wins the serialized claim, receives one active superadmin role and one audit record, can enter administration with its password session, and every other registration remains unprivileged

#### Scenario: SC-OPS-16 Claim replay, restart and upgrade safety

- **WHEN** signup is duplicated, authentication fails, registration is retried after the first claim, the application restarts, or an existing installation with users applies the claim-state migration
- **THEN** failed or repeated requests do not assign a role or consume an open claim; after initialization later registrations receive no global role, and an uninitialized upgraded installation can be initialized only through the audited server bootstrap

### Requirement: REQ-OPS-03 Operational projections with clear evidence

The backend SHALL expose authorized, paginated and redacted views of users/workspaces, memberships/status, subscriptions/orders, grants/ledger, tasks/assets, models/configuration health, provider cost evidence, webhook deliveries and audits. Filter/sort fields SHALL be allowlisted. It SHALL label cost as unknown, estimated or confirmed, retain correlation identifiers, and exclude credentials and raw sensitive payloads.

Trace: D20, D22, D31, J7, T04, T49, T59, G20, G22, G31. Tasks: 7.2, 7.5.

#### Scenario: SC-OPS-05 Trace an operational failure

- **WHEN** an authorized operator follows a failed task or billing delivery through its workspace, task, attempt and event references
- **THEN** the views expose matching status, bounded failure detail, recovery/audit references and cost evidence without secrets, signed URLs or misleading zero-cost assumptions

#### Scenario: SC-OPS-06 Unapproved query fields

- **WHEN** a client supplies an unapproved filter/sort field or attempts an unbounded admin query
- **THEN** the API rejects or bounds the request under the published query contract without exposing hidden fields or executing arbitrary column expressions

### Requirement: REQ-OPS-04 Named commands with atomic audit

Protected operational changes SHALL use named domain commands with permission, current step-up, reason, expected version and semantic idempotency. Domain effects, any ledger entries, command result and successful audit SHALL commit together; external intent SHALL enter a durable outbox. Historical ledger rows and task/order entitlements SHALL NOT be writable through generic CRUD even by superadmins. Reusing a command key with different semantics SHALL fail.

Trace: D22, D31, J7, T04, T60, T61, G22, G31. Tasks: 7.3, 7.4.

#### Scenario: SC-OPS-07 Duplicate command and stale version

- **WHEN** a privileged command is repeated, its key is reused with a different body, or its expected version is stale
- **THEN** an identical authorized retry returns the recorded effect once; conflicting semantics or stale versions fail without another adjustment

#### Scenario: SC-OPS-08 Audit or ledger failure

- **WHEN** a required ledger, command-result, audit or outbox write fails while executing an admin change
- **THEN** no partial business success is committed; authorization failures are security events, and later external completion or failure appends separate auditable evidence

#### Scenario: SC-OPS-09 Generic CRUD bypass

- **WHEN** an admin client calls generic create/update/delete for protected ledger, task, order, subscription or workspace-authorization data
- **THEN** both the UI adapter and server reject the unsupported operation and expose only named commands preserving domain invariants

### Requirement: REQ-OPS-05 Controlled recovery and suspension

Operator recovery SHALL preserve terminal credit/task outcomes, use existing business keys for safe replay and never blindly repeat paid submission. A disabled user SHALL lose login, sessions and actions without suspending other workspace members. A suspended workspace SHALL deny member reads, downloads and actions while allowing audited admin reads and settlement of active workers. A billing hold SHALL block new generation and new Checkout while preserving history, downloads, invitations, billing portal and support access under normal permissions; active workers SHALL settle.

Trace: D05, D20, D22, J4, J7, T03, T04, T12, T19, T49, T53, G05, G20, G22. Tasks: 7.4, 7.5.

#### Scenario: SC-OPS-10 Recovery preserves terminal state

- **WHEN** an operator replays a failed delivery or examines an uncertain submission or late provider result
- **THEN** safe reconciliation/ingestion uses the original identity, cannot create another paid submission, and cannot silently reopen, recharge or refund a settled task

#### Scenario: SC-OPS-11 User and workspace suspension matrix

- **WHEN** a user is disabled or a workspace is suspended while sessions and jobs exist
- **THEN** disabled-user access is rejected without disabling others; workspace suspension rejects member resource access while audited admin reads and active-worker settlement remain possible

#### Scenario: SC-OPS-12 Billing hold access matrix

- **WHEN** a workspace enters a billing recovery hold
- **THEN** new generation and Checkout are denied while normally authorized history, downloads, invitations, portal and support remain available, and existing reservations still reach their proper outcome

### Requirement: REQ-OPS-06 Reusable admin foundation without competing authority

The selected React-admin OSS foundation SHALL provide presentation through the existing session and domain query/command contracts, without creating another authentication owner, schema/migration owner, hosted CMS requirement or seller-owned runtime dependency. The customer-delivered admin SHALL work in the supported local, managed and Docker profiles with approved redistribution notices.

Trace: D15, D18, D22, D31, J1, J7, J9, T59, T60, T61, T62, G15, G18, G22, G31. Tasks: 7.2, 7.14, 9.2, 9.4, 9.5, 9.6, 9.15.

Evidence staging: M6 tasks 7.2/7.14 verify the selected local admin adapter, session/domain authority and notices only. M8 tasks 9.5/9.6 prepare deploy assets before the final candidate freezes at 9.3; full SC-OPS-13/T62 clean-customer local, managed and Docker evidence belongs to 9.4/9.14 and gate 9.15 against that candidate. M6 cannot mark the release-profile scenario fully passed.

#### Scenario: SC-OPS-13 Independent admin delivery

- **WHEN** the selected admin is exercised in a clean customer build with the declared profiles
- **THEN** the same Better Auth identity and single Drizzle migration authority apply, required OSS notices are present, and no seller CMS/account is required to authorize local operations
