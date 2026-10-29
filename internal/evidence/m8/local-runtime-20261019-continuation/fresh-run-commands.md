# Commands reserved for the leader's next source freeze

Status: **INSPECTED; NOT EXECUTED**. Packaging and workflow execution must wait
for the leader to freeze the complete shipped footprint and supply a new
candidate ID and its source-tree SHA-256. No historical candidate is selected.
Run these blocks in order in one dedicated PowerShell session from the repository
root. All native command exit codes are checked explicitly.

## Preparation after freeze

```powershell
Set-Location -LiteralPath 'D:\github\shpitto'
$taskCandidateId = '<LEADER_NEW_CANDIDATE_ID>'
$taskFrozenSourceSha = '<LEADER_64_HEX_SOURCE_TREE_SHA256>'
if ($taskCandidateId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$') { throw 'Supply the leader-approved new candidate ID.' }
if ($taskFrozenSourceSha -notmatch '^[a-f0-9]{64}$') { throw 'Supply the leader-approved frozen source digest.' }
$taskArtifactDirectory = Join-Path 'internal/evidence/m8/artifact-manifest' $taskCandidateId
$taskRuntimeDirectory = Join-Path 'internal/evidence/m8/local-demo' $taskCandidateId
if ((Test-Path -LiteralPath $taskArtifactDirectory) -or (Test-Path -LiteralPath $taskRuntimeDirectory)) { throw 'Use a fresh candidate ID to preserve earlier evidence.' }
$taskCommandDirectory = Join-Path 'internal/evidence/m8/local-runtime-20261019-continuation' $taskCandidateId
if (Test-Path -LiteralPath $taskCommandDirectory) { throw 'Command logs for this candidate already exist.' }
New-Item -ItemType Directory -Path $taskCommandDirectory -ErrorAction Stop | Out-Null
$taskFreezeSnapshot = node scripts/candidate-digests.mjs | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Could not measure the frozen source.' }
if ($taskFreezeSnapshot.sourceTreeSha256 -ne $taskFrozenSourceSha) { throw 'Root source differs from the leader freeze.' }
$env:SHPITTO_CANDIDATE_ID = $taskCandidateId
$env:SHPITTO_CANDIDATE_POSTGRES_CONTAINER = 'shpitto-completion-pg-20261019'
$env:SHPITTO_CANDIDATE_KEEP = '0'
$env:SHPITTO_M7_EXPECTED_SOURCE_SHA = $taskFrozenSourceSha
$env:COREPACK_ENABLE_NETWORK = '0'
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
Remove-Item Env:SHPITTO_CANDIDATE_ADMIN_DATABASE_URL -ErrorAction SilentlyContinue
```

Removing a possibly inherited admin override selects the runner's existing
declared disposable local default without printing a database URL or password.
M8 asserts host `127.0.0.1`, port `55432`, and administrative database `postgres`.
M7 hardcodes the same endpoint and local credentials; it does not read the M8
admin URL or container override. The infrastructure preflight verified that
these credentials match the recovered task container.

## Actual four-workflow execution

```powershell
node --experimental-strip-types internal/evidence/m7/workflows-current-20261019/run-workflows.mjs 2>&1 | Out-File -LiteralPath (Join-Path $taskCommandDirectory 'm7-workflows.log') -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'M7 workflow execution failed; inspect its new logs.' }
$taskM7Pointer = Get-Content -LiteralPath 'internal/evidence/m7/workflows-current-20261019/latest-run.json' -Raw -Encoding utf8 | ConvertFrom-Json
$taskM7Summary = Get-Content -LiteralPath $taskM7Pointer.summaryRef -Raw -Encoding utf8 | ConvertFrom-Json
if (($taskM7Summary.baselineSourceTreeSha256 -ne $taskFrozenSourceSha) -or ($taskM7Summary.candidateCurrency -ne 'EXPLICIT_ROOT_FREEZE_BOUND') -or ($taskM7Summary.sourceStableDuringRun -ne $true) -or (@($taskM7Summary.workflows).Count -ne 4) -or (@($taskM7Summary.workflows | Where-Object result -ne 'PASS').Count -ne 0)) { throw 'M7 results do not prove four passing workflows on an unchanged explicit freeze.' }
```

The runner executes `customize-brand`, `create-page`, `modify-page`, and
`customize-site` sequentially in disposable source copies. Each runs real type
generation, typechecking, four boundary checks, formatting, five database probes,
static React/CSS desktop and mobile viewport checks, protected-file checks,
negative controls, and scoped reverse-patch rollback. It uses existing root
dependencies through a junction and creates/drops one unique database per
workflow. Browser rendering uses an ephemeral loopback port.

Evidence is retained under
`internal/evidence/m7/workflows-current-20261019/runs/<timestamp-uuid>/`; only the
`latest-run.json` pointer is replaced. Disposable source copies under
`.data/m7-four-workflows-*` remain available for inspection. No keep/cleanup
environment switch is implemented for M7.

The explicit summary check above matters: the runner records
`sourceStableDuringRun: false` without setting a failing process exit code. A
successful process alone does not establish a frozen-source pass.

## Fresh candidate ZIP and clean repository

```powershell
node --experimental-strip-types scripts/package-release.ts 2>&1 | Out-File -LiteralPath (Join-Path $taskCommandDirectory 'package.log') -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'Fresh candidate packaging failed.' }
node scripts/create-local-candidate-repo.mjs 2>&1 | Out-File -LiteralPath (Join-Path $taskCommandDirectory 'clean-repo.log') -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'Fresh clean repository creation failed.' }
```

Both commands use `SHPITTO_CANDIDATE_ID`. Packaging writes
`internal/evidence/m8/artifact-manifest/<id>/manifest.json` and `<id>.zip` using
the reviewed v1 export manifest. The repository command verifies the archive
and file hashes, creates `clean-repo/` and `clean-repo.json`, and commits the
exported runtime into local history. It does not publish a repository or execute
an additional runtime journey from that repository.

Always keep the fresh-ID guard: packaging overwrites an existing candidate ZIP
and manifest; the repository command removes an existing candidate `clean-repo/`
before regenerating it. The differing built-in candidate-ID defaults are unsafe
for this sequence unless the shared environment override is explicit.

## Local fulfillment without replacing the historical shared result

The stock CLI `node scripts/verify-local-fulfillment.mjs` always writes
`internal/evidence/m8/fulfillment/local-fixture/result.json`, independently of the
candidate ID. Use its exported verifier and a candidate-specific output instead:

```powershell
node --input-type=module -e @'
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {verifyLocalFulfillment} from './scripts/verify-local-fulfillment.mjs';
const id = process.env.SHPITTO_CANDIDATE_ID;
const result = verifyLocalFulfillment(process.cwd(), id);
const output = path.join('internal/evidence/m8/artifact-manifest', id, 'fulfillment.json');
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'});
console.log(JSON.stringify({status: result.status, candidateId: result.candidateId, output}));
'@ 2>&1 | Out-File -LiteralPath (Join-Path $taskCommandDirectory 'fulfillment.log') -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'Candidate-specific local fulfillment verification failed.' }
```

This checks the exact ZIP digest/bytes and 11 mock fulfillment invariants. It
requires `vendor/sales/commerce.config.json` to remain in `mock` mode. It exercises
local source-order domain rules and does not charge a merchant account or
perform external delivery. If a later acceptance consumer requires the stock
shared result location, the leader must explicitly manage that pointer separately.

## Fresh extracted candidate runtime and restore

```powershell
node scripts/verify-local-candidate.mjs 2>&1 | Out-File -LiteralPath (Join-Path $taskCommandDirectory 'candidate-runtime.log') -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'Fresh candidate runtime or restore verification failed.' }
$taskRuntime = Get-Content -LiteralPath (Join-Path $taskRuntimeDirectory 'result.json') -Raw -Encoding utf8 | ConvertFrom-Json
$taskArchive = Get-Content -LiteralPath (Join-Path $taskArtifactDirectory 'manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
if (($taskRuntime.status -ne 'PASS') -or ($taskRuntime.candidateId -ne $taskCandidateId) -or ($taskRuntime.archive.sha256 -ne $taskArchive.zip.sha256)) { throw 'Runtime result is not a pass for the new exact archive.' }
$taskEndSnapshot = node scripts/candidate-digests.mjs | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Could not remeasure the root freeze.' }
foreach ($taskDigestKey in @('sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256')) {
  if ($taskEndSnapshot.$taskDigestKey -ne $taskFreezeSnapshot.$taskDigestKey) { throw "Root freeze changed: $taskDigestKey" }
}
```

The runtime verifier hashes and extracts the new ZIP, installs from the local
pnpm cache using `--frozen-lockfile --offline --ignore-scripts`, builds, runs eight
exported buyer checks, migrates/seeds a new disposable database, starts local web
and mock worker processes, exercises the actual domain journey, backs up with
`pg_dump`, restores with `pg_restore` through the named container, and checks
restart recovery. `KEEP=0` cleans its databases and extracted workspace. Its
candidate-specific logs/result and restore evidence remain under
`internal/evidence/m8/local-demo/<id>/`.

The source digests do not cover every exported buyer document or top-level file.
The leader must freeze the complete export footprint as well as these six
digests; archive/file hashes bind the candidate evidence after packaging. None
of these runners promotes release gates, performs the Docker installation
acceptance, or supplies independent review or real-account evidence.

## Timing and current prerequisites

| Step | Planning estimate | Observed basis or timeout |
| --- | --- | --- |
| Four M7 workflows | 1-3 minutes | Prior Oct 19 run: 72.3 seconds, 79 commands, four local passes; source drift made that run provisional. |
| ZIP, clean repo, mock fulfillment | Under 1 minute total | Small local archive/file/Git operations; no reliable prior elapsed timer retained. Estimate only. |
| Extracted ZIP runtime + restore | 6-10 minutes | Successful Oct 17 run: 4m50.5s; Oct 9: 5m25.0s. Oct 19 took 5m17.8s to reach the previously unavailable DB, before runtime/restore. |
| Sequential total | Allow 8-15 minutes | Depends on local build load, cache availability, and final source changes. |

There is no whole-run timeout. M8 bounds installation at five minutes, build at
ten minutes, and each buyer check at two minutes; journey waits and restore
commands have additional individual limits. M7 bounds ordinary subprocesses at
three minutes and each domain probe at four minutes. These are failure ceilings,
not expected durations.

Inspected prerequisites on October 19:

- Node `v24.15.0`, Git, and Windows `tar.exe` are available.
- The ordinary `pnpm` launcher is broken and fails before reporting its version.
  No runner above depends on invoking that launcher. M8 resolves Corepack's
  JavaScript entry point and invokes it with the active Node executable. A
  network-disabled version probe using that same resolution returned pnpm
  `12.6.0` successfully. Do not substitute the broken `pnpm` shell shortcut.
- The hardcoded Playwright module used by M7 exists, and Chromium browser cache
  directories exist. Browser launch was not attempted during this inspection.
- The infrastructure packet proves authenticated TCP, CREATE DATABASE, and an
  actual PostgreSQL 15.19 dump/restore round trip on the `20261019` task container.
- Offline dependency availability and fresh build success must still be proved
  by the reserved candidate run. No package/workflow was started for this task.

The current execution hold is the missing leader-confirmed freeze and fresh
candidate identity. Other potential blockers are root changes during a run,
offline-cache gaps, final-code incompatibility with the evidence harness, or a
missing matching Chromium binary. M7's static viewport smoke does not constitute
Next.js routing/hydration or authenticated checkout browser acceptance. Final
commercial, provider, independent-review, and release decisions remain separate.
