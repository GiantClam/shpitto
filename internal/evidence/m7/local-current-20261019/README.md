# M7 current local review, 2026-10-19

Decision: `CHANGES_REQUIRED`. This is a bounded local evidence review, not M7
acceptance or an integrator decision. No authoritative acceptance record was
changed.

The five local validator defects identified below were repaired later in the
same review. See `validator-repair-plan.md`, the retained `validator-red-*.log`
files and `validator-fixed-probe.json`. The repaired suite passes 28 tests;
TypeScript, source-boundary and formatting checks also pass. The remaining
acceptance work below keeps this packet from claiming M7 PASS.

The current contract regression suite passed 24 tests across governed Skills,
four customization workflows, published and portable Docs, vendor Docs,
fulfillment integrity and export boundaries. The canonical Docs contract check
passed for 27 published pages. Retained outputs are `tests.log` and
`docs-contract.log`. The provisional source and validator fingerprints are in
`candidate/`; ongoing implementation changes require another capture before
review.

## Mandatory local defect

`validator-negative-probe.json` records five malformed evidence records that
`scripts/validate-change.ts::validateEvidence` accepted at review time:

- An empty check list.
- A check list missing the policy's required checks.
- An independent review explicitly deciding `FAIL`.
- A review without a reviewer identity.
- An evidence candidate identity different from the current candidate.

These are deterministic local defects in the evidence validator. Passing the
existing contract tests does not close them. The owning requirements are
`.shpitto/contracts/validation-policy.json`,
`.shpitto/contracts/validation-evidence.json`, and the M7 criteria in
`openspec/changes/restart-shpitto-video-saas/acceptance-gates.md`. Add regression
cases before repairing this boundary, then rerun the tests and the negative
probe. Validate trusted baseline provenance separately: matching a digest from
a candidate-supplied JSON file alone does not establish a pinned validator
outside candidate edits.

## Remaining acceptance work

The 24 tests inspect contracts and pure functions. They do not execute four
actual presentation customizations in disposable candidates or establish
current desktop/mobile accessibility, coding-agent discovery, independent
validator provenance, and integrated behavior preservation after those edits.
The older local integrated report references October 4 journey logs; carry it
forward only with an explicit impact review or rerun the affected journeys.

Full M7 acceptance additionally requires the accepted final M4/M5/M6 interfaces
and an independent contract/UX/Docs review. Account-backed provider, Stripe and
FirstPromoter obligations remain at their respective gates. This review does
not convert their local fixtures into external evidence.
