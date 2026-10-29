# Real provider integrations

## Purpose

Deliver genuine text-to-video and image-to-video through both selected providers using versioned contracts, authenticated observations and owned durable output, while keeping provider-specific behavior outside credit settlement authority.

## ADDED Requirements

### Requirement: REQ-PRV-01 Four selected real provider-mode contracts

The release SHALL provide all four real contracts: Replicate wan-video/wan-2.2-t2v-fast pinned to c483b1f7b892065bc58ebadb6381abf557f6b1f517d2ff0febb3fb635cf49b4d; Replicate wan-video/wan-2.2-i2v-fast pinned to 4eaf2b01d3bf70d8a2e00b219efeb7cb415855ad18b7dacdc4cae664a73a6eea; fal-ai/wan/v2.2-a14b/text-to-video; and fal-ai/wan/v2.2-a14b/image-to-video. Inspected schemas/digests SHALL be retained. A mutable fal endpoint MUST NOT be described as an immutable model build. Mock evidence MUST NOT replace any row.

Trace: D03, D10; J3; T13, T14, T53; G03, G10. Tasks: 5.1, 5.2, 5.3, 5.10.

#### Scenario: SC-PRV-01 All four rows produce owned video

- **WHEN** each selected provider/mode is exercised with authorized account resources and valid inputs
- **THEN** each row records its exact contract/request ID, usable durable downloaded output and credit outcome; a missing row keeps the real-provider gate incomplete

#### Scenario: SC-PRV-02 Contract drift is explicit

- **WHEN** a pinned Replicate version is unavailable or a fal schema digest changes
- **THEN** the affected capability is blocked pending evidence-backed contract review rather than silently switching model/version

### Requirement: REQ-PRV-02 Bounded shared preset and owned-image crop consent

The initial preset SHALL use 720p, 81 frames, 16 fps and 16:9 or 9:16, with safety checking enabled and interpolation/prompt expansion disabled as mapped in the selected contracts. Duration SHALL be described as approximately five seconds and measured from delivered media. Image-to-video SHALL use an authorized normalized owned image after showing the chosen crop; the pinned Replicate I2V request MUST NOT send an unsupported aspect_ratio field. Arbitrary client URLs/LoRA/last-frame inputs MUST be rejected.

Trace: D03, D10; J3; T02, T13; G03, G10. Tasks: 5.1, 5.2, 5.3.

#### Scenario: SC-PRV-03 Image ratio is realized through approved crop

- **WHEN** a user selects 9:16 for Replicate image-to-video
- **THEN** the user confirms the normalized owned-image crop, the adapter supplies its image URL without unsupported aspect_ratio and output dimensions/duration are measured

#### Scenario: SC-PRV-04 Unapproved parameters do not reach providers

- **WHEN** a request includes a foreign source URL or arbitrary vendor fields outside the catalog DTO
- **THEN** validation rejects the request before reserve/submit and the documented safe preset remains authoritative

### Requirement: REQ-PRV-03 One normalized provider observation contract

Provider adapters SHALL expose capabilities, validate, submit, getStatus, readResult and verifyWebhook operations through one shared contract. Submit SHALL distinguish accepted(requestId), definitelyRejected and unknown. Status/result observations SHALL distinguish queued/running, usable result and failure. Adapters MUST NOT mutate ledger or independently settle task state. Endpoint/schema/input digest and attempt nonce MUST be persisted before dispatch; trusted provider IDs SHALL be persisted before scheduling follow-up.

Trace: D03, D10, D15, D20; J3, J4; T11, T12, T13, T20; G03, G10, G15, G20. Tasks: 5.1, 5.2, 5.3, 5.4.

#### Scenario: SC-PRV-05 Different provider vocabularies normalize safely

- **WHEN** Replicate or fal returns accepted IDs, completed-with-error results or unknown transport outcomes
- **THEN** the adapter returns the correct normalized observation and domain commands alone choose state and credit effects

#### Scenario: SC-PRV-06 Persisted contract survives configuration changes

- **WHEN** the operator changes future model configuration while an accepted task is being reconciled
- **THEN** the task keeps its persisted endpoint/schema/input and policy snapshot and does not reinterpret its accepted price or provider request

### Requirement: REQ-PRV-04 Provider-specific authenticated callbacks

Replicate callbacks SHALL verify raw bytes using its HMAC-SHA256 signing secret and webhook-id/timestamp/signature headers with a 300-second tolerance. fal callbacks SHALL verify ED25519 over its documented signed values/body digest using trusted JWKS cached at most twenty-four hours, a 300-second tolerance and expected account user ID. Both SHALL match authenticated provider/request/attempt identity and persist a deduplicated inbox before acknowledgment. Attempt nonce alone MUST NOT authenticate a callback.

Replicate account provenance SHALL be confirmed before a paid POST and before the receiver trusts its signing key: the submission token MUST authenticate both GET /v1/account and GET /v1/webhooks/default/secret, the account MUST exactly match REPLICATE_WEBHOOK_ACCOUNT_ID in canonical `user:username` or `organization:username` format, and the returned signing key MUST match the configured key. A process-local confirmation MAY be reused for at most five minutes only for the exact API base, token, key, account and callback configuration digest; missing, mismatched or expired/unrefreshable association SHALL fail closed. Runtime dispatch SHALL await this preflight before claim/submit fencing, and the adapter SHALL independently enforce it before POST. No credentials or route nonces SHALL appear in evidence or telemetry.

Replicate prediction callbacks SHALL NOT require or trust undocumented `account_id`, `metadata.attempt_nonce`, or an echoed `webhook` URL. The receiver SHALL explicitly supply the privately issued UUIDv4 route nonce after looking up its persisted attempt. A known prediction MUST match the signed body `id` against that attempt's persisted provider request ID. Missing-ID adoption SHALL require a signature under the confirmed account key, an issued nonce, the existing durable submit fence and provider-ID uniqueness. The URL nonce is private correlation, not cryptographic destination binding: a leaked nonce plus a fresh signed payload from the same account can defeat unknown-ID correlation, so this recovery is limited to a threat model excluding that combination. The signed-content contract does not include the destination URL, and the current prediction response schema documents no echoed callback URL that could strengthen this check. Protocol provenance and official sources: `internal/evidence/M4/task-5.10/railway-worker/replicate-protocol-review-20261015.md`.

Trace: D03, D10, D20; J3, J4; T09, T19, T22, T53; G03, G10, G20. Tasks: 5.4.

#### Scenario: SC-PRV-07 Reject forged stale or wrong-account observations

- **WHEN** a callback has invalid signature, stale timestamp, wrong account or conflicting request/attempt mapping
- **THEN** it is rejected before any trusted observation, task transition or ledger effect is recorded

#### Scenario: SC-PRV-08 Authenticated callback is durable and replay-safe

- **WHEN** a valid signed callback is duplicated and the processor crashes after inbox acknowledgment
- **THEN** durable replay resumes processing, preserves terminal rules and does not duplicate credit effects

### Requirement: REQ-PRV-05 Paid create retries disabled and exact reconciliation

Paid submit SHALL disable SDK/HTTP automatic retries and fal platform retries using X-Fal-No-Retry: 1. No selected endpoint SHALL be assumed to provide create idempotency or missing-ID search. Reconciliation SHALL use authenticated exact IDs or verified callbacks under the generation budget. Retries from the selected self-hosted worker or optional Trigger runtime MUST resume safe status/result recovery rather than repeat creation. A proven endpoint-specific idempotency exception requires separate reviewed evidence before use.

Trace: D10, D13, D20; J4; T11, T12, T20, T53; G10, G13, G20. Tasks: 5.2, 5.3, 5.5, 5.6.

#### Scenario: SC-PRV-09 Runner retry does not duplicate provider spend

- **WHEN** a Trigger run retries after a provider submit timeout or after losing its acknowledgment
- **THEN** the stored attempt enters safe reconciliation and no second create request is issued

#### Scenario: SC-PRV-10 Missing-ID similarity is not ownership evidence

- **WHEN** a lookup finds a similar prompt/time but no exact provider/attempt correlation
- **THEN** the result is not attached to the task and the bounded unknown-outcome policy continues

### Requirement: REQ-PRV-06 Durable output and truthful real-integration evidence

Provider temporary URLs SHALL be materialized through the shared safe asset pipeline before success. Replicate output URI and fal video.url SHALL be normalized without exposing them as permanent delivery. Each real-provider gate SHALL record contract, account-backed request, owned download, credit outcome and limitations. Fixtures, missing budget or unavailable account capability SHALL be labeled and MUST NOT be reported as a passed live integration.

Trace: D03, D10, D19, D20; J3, J4, J9; T13, T14, T15, T48, T49; G03, G10, G19, G20. Tasks: 5.7, 5.8, 5.9, 5.10.

#### Scenario: SC-PRV-11 Expiring provider output is not permanent delivery

- **WHEN** a valid provider URL expires during an interrupted copy
- **THEN** the bounded materialization policy refreshes authoritative output if supported or eventually fails/refunds; it never marks the temporary URL as durable success

#### Scenario: SC-PRV-12 Unavailable paid evidence keeps gate open

- **WHEN** the implementation has passing fixtures but lacks authorized live-provider resources or one required mode run
- **THEN** the report distinguishes fixture evidence and blocked real rows, and M4/G03/G10 remain incomplete
### Requirement: REQ-PRV-07 Portable private object storage for provider output

The application SHALL expose one private object-storage port for input assets and provider outputs. The local filesystem adapter SHALL support development, Docker demo and offline acceptance. A single S3-compatible adapter SHALL support Cloudflare R2 as the managed reference profile, AWS S3 as the buyer-enterprise profile and MinIO as a local contract-test target. Provider-specific domain logic MUST NOT branch on R2 versus AWS S3. Production configuration MUST reject local storage and require an endpoint, bucket, region and credentials for the S3-compatible driver. Durable assets SHALL store only opaque tenant-scoped object keys and validated media metadata; temporary provider URLs MUST NOT be used as permanent delivery locations.

The storage boundary SHALL support bounded put/get/delete operations, atomic publication after media probing, retryable cleanup and application-authorized downloads. Public buckets, unbounded provider redirects, permanent provider URLs and storage credentials in browser code are forbidden. S3-compatible lifecycle/listing differences SHALL remain inside the adapter; the domain SHALL not assume filesystem directory scans in production. Each provider-output download, including DNS resolution, HTTP redirects and response-body streaming, SHALL use one total timeout of 120 seconds; on expiry the in-flight HTTP request or response stream SHALL be aborted, the asset SHALL not be published, and normal bounded materialization recovery SHALL apply.

#### Scenario: SC-PRV-15 Provider-output downloads terminate within a bounded deadline

- **WHEN** DNS resolution, an HTTP request or response-body streaming stalls during provider-output materialization
- **THEN** the download fails within 120 seconds of starting, pending network work is aborted where supported, no asset is published, and the existing bounded materialization recovery handles the failure

Trace: D03, D19, D20; J3, J4, J9; T02, T13, T14, T15, T48, T49, T53; G03, G10, G19, G20. Tasks: 5.7, 5.10.

#### Scenario: SC-PRV-13 Local and S3-compatible profiles preserve one asset contract

- **WHEN** the same validated media is materialized under local storage, Cloudflare R2 or AWS S3 configuration
- **THEN** the database records the same tenant-scoped object-key/metadata contract, authorized download behavior is equivalent, and provider URLs are absent from durable asset delivery

#### Scenario: SC-PRV-14 Storage publication is recoverable

- **WHEN** a provider output download, object write, media probe, database publication or cleanup step fails
- **THEN** the asset cannot become ready until all required checks pass, failed objects are deleted or scheduled for bounded orphan cleanup, and a later retry does not duplicate the ready asset

