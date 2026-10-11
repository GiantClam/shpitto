# M6 independent affiliate and recovery review

Review date: 2026-10-04. Review scope: local source and local Docker evidence for
tasks 7.6-7.13, plus the separately implemented administrative recovery and
refund-delivery paths. This review does not certify a real FirstPromoter account,
production email, payment provider, payout method, or live funds transfer.

The reviewer implemented the privileged authentication and cash integration
lane. Their existing probes below are implementation evidence, not independent
approval of that same work. The findings in this document concern the separate
affiliate/runtime and notification/recovery lanes.

## Review status

**PASS for the reviewed local affiliate source and fixture-backed Docker scope.**
The approval, hidden-backlog, ambiguous-send, and unattributed-payment findings
below are closed by source review and independently rerun Docker probes. No known
blocking local defect remains in this reviewed affiliate snapshot. The additional
referral HTTP handler was also read and independently tested after its owner
froze the source.

Task 7.5 integration health, correlation inspection, and safe replay/reconciliation
coverage is a separate local follow-up owned by the parent/admin lane. Its newest
implementation is not approved by this report. The integrated M6 gate and any
live-account gate remain outside this PASS scope.

## Findings and closure

1. **Delayed approval must refresh and recheck current evidence.**
   `processAffiliateReviewAction` originally checked policy, account, and review
   versions but not newly opened refund/dispute/abuse holds. A hold can arrive
   after the audited approval intent without incrementing the review version.
   The worker now refreshes account/history/abuse/commission evidence before
   dispatch and checks holds, history, policy, checkpoint, and lease at claim
   and completion. Closed: `affiliate-review-races.log` covers a hold after
   enqueue, a hold during send, and a changed checkpoint during readback.
2. **Hidden review backlog must remain a blocking condition.**
   The original sync loop limited acknowledged payments to one page without a
   cursor. An account-wide guard also counted existing holds and denial rows
   without detecting required review records that were absent or stale. A later
   sale could remain invisible to approval/handoff. All acknowledged payments
   and due delivery events now use cursor pagination. Missing, stale, held,
   policy-mismatched, or history-incomplete review evidence contributes to the
   account guard. Closed: the race probe uses a batch size of two with six
   reviews and verifies missing review records block the guard.
3. **An ambiguous action submission must not be blindly repeated.**
   The original action worker called `sendReviewAction` again whenever no batch
   reference had been persisted, including after a timeout or crash following
   remote acceptance. A stable local action reference alone does not prove
   provider idempotency. Previously claimed intents now use authoritative
   readback and never send again. Closed: the fault probe throws after accepted
   send, confirms that no batch reference was saved, and verifies the next
   attempt completes through readback with exactly one send.
4. **An unattributed workspace must still consume its first-payment slot.**
   The original sync loop omitted sealed unattributed workspaces and returned
   before freezing their payment history. Immutable unattribution prevented
   commission export, but the specified persistent first-payment evidence was
   absent. History-only reconciliation now includes both sealed unattributed and
   invalid referrals. Closed: the independently rerun DB probe confirms that both
   consume the chronological first slot and that unattributed sale delivery is
   rejected. Signup/sale export still requires verified attribution.

Two additional tracking findings were sent earlier: delivery required a fresh
successful manual-payout account checkpoint, and completion could overwrite a
held sale following new older-payment evidence. The owner added claim and
completion fences. Independent race probes verify an expired delivery lease and
a new hold during sale delivery remain held for readback.

## Reviewed boundaries

- Privileged affiliate commands reauthorize the live operator/MFA session,
  validate expected versions and reasons, and atomically record command result,
  intent, and audit. Hosted payout records a reviewed redirect with
  `fundsTransferred: false`.
- A later independent check of the credit-adjustment fix confirms grant, ledger,
  and outbox identities include the command, actor, workspace, and client key.
  Different legitimate scopes can reuse a key; stored same-scope retries still
  return before deriving a new business identity. The Docker operations probe
  verifies positive and negative adjustments, exact balances, and no duplicate
  ledger/outbox effects.
- The shared referral HTTP handler validates same-origin bounded exact input,
  current enabled account/program settings, and authoritative verification before
  issuing a signed host-only HttpOnly cookie. Production requires HTTPS and the
  Secure attribute. Invalid/unavailable candidates retain the previous valid
  cookie, and configuration changes during verification fail closed. The actual
  route still uses an unavailable verifier until real account integration is
  separately authorized and verified.
- `approveReview` and `denyReview` are pure decision helpers. Their only callers
  outside their defining file are pure probes; they are not persisted provider
  approval bypasses.
- Affiliate notification intake authenticates a configured secret header,
  bounds the request body, normalizes the event identity, discards asserted
  status and personal data, and stores a deduplicated hint. The processor checks
  authoritative account/program/event/entity scope and lease/config versions.
  Notification processing cannot itself move funds or clear correction holds.
- Notification-triggered refresh preserves the status and version of a review
  with an active durable action. The notification Docker probe directly covers
  this interaction; it cannot orphan the pending action by replacing its version.
- Recovery projections constrain provider inbox joins by workspace, task,
  provider request identity, and attempt nonce. Recovery sweep effects run in
  the audited command transaction with expected-version and semantic replay
  protection.
- Refund dispatch uses a never-claimed intent for the initial create and
  authoritative lookup after an ambiguous attempt. Lease fencing prevents stale
  completion. Workspace-first lock ordering is shared with cash reconciliation.
- FirstPromoter wire mapping is recorded in
  `internal/restart/firstpromoter-v2-mapping.md`, with public official sources and
  pure contract tests. It is a codec checkpoint; no enabled account adapter or
  provider account entitlement is implied. Batch completion requires the selected
  and processed counts to match and zero failed items.

## Existing local implementation evidence

The following saved runs passed against disposable databases on local Docker
PostgreSQL. Each probe removed its own database afterward.

| Evidence | Verified behavior |
| --- | --- |
| `logs/privileged-final.log` | Eleven privileged scenario groups: bootstrap latch, usable final owner, audited legacy disable, session revocation, versioned recovery, refund replay, crash recovery, lookup-only ambiguity handling, and original pending command recovery after browser reload |
| `logs/two-factor-final.log` | Real installed Better Auth TOTP enrollment and login challenge, invalid code rejection, rotated/same/wrong session handling, recent step-up expiry, live role revocation, and stamp deletion on factor disable |
| `logs/cash-affiliate-final.log` | Four cash integration groups: unique incremental refunds, cumulative basis bound, dispute/refund overlap, unrelated-credit preservation, signed webhook object deduplication, and transactional rollback |
| `logs/billing-regression-final.log` | Eighteen billing reconciliation cases, including canonical identities, customer lineage, concurrent payment convergence, refund-before-paid, credit recovery, and workspace isolation |
| `logs/affiliate-review-db.log` | Durable attribution, unattributed/invalid first-slot consumption without export, canonical history, ordered delivery, review checkpoints, audited command rollback/replay, asynchronous readback, hosted handoff, abuse release, and root workspace/billing hooks |
| `logs/affiliate-review-races.log` | Twelve targeted approval/delivery/history/clock/backlog/configuration race and lost-response scenarios described above |
| `logs/affiliate-review-notifications.log` | Six notification groups: disabled path, sanitized authenticated intake, foreign/unavailable readback, concurrent claims, ordinary worker draining, active-action preservation, and lease/policy fences |
| `logs/affiliate-review-referral.log` | Five shared-handler groups: same-origin and bounded validation before I/O, retained cookies on failure, verified signed-cookie consumption, HTTPS/Secure production behavior, and post-verification configuration fencing |
| `logs/billing-schema-upgrade-red.log` and `logs/billing-schema-upgrade-green.log` | Populated pre-0024 upgrade fails before the fix and passes afterward; 47 schema cases retain original cash facts, backfill loss identities, reject missing identities, and enforce immutable cash facts after migration |
| `logs/billing-schema-domain-replay-red.log` and `logs/billing-schema-domain-replay-green.log` | Follow-up RED/GREEN proves the backfill matches runtime refund/dispute identities; all four historic event kinds replay without effects, and a new correlated reversal converges without changing unrelated hold/credit state; 49 total cases |
| `logs/credit-command-review.log` | Independent Docker rerun of operations checks after scoped credit identities; cross-workspace and cross-actor positive/negative adjustments succeed while same-scope replay remains idempotent |

All listed probes were run against the current migration set through 0025. The
affiliate DB and race probes were rerun after the final first-slot/source fixes,
and the schema and referral probes ran after the populated-upgrade repair.
The schema probe reports PostgreSQL 15.19 on local Docker; this does not imply
separate PostgreSQL 17 deployment evidence. Typecheck, source boundary, format,
and database boundary checks passed at the affiliate source freeze. Later
parent/admin work requires its own final aggregate checks.

## Migration repair and remaining limits

The preflight schema probe exposed both an obsolete fixture and a real migration
defect: 0024 attempted to backfill new derived fields while the immutable cash
trigger rejected every update. The regression now starts from a populated
pre-0024 database. Migration 0024 temporarily disables only that trigger while
the migration transaction holds the table lock, backfills the derived identity,
and re-enables the trigger before commit. A separate reviewer then found that
the initial derived dispute key used an event-kind prefix rather than the
runtime's shared `dispute:` prefix. The final migration uses `refund:<externalId>`
for refunds and `dispute:<externalId>` for every dispute event kind. The upgraded
database is now exercised through `recordBillingRecovery`, including duplicate
refund/open/lost/reversed events and a newly correlated reversal. Original cash
fields remain unchanged, and post-upgrade mutations and changed duplicate
amounts are rejected. No runtime constraint was relaxed.

The probe reuses one migration-slice helper for the pre-0016 and pre-0024 setup;
there are no new dependencies or production-provider calls. Account-specific
referral verification, provider correlation after ambiguous batches, campaign
permissions, actual delivery, and hosted payout evidence remain unverified by
design. Live-account testing is separately deferred by user instruction and is
not represented as local evidence.
