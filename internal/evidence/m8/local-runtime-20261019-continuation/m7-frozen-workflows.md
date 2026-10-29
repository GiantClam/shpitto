# Frozen-source four-workflow execution

Status: **PASS for local workflow execution**. The leader authorized the exact
source-tree SHA-256
`95ad817920e31e3db850155b6d321ab90c79cfeaa90d4d0d5263c9aa297a08e7`.
The existing evidence runner was executed unchanged with
`SHPITTO_M7_EXPECTED_SOURCE_SHA` set to that value and with Corepack networking
disabled. Its SHA-256 remained
`172300533b547875a60adef534932e955f370233c571eedbf7f86f8fce0fb12a`.

The successful run summary is:

`internal/evidence/m7/workflows-current-20261019/runs/2026-10-19T06-15-10-253Z-0810d9ac/summary.json`

Summary SHA-256:
`b8b94b428913f3c9198a9ac576bc7c30c9ad1acdf665cd7e6db45b4850a83320`.
Execution lasted 142.479 seconds, from 2026-10-19T06:15:10.509Z through
2026-10-19T06:17:32.988Z.

- All four workflows passed: `customize-brand`, `create-page`, `modify-page`,
  and `customize-site`.
- All 79 retained commands passed and every command output reference exists.
- `sourceStableDuringRun` is `true` and candidate currency is
  `EXPLICIT_ROOT_FREEZE_BOUND`.
- Each workflow's viewport smoke and scoped rollback passed; protected files
  remained unchanged.
- All six source/schema/configuration/contract/validator/lockfile digests match
  at baseline, run end, and a separate post-run measurement.

The first attempt is preserved at:

`internal/evidence/m7/workflows-current-20261019/runs/2026-10-19T06-12-57-401Z-0995e559/failure.json`

That attempt passed the first two workflows, then the Node subprocess for
`modify-page-probe-m6-admin-reads` exited with Windows code `3221226505` and an
empty child log. No root-cause claim is made for that native process exit.
All six frozen digests still matched afterwards. One complete retry of the
unchanged runner produced the successful result above. The first attempt was
not deleted or rewritten.

The existing runner created and dropped three uniquely named databases in the
failed attempt and four in the successful attempt. Queries against
`shpitto-completion-pg-20261019` found zero `m7_workflow_*` databases before
execution, after the failed attempt, and after the successful run. Its cleanup
completed without an error. Existing application databases and Docker volumes
were preserved. Disposable source copies remain under `.data/m7-four-workflows-*`
as the runner normally retains them.

The machine-readable consolidation is `m7-frozen-workflows-result.json` in this
packet. Only new run outputs, the runner's normal latest-run pointer, and this
preflight packet were written. No shipped source, runner implementation, old
evidence, package archive, or release-acceptance record was edited.

This is local/mock workflow evidence. Static React/CSS viewport smoke does not
prove Next.js route hydration or an authenticated checkout browser flow.
Independent review and gate promotion remain `NOT_RUN` and `false` respectively.
