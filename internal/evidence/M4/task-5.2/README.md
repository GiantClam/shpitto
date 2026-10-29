# Task 5.2 local Replicate adapter evidence

Date: 2026-10-01. This slice implements a local, injected-transport Replicate
adapter for the two inspected Wan 2.2 rows. It constructs requests and
normalizes responses without making a network call. Production/live mode stays
blocked because the catalog rows are intentionally `liveEnabled: false` until
account-backed M4 evidence is approved.

## Scope and behavior

- `src/adapters/providers/replicate/index.ts` is a thin adapter over the shared
  `ProviderPort`; it has no database, task, credit or retry state.
- The POST body uses the persisted exact Replicate version, shared safe preset,
  approved mapping and optional authenticated webhook URL. T2V sends its
  approved `aspect_ratio`; I2V sends only the server-resolved owned image and
  deliberately omits the unsupported Replicate I2V `aspect_ratio` field.
- `ReplicateTransport` is injected. Every request carries `retry: false`, so a
  transport or SDK cannot silently create an automatic paid retry. The adapter
  performs exactly one create call. A transport error returns `unknown` and
  never becomes a rejection or a second create.
- Responses normalize only sanitized classifications. Accepted IDs are returned
  as `accepted`; explicit 4xx input/auth responses are `definitelyRejected`;
  malformed, 5xx, throttle and transport outcomes remain `unknown`.
- Poll and result calls use the exact persisted prediction ID and catalog
  snapshot. IDs, mismatched bodies and non-HTTPS output locations are rejected
  or marked unavailable. Provider output remains a candidate for the shared
  safe asset materialization pipeline; it is not durable delivery.
- Image URLs are resolved from an authorized owned asset reference through an
  injected server resolver. The test-only fallback is a deterministic local
  placeholder. Live I2V requires an explicit resolver and token.

## Test-first evidence

`red.log` records the initial missing adapter module. `green-or-errors.log`
records the first implementation's test failures; the final `coverage.log` and
the rerun below are the passing result. The contract suite in
`tests/contracts/replicate.test.ts` covers:

1. pinned T2V and I2V request fields, exact versions, webhook shape and no
   unsupported I2V ratio;
2. owned-image resolver use and rejection of live I2V without one;
3. one-call timeout/unknown behavior and no automatic retry;
4. explicit rejection versus 5xx unknown classification;
5. exact prediction-ID status/result polling and normalized output/error;
6. mismatched or missing IDs, malformed private output, disabled live rows and
   the shared persisted contract mapping.

`red-exact-id.log` records the reviewer regression before the final shared
normalizer fix: status/result bodies without the persisted provider ID were
accepted. The normalizer now requires a present, exact ID for both Replicate
and fal observations/results; `green.log` and `shared-normalize.log` contain
the final passing adapter and shared suites.

Focused commands:

```text
node --experimental-strip-types --test tests/contracts/replicate.test.ts
node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='src/adapters/providers/replicate/**' tests/contracts/replicate.test.ts
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format:check
```

The final focused run is 14/14 passing. Adapter coverage is 100% lines,
89.47% branches and 100% functions; the shared 5.1 test suite covers the
remaining common modules. Source-boundary lint and format checks pass. A
focused strict typecheck of this adapter and its declarations passes, recorded
in `focused-typecheck.log`. The current repository-wide typecheck also passes.

## Deferred boundary

This is not live-provider evidence. It does not add credentials, call
Replicate, verify webhooks, materialize temporary URLs, persist prediction IDs
in the generation attempt, or reconcile unknown submissions. Those concerns
remain owned by subsequent 5.4, 5.5/5.6 and 5.7–5.10 tasks. Domain commands
must persist the accepted submission/correlation before scheduling polling and
must never call `submit` a second time after `unknown`.
