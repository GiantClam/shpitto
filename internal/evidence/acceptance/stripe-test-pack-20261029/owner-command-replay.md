# Owner refund-command replay (in-process only)

Status: `PASS_IN_PROCESS_ONLY`. This is not an M5 stage PASS, not hosted owner-command replay, and not a Stripe refund.

Date: 2026-10-29T08:41:30Z
Suite: `node --experimental-strip-types --test --test-reporter spec tests/integration/stripe-refunds.test.ts`
Suite result: 22 pass, 0 fail
Log: `internal/evidence/acceptance/M5/m5-current-20261029/stripe-refunds-stepup-closure.log`
Database: disposable PostgreSQL on `127.0.0.1:55433`
Provider: in-process fake refund provider. No live Stripe call.

## Test

`owner refund command replays the current confirmed result after the order becomes refunded`

The case calls the owner command `requestBillingRefund` twice with the same input.

- The first result is `confirmed`, and the local order status becomes `refunded`.
- The second result equals the first result with `replayed: true`.
- The fake provider recorded a single `create` for the whole case. The replay added no provider call (`providerCalls: 0` on replay).
- One refund request row and one cash row remain.

## Do not refund the staging pack

The unused acceptance pack must not be refunded for this item. This note does not authorize a refund of workspace `88e1b0a0-a097-4a8c-b274-f5b8f0ab80d1`, order `da90a49b-c55a-4dcb-8fa1-a983769ff9a0`, or grant `7f0a93a4-78f6-4c4a-9468-5a0c4a84ec81` (250 credits still available).

Hosted owner-command replay, the $25 subscription, hosted refunds, and live charges remain open. M5 stays `IN_PROGRESS`.
