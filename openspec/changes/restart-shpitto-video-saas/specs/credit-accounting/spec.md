# Credit accounting

## Purpose

Maintain explainable workspace credit grants, immutable allocation lineage and single-effect settlement across concurrent submissions, expiry, cancellation, failed delivery and operator reconciliation, separately from currency charges.

## ADDED Requirements

### Requirement: REQ-CRD-01 Integer grants and immutable lineage

The credit domain SHALL keep integer nonnegative grant buckets whose issued total equals available plus reserved plus consumed plus expired plus voided. Every bucket change MUST have an immutable ledger explanation; allocations SHALL preserve original source, expiry and lineage. Currency charges and credit units MUST remain separate. All related grant, task, allocation and reservation ownership MUST agree on workspace.

Trace: D05, D11, D12; J3, J5, J6; T06, T07, T08, T60; G05, G11, G12. Tasks: 3.9.

#### Scenario: SC-CRD-01 Every balance projection reconciles

- **WHEN** a grant is issued, reserved, consumed, expired or reversed
- **THEN** its bucket equality and nonnegativity hold and persisted immutable entries explain the complete change

#### Scenario: SC-CRD-02 Tenant lineage cannot cross workspaces

- **WHEN** a reservation or asset/task relationship references a grant belonging to another workspace
- **THEN** the write is rejected and no partial ledger, balance or task mutation remains

### Requirement: REQ-CRD-02 Atomic reservation with server-authoritative quotes

Generation acceptance SHALL derive its immutable credit quote from a versioned enabled server catalog, authorize the input and reserve funds together with task creation, command result and dispatch intent. Concurrent requests MUST NOT overspend. A stale or disabled model/catalog MUST require refresh. Transaction retries MUST be bounded to three attempts and MUST NOT perform a provider call before commit.

Trace: D05, D12, D20; J3, J5; T06, T09, T12; G05, G12, G20. Tasks: 3.10, 4.1.

#### Scenario: SC-CRD-03 Concurrent reservations cannot exceed funds

- **WHEN** two concurrent requests each require more than half the same workspace's spendable balance
- **THEN** only affordable reservations commit and failed requests leave no task, debit or dispatch side effect

#### Scenario: SC-CRD-04 Client price and stale catalog do not bind the ledger

- **WHEN** a client changes a displayed price or submits a model disabled since its quote
- **THEN** the server ignores untrusted price input, rejects stale/disabled acceptance and performs no provider call or partial reservation

### Requirement: REQ-CRD-03 Earliest-expiry spending and reservation protection

Reservations SHALL allocate only currently eligible grants by earliest expiry, then creation time and ID, with nonexpiring purchases last. Unreserved expired amounts MUST be unavailable even before an expiry sweep runs. An in-flight reservation SHALL retain its original allocation when its grant expires, and accepted quotes MUST NOT change after plan/catalog edits.

Trace: D12; J3, J5, J6; T07, T08; G12. Tasks: 3.10, 3.11.

#### Scenario: SC-CRD-05 Deterministic FEFO preserves permanent purchases

- **WHEN** a request is funded from valid subscription, compensation and permanent purchase grants
- **THEN** eligible expiring grants are allocated first using deterministic ties and each allocation retains its source terms

#### Scenario: SC-CRD-06 Expiry does not discard a reservation

- **WHEN** a subscription grant expires while some credits are reserved and its expiry sweep is delayed
- **THEN** unused amounts are excluded from new spending while existing reserved amounts remain available only for their task's terminal settlement

### Requirement: REQ-CRD-04 Domain idempotency and transactional evidence

Repeated semantic business commands SHALL return their committed result without duplicate task, grant, reservation or ledger effects, independently of queue/webhook deduplication windows. Reusing a key with a different semantic payload MUST return conflict. Required domain state, ledger, command result, audit and outbox effects SHALL commit together or roll back together.

Trace: D12, D20, D22, D31; J3, J4, J7; T09, T12, T60, T61; G12, G20, G22, G31. Tasks: 3.8, 3.9, 4.10.

#### Scenario: SC-CRD-07 Replay after external deduplication expires

- **WHEN** a previously committed command is delivered again after a queue deduplication window has expired
- **THEN** the stored domain result is returned with no second reservation or credit effect, while mismatched payload reuse is rejected

#### Scenario: SC-CRD-08 Audit failure rolls back the privileged mutation

- **WHEN** a required audit or outbox write fails during a privileged credit command
- **THEN** the entire mutation, ledger and command result roll back rather than recording an unaudited successful adjustment

### Requirement: REQ-CRD-05 Cancellation and successful-delivery settlement

A pre-dispatch cancellation SHALL release its held allocations exactly once, restoring still-valid amounts and expiring amounts whose original terms elapsed; cancellation MUST NOT create failure compensation. Successful settlement SHALL consume reservations only after verified durable usable output exists. Cancellation, delivery and failure MUST share one terminal credit boundary.

Trace: D13, D20; J3, J4; T09, T10, T13, T14, T19; G13, G20. Tasks: 4.2, 4.8.

#### Scenario: SC-CRD-09 Cancelled expired allocation is not compensation

- **WHEN** a queued task is cancelled after an allocated subscription grant expires but before dispatch claim
- **THEN** valid allocations are restored, expired allocations remain expired and no seven-day compensation grant is issued

#### Scenario: SC-CRD-10 Only durable delivery consumes

- **WHEN** a provider reports success but the durable asset is missing or invalid, followed by repeated delivery observations
- **THEN** the held credits are not consumed until validated durable delivery, and consumption occurs at most once

### Requirement: REQ-CRD-06 Full failed-delivery refund under original terms

A terminal generation failure without usable delivered video SHALL refund every allocated credit under its source/expiry terms, including a bounded unrecoverable-delivery disposition. Valid subscription and compensation amounts keep their expiry, purchases remain permanent, and upstream currency cost MUST be retained separately without reducing the credit refund. Mixed allocations SHALL be settled individually.

Trace: D20, D21; J4, J6; T15, T18, T53; G20, G21. Tasks: 3.11, 4.3.

#### Scenario: SC-CRD-11 Provider charge does not reduce a failure refund

- **WHEN** a provider incurred a currency charge but the task reaches terminal failure without usable delivery
- **THEN** all allocations follow the full refund rules and upstream cost is recorded as separate known/unknown evidence

#### Scenario: SC-CRD-12 Mixed-source failure preserves each source

- **WHEN** a failed task used expired subscription, valid subscription, valid compensation and purchased credits
- **THEN** only expired subscription allocations generate their permitted compensation; other amounts retain their original expiry or permanence

### Requirement: REQ-CRD-07 One nonrenewing seven-day compensation period

Failure settlement of an expired subscription allocation SHALL create at most one compensation grant for that allocation, expiring exactly seven days after refund time and linked to original lineage. Refunding that compensation later MUST retain its original expiry. Already expired compensation MUST NOT become spendable again or create another extension.

Trace: D21; J6; T16, T17, T18, T53; G21. Tasks: 3.11, 4.3.

#### Scenario: SC-CRD-13 Exactly one seven-day compensation grant

- **WHEN** a task fails with 100 expired subscription credits and its failure event repeats
- **THEN** exactly 100 compensation credits are issued once with expiry refund_time plus seven days and origin allocation retained

#### Scenario: SC-CRD-14 Compensation cannot renew through another failure

- **WHEN** a compensation-funded task fails before or after that compensation's original expiry
- **THEN** its refund preserves the same expiry; an already expired amount remains expired and no new compensation period starts

### Requirement: REQ-CRD-08 Explainable balances and safe reconciliation

The application SHALL show available, reserved, source and expiry information with allocation/ledger lineage. Reconciliation SHALL report ledger/projection discrepancies and hold affected commands rather than silently rewriting history. Authorized corrections MUST use new grants or compensating ledger entries and may revoke only available unreserved amounts; larger recovery cases MUST preserve active settlement.

Trace: D12, D20, D22; J5, J6, J7; T07, T08, T49, T61; G12, G20, G22. Tasks: 3.11, 4.11.

#### Scenario: SC-CRD-15 User can explain a mixed refund

- **WHEN** a user inspects credits after mixed-source failure or expiry
- **THEN** the displayed amounts, source lineage and expiry distinguish returned spendable credits from expired compensation instead of describing all refunds as permanently available

#### Scenario: SC-CRD-16 Mismatch never silently repairs history

- **WHEN** reconciliation finds a grant projection inconsistent with immutable ledger entries
- **THEN** the mismatch is visible, affected commands are held and any repair requires an authorized compensating operation rather than editing past entries
