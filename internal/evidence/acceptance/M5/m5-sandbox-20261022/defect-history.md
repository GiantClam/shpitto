# M5 defect history

## Owner refund command replay after confirmation

- **Observed:** The first replay of the completed Acceptance refund command failed because eligibility preview ran before the durable command lookup. The order was already refunded, so preview rejected the replay.
- **Impact:** An owner retry could not recover the already-confirmed result through the command path. The observed failure did not create another provider refund or cash event.
- **Correction:** `src/modules/billing/refund-command.ts` now resolves an existing durable command before refund eligibility checks and returns the current request result.
- **Regression evidence:** `tests/integration/stripe-refunds.test.ts` verifies confirmed replay after the order becomes refunded. The disposable PostgreSQL refunds suite passed 21/21. The Acceptance replay returned the same request/refund with `providerCalls: 0`; see `owner-command-replay.json`.
- **Disposition:** Resolved for this candidate. Whole-stage review remains open.
