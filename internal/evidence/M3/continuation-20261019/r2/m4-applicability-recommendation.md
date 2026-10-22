# M4 applicability recommendation for the final r2 candidate

Recommendation: **propose scoped evidence carry-forward for independent review**.
This is not a current M4 acceptance decision or a new remote execution receipt.

The exact candidate is
`e5cf13a5d4af7747fcb83bc10e940e73e731570a0df4dd6361aaced0890a71be`,
with all six digests matched to
`internal/evidence/m7/local-current-20261019/continuation/baseline-r2/candidate.json`.
The approved comparison baseline is
`internal/evidence/acceptance/M4/m4-self-hosted-20261017/record.json` and its
retained `digest-footprints.json`. The independent review and integration there
are historical decisions bound to their own candidate. Their identities and
approval are not copied onto r2.

`footprint-comparison.json` verifies the historical footprint digests before
comparison and retains all per-file hashes and differences. The r2 candidate
matches all 13 provider adapters, seven storage adapters, 11 generation-domain
modules, 39 M3-owned modules, six provider contract files, 49 schema/migration
files, seven deployment/workflow files and three provider-worker scripts.
The dependency lockfile matches. The configuration group differs only in the
validator environment-access policy in `tooling/lint-policy.json`.

The runtime tree as a whole differs: 19 changed or added page/component/brand
paths, with 272 matching files. The changed paths include generation form state,
crop consent, input crop, personal/team/member/billing views, shared navigation,
marketing and styling. No backend/provider equivalence is asserted for those UI
paths. The local provider/storage/webhook/worker/crop/creation contract run
passed 234/234 tests, retained at `../m4-local-contracts.log`. Its code and
fixtures are unchanged by r2. Fresh M3 automation and actual browser evidence
are collected separately for the changed UI behavior.

## Owner-layer review

The r1-to-r2 comparison in `r1-to-r2-impact.json` contains exactly four changed
paths: `scripts/validate-change.ts`,
`.shpitto/contracts/protected-paths.json`,
`tests/unit/governed-skills.test.ts` and
`tests/unit/customer-package.test.ts`. No application, provider, deployment,
schema, runtime configuration or lockfile path changed between those freezes.

The owner-layer contract inspected is REQ-SKL-03/SC-SKL-08 and
REQ-SKL-04 in
`openspec/changes/restart-shpitto-video-saas/specs/governed-skills/spec.md`,
alongside `.shpitto/contracts/protected-paths.json`,
`.shpitto/contracts/validation-policy.json` and
`scripts/validate-change.ts`. The repair classifies ambiguous Windows paths and
protected validation/export policies as engineering work at both the per-file
and whole-manifest levels. This is a validation-policy repair; it does not
alter the provider execution or financial state machine. Affected evidence,
root, digest, classification and customer-package regression checks pass 58/58
on r2 in `affected-regressions.log`.

Acceptance-gates rule 5 allows unchanged evidence only with an explicit
equivalence argument and affected regressions. That supports a review proposal
for the existing four live provider rows, private R2 lifecycle and selected
self-hosted recovery evidence, restricted to their original accounts, model
versions, private-storage policy, deployment profile and declared limitations.
It does not justify changing either old record to current PASS.

## Required integration decisions

An independent M4 reviewer must review this exact candidate, the source delta,
current local M3/UI evidence and all original live/recovery references, then
state which unchanged scopes are carried and which limitations remain. A
separate integrator must record the final decision. Any changed provider,
storage, account/model mapping, schema, financial contract or deployed
configuration invalidates the relevant equivalence and needs its own scoped
verification/authority. Current remote service availability or account state
was not inspected by this bounded local task.

No paid/cloud/provider calls, live rows, remote deployments or production
changes were executed. Production email, AWS S3 live connectivity, Stripe,
FirstPromoter, merchant/commercial authorization and later release labels are
not established by this recommendation.
