# Independent review of privileged commands and cash recovery

Review date: 2026-10-04. Scope: `src/lib/auth.ts`, operations authorization,
bootstrap/ownership and named commands, operator refund intent/delivery, and the
populated upgrade through migration 0024. This reviewer did not implement those
authentication, ownership, refund-delivery, or migration changes. Existing Docker
evidence was inspected rather than rerunning the complete acceptance suite.

**Result: no unresolved blocking defect in this reviewed local scope after the
migration correction described below.** This is not approval of real payment
accounts, production identity recovery, or the entire M6 gate.

## Concrete findings and disposition

1. **Populated dispute migration broke original-identity replay.** The first
   backfill used `event_kind || ':' || external_id`, while the recovery domain
   derives `refund:<id>` or `dispute:<id>`. Replaying an unchanged pre-upgrade
   dispute therefore conflicted with its newly backfilled loss identity. The
   migration owner corrected the backfill to the canonical prefixes. I inspected
   the corrected migration and regression: all four historical cash event kinds
   replay without adding cash facts or credit effects; a new reversal of the
   historical dispute resolves only its case and preserves the unrelated hold.
   Closed by source inspection and
   `logs/billing-schema-domain-replay-green.log` (49 cases).

2. **Manual-credit business identities omitted command scope.** The original
   grant, ledger, and outbox keys used only the client idempotency key even
   though command results are scoped by actor, workspace, and command. Identical
   legitimate keys across those scopes collided with global database uniqueness.
   After reporting this finding, the parent assigned its implementation to this
   reviewer. The fix hashes the complete command scope for both positive and
   negative adjustments; existing committed retries return before creating any
   new effect. This fix is therefore excluded from my independent approval.
   The separate privileged-lane reviewer inspected it and independently reran
   `probe-m6-operations.ts`; `logs/credit-command-review.log` passes different
   actors/workspaces using the same client keys, exact balances, and same-scope
   replay without duplicated ledger/outbox entries.

## Confirmed boundaries

- Operator authorization reads the current user, live session owner/expiry,
  active global role, and session-bound second-factor evidence. Workspace owner
  status is not global operator authority. Reads require completed MFA; cash and
  other privileged commands additionally require an unexpired step-up. The
  Better Auth hook uses the verified current/new session, does not stamp rejected
  TOTP results, and removes operator stamps when MFA is disabled.
- Bootstrap and recovery share the administrative-ownership advisory lock with
  role changes and account disablement. Bootstrap requires an existing verified
  active identity and cannot run after initialization. Recovery restores only an
  already appointed superadmin at the expected version, revokes sessions/stamps,
  and records out-of-band host authority; it never fabricates an authenticated
  session. The last-owner check excludes unverified and disabled identities.
- The public admin command route chooses named domain operations and supplies
  the authenticated actor. Reasons, expected versions, semantic idempotency,
  command results, audit, and local effects commit transactionally. The legacy
  disable helper delegates to the protected named command.
- Operator refunds persist their intent, account version, command audit/result,
  and outbox before provider I/O. Only an unclaimed delivery may call create;
  an expired/unknown attempt uses authoritative lookup or remains unknown. A
  heartbeat and lease generation fence completion. Matching cash facts, credit
  effects, request confirmation, final audit, and outbox publication share one
  transaction. The saved fault case demonstrates that a final audit conflict
  rolls back local cash/results after remote success and that retry looks up the
  original identity without a second create.
- Migration 0024 holds the table lock in the migration transaction, temporarily
  disables only the cash immutability trigger for derived-field backfill, and
  reenables it before commit. The upgrade probe compares every original cash
  field, preserves existing credits/holds, and rejects subsequent mutations.
  This proves a fresh/pre-0024 upgrade; it does not automatically repair a
  deployment that already applied a different historical copy of migration 0024.

## Evidence and limits

| Saved local evidence | Relevant result |
| --- | --- |
| `logs/two-factor-final.log` | Actual installed Better Auth enrollment/login challenge, invalid TOTP, rotated/wrong session, step-up expiry, role revocation, and factor-disable invalidation |
| `logs/privileged-final.log` | Eleven bootstrap, surviving-owner, session-revocation, refund atomicity, concurrent delivery, ambiguity, and persisted-command recovery groups |
| `logs/billing-schema-domain-replay-green.log` | Forty-nine populated-upgrade and billing integrity cases, including original cash-identity replay and related dispute reversal |
| `logs/credit-command-review.log` | Independent verification of the separately assigned scoped-credit fix |
| `logs/refund-preview-boundaries.log` | Additional author-run local preview/command checks: full and exposed grants, held/refunded orders, invalid money, user isolation, currency/catalog mismatch, unresolved-intent rejection, and consumed-credit preservation |

The last row is additional implementation evidence authored during this review,
not a claim of independent review of the probe itself. All provider refund
execution remains restricted to the fixture provider. The older owner refund and
manual reconciliation helpers currently have probe-only callers; this report
does not authorize exposing them as a production API or treating a browser-supplied
external ID as authoritative cash confirmation. The fixture provider's in-memory
lookup is not a durable production provider ledger. TOTP evidence does not imply
separate end-to-end backup-code or real-email delivery coverage. Production
account testing remains deferred by the user.
