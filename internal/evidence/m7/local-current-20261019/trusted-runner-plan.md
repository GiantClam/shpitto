# Trusted runner implementation plan

Owner: release validation boundary. Existing `validateEvidence` only validates
submitted JSON; it cannot establish trusted tool provenance or measure buyer
staging. REQ-SKL-04 and SC-SKL-11/12/13 require an executable boundary.

Implement a delivered helper under `scripts/lib`, a buyer-only fingerprint
contract, pinned check definitions, consumer context flags and focused tests.
The trusted directory, reviewer-controlled pin and retained evidence store must
all be outside staging after realpath resolution. Validate the actual helper,
validator, policy, footprint and suite bytes against the external pin. Reject
candidate replacements of protected files. Explicit independently reviewed
rebaselines retain the prior pin checksum, rationale, scope and review.

Preparation snapshots measured buyer files into the external evidence store and
overlays pinned suites there. Relative imports consequently resolve candidate
modules, while compiler dependencies resolve only from the trusted directory.
Checks execute without a shell. Retain each output and checksum, remeasure
staging afterward, and submit the record for independent review. Export/deploy
remain validation-only: require approval of the exact retained record in the
external pin, verify its logs and staging identity, remeasure actual staging,
and reexecute required checks. Old evidence plus old candidate JSON cannot
authorize changed staging. No secret signing key or claim that buyer source is
immutable is introduced; protecting the external pin/store is an operator trust
and access-control prerequisite.

Tests cover candidate behavioral defects against a healthy baseline, tool/policy/
suite tampering, forged or missing retained proof, source/config/schema/contract/
lock changes, root identity reuse, path overlap and symlinks, and deliberate
reviewed rebaseline. The ordinary wrappers will reject their old JSON-only API
without explicit trusted context. No M3 or application runtime files change.
