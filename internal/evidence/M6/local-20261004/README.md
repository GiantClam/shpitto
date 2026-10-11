# M6 local implementation and verification

The local implementation profile is complete. The final aggregate passed on
2026-10-04 against this machine's Docker PostgreSQL 15. All 50 retained commands
succeeded, including 115 unit/contract tests, domain probes, static boundaries,
frozen offline installation and production build. Owned M6 core branch coverage
is 1,318/1,598 (82.48%), with no missing source files. Canonical source, schema,
configuration, contract, validator and lockfile digests remained unchanged during
the aggregate run.

This is a **development verification**, not an integrated milestone or production
release approval. The user explicitly deferred real-account tests to a separate
next phase. Gates 5.10, 6.10 and 7.14 remain open. M0-M3 historical approvals are
preserved; complete current M3 applicability remains explicitly stale pending its
separate equivalence review.

## Completed local scope

| Tasks | Implemented and verified behavior |
| --- | --- |
| 7.1 | Live role/session authorization, actual Better Auth authenticator challenge, ten-minute same-session command verification, usable-last-superadmin concurrency guard, audited bootstrap and recovery |
| 7.2 | React-admin resource lists; bounded, redacted tenant membership/subscription/grant/ledger details; recorded access purposes; functional filters and dashboard navigation |
| 7.3-7.4 | Named versioned/idempotent administrative commands, account/workspace controls, scoped credit adjustment identities, atomic audit/outbox effects, refund preview and persisted-command recovery after reload |
| 7.5 | Bounded task/attempt/asset/inbox/outbox correlations, sample-scoped model health, expired-task sweep, replay of authenticated persisted notifications using original domain identities, terminal-credit preservation and rollback |
| 7.6-7.7 | Disabled-by-default optional affiliate configuration; immutable workspace attribution; same-origin verified referral handler and signed 30-day HttpOnly cookie; invalid/unavailable attempts retain the prior valid touch |
| 7.8 | Canonical chronological first payment after the reconciliation delay, complete-history guards, pagination, older-payment conflict holds, ordered signup/sale delivery, and first-payment freezing even without attribution |
| 7.9 | Incremental cash refunds, shared dispute/refund economic-loss deduplication, bounded amounts, unrelated-credit/hold preservation, and manual correction hold after a won dispute |
| 7.10-7.11 | Persisted policy/review/checkpoint versions; five-minute synchronization; claim/completion freshness, history, abuse and account fences; missing-review backlog blocks approval |
| 7.12 | Versioned approve/deny/release/policy/handoff commands through fixture authority; async batch readback; lost-response lookup-only recovery; authenticated, deduplicated, sanitized durable notifications drained by the local worker |
| 7.13 | Verified self-referral and suspicious attribution holds, unknown signal handling, and audited legitimate-hold release |

Migrations include a populated pre-0024 upgrade rehearsal. The upgrade backfills
canonical refund/dispute identities while preserving historical facts and
restoring the immutable-fact trigger inside the migration transaction. The 49-case
schema probe also replays historical events through the domain and verifies a
correlated dispute reversal. Existing databases that already applied an earlier
development revision of migration 0024 were not repaired in place; those require
an explicit follow-up upgrade rather than assuming rerunning migration files
changes an applied database.

## Evidence

- `final/result.json`: aggregate outcome and unchanged-candidate assertion.
- `final/commands.json` and `final/logs/`: timestamped commands and retained output.
- `final/coverage.json`: explicit owned source manifest and branch counts.
- `final/candidate-before/` and `final/candidate-after/`: canonical digests and file footprints.
- `independent-review.md`: affiliate runtime, notification, cash boundaries and cross-scope credit review.
- `privileged-independent-review.md`: authentication, ownership, operator refund and populated-upgrade review.
- `recovery-read-review.md`: independent recovery and administrative user projection review.
- `workspace-detail-review.md`: independent tenant-detail authorization, redaction and pagination review.
- `browser/`: actual in-app browser observations on a separate temporary local database.
- `candidate-impact.json`: current versus previous development candidate impact.

The integrator separately reviewed the allocation-level recovery projection fix:
release/refund evidence joins the exact allocation settlement identity, source
grant and workspace. Two tasks sharing a grant no longer share a displayed refund.
Latest-attempt/event/command selection occurs in SQL, limited to selected tasks.
The aggregate reran the shared-grant regression and affected generation probes.

Independent reviewers did not approve their own implementation changes. Where a
reviewer fixed a discovered issue, a different reviewer or the integrator examined
that delta; those boundaries are stated in the individual reports.

## Browser scope

Observed local flows include password login, authenticator setup and invalid-code
rejection, valid step-up, authenticator challenge after signing out/in, resource
tables, empty/nonempty search filtering, dashboard navigation, workspace members,
recovery/model-health display, refund preview, reload recovery of an interrupted
refund, and exact retry of a confirmed fixture refund. A previously dispatched
refund whose provider fixture state was lost correctly remains unknown and is
looked up without another submission. Affiliate-disabled and empty review/hold
states render truthfully.

The browser fixture has no real account or payment. Affiliate approval and hosted
settlement were exercised through Docker fixtures, not a supported external
account in the browser. Setup secrets, passwords and recovery codes were not
stored in this evidence directory.

## Deferred and remaining boundaries

- Production affiliate authority remains unavailable in application routes. The
  public FirstPromoter V2 mapping and local codecs are documented; an enabled
  network adapter, supported account/campaign semantics and hosted settlement
  verification still belong to the separately scoped next phase.
- Real generation providers, Stripe accounts, production email and actual
  payouts were not used. No local test grants authority to move real money.
- Historical abnormal-balance audit/recovery remains deferred.
- Full exported-customer local/managed/Docker profile proof and final release
  approval belong to M8. This Docker validation verifies the local database and
  application workflows, not an exported production image deployment.

The changes reuse existing domain transactions, settlement keys, authority ports
and audit contracts. They introduce no dependencies. Generic administrative CRUD
remains unavailable; supported changes use the named commands.
