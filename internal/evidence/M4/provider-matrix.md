# M4 real-provider matrix

Status: partial real-account evidence, reconciled on 2026-10-15. All four rows have captured playable outputs and isolated private R2 lifecycle evidence. The later authorized Fal T2V run also proves authentic callback processing and seeded application reservation settlement. Remaining row-level application evidence, hosted Trigger recovery and independent whole-stage review still block task 5.10. Unknown provider cost is permitted and is not itself a blocker.

| Provider | Mode | Provider output | Private application storage | Publication and download authorization | Cost and credit settlement | Remaining blocker |
|---|---|---|---|---|---|---|
| fal.ai | T2V | PASS, later request `01a13498-43f7-74f0-be1a-cbc5360a1555` | PASS on isolated private R2 through the Railway worker | PASS: owner 200/hash, outsider 403, anonymous 401 and expired/wrong-asset 403 in the October 13 run; October 15 retained-object/hash/media and negative-capability recheck passes | Actual cost UNKNOWN; seeded 10-credit reservation consumed once | Hosted Trigger recovery and independent whole-stage review |
| fal.ai | I2V | PASS, request `01a12337-c628-7363-93bd-2e526b11514b` | PASS on isolated private R2 | PASS with disposable PostgreSQL, current membership and token binding | Cost UNKNOWN; reservation settlement NOT RUN | Authentic application callback/polling and reservation outcome; independent review |
| Replicate | T2V | PASS, prediction `wxrfrzbt1drmt0d141n98vhsxr` | PASS on isolated private R2; `replicate-t2v-private-lifecycle-r2.json` | PASS with disposable PostgreSQL, current membership and token binding | Cost UNKNOWN; reservation settlement NOT RUN | Confirmed account binding, authentic callback, application reservation outcome and independent review |
| Replicate | I2V | PASS, prediction `0kwz3zvawxrmt0d15168x8c3rm` | PASS on isolated private R2; `replicate-i2v-private-lifecycle-r2.json` | PASS with disposable PostgreSQL, current membership and token binding | Cost UNKNOWN; reservation settlement NOT RUN | Confirmed account binding, authentic callback, application reservation outcome and independent review |

The historical Fal T2V request `01a1232d-b908-7442-b7df-6558dd769706` remains in `real-provider-run-summary.json`; the later worker run is a separate request, not retroactive callback evidence for the historical request. Its callback/settlement receipt is `task-5.10/railway-worker/fal-authorized-bootstrap-20261013.json`.

## Storage profile evidence

- Cloudflare R2 live PUT/HEAD/GET/SHA-256/list/pagination/delete: `task-5.7-r2-live-adapter.json`.
- Real fal output application lifecycle: `task-5.10/fal-private-lifecycle-r2.json`.
- Real Replicate T2V output application lifecycle: `task-5.10/replicate-t2v-private-lifecycle-r2.json`.
- Real Replicate I2V output application lifecycle: `task-5.10/replicate-i2v-private-lifecycle-r2.json`.
- Shared S3-compatible contract and local adapter evidence: `task-5.7-storage-contract.json`.
- AWS S3 live connectivity remains untested; it uses the same adapter contract but cannot be claimed from the R2 run.

## Scope boundary

The Replicate I2V row used one explicitly authorized controlled request and downloaded the output before provider retention removed it. The private-lifecycle probes used retained output files and disposable database/workspace/object keys. The later Fal T2V one-shot consumed its separate authorization; no further paid creation is authorized. October 15 rechecks use only that owned acceptance output or disposable fake-transport fixtures. Production email, Stripe and historical anomalous-balance recovery remain outside this continuation. Provider cost remains UNKNOWN where no authoritative billable amount exists.
