# R2 exact-archive local Docker application evidence

Status: **PASS for local application-only Docker checks**.

- Candidate: `local-candidate-20261019-trusted-r2`
- ZIP size: 9,658,756 bytes
- ZIP SHA-256: `cc9750578638109350e05b60865a76e139e752a9bd97ed2a436f279ffac5ea66`
- Authorized source-tree SHA-256: `e5cf13a5d4af7747fcb83bc10e940e73e731570a0df4dd6361aaced0890a71be`
- Image: `shpitto-candidate:local-candidate-20261019-trusted-r2`
- Image ID: `sha256:7c7306f3556e7b6fe349eae1040d5fb295a68995102fa88fe8db1befd92a98a1`

The successful attempt started at 2026-10-19T06:29:54.930Z and completed cleanup
at 2026-10-19T06:30:25.656Z. Build and HTTP checks took 29,140 milliseconds.

`run-local-application.mjs` is an evidence-only adaptation of the inspected
`scripts/verify-candidate-docker.mjs`. The existing shipped runner requires a
retained prior runtime directory and restored database; the r2 candidate run
does not retain them. This adaptation instead extracted the authorized ZIP
into a new OS temporary directory, checked the full archive entry allowlist and
every extracted file's size and SHA-256, and used only that extracted
`customerRuntime` as Docker's build context. The archived Dockerfile and shipped
files were unchanged.

Eight checks passed in `result.json`:

1. Authorized archive and every extracted file matched.
2. The exact extracted candidate Docker image built successfully.
3. Local application/database readiness passed.
4. `/`, `/login`, `/docs/v1`, and `/docs/v1/template/local-journey` returned HTML
   with status 200.
5. Both public brand PNGs matched the archive bytes.
6. All 14 JavaScript/CSS resources referenced by rendered pages returned nonempty
   responses with status 200.
7. Readiness and three page/Docs routes passed after container restart.
8. The ZIP and extracted build context remained byte-identical after execution.

`http-observations.json` retains per-route status, sizes, and content hashes.
The readiness response reported `ready` and database `ready` before and after
restart. Its `profile=production` field follows the Dockerfile's
`NODE_ENV=production` application mode. It is not proof of production deployment
or production-profile acceptance.

The database probe used the declared disposable PostgreSQL administrative
database on `shpitto-completion-pg-20261019` at port 55432 for `SELECT 1` only.
No database was created, migrated, seeded, restored, or modified by this Docker
packet. Full application journeys and timed restore remain separate candidate
evidence. S3 and SMTP endpoints were configured to closed container-loopback
ports, and external provider credentials were absent. No host UI application,
worker, provider generation, payment, mail, or storage integration was exercised.

The first attempt, retained under `attempts/network-disabled/`, failed before
container creation because `--network=none` prevented Corepack from fetching
pnpm. Its failed result and logs are preserved. Its historical
`imageRetainedAsEvidence=true` cleanup field was set unconditionally by the first
version of this packet's harness; no image was produced by that failed build.
The retry corrected that bookkeeping and used ordinary build networking with
`--pull=false`; public dependency reads were allowed. No provider calls or
remote resource changes were performed. Both attempts used unchanged exact ZIP
contents.

The unique application container `shpitto-candidate-r2-058c82b1` was bound to
`127.0.0.1:52334` with no host mounts. It was restarted, stopped, and removed.
The temporary extraction and environment file were removed. A separate query
confirmed zero remaining containers with this candidate's evidence label, and
the PostgreSQL prerequisite remained running. No volumes were created or
deleted. The image remains available under the stated scoped tag for review.

Only this new evidence packet was authored. Shipped source and previous
candidate evidence were preserved. The root source and archive hashes were
remeasured after completion and still matched. The packet's declared-credential
scan is recorded in `post-verification.json`.

`productionDeployment=NOT_RUN` and `productionAcceptance=NOT_CLAIMED`. Independent
source review and release-gate decisions belong to the leader.
