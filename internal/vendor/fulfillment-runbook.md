# Local fulfillment and entitlement rehearsal

This runbook is a local fixture rehearsal for task 9.11. It does not connect to
Lemon Squeezy, Stripe, FirstPromoter or a buyer account, and it does not grant a
commercial entitlement.

1. Generate an exact local candidate with `SHPITTO_CANDIDATE_ID` and
   `corepack pnpm export:candidate`.
2. Run `corepack pnpm verify:fulfillment-local`. The fixture verifies an order
   identity, candidate archive digest, one entitlement, a duplicate replay and
   an expiry/renewal transition.
3. Inspect `internal/evidence/m8/fulfillment/local-fixture/result.json`. The
   fixture records only redacted IDs and local file hashes.
4. A real order must be verified in the isolated vendor sales application before
   any per-customer copy is delivered. The buyer SaaS Stripe/FirstPromoter
   accounts are not valid source-sales evidence.
5. Expiry ends future update delivery and basic support; acquired source files
   remain accessible and usable. A renewed order extends future eligibility
   without changing past acquired releases or mutating the input record.

The fixture now calls the same vendor-only source-order and entitlement rules as
the sales preview. It rejects nonpaid/Stripe/cross-merchant orders, verifies the
candidate ZIP's actual SHA-256 and byte length, replays one identical order,
checks expiry at the exact boundary, retains acquired file access, and renews a
later release. Tests include conflict rejection and leap-day boundaries. No
constant PASS result is used for these checks; a failed check exits nonzero.

The commercial account, license, price, refund, support and source-affiliate
terms remain release blockers until task 9.10 and 9.13 are completed with
authorized vendor evidence.
