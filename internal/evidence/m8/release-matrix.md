# M8 local candidate matrix

Candidate: `local-candidate-20261007-completion`

| Task | Local result | Evidence | External boundary |
| --- | --- | --- | --- |
| 9.3 | PASS (local candidate only) | `internal/evidence/m8/artifact-manifest/local-candidate-20261007-completion/manifest.json` | M8 RC remains open |
| 9.4 | PASS (fresh no-cloud install/build, Mock journey, restore and restart) | `internal/evidence/m8/local-demo/local-candidate-20261007-completion/result.json` | Managed runtime and external adapters not run |
| 9.11 | PASS (local fulfillment fixture) | `internal/evidence/m8/fulfillment/local-fixture/result.json` | Vendor sales account, paid order and commercial entitlement not provided |
| 9.12 | PASS (local Docs/source synchronization and hydrated UI) | `internal/evidence/m8/vendor-docs/result.json`, `internal/evidence/m8/local-completion/docs-ui/result.json` | Merchant setup and commercial readiness remain open |

The completion candidate ZIP has 1,754,690 bytes and SHA-256
`c4a1dcb111811a9ae4a0a956045e59880ad937ff6efbadff4af47ca4beb1dbad`.
The same archive was built and restarted as a local standalone Docker image.

These records prove only local packaging, local install/build and fixture
fulfillment. They do not promote M8-RC, M8-BETA or M8-STABLE.

The isolated Railway demo project `shpitto-m4-staging` is separately verified
for hosted readiness in
`internal/evidence/m8/railway-staging/hosted-verification-20261017.json`.
Its Web, self-hosted provider worker and recovery monitor deployments are
healthy, with paid provider creates disabled. This hosted demo record supports
the deployment boundary and does not replace the exact 9.3 candidate proof,
commercial readiness, or the final M8 checkpoint reviews.
