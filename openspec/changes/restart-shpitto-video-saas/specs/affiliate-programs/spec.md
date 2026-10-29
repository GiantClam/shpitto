# affiliate-programs

## Purpose

Optional buyer-owned affiliate attribution, first-payment eligibility, trustworthy provider synchronization and reviewed settlement handoff independent of source-license commerce.

## ADDED Requirements

### Requirement: REQ-AFF-01 Optional independent affiliate programs

The buyer SaaS affiliate integration SHALL use a buyer-owned FirstPromoter account/program independently of the vendor source-license program. It SHALL be disabled by default without preventing authentication, workspaces, credits, generation or billing. Shpitto SHALL own attribution and payment eligibility evidence; FirstPromoter SHALL own reward amounts, commission balances and settlement. The template SHALL NOT introduce a local commission-money ledger or assume authority to transfer funds.

Trace: D23, D24, J8, J9, T29, T46, T62, G23, G24. Tasks: 7.6.

#### Scenario: SC-AFF-01 Disabled integration

- **WHEN** affiliate configuration is absent or explicitly disabled
- **THEN** the core application completes its normal flows and exposes affiliate unavailability clearly without requiring affiliate credentials

#### Scenario: SC-AFF-02 Program isolation

- **WHEN** a buyer enables its account or a customer package is exported
- **THEN** only the configured buyer program receives SaaS events; seller source orders, affiliate credentials, commissions and settlement authority remain outside that runtime and export

### Requirement: REQ-AFF-02 Immutable creator attribution and workspace identity

Every signup, sale and refund SHALL identify the workspace as uid=workspace:<uuid>, independent of payer, membership, email, subscription or current Stripe customer. The selected default SHALL use the last valid referral touch before workspace creation, retained for at most 30 days in a signed HttpOnly first-party referral token and verified server-side against the configured provider/program/reference. Creator attribution SHALL be bound once at creation. Missing, expired or invalid attribution SHALL remain unattributed; later members or payments SHALL NOT attach a replacement. Transient verification failure SHALL hold the captured candidate for retry without exporting an unverified sale.

Trace: D25, D26, J8, T26, T27, T31, G25, G26. Tasks: 7.6, 7.7.

#### Scenario: SC-AFF-03 Competing valid referral touches

- **WHEN** the creator has multiple referral touches before creating a workspace
- **THEN** the last valid unexpired touch verified for the configured program is bound once; tampered, expired and foreign-program references cannot win

#### Scenario: SC-AFF-04 Late and failed attribution

- **WHEN** a workspace is created without a valid referral, or the captured candidate cannot yet be verified because the provider is unavailable
- **THEN** a later referral cannot replace an unattributed binding; transient verification remains pending for the original candidate and holds affiliate export without blocking purchased credits

#### Scenario: SC-AFF-05 Identity survives payer changes

- **WHEN** members, payer or Stripe customer change, or one user creates a second legitimate workspace
- **THEN** the first workspace retains its UID and eligibility history while the second is evaluated independently without a global user lifetime cap

### Requirement: REQ-AFF-03 Chronological first-effective-payment resolution

Before exporting the first sale, the system SHALL wait five minutes and reconcile verified paid objects across every historical Stripe-customer mapping for that workspace. It SHALL converge invoice-backed payment aliases and order canonical payments by (paid_at,payment_id), not webhook arrival. It SHALL assign the first-effective-payment reference once under serialized workspace processing. Incomplete history SHALL hold affiliate export only. An older effective payment discovered after export SHALL create a persistent eligibility-conflict repair case and approval/handoff hold; it SHALL NOT silently rewrite eligibility.

Trace: D25, D26, J5, J8, T24, T25, T26, T27, G25, G26. Tasks: 7.8.

#### Scenario: SC-AFF-06 Reordered historical payments

- **WHEN** renewal, pack and initial-subscription events arrive out of order across historical customer mappings
- **THEN** the five-minute eligibility window and successful history reconciliation select the earliest canonical paid event exactly once, including pack-first purchases

#### Scenario: SC-AFF-07 Incomplete historical lookup

- **WHEN** a historical customer/payment lookup fails or pagination is incomplete
- **THEN** no first sale is exported until completeness is established, while normal billing entitlement reconciliation continues

#### Scenario: SC-AFF-08 Older payment discovered after export

- **WHEN** a verified older effective payment is discovered after a first sale was sent
- **THEN** the affected commissions remain held in a persistent repair case until provider records and any required denial/correction are reconciled and audited

### Requirement: REQ-AFF-04 Ordered deduplicated tracking delivery

Verified billing changes SHALL atomically record affiliate delivery intent with canonical business identities. Server Tracking API signup/sale/refund calls SHALL use stable workspace UID and payment/refund event IDs, with no duplicate native Stripe sale tracking. Retries SHALL preserve event ID and payload digest; refund export SHALL wait for acknowledgement or reconciliation of its original sale. Subsequent verified payments SHALL use the same UID for native campaign configuration, rather than being silently dropped.

Trace: D24, D25, D26, J8, T24, T25, T26, T28, G24, G25, G26. Tasks: 7.8, 7.9.

#### Scenario: SC-AFF-09 Duplicate financial observations

- **WHEN** one payment creates invoice, Checkout and PaymentIntent events and affiliate delivery retries
- **THEN** FirstPromoter receives one canonical sale identity and equivalent payload, no payer-email identity merging, and any duplicate response is reconciled against the existing sale

#### Scenario: SC-AFF-10 Refund arrives before sale acknowledgement

- **WHEN** a confirmed refund is ready while its original sale delivery is unresolved
- **THEN** refund export waits for that sale's acknowledgement/reconciliation and then references its original event ID; failed delivery is visible with retry count and next action

### Requirement: REQ-AFF-05 Default first-payment guard and deliberate campaign changes

The default program SHALL configure FirstPromoter monetary reward By count=1 and local commissionPolicy=first_payment. Any returned commission for another payment SHALL be held and denied through supported provider operations before approval or payout handoff, including after cash refunds. Automatic disbursement SHALL remain disabled under this default. Switching duration away from first-payment-only SHALL require a reviewed matching commissionPolicy=provider_campaign revision and provider configuration; it SHALL preserve identity/history and avoid replaying old sales or locally recalculating commission money.

Trace: D25, D26, D27, J8, T25, T26, T28, T30, G25, G26, G27. Tasks: 7.10.

#### Scenario: SC-AFF-11 Renewal and pack after first payment

- **WHEN** the first purchase is followed by renewals or packs under the default
- **THEN** only the canonical first effective payment may remain eligible; unexpected later commissions enter held/deny-pending state and cannot be approved or handed off before confirmed denial

#### Scenario: SC-AFF-12 Refund does not reset eligibility

- **WHEN** the first sale is fully or partially refunded and the workspace pays again
- **THEN** the local first-payment reference remains consumed and any later first-only commission is denied even if the provider's charge counter resets

#### Scenario: SC-AFF-13 Buyer changes campaign duration

- **WHEN** a buyer requests a different commission duration or the remote campaign differs from the local revision
- **THEN** handoff waits for configuration review; an explicit matching provider_campaign revision removes only the future first-only denial guard without changing UID, replaying history or authorizing automatic payment

### Requirement: REQ-AFF-06 Cash reversals and correction holds

Cash refunds SHALL export unique incremental amounts linked to the original canonical sale and SHALL NOT cumulatively exceed its refundable cash basis. A dispute SHALL hold payout eligibility immediately and share economic-loss deduplication with billing. Generation-credit refunds and compensation SHALL NOT reverse cash commission. A won/reversed dispute after commission denial or reversal SHALL create a persistent manual-correction case and hold until provider-verified correction and audit; it SHALL NOT blindly restore commission or grant a new first-payment identity.

Trace: D20, D21, D25, D27, J5, J6, J8, T25, T28, T30, G20, G21, G25, G27. Tasks: 7.9, 7.10.

#### Scenario: SC-AFF-14 Several partial cash refunds

- **WHEN** multiple partial refunds and a final refund are confirmed for one sale
- **THEN** each unique incremental amount is exported once with the original sale reference, cumulative reversal stays within the refundable basis, and a dispute/refund cannot reverse the same loss twice

#### Scenario: SC-AFF-15 Task-credit refund is not cash

- **WHEN** a failed generation restores subscription, permanent or compensation credits
- **THEN** no affiliate cash-refund event is emitted solely for that task-credit change

#### Scenario: SC-AFF-16 Won dispute after denial or reversal

- **WHEN** a previously disputed payment is restored after its commission was denied or reversed
- **THEN** a manual-correction case holds affected approval/handoff until authoritative provider correction and audit complete; eligibility identity remains unchanged

### Requirement: REQ-AFF-07 Persistent fresh commission review and payout handoff

Commission eligibility reviews and account synchronization checkpoints SHALL persist independently of UI sessions. Reconciliation SHALL run every five minutes and immediately before approval or hosted payout handoff. The chosen set SHALL have authoritative status refreshed within 60 seconds, a successful account-wide checkpoint, matching policy/review versions, no unresolved holds and completed required denials. Missing, stale, failed or incomplete evidence SHALL fail closed. Approve/deny intentions SHALL be audited and durably delivered; asynchronous batches SHALL remain pending until provider reconciliation proves completion.

Trace: D24, D27, J7, J8, T30, T31, T60, G24, G27. Tasks: 7.11, 7.12.

#### Scenario: SC-AFF-17 Failed refresh or hidden backlog

- **WHEN** a commission row looks fresh but account synchronization failed, backlog remains, refresh is older than 60 seconds, or a required review record is absent
- **THEN** approval and payout handoff stay disabled with a recoverable reason until both set and account evidence are current and complete

#### Scenario: SC-AFF-18 Asynchronous denial and stale review

- **WHEN** denial returns an asynchronous batch, or policy/review/checkpoint versions change during external refresh
- **THEN** denial remains pending until terminal provider proof; stale review approval is rejected and must reconcile again

#### Scenario: SC-AFF-19 Reviewed hosted payout handoff

- **WHEN** an authorized recently stepped-up operator opens the configured HTTPS payout dashboard for a fully reviewed set
- **THEN** the system records the reviewed handoff only, preserves provider status labels, and does not report transferred funds from approval, redirect or a manual paid marker

#### Scenario: SC-AFF-20 Direct dashboard limitation

- **WHEN** an operator follows the settlement runbook
- **THEN** it requires manual payout mode, the matching reviewed set, final provider refresh and no unresolved holds, and explicitly states that independent account-owner dashboard actions cannot be technically prevented by the template

### Requirement: REQ-AFF-08 Authenticated affiliate notifications and truthful payout visibility

Affiliate notifications SHALL require HTTPS and a configured secret authorization header, deduplicate event IDs, and match the expected account/program. They SHALL be treated as hints and require authenticated API readback before changing authoritative commission/payout visibility or clearing holds. The system SHALL NOT claim a provider signature protocol or direct payout API that is not supported, and SHALL never initiate funds movement from a webhook.

Trace: D24, D27, J8, T22, T29, T30, G24, G27. Tasks: 7.12.

#### Scenario: SC-AFF-21 Forged and foreign notification

- **WHEN** a notification has an invalid bearer secret, duplicate ID or unrelated account/program
- **THEN** invalid/foreign notices have no effect, duplicates do not repeat effects, and only authenticated provider readback can advance visibility or release a hold

#### Scenario: SC-AFF-22 Unavailable payout method

- **WHEN** the buyer account lacks entitlement to a payout method or provider status cannot be refreshed
- **THEN** the interface shows the actual prerequisite/staleness and supported hosted process without claiming payment completion or silently selecting another money-transfer method

### Requirement: REQ-AFF-09 Reviewable abuse signals without global reward cap

Verified affiliate identity matching the workspace owner/payer SHALL create a self-referral hold. More than three newly attributed workspaces per affiliate in 24 hours or a repeated lawfully available verified payment-instrument fingerprint SHALL flag review without automatically rejecting legitimate multiple workspaces. Missing signals SHALL be marked unknown. The system SHALL use no raw card details and SHALL permit audited manual release of legitimate cases without imposing a global user lifetime cap.

Trace: D25, D26, D27, J8, T26, T27, T31, G25, G26, G27. Tasks: 7.13.

#### Scenario: SC-AFF-23 Self referral and unknown signal

- **WHEN** verified identities match, or the required identity/payment signal is unavailable
- **THEN** a match creates a persistent review hold while unavailable evidence remains unknown rather than verified-safe; raw card information is not collected

#### Scenario: SC-AFF-24 Legitimate multiple workspaces

- **WHEN** a legitimate referral exceeds the configurable review threshold or shares a verified instrument
- **THEN** it is flagged for review, and a reasoned audited decision can release valid workspaces independently without resetting an existing first-payment reference
