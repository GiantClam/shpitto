# Task 5.3 fal queue T2V and I2V adapters

Date: 2026-10-01. This is the local adapter-contract slice only. It does not enable live fal requests, account credentials, paid generation, callbacks or durable output.

The adapter uses the shared `ProviderPort`, server-owned input mapping and the inspected fal queue endpoints. It sends `X-Fal-No-Retry: 1`, sets transport retry to false, requires an exact `request_id`, validates status and response tracking origins against the selected queue endpoint, and keeps queue `COMPLETED` separate from a result containing a usable `video.url`. I2V receives only an authorized server-owned image URL. Live catalog rows remain disabled.

## Verification

- `tests/contracts/fal.test.ts`: 5/5 focused tests pass.
- The tests cover safe T2V/I2V mapping, no-retry headers, exact request identity, queue/result separation, missing IDs, foreign tracking URLs, live-disabled behavior and bounded configuration failures.
- `corepack pnpm typecheck`, source-boundary checks and formatting pass.
- The injected transport never opens a network connection. No fal account, token, paid request or callback is claimed.

## Remaining scope

Durable generation attempts, authenticated fal callbacks, Trigger/outbox dispatch, safe media materialization and the real-provider gate remain later tasks 5.4 through 5.10.
