# Real provider verification

## fal.ai

On 2026-10-10, after explicit paid-run authorization, one controlled fal T2V request and one controlled fal I2V request completed through the repaired adapter. The adapter used `Authorization: Key`, persisted the returned dynamic `status_url` and `response_url`, polled those exact URLs, accepted fal result payloads that omit `request_id`, and downloaded both outputs.

Evidence: `fal-real-run-summary.json`, `fal-t2v-real-run.json`, `fal-i2v-real-run.json`.

Both outputs were measured as H.264, 1280x720, 81 frames and approximately 5.07 seconds. The downloaded artifacts are retained beside this record with SHA-256 digests.

The same output bytes were then passed through the application-owned materialization boundary against the isolated private R2 bucket and a disposable PostgreSQL database. Both became ready asset rows, were readable only after current workspace authorization plus the sixty-second token binding, matched their source SHA-256 digests, and were removed through the authorized delete path. A separate old pending asset was removed through the production S3 orphan-cleanup schedule entry point. The probe removed every generated object and the disposable database. Evidence: `fal-private-lifecycle-r2.json` and `../task-5.7-r2-live-adapter.json`.

The callback path was not exercised because no public callback endpoint was configured. Real domain-task reservation, provider cost, credit settlement and independent review remain open. The original pre-repair paid fal request is still unresolved because its request identity was not persisted.

## Replicate

The earlier read-only account and model contract verification, plus one real Replicate T2V smoke run, remain recorded in `replicate-t2v-real-smoke.json`. A single explicitly authorized Replicate I2V request was then completed with the public test image captured at `replicate-i2v-test-image.jpg`. The prediction `0kwz3zvawxrmt0d15168x8c3rm` completed through the pinned I2V version, returned one video output, and was downloaded immediately as `replicate-i2v-real-0kwz3zvawxrmt0d15168x8c3rm.mp4`. Its request, output digest, media probe, retention state and unknown cost status are recorded in `replicate-i2v-real-run.json`.

Both retained Replicate output files were passed through the application-owned materialization boundary against the isolated private R2 bucket and disposable PostgreSQL databases. Ready publication, current-membership authorization, sixty-second token binding, exact SHA-256 download, authorized deletion and scheduled orphan cleanup passed in `replicate-t2v-private-lifecycle-r2.json` and `replicate-i2v-private-lifecycle-r2.json`.

The callback path was not exercised because no public callback endpoint was configured. The provider API did not expose a billable amount, so cost remains explicitly unknown. Real domain-task reservation settlement and independent review remain open; these omissions keep 5.10 open under the all-rows gate.
