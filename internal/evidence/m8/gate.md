# M8 gate review packet

Status: `IN_PROGRESS` (local candidate and preflight only)
Candidate: `local-candidate-20261019-trusted-r2`
Candidate ZIP SHA-256: `cc9750578638109350e05b60865a76e139e752a9bd97ed2a436f279ffac5ea66`
Candidate ZIP bytes: `9,658,756`

## Current applicability, October 19, 2026

The current candidate passed all fifteen exact-archive local runtime checks,
including frozen offline installation, build, exported buyer commands, migration,
authentication, Mock generation/refunds, private downloads, database/media
restore and restart. Backup took 976 ms and restore 891 ms. Its separately
extracted Docker application image passed build, readiness, Docs, fourteen
rendered static resources, archive-matched brand assets and restart. The clean
repository and eleven local fulfillment cases passed for the same ZIP digest.

The older `local-candidate-20261019` rerun remains a historical FAIL at the local
PostgreSQL prerequisite; recovery did not overwrite or retroactively approve it.
The `trusted-r1` continuation is also retained with its own source identity.
The fresh external trusted candidate review is `PASS` in
`internal/evidence/m7/local-current-20261019/continuation/candidate-review-r3.json`.
Trusted validation and export validation also have accepted records in the
fresh-r4 evidence store. Deploy validation is `BLOCKED` because the pinned
trusted root dependency tree no longer matches the protected `3d28...` checksum;
the pin was not changed and no release or customer delivery occurred. Current M3
is independently `BLOCKED`; M4 is `PASS` only for scoped applicability and its
current acceptance remains `NOT_RUN`. Local Docker application checks do not
establish the complete buyer production profile, managed services or SC-OPS-13
customer admin acceptance.

See `internal/evidence/m7/local-current-20261019/continuation/current-status-r2.json`
for the current evidence index. Earlier observations under
`internal/evidence/m8/local-current-20261019/README.md` retain their historical
scope. No RC/BETA/STABLE or whole-stage approval is asserted.

## Completed local evidence

- Candidate packaging and allowlist scan: `internal/evidence/m8/artifact-manifest/local-candidate-20261019-trusted-r2/`
- Fresh offline install/build, Mock journey and restore: `internal/evidence/m8/local-demo/local-candidate-20261019-trusted-r2/result.json`
- Exact candidate local Docker build/readiness/restart: `internal/evidence/m8/docker/local-candidate-20261019-trusted-r2/result.json`
- Local fulfillment and entitlement fixture: `internal/evidence/m8/fulfillment/local-candidate-20261019-trusted-r2/result.json`
- Vendor Docs and buyer-guide synchronization: `internal/evidence/m8/vendor-docs/result.json`
- Deployment, Docker, migration, restore and operations preflight: `internal/evidence/m8/*-preflight/`

## Open gates

- Restore the pinned trusted dependency tree, then rerun deploy validation against the same fresh-r4 record and candidate
- Current M3: mandatory acceptance rows, manual visual approval, 403/409 classification and task 4.13 remain unresolved
- Current M4 acceptance: scoped applicability passed, but whole-stage acceptance remains `NOT_RUN`
- 6.10: Stripe test-mode account and payment lifecycle evidence
- 7.14: FirstPromoter account/campaign and operator settlement evidence
- 9.13: Lemon Squeezy merchant qualification, license/pricing/support terms
- 9.14/9.15: managed deployment, commercial qualification and final RC/BETA/STABLE review

The local candidate itself passed offline install, production build, buyer checks,
fresh migration and seed, authenticated Mock generation, cancellation/refund,
deadline failure/refund, private download, backup/restore, restart recovery and
exactly-once credit assertions. These results are local evidence only and do not
promote M8-RC, M8-BETA or M8-STABLE.

## Hosted demo verification

The isolated Railway demo project `shpitto-m4-staging` has a current hosted
readiness record at
`internal/evidence/m8/railway-staging/hosted-verification-20261017.json`.
The Web service, self-hosted provider worker and recovery monitor are deployed
with successful Docker deployments. Web, worker and monitor readiness returned
HTTP 200; the worker passed isolation and migration startup checks with paid
creates disabled, and the monitor is running in observe mode with provider
creates disabled. The current application digests match the frozen M4
self-hosted candidate. This is hosted demo evidence for the deployment
boundary; it does not satisfy the exact 9.3 managed/Docker release candidate
proof or close the commercial and final-release gates above.

These are explicit external inputs. Local Mock and fixture evidence is retained as valid partial proof and is not promoted to production readiness.
