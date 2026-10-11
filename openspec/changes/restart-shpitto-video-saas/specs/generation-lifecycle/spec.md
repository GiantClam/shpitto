# Generation lifecycle and assets

## Purpose

Provide durable, tenant-authorized video generation whose dispatch, cancellation, output ownership and financial outcome remain correct across crashes, uncertain provider submissions, missing jobs and delayed or conflicting events.

## ADDED Requirements

### Requirement: REQ-GEN-01 Persistent local end-to-end generation

The no-cloud profile SHALL use the same durable domain behavior as production with persistent authentication, workspaces, credit history, tasks and owned local assets. A scripted Mock provider SHALL support success, failure, delay, ambiguous submission and duplicate/out-of-order observations. Process restart MUST NOT discard accepted work. Demo behavior MUST be labeled and MUST NOT satisfy real-provider or payment gates.

Trace: D18, D15; J1, J3, J4; T01, T12; G18, G15. Tasks: 4.4, 4.5, 4.12.

#### Scenario: SC-GEN-01 Local journey survives a restart

- **WHEN** a buyer without cloud keys signs in, generates a Mock video and restarts web and worker processes
- **THEN** task, credits and asset persist and the authorized video remains downloadable

#### Scenario: SC-GEN-02 Mock faults exercise real domain transitions

- **WHEN** the Mock fixture delays, fails or repeats an observation across worker restart
- **THEN** the durable domain performs the same recovery and idempotency rules as a real adapter without claiming real-provider evidence

### Requirement: REQ-GEN-02 Atomic cancellation versus paid dispatch

A queued task SHALL remain cancellable only until its first durable dispatch claim. Claim and cancellation MUST compete through the same atomic boundary. Once dispatching is recorded, cancellation SHALL be denied even before network transmission. Repeated claim or expired execution lease MUST NOT confer another paid submission right.

Trace: D13, D20; J3, J4; T10, T11, T12; G13, G20. Tasks: 4.2, 4.6.

#### Scenario: SC-GEN-03 Cancel wins the dispatch race

- **WHEN** cancellation commits before any dispatch claim
- **THEN** the task becomes cancelled, its reservation releases once and no provider submission occurs

#### Scenario: SC-GEN-04 Dispatch wins before network transmission

- **WHEN** dispatch claim commits and cancellation arrives before the worker sends its HTTP request
- **THEN** cancellation returns a state conflict and the persisted attempt remains the only initial submission attempt

### Requirement: REQ-GEN-03 Monotonic task state and usable-delivery success

Tasks SHALL follow guarded transitions among queued, dispatching, submission_unknown, submitted, running, materializing and terminal succeeded/failed/cancelled states. A queue completion signal MUST NOT substitute for a valid provider result. Success MUST require a usable private durable output plus ready asset metadata. Failure settlement SHALL follow the credit accounting contract.

Trace: D03, D20; J3, J4; T13, T14, T20; G03, G20. Tasks: 4.1, 4.3, 4.8.

#### Scenario: SC-GEN-05 Queue completion with error is not success

- **WHEN** an adapter observes a completed queue entry whose result contains an error or no usable output
- **THEN** the task does not succeed or consume its reservation and enters the appropriate recovery or failure path

#### Scenario: SC-GEN-06 Owned asset is the success boundary

- **WHEN** provider output exists but object ingestion or validation is incomplete
- **THEN** the task remains materializing until the durable owned object and matching ready record exist, then settles success once

### Requirement: REQ-GEN-04 Ambiguous submission receives bounded recovery without blind retries

A timeout, lost response or crash after dispatch claim SHALL preserve an uncertain attempt and MUST NOT cause automatic paid resubmission. Submit timeout SHALL be 30 seconds. Unknown reconciliation SHALL end within 60 minutes from dispatch and at most 24 probes, with an operator alert at 30 minutes. Exact authenticated request/callback evidence may resolve it; prompt/time similarity MUST NOT. Exhaustion SHALL cause audited unrecoverable-delivery failure and full source-aware refund even if upstream cost remains unknown.

Trace: D13, D20, D21; J4, J6; T11, T12, T20, T53; G13, G20, G21. Tasks: 4.6, 5.4.

#### Scenario: SC-GEN-07 Lost response never triggers a second paid create

- **WHEN** the provider may have received the request but no trusted request ID returns
- **THEN** the original attempt is marked unknown, only safe recovery runs and no second paid create is automatically sent

#### Scenario: SC-GEN-08 Untraceable outcome releases credits on time

- **WHEN** neither exact provider ID nor a valid correlated callback is recoverable before the unknown budget expires
- **THEN** the task fails as unrecoverable, refunds once with applicable seven-day compensation and retains unknown provider cost for operators

### Requirement: REQ-GEN-05 Independent deadline sweep

Every nonterminal task SHALL carry immutable accepted recovery budgets, due-action and deadline records. Queued dispatch SHALL expire after ten minutes; known execution after sixty minutes from dispatch; materialization after thirty minutes from first authenticated success, at most eight attempts and no later than dispatch plus ninety minutes. Recovery SHALL scan task state independently of the original job every minute in production and every ten seconds locally. Retries MUST NOT reset deadlines. After total database/runner outage, overdue settlement MUST precede further state advancement; availability during that outage is not promised.

Trace: D18, D20; J3, J4; T12, T14, T20, T49, T53, T12.a; G18, G20, G22. Tasks: 4.7, 5.6.

#### Scenario: SC-GEN-09 Lost job does not strand reservation

- **WHEN** the original job is missing, dead-lettered or has exhausted retries while a task remains nonterminal
- **THEN** an independent task scan resumes only safe work or terminates overdue work with the normal single refund, without relying on the lost job

#### Scenario: SC-GEN-10 Deadline and success share one winner

- **WHEN** success finalization and deadline failure race, or the service returns after deadlines passed
- **THEN** only one matching active-version terminal transition commits; overdue tasks are settled before late progress and retries do not extend their accepted budgets

### Requirement: REQ-GEN-06 Durable inbox/outbox with fenced ownership

Committed work SHALL survive scheduling failure through durable outbox records, and authenticated observations SHALL survive processing failure through a deduplicated inbox. Worker leases SHALL expire after sixty seconds with twenty-second heartbeats and exact owner/token/generation fencing. Stale workers MUST NOT acknowledge or overwrite a newer lease. Reclaiming dispatching/unknown work SHALL reconcile the existing attempt, never acquire a new paid-create right.

Trace: D15, D18, D20; J3, J4; T09, T12, T19, T20, T12.b; G15, G18, G20. Tasks: 4.5, 4.10, 5.5.

#### Scenario: SC-GEN-11 Scheduling and processing crashes recover

- **WHEN** the process stops after domain commit but before scheduling, or after inbox acceptance but before processing
- **THEN** later workers resume the committed record and duplicate delivery has no duplicate business effect

#### Scenario: SC-GEN-12 Stale worker cannot acknowledge new lease

- **WHEN** worker A loses its lease, worker B acquires a higher generation and A later acknowledges or writes progress
- **THEN** A's stale owner/token/generation operation is rejected and B's lease/state remains intact

### Requirement: REQ-GEN-07 Terminal outcomes are immutable to late observations

Late or conflicting provider outcomes for a terminal task SHALL be quarantined as evidence for authorized operator review. They MUST NOT reopen the task, resubmit paid work, silently recharge the workspace or issue another refund. Safe recovery actions MUST use the same terminal guards and audit contracts.

Trace: D20, D21, D22; J4, J6, J7; T19, T49, T53; G20, G21, G22. Tasks: 4.3, 4.10, 5.4.

#### Scenario: SC-GEN-13 Late success after refund is quarantined

- **WHEN** a provider succeeds after the task was failed and its credits refunded
- **THEN** result evidence is quarantined, the failed outcome remains unchanged and no new debit/refund or automatic resubmission occurs

#### Scenario: SC-GEN-14 Conflicting duplicate cannot bypass terminal guard

- **WHEN** an operator recovery command or duplicate callback attempts an incompatible terminal update
- **THEN** the recorded terminal result is retained and conflict is visible without mutating its financial outcome

### Requirement: REQ-GEN-08 Authorized safe input and output materialization

Generation SHALL accept only ready owned input assets, not arbitrary browser URLs or provider parameters. Images SHALL be JPEG/PNG/WebP up to 20 MiB and 4096 by 4096 pixels or tighter model limits, checked by actual decoding. Output ingestion SHALL accept validated HTTPS provider locations, revalidate redirects and DNS, block private/link-local addresses and URL credentials, stream at most 250 MiB, and enforce bounded media validation. Unsafe or invalid data MUST NOT become a ready asset.

Trace: D03, D05, D20; J3, J4; T02, T13, T14; G03, G05, G20. Tasks: 4.8, 5.7.

#### Scenario: SC-GEN-15 Reject unsafe inputs and output locations

- **WHEN** an input has spoofed MIME, excessive decoded dimensions or foreign ownership, or a result URL redirects into a private network
- **THEN** validation rejects it without unauthorized fetch/delivery and the task follows its defined recovery/failure policy

#### Scenario: SC-GEN-16 Object and metadata finalization are recoverable

- **WHEN** an output copy is interrupted or object upload completes before its database finalization fails
- **THEN** no premature success is shown; safe retry verifies deterministic object identity/integrity and finalizes once or collects the orphan under the retention policy

### Requirement: REQ-GEN-09 Private downloads and bounded asset lifecycle

Ready outputs SHALL be private and require current workspace authorization before issuing a sixty-second download URL. Provider input URLs SHALL have separate bounded validity, initially two hours. Local paths MUST remain inside the configured volume and reject traversal/symlinks. Incomplete uploads expire after one hour; orphan cleanup waits twenty-four hours. Ready outputs remain until authorized deletion subject to published storage policy; active-task input deletion MUST be rejected. An owner or recorded asset creator may request deletion.

Trace: D05, D18, D20; J1, J3, J7; T01, T02, T03, T14; G05, G18, G20. Tasks: 4.9, 5.7.

#### Scenario: SC-GEN-17 Private download is authorized at issuance

- **WHEN** a current member requests a ready asset, then is removed before requesting another download link
- **THEN** the original link expires within sixty seconds and the second request is denied; raw permanent storage credentials are never exposed

#### Scenario: SC-GEN-18 Deletion and cleanup preserve active references

- **WHEN** an owner/creator requests deletion of an input used by an active task or cleanup sees a recent orphan
- **THEN** active input deletion is rejected and recent orphans wait the twenty-four-hour recovery window rather than breaking in-flight work

### Requirement: REQ-GEN-10 Truthful progress and actionable recovery evidence

Task UI SHALL rehydrate persisted state, distinguish unknown/materializing/failed/delivered outcomes and stop polling terminal tasks. Operational evidence SHALL correlate workspace, task, attempt, event, command and release without secrets or signed URLs. Unknown age, worker heartbeat, outbox delay and ledger mismatch SHALL be observable. Recovery tooling MUST invoke authorized domain commands and MUST NOT directly alter balances or task status.

Trace: D18, D20, D22; J3, J4, J7; T01, T20, T49; G18, G20, G22. Tasks: 4.11, 5.8, 5.9.

#### Scenario: SC-GEN-19 Progress reflects domain state after navigation

- **WHEN** a user reloads or returns to an active task whose runner has timed out
- **THEN** the UI displays persisted recovery state rather than treating runner timeout as successful or failed delivery

#### Scenario: SC-GEN-20 Recovery drill remains correlated and secret-free

- **WHEN** a queued job stalls, unknown submission ages or the sweep heartbeat exceeds three minutes
- **THEN** operators receive correlated actionable evidence and a domain-command recovery path without secrets, duplicate spend or direct state editing
