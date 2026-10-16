# Replicate protocol correction - October 15, 2026

## Scope and evidence boundary

Owner layer: provider adapter and callback contract. This executor inspected public official documentation/OpenAPI and used injected local transports only. It did not read real env files or credentials, authenticate to Replicate, create predictions, deploy, or commit. Passing fixtures are not live T2V/I2V evidence. The leader owns authenticated account preflight, deployment and remaining authorized real runs.

Upstream contracts inspected: `openspec/changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md` (REQ-PRV-03/04/05), `docs/plans/2026-09-27-shpitto-detailed-technical-design.md` (provider identity/no-second-create contract), and the official sources below. This is an adapter contract defect, not a generation-skill or model-prompt defect; higher-layer wording cannot make fictional response fields exist.

## Proven official documentation

Sources inspected anonymously on October 15, 2026:

1. [HTTP API reference](https://replicate.com/docs/reference/http): prediction webhooks contain the GET-prediction response body; GET /v1/account identifies the token's user or organization.
2. [Public OpenAPI schema](https://api.replicate.com/openapi.json): `schemas_prediction_response` documents `id` and prediction state, but not `account_id`, `metadata`, or `webhook`. `schemas_version_prediction_request` allows `input`, `stream`, `version`, `webhook` and `webhook_events_filter`, with `additionalProperties: false`. Account `type` and `username` are required. Prediction status includes `aborted`.
3. [Verify webhooks](https://replicate.com/docs/topics/webhooks/verify-webhook): the default signing secret belongs to the API token's user/organization. The key endpoint returns `key` in `whsec_` base64 form. HMAC-SHA256 authenticates webhook ID, timestamp and raw body, not the destination URL.
4. [Set up webhooks](https://replicate.com/docs/topics/webhooks/setup-webhook) and [receive webhooks](https://replicate.com/docs/topics/webhooks/receive-webhook): supply an HTTPS callback destination and handle repeated/out-of-order delivery safely.

Absence from the documented prediction schema is not proof that a future/private response can never contain extra fields. It is proof that these fields cannot be required for interoperability. No documented signed callback URL echo was found; the `urls` prediction links are not a callback destination.

## Defects corrected and local contract choices

- `src/adapters/providers/replicate/webhook.ts` formerly expected account/nonce payload fields that real documented callbacks need not have. Account identity now comes from a confirmed token/key association; attempt correlation is explicit trusted caller context, never body metadata.
- `src/app/api/webhooks/replicate/[attemptNonce]/route.ts` formerly compared the signed prediction ID against a reference built from the same body ID even when storage already had an ID. It now uses `attempt.providerRequestId` when present. Only missing-ID recovery starts with the signed body ID.
- Live create formerly depended on configured labels rather than confirmed account/key association. `account-binding.ts`, the adapter and shared runtime now require account and default-key GET confirmation using the exact submission token, with no retries or alternate API origin.
- Canonical `REPLICATE_WEBHOOK_ACCOUNT_ID` is exactly `user:username` or `organization:username`, preserving case. It is a local composite identity, not a claimed upstream opaque account ID. Do not use `account:user:username`, a bare username, or a numeric ID.
- Confirmation is cached for five minutes from preflight start, scoped to transport identity and a SHA-256 digest of API base/token/configured secret/account/callback base. A changed configuration, stale proof, backward clock or failed refresh cannot reuse that cache entry. Returned process-local proofs contain no credentials; copied/forged objects are not accepted. Key equality uses decoded bytes and constant-time comparison. Freshness/cache duration and canonical label format are application policy, not upstream guarantees. Rotation can remain undetected until the cache expires; simultaneous cold requests may repeat the read-only GETs.
- Receiver, adapter verifier and without-reference verifier use the same confirmation proof contract. A receiver obtains confirmation for its current submission token/configuration before trusting its configured secret. Verification uses exact raw bytes, the original timestamp text, supported v1 signatures and a 300-second tolerance.
- Callback URLs contain the durable issued UUIDv4 nonce in the path. Invalid nonce, credentials, query or fragment are rejected before create. `aborted` normalizes to failed for status and result.

## Correlation threat model and unchanged spend invariants

Known-ID callbacks require the signed `id` to equal the persisted attempt ID; relaying a different prediction cannot replace it. Missing-ID adoption requires a signed body under the confirmed account key, the privately issued nonce, the existing persisted submit fence, and the existing unique provider/request constraint. No prompt/time similarity search is allowed.

Inference/limitation: the nonce is not signed, and a signature is account-wide rather than per-attempt. An attacker holding both an issued nonce and a fresh signed payload for another prediction under the same account could transplant that payload to a missing-ID route. This correction does not claim to prevent that attack. Keep callback URLs, nonces, raw callback bodies and signed headers out of logs/evidence; restrict the account and its integration operators. If that threat must be covered, missing-ID adoption must remain disabled until stronger independently reviewed provider evidence is available. Do not invent a signed `webhook` or metadata echo to hide this limitation.

No documented create-idempotency guarantee was found. The transport still performs one POST at most per worker fence, never automatically retries create, and missing/ambiguous acknowledgment stays unknown. Existing lifecycle adoption, provider-ID uniqueness, deduplicated inbox, terminal/reorder rules and UNKNOWN provider-cost settlement remain authoritative. A failed preflight is not a definitive provider rejection; never use it to infer that an earlier ambiguous create did not spend.

## Verification and leader handoff

TDD red observations included a missing binding module, POST before preflight, accepted unconfirmed webhook context, unsupported `aborted`, and a missing rejection for unusable callback correlation. Green focused tests exercise documented bodies without invented fields, wrong/unavailable/missing account-key association with zero POSTs, cache expiry/reconfiguration, forged proof, known-ID mismatch and verification-entrypoint consistency. The recovery probe is entirely deterministic and fake-only.

Executor results: 57/57 passed across `replicate.test.ts`, `replicate-account-binding.test.ts`, `replicate-webhook-boundaries.test.ts`, `provider-webhooks.test.ts`, `provider-worker.test.ts` and `optional-provider-env.test.ts`. `scripts/probe-provider-recovery.ts` passed all four deterministic cases. Direct `tsc --noEmit --incremental false`, source-boundary lint, read-only format check and scoped `git diff --check` passed. Direct TypeScript was used instead of `next typegen` to avoid loading real env files. No new dependencies were added.

`tests/integration/provider-worker.test.ts` retains live admission with injected account/key GETs, separately counts POSTs for definitive rejection/unknown/race cases, and adds a zero-POST failed-binding/restart case. Its injected factory exercises the adapter's final guard after the fence and therefore recovers conservatively as unknown; the real runtime additionally preflights before claim/fence. The leader integrated that awaited runtime preflight in `src/modules/generation/provider-worker.ts`. Disposable database execution belongs to the leader; this executor did not start Docker or contend for local port 55432.

Before enabling create, the leader must verify the exact canonical identity/token/default-key association in both app and worker, capture sanitized read-only receipts, independently review the final source bundle, and run the isolated integration suite. This note does not assert deployed health or completion of the four real-provider application rows.
