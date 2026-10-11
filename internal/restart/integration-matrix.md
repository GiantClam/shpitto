# M0 external integration matrix

Status: **LOCAL_CONTRACTS_FROZEN_EXTERNAL_EVIDENCE_DEFERRED**. The selected boundary, DTO shape, adapter responsibility and evidence owner are frozen for implementation. No row claims an account, paid call, payout or production deployment. Account-backed rows remain explicit blockers for their later gates.

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

## Review and input ownership

The integration owner supplies non-secret account identity, entitlement, region and capped budget evidence. The billing owner supplies the Stripe test catalog and event fixtures. The product owner supplies commercial terms. The release owner supplies hosting and publication authority. All are listed with gate deadlines in [external-inputs.json](external-inputs.json).

The absence of those later inputs does not make the M0 local contract ambiguous; it keeps the dependent gate `BLOCKED` until the correct evidence exists. No paid/provider/payout/publishing action is authorized by this matrix.
