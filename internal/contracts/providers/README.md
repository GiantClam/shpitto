# Selected provider contracts

These files contain official public schema observations for task 5.1. The four
schema files are UTF-8 JSON with LF endings and a final newline. Each manifest
digest is SHA-256 of those exact retained bytes. It is not a provider-reported
build digest, a price quote, or proof of successful account-backed inference.

Both Replicate pins were read from the `version.id` object in their official
public model pages. The selected `openapi_schema`, or its public dereferenced
equivalent, belongs to that same exact version object. The fal schemas were read
from the public queue OpenAPI endpoint for the selected endpoint ID. A fal schema
digest detects contract drift; the hosted endpoint remains mutable and has no
claimed immutable model build.

`manifest.json` records the source URL, inspection timestamp, HTTP status,
observed version, file name, digest, and account-validation boundary. The
inspection helper is
`internal/evidence/M4/task-5.1/inspect-official-schemas.mjs`. Reinspection is an
explicit contract update: compare retained bytes, review drift, update the code
catalog only after approval of the new contract, and regenerate dependent
evidence. Never overwrite a release's accepted snapshot during reconciliation.

The code register is `src/config/provider-models.ts`. All four rows have
`liveEnabled: false`; the executable local catalog in `src/config/models.ts`
continues to expose only Mock. Shared input, result, observation and submission
types have one owner in `src/adapters/providers/port.ts`. Paid submissions,
account eligibility, webhook authentication, provider result downloading and
real-output evidence belong to subsequent M4 tasks.

The public input DTO accepts only model key, mode, bounded prompt, aspect ratio,
and an owned asset/crop-confirmation reference. The safe preset is 720p, 81 frames
and 16 fps. Product copy must say approximately five seconds; delivered duration
and dimensions must be measured. All four mappings explicitly enable applicable
safety checks and disable interpolation and prompt expansion. Replicate I2V does
not receive the unsupported `aspect_ratio` field.

Image normalization and authorization remain asset/domain responsibilities.
Before freezing a submission, the domain must resolve a ready workspace image,
confirm its exact crop digest and 1280x720 or 720x1280 normalized dimensions, and
check live actor access in the same creation transaction. The `AuthorizedOwnedImage`
argument is trusted server data, never a browser request body. Likewise, the quote
must already be issued by the authoritative server catalog; its semantic hash
detects inconsistency and is not a secret or authentication mechanism.

Submission snapshots contain the accepted catalog/endpoint/version/schema,
validated input digest, server quote, persisted attempt correlation and deadline
policy. Reconciliation references contain the accepted catalog copy. The domain
must persist the snapshot before any upstream create call and derive execution
and recovery deadlines from its persisted claim/observation times.

New submission admission consults the current model register. Mapping an
already accepted input validates against the persisted catalog and an explicit
supported catalog-version implementation. It does not look up the current
register or adopt current preset defaults. Removing a model from future choices
therefore cannot reinterpret an accepted attempt. Unknown catalog versions and
unsupported version-specific presets fail closed.

Output URLs are internal candidates. HTTPS syntax is not SSRF protection or a
delivery guarantee; the existing asset pipeline still performs origin/DNS
checks, bounded streaming, media validation and owned atomic materialization.
No adapter changes task state or credits. Transport uncertainty stays `unknown`;
it never authorizes a second paid create attempt.

The Mock port is a thin bridge using existing `submitMock` and `observeMock`
functions. Its injected state reader supplies persisted script/poll state. It
does not create a separate in-memory queue, advance polls, or introduce public
Mock webhooks. The existing M3 worker remains the owner of persisted Mock work;
worker integration with live providers is a subsequent implementation boundary.
