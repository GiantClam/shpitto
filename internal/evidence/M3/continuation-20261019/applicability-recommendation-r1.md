# M3/M4 applicability diagnostics for the r1 source freeze

This packet is bounded verification evidence. It grants no milestone approval,
staged promotion, commercial authorization, or reviewer/integrator identity.
The leader retains ownership of integration and the final candidate.

The requested r1 freeze is
`internal/evidence/m7/local-current-20261019/continuation/baseline/candidate.json`,
source SHA-256
`95ad817920e31e3db850155b6d321ab90c79cfeaa90d4d0d5263c9aa297a08e7`.
The fresh local M3 attempt is
`automated/verification-attempts/2026-10-19T06-15-36-336Z-cf40582e-4868-47f4-a19a-74dac9a9c38f/`.
All 79 retained commands passed. Owned-domain branch coverage was 1032/1228,
84.04%, across all 39 owned modules, with no missing sources. The disposable
database migration, domain/protocol/HTTP probes, six crash boundaries,
three repetitions of generation creation/races, build, dependency install,
quality checks, evidence integrity and database cleanup all passed.

The attempt remains **STALE**, correctly: the final freshness capture observed
concurrent changes to the governed-skills test suite while the leader prepared
the next validator repair. Its end source SHA-256 was
`d512a36b77a77ac8f48f6150145f12211c9754da3bbe8b7f9734b9ef39a5fd1e`.
This partial intermediate fingerprint is not the announced final r2 freeze.
No r1 result has been relabeled as r2 approval. See `r1-diagnostics.json` and
the unmodified generated `automated/record.json` for exact command evidence.

The separate targeted evidence/root/candidate suite passed 39/39 tests. The
additional local provider, storage, webhook, worker, crop-consent and creation
contract suite passed 234/234 tests. Both logs are retained in this directory.
These fixtures used local/in-memory transports, without provider generation,
cloud staging, remote promotion, or paid calls.

## Historical approval and byte comparison

Historical M3 approval remains at
`internal/evidence/acceptance/M3/working-tree-20261001-current/record.json`,
source `73ec731c971aca355335d6c86a3ba14e8c91e84e9cf8569007cb7abf3f6bd3ab`.
Historical M4 approval remains at
`internal/evidence/acceptance/M4/m4-self-hosted-20261017/record.json`,
source `5b1aca204c1c44d031e9d2e36b104333ae8332552ceac1c11d09fa3549831d48`.
All five historical footprint groups were recomputed and match their recorded
digests. Historical integrity checks pass; requesting current-byte acceptance
correctly rejects both old records. Their bytes were preserved.

`footprint-comparison.json` retains every added, removed and changed path and
hash. Against the approved M4 footprint, the r1 candidate has byte-identical:

- All 13 provider-adapter modules and seven storage-adapter modules.
- All 11 generation-domain modules and all 39 current M3-owned modules.
- All six retained provider-contract files and all 49 schema/migration files.
- All seven deployment/workflow files and all three provider-worker scripts.
- The dependency lockfile and all configuration footprint files except the
  validation allowlist in `tooling/lint-policy.json`.

The whole runtime source tree is not identical: 19 page/component/brand paths
were added, removed or changed, while 272 paths match. These include the
dashboard, teams/members/billing pages, creator views, crop/input controls,
shells, navigation and styling. Existing M4 live provider/storage/recovery
evidence can be proposed for narrowly scoped carry-forward after an explicit
final-candidate impact review. That proposal does not imply fresh cloud
configuration observation, new paid rows, whole-runtime equivalence, or a
current M4 gate PASS. Changed UI and validation contracts require current local
evidence and independent review. The historical October 1 M3 candidate differs
more broadly; its complete approval cannot be inherited.

## Browser status and remaining work

`browser-applicability.json` records retained historical walkthroughs and the
strict rejection of their stale source fingerprints. The selected October 19
walkthrough belongs to source
`6060202010b65f1b7ad67cf468f110c6ca32ac9a571b58ad8075a9a178c773df`,
and reports `servicesStopped: false`; it was not accepted for the r1 candidate.
The runner left browser-dependent criteria unresolved.

An actual UI harness was found at `.data/m3-browser-acceptance.mjs`. An isolated
copy was prepared here with port 3199, packet-local screenshots and evidence,
no ambient integration env loading, a unique disposable PostgreSQL database,
and assets in a private temporary runtime. Its fresh M3 build provenance and
all 1364 copied compiled-file hashes are retained in
`browser-runtime-provenance.json`. The browser was **not launched** because the
leader invalidated r1 and asked to wait for final r2. The original harness and
all shipped source files were preserved.

Once r2 is announced, compare the exact final footprint delta, rerun affected
validator/evidence checks, bind browser runtime applicability honestly and
execute all eleven genuine UI journeys with screenshots, desktop/mobile,
keyboard, actual owner actions, private playback, app/worker restart, and
verified owned-service/database cleanup. Independent product/verifier review
and a separate integrator decision remain mandatory. No reviewer identity or
decision is supplied by these diagnostics.
