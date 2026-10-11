# Generation recovery runbook

The recovery schedule reads `generation_tasks.deadline_at` and `next_action_at` directly. It does not depend on the original Trigger run or on a provider retry queue. Local verification uses a ten second interval; production uses one minute.

1. Run `node --experimental-strip-types scripts/reconcile-overdue.ts` with the intended `DATABASE_URL`.
2. Confirm the JSON result reports the scanned and terminalized task counts.
3. For an unknown provider submission, reconcile the exact persisted provider request or let the bounded recovery budget expire. Never issue a second paid create from a missing response.
4. If the outbox heartbeat is older than three minutes, stop stale workers and allow the fenced lease to expire before restarting the pump.

The command invokes domain recovery operations and does not edit task status, balances, or reservations directly.
