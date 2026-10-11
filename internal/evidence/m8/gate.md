# M8 gate review packet

Status: `IN_PROGRESS` (local candidate and preflight only)
Candidate: `local-candidate-20261007-completion`
Candidate ZIP SHA-256: `c4a1dcb111811a9ae4a0a956045e59880ad937ff6efbadff4af47ca4beb1dbad`
Candidate ZIP bytes: `1,754,690`

## Completed local evidence

- Candidate packaging and allowlist scan: `internal/evidence/m8/artifact-manifest/local-candidate-20261007-completion/`
- Fresh offline install/build, Mock journey and restore: `internal/evidence/m8/local-demo/local-candidate-20261007-completion/result.json`
- Exact candidate Docker image: `internal/evidence/m8/docker/local-candidate-20261007-completion/result.json`
- Local fulfillment and entitlement fixture: `internal/evidence/m8/fulfillment/local-fixture/result.json`
- Vendor Docs and buyer-guide synchronization: `internal/evidence/m8/vendor-docs/result.json`
- Deployment, Docker, migration, restore and operations preflight: `internal/evidence/m8/*-preflight/`

## Open gates

- 5.10: Replicate/fal provider rows and durable-output recovery
- 6.10: Stripe test-mode account and payment lifecycle evidence
- 7.14: FirstPromoter account/campaign and operator settlement evidence
- 9.13: Lemon Squeezy merchant qualification, license/pricing/support terms
- 9.14/9.15: managed and Docker candidate deployment, final RC/BETA/STABLE review

These are explicit external inputs. Local Mock and fixture evidence is retained as valid partial proof and is not promoted to production readiness.
