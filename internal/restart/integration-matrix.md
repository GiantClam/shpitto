# M0 external integration matrix

Status: **LOCAL_CONTRACTS_FROZEN_EXTERNAL_EVIDENCE_DEFERRED**. The selected boundary, DTO shape, adapter responsibility and evidence owner are frozen for implementation. No row claims an account, paid call, payout or production deployment. Account-backed rows remain explicit blockers for their later gates.

The M0 observations below are historical, not a statement that later adapter
implementation or account-backed receipts do not exist. The runtime amendment
records the current selected policy without rewriting those observations or
granting stage approval.

## Boundary matrix

| Boundary | Internal owner and frozen contract | M0 decision and evidence | Deferred real evidence |
| --- | --- | --- | --- |
| Replicate T2V/I2V | Provider adapter implements the shared `ProviderPort`; generation owns task/credit transitions and unknown-submission recovery | Adapter boundary, normalized DTOs, signature/replay responsibility and no-secret rule recorded; local Mock remains the only executable provider | M4: authorized model/version, region, one usable output per mode, callback/polling recovery and bounded cost evidence |
| fal.ai T2V/I2V | Same `ProviderPort`; adapter verifies documented request/user/timestamp/signature contract | Same frozen ownership and failure semantics as Replicate; no vendor request was made | M4: authorized model/version, region, one usable output per mode, callback/polling recovery and bounded cost evidence |
| Stripe | Billing adapter owns canonical object lookup, idempotency and signed events; billing domain owns economic effects | Payment aliases, browser-return prohibition, duplicate/reorder/refund rules and test-mode owner are recorded | M5: test account, catalog, canonical PaymentIntent/Invoice/Checkout map, replay/refund/dispute fixtures |
| FirstPromoter V2 | Affiliate adapter owns tracking/reconciliation; affiliate domain owns sealed workspace attribution and review state | `workspace:<uuid>` identity, disabled default, no local balance ledger and correction-hold policy are frozen | M6: account/campaign, UID and review API behavior, first-payment/reversal/review evidence |
| Lemon Squeezy | Separate vendor sales application owns hosted source checkout, fulfillment and source-affiliate policy | Vendor boundary is separate from buyer Stripe/FirstPromoter; no source checkout or live order was created | M8: merchant eligibility, license/pricing/support terms and clean per-customer fulfillment |
| Private object storage | S3-compatible adapter owns private object operations; domain owns asset ownership and download authorization | Path/ownership boundary and no-public-key rule are frozen; local fixture is sufficient for M0 | M3/M4/M8: durable object, signed-download, expiry and failure recovery in each deployment profile |
| Mail and notifications | Resend/Nodemailer adapter owns delivery; domain owns authenticated intent and retry state | Notification content and authentication boundary remain domain-owned; no email was sent | M6/M8: configured sender, redacted delivery evidence and failure/retry recovery |

## M0 feasibility decisions

1. Every selected provider is replaceable behind one adapter interface; a provider limitation must be handled in the adapter or reflected in the approved spec, never by weakening domain invariants.
2. Mock and deterministic replay fixtures prove shape, ordering, idempotency and failure handling only. They cannot satisfy M4, M5, M6 or M8 account-backed criteria.
3. Local, sandbox/test-mode and live profiles are distinct record environments. A credential or budget is never copied into this repository or the acceptance record.
4. External dispatch occurs only after a durable local intent and commit. Unknown responses remain unknown until bounded reconciliation resolves them.
5. The selected stack remains feasible for local implementation: pnpm lock/build, PostgreSQL/Drizzle/RLS, Better Auth persistence, admin/docs and Docker worker probes all have evidence under `internal/spikes/selected-stack/`.

## Task-runtime amendment — October 15, 2026

| Runtime | Current implementation and selected policy | Applicable remaining evidence |
| --- | --- | --- |
| Buyer-owned worker | `TASK_RUNTIME=self_hosted` is the default. The only runnable real-provider runtime remains isolated Railway acceptance-only: matching project, private PostgreSQL, one workspace allowlist, creates disabled by default. It shares domain/outbox/lease commands with other adapters; no isolation guard is broadened. | Selected-runtime M4 recovery and provider evidence; generic buyer production activation, M8 production entry and clean-export deployment remain unimplemented/unproved, not inferred from Railway health or fixtures. |
| Independent recovery | The current Railway worker runs its scoped drain every 10 seconds outside dispatch polling; the production interval must be positive and no greater than 60 seconds. Each drain uses up to 10 batches of at most 100 tasks, stops on no progress and requires an empty confirmation within the budget. Dispatch returns `recovery_pending` before claiming work or making provider calls while incomplete. Readiness tracks successful freshness independently for dispatch, sweep, inbox and cleanup. Local integration coverage asserts 101 overdue settlements before the first fake provider call and no duplicate POST after a second restart. | Selected-runtime deployment/restoration evidence, scoped maintenance, stale leases and concurrent settlement evidence remain applicable. Durable external heartbeat monitoring and alert delivery after three minutes without successful sweep completion remain unimplemented/unverified; in-memory readiness and fixture coverage do not prove them. |
| Optional future Trigger | `TASK_RUNTIME=trigger` is rejected even with credentials until scoped registration/deployment is verified. There is no executable/deployed optional profile or hosted PASS. Cleanup core moved to `src/modules/assets/cleanup-batch.ts`; the Trigger compatibility file only re-exports it and the unverified automatic all-workspace cron was removed. | Before future enablement: reviewed target authority/connectivity, registration/configuration, safe scope, clean export and hosted recovery proof. Missing Trigger credentials or deployment evidence is not a baseline M4 blocker for self-hosted execution. Never bypass the selector or run two runtimes for one scope. |

The approved runtime choice does not waive real-provider, credit, webhook,
storage, recovery or independent-review obligations. See the
[generation recovery runbook](../runbooks/generation-recovery.md) and
[buyer runtime boundary](../../docs/buyer/local-setup.md#task-runtime-and-production-support-boundary). Historical receipts
retain their original environment and limitations; no hosted or whole-stage PASS
is created by this amendment.

## Review and input ownership

The integration owner supplies non-secret account identity, entitlement, region and capped budget evidence. The billing owner supplies the Stripe test catalog and event fixtures. The product owner supplies commercial terms. The release owner supplies hosting and publication authority. All are listed with gate deadlines in [external-inputs.json](external-inputs.json).

The absence of those later inputs does not make the M0 local contract ambiguous; it keeps the dependent gate `BLOCKED` until the correct evidence exists. No paid/provider/payout/publishing action is authorized by this matrix.
