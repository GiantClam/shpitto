# FirstPromoter V2 contract checkpoint

Reviewed 2026-10-04 against public official documentation; no account API or
provider mutation was invoked. `src/adapters/affiliates/firstpromoter-contract.ts`
contains the tested wire codec. The account adapter remains disabled. This is a
mapping checkpoint, not evidence of account permissions, delivery or payout.

| Operation | Published contract | Local mapping |
| --- | --- | --- |
| Authentication | `Authorization: Bearer <key>` and `ACCOUNT-ID: <account>` | Buyer-owned server credentials; never client input or logs |
| Signup | `POST /api/v2/track/signup`, `uid`, `tid` or `ref_id` | Immutable workspace UID and authoritatively verified referral ID; do not mistake arbitrary visitor IDs for promoter IDs |
| Sale | `POST /api/v2/track/sale`, required `event_id`, `amount` | Canonical payment reference; integer cash basis, never credit quantity |
| Refund | `POST /api/v2/track/refund`, `event_id`, `amount`, `sale_event_id` | Unique incremental refund reference plus original canonical sale; no same-amount deduplication |
| Review reads | `GET /api/v2/company/commissions` | Preserve provider IDs/status and complete pagination; verify account/program/customer scope |
| Approve/deny | `POST /api/v2/company/commissions/approve` or `/deny`, integer `ids` | Audited intent; explicit selected count and authoritative readback |
| Batch | `GET /api/v2/company/batch_processes/{id}` | `pending`, `in_progress`, `completed`, `failed`, `stopped` remain distinct; completed requires expected selected/processed count and zero failures |
| Notifications | Webhooks V2 supports configured custom headers | Secret header authenticates notification only; durable inbox and authoritative readback precede domain effects |

The documentation specifies sale amounts in cents except whole amounts for
zero-decimal currencies such as JPY. The local codec pins USD/EUR/GBP minor units
and JPY whole units; unreviewed exponents fail closed. Refund wire amount is a
decimal string per the published schema. Sale amounts above safe JSON integers
are rejected. Currency conversion or tax-basis ambiguity requires a hold.

More than five review IDs may run asynchronously. HTTP 200/202 and a batch ID
alone cannot authorize payout. Partial, failed and stopped batches must remain
blocked until all required item statuses are read back. The public API includes
other commission operations; they are outside this command allowlist.

The tracking docs alone do not establish account-level campaign settings or an
authoritative promoter/program verifier. These remain explicit adapter inputs;
do not enable the runtime by treating syntactically valid references as verified.

## Official sources

- https://docs.firstpromoter.com/api-reference-v2/api-admin/authentication
- https://docs.firstpromoter.com/api-reference-v2/api-admin/tracking-api/leads-and-signups
- https://docs.firstpromoter.com/api-reference-v2/api-admin/tracking-api/sales
- https://docs.firstpromoter.com/api-reference-v2/api-admin/tracking-api/refund
- https://docs.firstpromoter.com/api-reference-v2/api-admin/commissions/openapi-v2-commissions.json
- https://docs.firstpromoter.com/api-reference-v2/api-admin/batches/show-batch-process
- https://docs.firstpromoter.com/webhooks-v2/overview
