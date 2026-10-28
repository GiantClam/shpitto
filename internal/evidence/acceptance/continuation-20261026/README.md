# Acceptance continuation evidence and human review recommendations

Date: 2026-10-26. This packet applies the evidence-first review pattern to the remaining M4-M8 work. It records automated results, external blockers and a human decision recommendation for each stage. It does not promote a milestone status or replace the canonical acceptance records.

## M4

The fresh provider and recovery suite passed 128/128 tests after the local disposable PostgreSQL services were started and non-production dummy HTTPS S3 signing inputs were supplied. Coverage includes provider submission fencing, local and S3 materialization, webhook replay, crash races, late completion quarantine, reservation settlement and self-hosted restart recovery. No provider network call or paid generation was made.

The automated result is partial because the current M4 candidate still lacks a complete current authentic provider matrix, selected-runtime hosted recovery record and independent whole-stage review. Recommended human decision: `RETURN_FOR_EVIDENCE`.

## M5

Local Stripe billing automation passed 68/68 integration and contract tests. Additional disposable PostgreSQL probes passed 49 billing schema cases, 10 Checkout cases and 18 reconciliation/refund cases. The hosted Acceptance packet also proves owner/member login, owner Stripe test Checkout and Portal creation, member denial and bootstrap cleanup.

The automated result is partial because task 6.10 still lacks hosted subscription lifecycle, refund, dispute and webhook replay evidence. Recommended human decision: `RETURN_FOR_EVIDENCE`.

## M6

Operations, admin reads, workspace details, privileged commands, MFA, recovery and affiliate probes passed on disposable local PostgreSQL. The read-only FirstPromoter account and campaign checks now pass, and the external safety prerequisites were verified in the current UI and API state.

The automated result remains partial because Shpitto affiliate settings are still disabled and the verified account/campaign has not yet been bound by an authenticated Superadmin. The hosted referral endpoint therefore returned HTTP 200 with `status=disabled` and issued no cookie. Recommended human decision: `RETURN_FOR_EVIDENCE`.

On 2026-10-26, campaign `45084` returned HTTP 200 and showed `20% commission for first charge`; accepted promoter `15752036` has referral token `shpitto-203f34`. Stripe Test Mode's installed-app page now shows FirstPromoter `Disconnected`, and FirstPromoter Payouts shows no payout methods selected, no upcoming or overdue payouts, and no recent payments. The FirstPromoter integration page still displays a stale `Connected` label after reload, so the evidence records both surfaces and treats the Stripe sandbox installed-app state as the authoritative disconnection check. Acceptance deployment `ce63e734-832e-4337-9772-8c4ee3a61256` is successful; `GET /api/healthz` returns `status=ready`, `profile=acceptance`, `database=ready`. Railway safety flags are both `true`. A canonical Stripe test-mode history reader is implemented and tested, but no hosted Stripe customer/order history has yet been used for affiliate settlement. No external referral, sale, refund or payout was created. Detailed evidence: `internal/evidence/acceptance/M6/firstpromoter-credential-check-20261026.json`.

## M7

Skills, customization, Docs, vendor Docs, release boundaries, content boundaries, shell boundaries and local-service checks passed. The existing four-workflow local run passed all four workflows and preserved protected files. It explicitly records `independentReview=NOT_RUN`, `gatePromotion=false`, local-mock scope and no real provider/payment execution.

The automated result is partial because M7 depends on M4-M6 gate closure and still needs current candidate review and independent approval. Recommended human decision: `RETURN_FOR_EVIDENCE`.

## M8

M8 local preflight passed export boundaries, candidate runtime checks, deployment/Docker/config/restore/operations preflight and local vendor separation. The fresh candidate check passed archive extraction, offline install, production build, buyer checks, migrations, seeded login/dashboard, cancellation/refund, worker success/deadline refund, private download, backup/restore, restart persistence and exactly-once credits.

The automated result is partial because merchant eligibility and commercial terms, managed/production deployment, real external accounts and RC/BETA/STABLE independent review remain open. Recommended human decision: `RETURN_FOR_EVIDENCE`.

## Human review rule

Reviewers choose `PASS`, `FAIL` or `RETURN_FOR_EVIDENCE` from this packet and the referenced detailed evidence. `PASS` accepts only the recorded scope. `FAIL` rejects the observed evidence. `RETURN_FOR_EVIDENCE` requests the named missing scenarios or external inputs. Reviewers do not rerun automated tests as a substitute for reviewing the evidence.

No live Stripe key, real refund, payout, settlement, merchant publication or new paid provider request was used in this continuation run.
