# Identity and workspaces

## Purpose

Provide persistent authentication and a single workspace authorization authority so each buyer can operate personal and team accounts without exposing another workspace's records or confusing owners with global operators.

## ADDED Requirements

### Requirement: REQ-IAM-01 Persistent authentication and recoverable onboarding

The application SHALL persist account/session state and idempotently establish one personal workspace for each authenticated account. Account creation and incomplete workspace setup MUST remain distinguishable so failed onboarding can be retried without duplicate workspaces or demo grants. Production MUST NOT issue local demo grants.

Trace: D05, D18; J1, J7; T01, T05; G05, G18. Tasks: 3.2, 3.10, 3.12.

#### Scenario: SC-IAM-01 Restart preserves account and workspace

- **WHEN** a user signs in, completes setup and restarts the local application
- **THEN** the same account and personal workspace remain available without cloud credentials or repeated setup grants

#### Scenario: SC-IAM-02 Interrupted setup is retryable

- **WHEN** workspace setup fails after account creation and two setup retries arrive
- **THEN** the user can resume setup and exactly one personal workspace and at most one permitted demo grant are committed

### Requirement: REQ-IAM-02 Personal and team ownership boundaries

The application SHALL distinguish personal and team workspaces. A personal workspace MUST retain its creator as its sole immutable owner and MUST reject invitations, owner transfer, leaving, removal or demotion. Team owners SHALL manage invitations and members; ownership transfer MUST target an existing active verified member and require recent authentication. Concurrent membership changes MUST never remove the team's last owner. Creating a team MUST atomically initialize exactly one zero-balance credit account without issuing a credit grant. These personal-workspace and transfer restrictions are selected engineering defaults completing the minimal role contract.

Trace: D05; J7; T05, T05.a; G05. Tasks: 3.3, 3.5, 4.13.

#### Scenario: SC-IAM-03 Personal workspace rejects team operations

- **WHEN** a personal owner attempts to invite another user, transfer ownership or leave their personal workspace
- **THEN** the operation is rejected and the UI directs collaboration to a separate team workspace without altering personal ownership

#### Scenario: SC-IAM-04 Concurrent last-owner protection

- **WHEN** two requests concurrently attempt to remove or demote the remaining team owner or transfer to an ineligible target
- **THEN** the application serializes the ownership decision, rejects any ownerless or ineligible outcome and retains an authorized owner

### Requirement: REQ-IAM-03 Bound single-use invitations

Team invitations SHALL use unpredictable single-use tokens stored as hashes, expire after seven days and bind acceptance to the normalized invited email on a verified account. Only a current team owner may create an invitation, and duplicate/replayed acceptance MUST NOT duplicate membership. Invitation delivery SHALL be recoverable from the committed invitation.

Trace: D05, D15; J7; T05; G05, G15. Tasks: 3.4, 4.13.

#### Scenario: SC-IAM-05 Accept invitation exactly once

- **WHEN** the verified invited user accepts the same valid token repeatedly or concurrently
- **THEN** one membership is created and repeated acceptance has no additional membership or privilege effect

#### Scenario: SC-IAM-06 Reject expired or mismatched invitation

- **WHEN** an expired invitation or a token belonging to another email is presented
- **THEN** acceptance is denied without leaking the team's private records or creating membership

### Requirement: REQ-IAM-04 Current workspace authorization on every private entrypoint

Every private query and mutation SHALL check current workspace membership and the resource's workspace. Task, credit, billing, asset and download access MUST NOT trust client workspace selection, cached roles or unguessable IDs. Inaccessible tenant resources SHALL return a non-disclosing response. Removal MUST affect subsequent requests even when the session remains valid; a previously issued signed download URL may remain usable only until its bounded expiry.

Trace: D05; J3, J5, J7; T02, T03; G05. Tasks: 3.5, 4.9, 4.13.

#### Scenario: SC-IAM-07 Cross-workspace IDs do not grant access

- **WHEN** a member of W1 sends W2 task, asset, download, credit or billing identifiers
- **THEN** the server rejects access without W2 records, balances or signed URLs in the response

#### Scenario: SC-IAM-08 Removal takes effect during an active session

- **WHEN** a team owner removes a member who holds a still-valid session
- **THEN** their subsequent workspace requests fail and no new download URL is issued, while previously issued URLs expire within their stated bound

### Requirement: REQ-IAM-05 Separate global operator authority

Global operations SHALL require an explicitly assigned support/operator/superadmin role independent of workspace ownership. Every operator request MUST recheck current authority; privileged commands MUST also require trusted successful second-factor verification for the same live session within ten minutes. Merely enabling 2FA MUST NOT count as step-up verification. These authentication controls SHALL be shared with the operator capability without creating a second identity store.

Trace: D22, D31; J7; T04, T59; G22, G31. Tasks: 3.6.

#### Scenario: SC-IAM-09 Workspace ownership is not global administration

- **WHEN** a workspace owner requests an admin route or an operator's role is revoked during their session
- **THEN** the server denies the unauthorized or revoked request regardless of visible buttons or cached client permissions

#### Scenario: SC-IAM-10 Step-up binds user and live session

- **WHEN** a privileged command carries only an enabled-2FA flag, a different-session stamp or a stamp older than ten minutes
- **THEN** the command is denied until that live session completes trusted second-factor verification

### Requirement: REQ-IAM-06 Explicit disabled-account and workspace-hold effects

As selected engineering defaults, a disabled account SHALL be denied interactive login and all current-session actions without suspending other members' workspace access. A suspended workspace SHALL deny member reads, downloads and new actions while permitting authorized audited operator reads and continuing in-flight worker delivery/settlement. A billing hold SHALL block new generation and new Checkout while preserving authorized history, downloads, invitations, Portal, support and active task settlement. No suspension or hold may silently release, consume or erase credits.

Trace: D05, D20, D22; J4, J5, J7; T03, T04, T23, T59, T59.a; G05, G20, G22. Tasks: 3.7.

#### Scenario: SC-IAM-11 Disable one account without harming other members

- **WHEN** one account is disabled while other members share its team and tasks are running
- **THEN** the disabled user's login and session actions fail, other authorized members retain access and in-flight task settlement continues

#### Scenario: SC-IAM-12 Suspension and billing hold have different effects

- **WHEN** a workspace is suspended or receives a billing hold during an in-flight generation
- **THEN** suspension denies member reads/downloads/actions, billing hold preserves allowed read/support/Portal/invitation actions but blocks new generation/Checkout, and both preserve worker settlement and financial history

### Requirement: REQ-IAM-07 Session API validation and safe data contracts

The V1 application SHALL expose its private interfaces through authenticated sessions with validated DTOs and same-origin/CSRF protection for mutations. It MUST NOT advertise customer generation API keys or a public generation API. Business-command idempotency keys SHALL be bounded and semantic; protected data MUST NOT be browser-imported. Credit and currency quantities SHALL be decimal strings in JSON, with currency carried separately and safe errors without raw secrets.

Trace: D05, D08, D15; J3, J5, J7, J10; T02, T09, T57; G05, G08, G15. Tasks: 3.8.

#### Scenario: SC-IAM-13 Reject unauthenticated or forged-origin mutations

- **WHEN** an unauthenticated request or a request failing the same-origin/CSRF contract attempts a protected mutation
- **THEN** the operation has no business effect and returns the safe authentication/authorization error

#### Scenario: SC-IAM-14 Validate quantities and API product boundary

- **WHEN** an internal API serializes a large credit balance or a developer inspects the available API surface
- **THEN** the exact quantity is returned as a decimal string and documented session interfaces do not expose a nonfunctional public API-key feature
