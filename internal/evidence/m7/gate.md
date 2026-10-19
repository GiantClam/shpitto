# M7 gate review packet

Status: `READY_FOR_REVIEW` (local/mock profile only)
Candidate: `local-candidate-20261019`
Environment: local repository, Mock generation, fixture billing, local operator evidence

## Completed local evidence

- Twelve governed Skills and four customization workflows: `internal/evidence/m7/customization/local-integrated-report.json`
- Shared Docs source and buyer export: `internal/evidence/m7/docs/local-docs-report.json`
- Vendor Docs/source synchronization preflight: `internal/evidence/m8/vendor-docs/result.json`
- Candidate ZIP SHA-256: `b1967ad98000316ad96539b6baa04c6ae499a68175d707429c8e6d91d8f14c07`
- Exact-candidate install/build/journey/restore: `internal/evidence/m8/local-demo/local-candidate-20261019/result.json`
- Exact-candidate local fulfillment fixture: `internal/evidence/m8/fulfillment/local-fixture/result.json`

## Verification

- `corepack pnpm verify:skills` — PASS
- `corepack pnpm verify:docs` — PASS
- `corepack pnpm verify:customization` — PASS
- `corepack pnpm verify:vendor-docs` — PASS
- `corepack pnpm typecheck` — PASS
- `corepack pnpm format:check` — PASS
- `node scripts/verify-local-candidate.mjs` with `SHPITTO_CANDIDATE_ID=local-candidate-20261019` — PASS
- `node scripts/verify-local-fulfillment.mjs` with `SHPITTO_CANDIDATE_ID=local-candidate-20261019` — PASS

## Open review items

Independent reviewer must inspect the exact candidate, responsive/accessibility behavior and trusted validator provenance before recording M7 PASS. M4 real-provider, M5 Stripe test-mode and M6 FirstPromoter evidence are unavailable, so this packet does not close the full M7 gate.
