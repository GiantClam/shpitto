# M8 gate review packet

Status: `IN_PROGRESS` (local candidate and preflight only)
Candidate: `local-candidate-20261019`
Candidate ZIP SHA-256: `b1967ad98000316ad96539b6baa04c6ae499a68175d707429c8e6d91d8f14c07`
Candidate ZIP bytes: `9,606,977`

## Completed local evidence

- Candidate packaging and allowlist scan: `internal/evidence/m8/artifact-manifest/local-candidate-20261019/`
- Fresh offline install/build, Mock journey and restore: `internal/evidence/m8/local-demo/local-candidate-20261019/result.json`
- Exact candidate local Docker build/readiness/restart: `internal/evidence/m8/docker/local-candidate-20261019/result.json`
- Local fulfillment and entitlement fixture: `internal/evidence/m8/fulfillment/local-fixture/result.json`
- Vendor Docs and buyer-guide synchronization: `internal/evidence/m8/vendor-docs/result.json`
- Deployment, Docker, migration, restore and operations preflight: `internal/evidence/m8/*-preflight/`

## Open gates

- 5.10: Replicate/fal provider rows and durable-output recovery
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
