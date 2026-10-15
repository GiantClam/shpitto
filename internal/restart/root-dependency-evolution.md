# Reviewed application dependency evolution

Date: 2026-10-15. Scope: the existing application graph in commit `a865777`, not a dependency installation or milestone promotion.

## Decision and historical boundary

REQ-FND-03 permits the selected baseline or a reviewed replacement. The M0 prototype and `provenance.json` remain unchanged historical evidence. The application now has two explicit direct-dependency differences: `@aws-sdk/client-s3` is added at `3.1141.0`, already selected by the original media/storage design; Next is pinned at `16.3.8` instead of `16.3.6` to retain the existing tested application patch without reverting the deployed application. Adoption history alone is not compatibility proof; current frozen-lock, typecheck, build and dependency-audit results must accompany this decision.

`tooling/root-dependency-baseline.json` records the exact accepted application lock and these two transitions. The application lock also contains its already-existing transitive overrides; this decision preserves their exact bytes rather than claiming that the whole graph differs by only two packages. No new dependency, version range, override or lock resolution is introduced by this verification work.

The root checker reconstructs the complete expected dependency map from the pinned prototype plus these transitions, rejects alternative dependency sections and package-manager drift, verifies both lockfiles byte for byte, and retains workspace/TypeScript/Docker isolation checks. The complete `pnpm-workspace.yaml` configuration is also pinned, including its existing transitive overrides and lifecycle-build allowlist; package extensions or changed overrides cannot bypass the guard. Historical JSON and workspace text hashes normalize CRLF to LF only so Windows and Linux checkouts identify the same text. Content changes still fail. Lock hashes never normalize line endings.

## Verification and review

The independent design review accepted this bounded evolution subject to complete-map checks, alternate-section rejection, historical text portability, digest coverage and negative regression tests. The [final independent implementation review](../evidence/M4/task-5.10/railway-worker/root-baseline-review-20261015.md) passed after the workspace-settings bypass was reproduced and fixed. This resolves the root-baseline blocker only and does not approve M4.

The evolution registry is already covered by the canonical source/configuration/validator footprints through `tooling/`; this decision is explicitly included in the contract footprint. Editing either invalidates development evidence. Root-integrity regressions cover the accepted graph, dependency additions/removals/versions/ranges, package-manager drift, historical tampering, raw lock drift, checkout line endings and legacy isolation. Future graph changes require a new rationale, current compatibility evidence and independent review. Do not overwrite M0/M1 evidence or regenerate the registry from the current manifest to silence a failure.
