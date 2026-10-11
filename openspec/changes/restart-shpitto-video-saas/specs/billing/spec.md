# billing

## Purpose

Workspace billing, canonical payment reconciliation, credit purchase entitlement and recoverable cash events for the independently operated video SaaS.

## ADDED Requirements

### Requirement: REQ-BIL-01 Workspace-owned checkout and subscription exclusivity

The system SHALL allow only a current workspace owner to open a Checkout or billing portal for an approved server-bound catalog product and that workspace. V1 SHALL expose monthly subscriptions with one nonterminal recurring subscription or unresolved recurring Checkout per workspace, and permanent credit packs. Client-supplied prices, customers, workspace substitutions, annual plans, scheduled plan changes and immediate proration SHALL NOT create unsupported entitlements.

Trace: D05, D11, J5, T21, T23, T24, G05, G11. Tasks: 6.1, 6.2.

#### Scenario: SC-BIL-01 Owner and catalog binding

- **WHEN** a member, former owner or owner supplying another workspace/customer/price attempts Checkout or portal access
- **THEN** the request is rejected without creating a payment session; an authorized owner's approved request returns a session bound to the intended workspace and an allowlisted return destination

#### Scenario: SC-BIL-02 Concurrent checkout and lost response

- **WHEN** two recurring Checkout requests race, or a committed attempt receives no Stripe response
- **THEN** at most one unresolved recurring Checkout slot remains active; retry reconciles the same persisted attempt and Stripe idempotency identity, and only authoritative expiry, cancellation or payment resolution releases the slot

#### Scenario: SC-BIL-03 Unexpected external subscription

- **WHEN** a Stripe dashboard action creates a second subscription or unsupported invoice/plan structure
- **THEN** automatic entitlement guessing stops, billing enters an auditable recovery hold, and the operator can resolve the external exposure through an explicitly authorized process

### Requirement: REQ-BIL-02 Authenticated durable payment observations

The system SHALL verify Stripe webhook authenticity against the unmodified request body before accepting a durable observation. It SHALL distinguish event delivery deduplication from canonical business-effect deduplication, reconcile authoritative Stripe state, and never grant credits from a browser return URL.

Trace: D11, D15, J5, T22, T24, G11, G15. Tasks: 6.3, 6.4.

#### Scenario: SC-BIL-04 Forged and duplicate webhooks

- **WHEN** a webhook has an invalid signature, or a verified event is delivered repeatedly
- **THEN** the forged observation has no financial effect, and verified duplicates acknowledge durable processing without repeating any grant, reversal or downstream affiliate sale

#### Scenario: SC-BIL-05 Unconfirmed return or delayed payment

- **WHEN** a customer returns from Checkout before confirmed payment, including delayed-payment methods
- **THEN** the UI shows pending payment and issues no purchase credits until authoritative successful payment is reconciled

#### Scenario: SC-BIL-06 Event alias convergence

- **WHEN** invoice, Checkout and PaymentIntent observations identify the same purchase in any order
- **THEN** they resolve to one canonical order and original grant identity; an unknown or mismatched mapping becomes a recovery case rather than a second grant

### Requirement: REQ-BIL-03 Correct recurring and permanent entitlements

The system SHALL issue subscription credits once for each supported paid recurring invoice line and service period, expiring at that line's original period end. It SHALL issue purchased pack credits once per confirmed canonical payment without an expiry. Grant quantities SHALL come from the approved catalog snapshot independently of taxes, discounts, cash amount or provider cost.

Trace: D11, D12, J5, J6, T07, T08, T21, T23, T24, G11, G12. Tasks: 6.4, 6.5.

#### Scenario: SC-BIL-07 Subscription and pack grant

- **WHEN** supported paid recurring invoices and credit-pack purchases are reconciled
- **THEN** the correct workspace receives the catalog quantity once with the original subscription expiry or no pack expiry, and displays source and expiry without converting money to guessed credit quantities

#### Scenario: SC-BIL-08 Incomplete or unsupported invoice

- **WHEN** payment is failed, incomplete, trial-only, or contains unsupported mixed or multiple recurring line semantics
- **THEN** no automatic purchased-credit grant is issued; unsupported paid structures expose a reconciliation case while an explicit future policy is required for trial credits

### Requirement: REQ-BIL-04 Subscription lifecycle and customer lineage

The system SHALL mirror subscription status, cancellation and period metadata without issuing extra credits from status changes. Period-end cancellation SHALL preserve existing grant expiry. V1 SHALL disable recurring-price changes in the portal and offer no scheduled plan-change workflow. A replacement subscription purchase SHALL become available only after the prior subscription ends and the Checkout guard permits it. Catalog edits SHALL affect future purchases or an explicitly reviewed migration. Audited Stripe-customer replacement SHALL retain all historical workspace mappings and consumed affiliate eligibility.

Trace: D11, D12, D26, J5, J8, T23, T26, G11, G12, G26. Tasks: 6.5.

#### Scenario: SC-BIL-09 Cancel before replacement purchase

- **WHEN** an owner cancels at period end or requests a different recurring price
- **THEN** current credits retain their original expiry, unsupported immediate/scheduled price changes are unavailable, and a new subscription purchase requires the prior subscription to end and the Checkout guard to pass; catalog edits do not silently migrate existing customers

#### Scenario: SC-BIL-10 Payer or customer changes

- **WHEN** the payer, member roster or Stripe-customer mapping changes
- **THEN** the workspace's order history and canonical first-payment reference remain intact, and mapping replacement records its reason and previous identities

### Requirement: REQ-BIL-05 Cash recovery without credit corruption

For a confirmed full cash refund whose associated grants are wholly unused and unreserved, the system SHALL revoke only those available credits with immutable reversal evidence. Consumed or reserved exposure, partial refunds and disputes SHALL create a recovery case and block new billable generation and new Checkout while allowing active tasks to settle. It SHALL NOT create negative spendable credit, confiscate unrelated grants, charge again automatically, or equate a task-credit refund with a cash refund. Restoration after a reversed dispute SHALL occur at most once, retain original expiry, and require resolution of the recovery case.

Trace: D11, D12, D20, D21, J5, J6, T21, T22, T28, G11, G12, G20, G21. Tasks: 6.6.

#### Scenario: SC-BIL-11 Full unused refund

- **WHEN** Stripe confirms a full refund of entirely available, unreserved grant credits
- **THEN** only those credits are revoked once with linked reversal/audit records; subscription cancellation remains a separate explicit operation

#### Scenario: SC-BIL-12 Reserved, partial or disputed exposure

- **WHEN** a refunded payment has consumed/reserved credits, a partial refund exists, or a dispute is open/lost
- **THEN** new billable generation and new Checkout are held, active tasks settle under their existing terms, and a recoverable exposure case records the reason without automatic negative balances or duplicate economic-loss reversal

#### Scenario: SC-BIL-13 Dispute reversal and task refund

- **WHEN** a dispute is authoritatively reversed, or an unrelated failed generation returns credits
- **THEN** eligible previously revoked entitlement is restored at most once with original expiry only after case resolution; task-credit refunds follow grant lineage and produce no Stripe cash-refund event

### Requirement: REQ-BIL-06 Order-independent atomic reconciliation

All paid, refund and dispute observations SHALL converge through one canonical reconciliation authority. Confirmed refund/loss identities SHALL be retained monotonically. A stale authoritative fetch SHALL NOT overwrite newer accepted state. Payment projection, grant or reversal, recovery hold, command result, required audit and downstream outbox intent SHALL commit atomically.

Trace: D11, D22, D31, J5, J7, T22, T24, T60, G11, G22, G31. Tasks: 6.4, 6.7.

#### Scenario: SC-BIL-14 Refund or dispute precedes payment notification

- **WHEN** authoritative full refund, partial refund or dispute evidence exists before a paid webhook is processed
- **THEN** full refund produces no credit grant; partial refund or dispute produces a recovery hold and no automatic full grant; later paid notifications cannot erase that evidence

#### Scenario: SC-BIL-15 Concurrent grant, refund and generation

- **WHEN** grant reconciliation, refund reconciliation and generation reservation contend for the same workspace
- **THEN** the serialized outcome is either no grant or one grant with its matching reversal/recovery exposure, and generation rechecks any billing hold before reserving; no spendable orphan grant or unrelated confiscation remains

#### Scenario: SC-BIL-16 Stale reconciliation and transaction failure

- **WHEN** an older network fetch finishes after a newer reconciler, or a required audit/outbox write fails
- **THEN** the stale fenced result is rejected; an incomplete transaction exposes none of its business effects and retry converges on the existing canonical order

### Requirement: REQ-BIL-07 Accurate billing visibility and refund intent

The owner billing surface SHALL distinguish subscription status, cash payments/refunds, credit grants/expiry and recovery holds. A privileged cash-refund command SHALL preview monetary amount, credit exposure and reason before authorized execution, and SHALL report pending until confirmed payment-provider evidence establishes its outcome. Sale terms and monetary values SHALL remain explicit release configuration rather than implied by engineering recovery behavior.

Trace: D11, D22, D27, J5, J7, T04, T21, T28, T30, G11, G22, G27. Tasks: 6.8, 6.9, 7.3, 7.14.

Evidence staging: M5 tasks 6.9/6.10 verify the refund preview/command port and confirmed/pending/lost-response reconciliation in authorized test mode. This is a domain/adapter subset of SC-BIL-17, not proof of the operator UI or production execution permission. Task 7.3 and M6 gate 7.14 close the privileged operator UI scenario.

#### Scenario: SC-BIL-17 Refund request and unresolved remote result

- **WHEN** an authorized operator requests a previewed refund and the API succeeds or its response is lost
- **THEN** the UI records a pending operation with stable external references; no cash-moved claim is made until reconciliation confirms it, and retry cannot create an unrelated refund
