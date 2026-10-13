# Isolated Railway provider worker

This evidence is for the independently deployed real-provider worker in the existing Demo/acceptance project. It is not a full M4 PASS and does not enable the production catalog.

## Runtime separation

- `shpitto-m4-web` serves authenticated application APIs and verified webhook inbox receipt.
- `shpitto-m4-worker` uses Replicate/fal adapters, exact-ID polling, bounded output ingestion, private object publication and domain credit settlement.
- The original local Mock worker is unchanged.
- Startup validates the acceptance profile, expected Railway project and private PostgreSQL endpoint before migrations.
- The worker starts **paused**, with new creates disabled and no workspace assigned. Paused operation performs readiness checks but does not scan customer tasks, inboxes or assets.

## Activation controls

Set only on the explicitly approved isolated project. Do not activate for public Demo traffic without bounded provider-spend authorization.

```text
SHPTITTO_RUNTIME_PROFILE=acceptance
SHPITTO_PROVIDER_WORKER_PROJECT_ID=<approved Railway project ID>
SHPITTO_PROVIDER_WORKER_STATE=active
SHPITTO_PROVIDER_WORKER_WORKSPACE_ID=<new acceptance workspace UUID>
SHPITTO_PROVIDER_WORKER_ALLOW_CREATE=false
SHPITTO_PROVIDER_WORKER_MODEL_KEYS=<approved fixed model keys>
```

`ALLOW_CREATE=false` permits recovery/polling of an already issued request but never starts a new request. Set it to `true` only after explicit capped-spend authorization. Configure the same project/workspace admission for the Web service when creating a new task through its API. Acceptance quotes use fictional domain credits, not published vendor prices.

The worker inherits credentials through Railway service references. Replicate signing verification uses its account signing secret; fal uses the fixed official JWKS endpoint and a confirmed signed user/account binding. Do not store secret values, input capabilities or provider output URLs in evidence.

## Safety and recovery

A durable network-start fence is committed before POST. After a crash, missing request identity is reconciled from a provider-authenticated callback bound to that issued nonce, never from prompt/time similarity or a second create. Request-bound status/result URLs are preserved. Overdue work is swept before restored dispatch, and materialization is limited to 30 minutes/eight attempts under the 90-minute overall deadline. Input read capabilities expire within one hour and bind a confirmed workspace-owned crop.

Dispatch, deadline sweep, terminal-inbox draining and workspace cleanup are independent loops. This Railway runner does not assert that the separately required hosted Trigger acceptance has passed. Complete-service outages stop all local loops; restoration and external monitoring are still required.

## Evidence boundaries

Disposable PostgreSQL fixture runs test real domain transactions and runner recovery, but use fake provider HTTP responses and cannot stand in for authentic provider delivery. The R2 input-URL probe uses only a freshly generated object and removes it afterward. No new paid prediction/request is created by deployment or these probes. Task 5.10 remains open for the outstanding real callback/settlement and independent whole-stage evidence.

## Subsequent authorized live verification (2026-10-13)

The initial deployment receipts above describe a paused, pre-authorization worker. A later explicitly authorized one-shot is recorded in `fal-authorized-bootstrap-20261013.json`. It proves a real Fal T2V callback, account binding, application-private R2 publication, one seeded reservation consumption, real HTTP owner/outsider/anonymous/capability checks, scheduled fresh-fixture cleanup and paused-restart output retention. The fixed input reference estimate is USD0.405; actual billed cost is UNKNOWN. The local one-POST receipt is not an invoice.

Authentication users/demo funding and the cleanup row's 25-hour age are fixtures. The output/provider/storage/HTTP paths and scheduled R2 deletion are real. The captured scheduler observation is newer than the persisted fixture-seed clock; follow-up code adds an explicit clock-freshness regression. The unsigned S3 API returns HTTP400, which does not constitute an independent bucket-policy audit. Successful output is retained for the Demo; test orphan, temporary media files and auth sessions are removed.

Final deployment: worker `2bf5deba-ac0f-42ae-ba9a-be93de1ebfc7`, Web `fb696a0c-d924-4c6a-809a-10bcc3916032`. Worker is paused/create-disabled and exposes no active workspace. Both services have the confirmed account binding; only its SHA-256 fingerprint is recorded. The runtime admission guard now passes, but the authorization permits no additional paid POST.

115 related contracts and the local quality/build/OpenSpec/audit checks pass. Full acceptance remains blocked by stale M4 candidate digests; mandatory complete four-row/hosted-runner/whole-stage review evidence is not replaced by this scoped run. Never update an old PASS record merely to silence the digest mismatch.

Versioned console logs normalize line endings and omit terminal-only trailing padding/blank EOF lines. Original byte-for-byte captures remain in ignored local temporary files; no result, error, timestamp or test assertion is changed.
