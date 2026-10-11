# M4 real-provider matrix

Status: partial real-account evidence. All four provider rows now have a captured playable output and the two Replicate rows have passed the isolated R2 application lifecycle. This matrix does not close task 5.10 because callback, real reservation settlement and independent review evidence are still missing.

| Provider | Mode | Provider output | Private application storage | Publication and download authorization | Cost and credit settlement | Remaining blocker |
|---|---|---|---|---|---|---|
| fal.ai | T2V | PASS, request `01a1232d-b908-7442-b7df-6558dd769706` | PASS on isolated private R2 | PASS with disposable PostgreSQL, current membership and token binding | NOT RUN | Authenticated callback, cost evidence, real reservation settlement and independent review |
| fal.ai | I2V | PASS, request `01a12337-c628-7363-93bd-2e526b11514b` | PASS on isolated private R2 | PASS with disposable PostgreSQL, current membership and token binding | NOT RUN | Authenticated callback, cost evidence, real reservation settlement and independent review |
| Replicate | T2V | PASS, prediction `wxrfrzbt1drmt0d141n98vhsxr` | PASS on isolated private R2; `replicate-t2v-private-lifecycle-r2.json` | PASS with disposable PostgreSQL, current membership and token binding | UNKNOWN; provider response exposed no billable amount | Authenticated callback, real domain reservation settlement and independent review |
| Replicate | I2V | PASS, prediction `0kwz3zvawxrmt0d15168x8c3rm` | PASS on isolated private R2; `replicate-i2v-private-lifecycle-r2.json` | PASS with disposable PostgreSQL, current membership and token binding | UNKNOWN; provider response exposed no billable amount | Authenticated callback, real domain reservation settlement and independent review |

## Storage profile evidence

- Cloudflare R2 live PUT/HEAD/GET/SHA-256/list/pagination/delete: `task-5.7-r2-live-adapter.json`.
- Real fal output application lifecycle: `task-5.10/fal-private-lifecycle-r2.json`.
- Real Replicate T2V output application lifecycle: `task-5.10/replicate-t2v-private-lifecycle-r2.json`.
- Real Replicate I2V output application lifecycle: `task-5.10/replicate-i2v-private-lifecycle-r2.json`.
- Shared S3-compatible contract and local adapter evidence: `task-5.7-storage-contract.json`.
- AWS S3 live connectivity remains untested; it uses the same adapter contract but cannot be claimed from the R2 run.

## Scope boundary

The Replicate I2V row used one explicitly authorized controlled provider request and downloaded the output before provider retention removed it; no retry or additional provider request was made. The private-lifecycle probes created no provider requests and used only retained output files with disposable database/workspace/object keys. Production email, Stripe, historical anomalous-balance recovery, provider cost confirmation and real domain credit settlement remain outside this continuation.
