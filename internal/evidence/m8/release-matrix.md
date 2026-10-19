# M8 local candidate matrix

Candidate: `local-candidate-20261019`

| Task | Local result | Evidence | External boundary |
| --- | --- | --- | --- |
| 9.3 | PASS (local candidate and exact local Docker runtime) | `internal/evidence/m8/artifact-manifest/local-candidate-20261019/manifest.json`, `internal/evidence/m8/docker/local-candidate-20261019/result.json` | Managed deployment and M8 RC remain open |
| 9.4 | PASS (fresh no-cloud install/build, Mock journey, restore and restart) | `internal/evidence/m8/local-demo/local-candidate-20261019/result.json` | Managed runtime and external adapters not run |
| 9.11 | PASS (local fulfillment fixture) | `internal/evidence/m8/fulfillment/local-fixture/result.json` | Vendor sales account, paid order and commercial entitlement not provided |
| 9.12 | PASS (local Docs/source synchronization and hydrated UI) | `internal/evidence/m8/vendor-docs/result.json`, `internal/evidence/m8/local-completion/docs-ui/result.json` | Merchant setup and commercial readiness remain open |

The current candidate ZIP has 9,606,977 bytes and SHA-256
`b1967ad98000316ad96539b6baa04c6ae499a68175d707429c8e6d91d8f14c07`.

These records prove only local packaging, local install/build and fixture
fulfillment. They do not promote M8-RC, M8-BETA or M8-STABLE.

The isolated Railway demo project `shpitto-m4-staging` is separately verified
for hosted readiness in
`internal/evidence/m8/railway-staging/hosted-verification-20261017.json`.
Its Web, self-hosted provider worker and recovery monitor deployments are
healthy, with paid provider creates disabled. This hosted demo record supports
the deployment boundary and does not replace the exact 9.3 candidate proof,
commercial readiness, or the final M8 checkpoint reviews.
