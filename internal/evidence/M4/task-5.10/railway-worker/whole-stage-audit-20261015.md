# Independent M4 evidence audit

Date: 2026-10-15. Reviewer: native Codex subagent Boyle, `01a13ec6-859b-7882-bc74-96ccca33ba3d`, independent from the integrator. Decision: M4 remains IN_PROGRESS. This is a gap audit, not a whole-stage PASS.

The reviewer inspected task 5.10, the M4 acceptance policy, provider matrix, historical row/lifecycle receipts, Railway worker receipts and the primary development record. All four retained original MP4 byte counts and SHA-256 hashes matched their receipts. The separate October 13 Fal T2V run additionally demonstrates official-JWKS callback verification, inbox processing and exactly one seeded 10-credit reservation consumption.

Remaining mandatory evidence:

1. Replicate T2V/I2V and Fal I2V application reservation outcomes and complete row-level endpoint/schema/request/attempt/input/output/download records. Existing retained media and fake transport can support isolated replay, but cannot be relabeled authentic live delivery.
2. Authentic Replicate callback acceptance and confirmed account binding; complete callback/polling coverage, forged/stale/wrong-account rejection and duplicate/conflicting/reordered-event proof. Unsafe/repeated cases may use deterministic fixtures; required financial replay assertions remain mandatory.
3. Hosted Trigger one-minute independent sweep, fenced lease recovery, immutable recovery/deadline budgets, alert and overdue-first restoration evidence. Railway runtime health alone does not prove this profile. Local and worker configuration inspection on October 15 finds no configured Trigger project/secret; the worker also lacks a confirmed Replicate account binding.
4. Complete production-adapter fault/recovery and crash-boundary evidence, including storage failure, output expiry, stale acknowledgements and late output after refund. The current controlled restart and thirteen fake-transport PostgreSQL integration cases are scoped evidence.
5. Reconcile scenario applicability and current evidence. The primary record's 43 scenario entries are still unapproved; SC-PRV-13, SC-PRV-14 and SC-PRV-15 must be represented. Its historical M6-only branch coverage cannot prove M4 coverage, and current M3 applicability remains STALE until independently reviewed equivalence or relevant reruns.
6. Resolve the current-root dependency provenance mismatch through an independently reviewed replacement, then obtain independent whole-stage review and the integrator decision on the exact candidate.

The M4 policy explicitly allows UNKNOWN provider cost. AWS live connectivity is a later release profile; real R2 evidence must not be called an AWS live test. These are not additional M4 blockers.

The audit made no repository edits, network calls, secret reads or paid submissions. No new provider create is authorized by this report.

## Same-day resolution and consistency follow-up

The initial audit above describes the pre-refresh inventory. The integrator subsequently added SC-PRV-13, SC-PRV-14 and SC-PRV-15 as mandatory NOT_RUN entries, bringing the current list to 46. The root-baseline blocker passed the separate independent review in `root-baseline-review-20261015.md`. Current M4 coverage remains NOT_RUN and current M3 applicability remains STALE; these are not resolved by candidate capture.

The follow-up reviewer identified stale October 14 `candidateRefresh` metadata and an overstatement that old Docker probes were current. The integrator updated M4/M5/M6 refresh identity/reference fields and restricted current-development assertions to actually rerun checks. Historical Docker/domain evidence remains explicitly unrerun and is not equivalent current proof. The final counts are 178 aggregate tests and 22 focused root tests; earlier counts belong to their earlier receipts.

Hosted Trigger requires implementation as well as account setup: there is no `trigger.config.ts`; recovery sweep scheduling is currently a process timer and dispatch/reconciliation helpers are plain functions. Executable hosted task/schedule registration and deployment wiring remain unfinished. The target also lacks Trigger project/credentials, and Replicate still lacks its confirmed account binding. Supplying credentials alone does not close this profile. Whole-stage review remains NOT_RUN.
