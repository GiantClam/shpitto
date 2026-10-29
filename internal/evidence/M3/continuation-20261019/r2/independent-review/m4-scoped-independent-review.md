# M4 scoped applicability independent review

Reviewer: codex-independent-reviewer-r2-20261019

Reviewed at: 2026-10-19T07:21:48Z

Decision: PASS for scoped applicability assessment only

Stage acceptance decision: NOT_RUN

The current r2 candidate is bound to sourceTreeSha256 e5cf13a5d4af7747fcb83bc10e940e73e731570a0df4dd6361aaced0890a71be, schemaSha256 7560a6a5b059bb33a47e7afa878826d73cf57f05a3a6a6f5ffa1ff2eb7f08d0f, configurationSha256 07533fb94ecce587a9ae2639c857fea11c837303a119505715ff703013b985cd, contractSha256 b9b18ecc7f944962df5880e4a0ffa255f2ea1621787cbc623c80e6ce588387b6, validatorSha256 e77e8954b8fb3774d56454f92fef306e8a213cb2515a2ca7eceb5a8fec1d7dbf and lockfileSha256 d0ac1bee9c86cc4ab58aa540b69148d26ca7aaf3cd8cf1e1321b6e2461fa7c35.

The r2 digests match internal/evidence/m7/local-current-20261019/continuation/baseline-r2/candidate.json and the current M3 automated/browser candidate receipts. The retained comparison verifies byte-identical provider adapters, storage adapters, generation-domain modules, current M3-owned modules, provider contracts, schema/migrations, deployment/workflow files, provider-worker scripts and the lockfile. The only configuration-group difference recorded by the comparison is tooling/lint-policy.json. The r1-to-r2 impact record contains exactly four validation-policy paths and reports 58/58 affected regressions passing.

Carry-forward scopes:

- The four retained live provider rows, bound to their original accounts, model versions, request mappings and declared cost limitations.
- The retained private R2 lifecycle evidence, bound to its original private-storage policy, account/model mapping and deployment profile.
- Selected self-hosted recovery evidence, bound to its original worker/runtime deployment profile and declared limitations.
- The byte-identical provider, storage, generation, M3-domain, contract, schema, deployment and worker-script subsets listed in the JSON review.
- The exact r2 lockfile and dependency boundary.

The local provider/storage/webhook/worker/crop/creation contract run is 234 passed, 0 failed and 0 skipped, recorded in internal/evidence/M3/continuation-20261019/m4-local-contracts.log.

The following 19 changed UI, component and brand paths are excluded from carry-forward:

1. src/app/(app)/dashboard/generation-panel.tsx
2. src/app/(app)/dashboard/page.tsx
3. src/app/(app)/dashboard/team/page.tsx
4. src/app/(app)/workspaces/[w]/billing/page.tsx
5. src/app/(app)/workspaces/[w]/settings/members/page.tsx
6. src/app/(app)/workspaces/new/page.tsx
7. src/app/(marketing)/page.tsx
8. src/app/creator-qa-check/page.tsx
9. src/app/globals.css
10. src/app/layout.tsx
11. src/components/creation/creator-home.tsx
12. src/components/creation/examples.ts
13. src/components/creation/media-icon.tsx
14. src/components/generation/creation-draft.ts
15. src/components/generation/crop-consent.ts
16. src/components/generation/input-crop.tsx
17. src/components/shell/site-shell.tsx
18. src/config/brand.ts
19. src/config/navigation.ts

The historical M4 record at internal/evidence/acceptance/M4/m4-self-hosted-20261017/record.json remains a PASS bound to its own October 17, 2026 candidate. Its reviewer and integrator identities are not copied onto r2, and the historical PASS is not promoted by this review.

Historical limitations remain: AWS S3 live connectivity, production email, commercial readiness, merchant/commercial authorization, Stripe transactions, FirstPromoter evidence, historical anomalous-balance recovery, further paid provider generation and later release labels are outside this scoped assessment. Current remote service availability and provider-account state were not inspected, and this review executed no paid/cloud/provider calls, live rows, remote deployments or production changes.

This PASS applies only to applicability and evidence carry-forward scope. It does not unlock M4 acceptance, release work or production/commercial action.
