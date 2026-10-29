# M4 current candidate development verification

Date: 2026-10-29T04:56:00.000Z
Candidate: `m4-current-20261029`
Source commit: `f59f1f094dab084374331de9ad2b7a6fb7ed081e`

Local install, typecheck, lint, format, database boundary, OpenSpec, provider-input and billing-contract tests, billing schema probe and production build passed on this digest. Point-in-time public Acceptance web health and the then-active provider worker health were read with creates disabled. That health read predates the hosted four-path run. Recovery-monitor ready output was not re-read.

A later controlled hosted four-path create, settle, and verify on Railway worker `shpitto-m4-worker` (production) is recorded in `hostedFourPathCreate`. Budget was one paid POST per path (`observedPostRequests=1`, `authorizedMaxPosts=1`). Prepare and submit used `SHPITTO_PROVIDER_WORKER_STATE=paused` and `ALLOW_CREATE=false`. Settle and verify used `STATE=active`, `ALLOW_CREATE=false`, and `WORKSPACE_ID` pinned to that path's workspace. After all four paths the worker was returned to `STATE=paused` and `ALLOW_CREATE=false`; healthz confirmed `state=paused` and `createsEnabled=false`.

Each retained row is `stage=verified`, task succeeded, `reservationStatus=consumed`, quoted credits `10`, `verification.privateHash=PASS`, owner HTTP 200, outsider/wrong/expired token 403, and `authenticatedAccountCallback=true`. `actualProviderCostConfirmed=false` and `providerCostStatus=UNKNOWN`. The fal T2V file stores task success under the key `taskSuatus` and is retained unchanged.

| Path | runId | workspaceId | taskId | Evidence |
| --- | --- | --- | --- | --- |
| `replicate-wan22-t2v` | `6fac7d93-6620-49eb-988d-0c055cd640c4` | `cfc9438d-503f-4f76-8d35-da6dfe7ee044` | `30310a03-5a5e-4e12-b405-085c4f1e8600` | `internal/evidence/M4/task-5.10/railway-worker/live-rows-20261029/replicate-wan22-t2v_6e3d.json` |
| `fal-wan22-t2v` | `14c7fe80-9428-4ab9-8992-42fda161e436` | `04795ed9-8377-4c06-a905-612073c5b012` | `ded809db-d61e-4b4a-b150-c86ab5105187` | `internal/evidence/M4/task-5.10/railway-worker/live-rows-20261029/fal-wan22-t2v_68bb.json` |
| `fal-wan22-i2v` | `7566ce4e-1f8f-4814-9716-cabae1bf2bec` | `7954aaf2-3f27-4fd5-91bf-e81536384718` | `26717344-bfa9-4e94-b929-5233f6f3e875` | `internal/evidence/M4/task-5.10/railway-worker/live-rows-20261029/fal-wan22-i2v_bda3.json` |
| `replicate-wan22-i2v` | `c3080d83-a753-484b-8a8f-0aac29752619` | `a0781ead-607d-48cc-b226-9f7e98f38833` | `e6c98712-f6bd-4620-9f81-b3df08f6ed0d` | `internal/evidence/M4/task-5.10/railway-worker/live-rows-20261029/replicate-wan22-i2v_ee33.json` |

The record remains `IN_PROGRESS`. Criteria `M4-C01` through `M4-C04` remain `BLOCKED`. Current M3 applicability is `STALE`. Historical M3 prerequisite evidence is unchanged. The hosted recovery drill, forged/stale/wrong-account callback failures, duplicate or reordered financial idempotence, deadline and sweep configuration, owned-module coverage, and independent review were not re-verified. No live Stripe charge was performed.
