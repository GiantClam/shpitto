# Task 5.1 local contract evidence

Date: 2026-10-01. Scope: shared provider contracts, strict public input, safe
mapping, inspected schema registry, immutable submission snapshots and a thin
bridge over the existing local Mock. No credentials or paid requests were used.

## Changes and ownership

- `src/adapters/providers/port.ts`: single normalized provider interface and DTOs.
- `src/adapters/providers/input.ts`: strict public input, crop/quote/correlation
  checks, frozen accepted policy/catalog snapshot and safe upstream field mapping.
- `src/adapters/providers/normalize.ts`: accepted/rejected/unknown and provider
  observation/result translation, with immutable accepted request references.
- `src/adapters/providers/mock.ts`: existing Mock function reuse with injected
  persisted state reader; no competing persistent or in-memory job store.
- `src/config/provider-models.ts`: four disabled live rows, exact inspected
  versions/schema digests, drift rejection and bounded capabilities.
- `internal/contracts/providers/**`: retained official public schema bytes and
  provenance, explicitly separating fal schema identity from immutable builds.
- `tests/contracts/provider-inputs.test.ts`: local contract regressions.

## Red and green evidence

`red.log` captures the test-first missing implementation. `red-boundary.log`
captures two behavioral failures after the first implementation: a forged
TypeScript validated-input object bypassed crop confirmation, and an observation
held an alias to mutable accepted catalog data. Mapping now validates the public
fields again, and observations take a frozen catalog copy. `green.log` contains
the passing contract suite. Typecheck, source boundary lint and format checks
are recorded in their corresponding logs.

Independent review identified a further SC-PRV-06 boundary: mapping consulted
the current model register, so retiring a model could block an already accepted
attempt. `red-persisted-contract.log` captures the historical-catalog failure
and missing rejection of an unsupported catalog version. Mapping now validates
strictly against the supplied persisted catalog using the supported version-one
mapping. New admission still uses the current registry; unknown versions and
unsupported version-one presets are rejected. The regression exercises all four
historical provider/mode snapshots after their model keys are absent from the
current register. `green.log` contains the final passing suite.

The schema test recomputes the SHA-256 of all four retained official schema
files, compares them with both provenance and code registry, and checks exact
versions. Mapping tests ensure every transmitted field is present in the
inspected schema and every required field is supplied. Other assertions cover
unsupported fields/ratios, crop revision/workspace/dimension mismatch, quote and
deadline snapshot stability, drift blocking, unknown submission, completed with
error, request identity mismatch, local Mock failure/delay/success, and immutable
accepted catalog references.

## Acceptance boundary

This evidence supports task 5.1's local contract slice and SC-PRV-02 through
SC-PRV-06 at the pure contract boundary. It does not claim the four real-output
rows in SC-PRV-01 or the M4 stage gate. Live adapters, verified callbacks, asset
crop UI/normalization, durable live-attempt integration and account-backed output
verification remain subsequent tasks. Existing local M3 services and database
contents were not modified by this work.
