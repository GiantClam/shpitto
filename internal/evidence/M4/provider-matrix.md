# M4 real-provider matrix

Status: **PASS for the selected self-hosted Railway demo profile**, recorded on 2026-10-16. Each row below is a distinct, explicitly authorized one-shot request from the 2026-10-15 acceptance run. No automatic create retry was used and no further paid provider request is authorized by this acceptance.

| Provider | Mode | Application request identity | Contract/output | Private application storage and authorized download | Credits/cost | Callback and account binding |
|---|---|---|---|---|---|---|
| fal.ai | T2V | `internal/evidence/M4/task-5.10/railway-worker/live-rows-20261015/fal-wan22-t2v.json` | `fal-ai/wan/v2.2-a14b/text-to-video`; 1280x720 H.264 MP4; 81 frames at 16 FPS | Private R2 asset published by the Railway worker; owner 200 with matching SHA-256; outsider, wrong-token and expired-token checks 403 | 10-credit reservation consumed once; provider cost `UNKNOWN` | Authenticated callback; account binding matched; inbox processed exactly once |
| fal.ai | I2V | `internal/evidence/M4/task-5.10/railway-worker/live-rows-20261015/fal-wan22-i2v.json` | `fal-ai/wan/v2.2-a14b/image-to-video`; approved 1280x720 crop; 1280x720 H.264 MP4; 81 frames at 16 FPS | Private R2 asset published by the Railway worker; owner 200 with matching SHA-256; outsider, wrong-token and expired-token checks 403 | 10-credit reservation consumed once; provider cost `UNKNOWN` | Authenticated callback; account binding matched; inbox processed exactly once |
| Replicate | T2V | `internal/evidence/M4/task-5.10/railway-worker/live-rows-20261015/replicate-wan22-t2v.json` | `wan-video/wan-2.2-t2v-fast`; pinned version; 1280x720 H.264 MP4; 81 frames at 16 FPS | Private R2 asset published by the Railway worker; owner 200 with matching SHA-256; outsider, wrong-token and expired-token checks 403 | 10-credit reservation consumed once; provider cost `UNKNOWN` | Authenticated callback/polling observation; confirmed account binding; inbox processed exactly once |
| Replicate | I2V | `internal/evidence/M4/task-5.10/railway-worker/live-rows-20261015/replicate-wan22-i2v.json` | `wan-video/wan-2.2-i2v-fast`; pinned version and approved crop; 1280x720 H.264 MP4; 81 frames at 16 FPS | Private R2 asset published by the Railway worker; owner 200 with matching SHA-256; outsider, wrong-token and expired-token checks 403 | 10-credit reservation consumed once; provider cost `UNKNOWN` | Authenticated callback/polling observation; confirmed account binding; inbox processed exactly once |

## Recovery and storage evidence

- Cloudflare R2 live PUT/HEAD/GET/SHA-256/list/pagination/delete: `internal/evidence/M4/task-5.7-r2-live-adapter.json`.
- Current S3-compatible storage contract and cleanup schedule: `internal/evidence/M4/task-5.7-storage-contract.json`.
- Selected self-hosted Railway recovery and monitoring drill: `internal/evidence/M4/task-5.10/railway-worker/recovery-drill-20261016.json`.
- Current local contract, fault, coverage and quality evidence: `internal/evidence/M4/task-5.10/railway-worker/local-fixture-validation-20261015.json` and `internal/evidence/M4/task-5.10/railway-worker/self-hosted-default-verification-20261015/`.

The recovery drill used a fake-clock/domain-fault fixture and did not create a provider request: 102 overdue tasks were failed and released, the submission fence was preserved, and the recovery heartbeat/alert-delivery assertions passed. Provider cost remains `UNKNOWN`; the acceptance does not convert a reference price into an invoice.

## Scope boundary

This matrix closes the selected self-hosted demo profile only. Trigger.dev remains an optional fail-closed runtime. AWS S3 live connectivity, production email, Stripe transactions, historical anomalous-balance recovery, customer release packaging and any further provider creates remain outside M4 acceptance.