# M4 task 5.5: Trigger and fenced outbox dispatch

The Trigger adapter delegates to `runOutboxPumpOnce`, which claims the durable event, renews the existing fenced lease, invokes a shared domain callback, and acknowledges, releases or fails only while the lease is current. `dispatchGeneration` delegates to the existing atomic generation claim; it does not create another paid submission on retry.

The existing Docker probes `probe-outbox-lease.ts`, `probe-generation-lifecycle.ts` and `probe-generation-races.ts` pass after the adapter was added. This is local scheduling evidence; hosted Trigger credentials and provider spend are not claimed.
