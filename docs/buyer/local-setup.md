# Local no-cloud setup

This profile starts the persistent local prerequisites for the product: PostgreSQL, Mailpit and a worker image with FFmpeg. It uses the Mock generation driver and local asset storage, so it does not require provider, payment, storage or mail credentials.

## Prerequisites

- Docker Desktop with Compose v2.
- Node.js 24 and Corepack-enabled pnpm 12.
- `ffprobe` and `ffmpeg` available on the host PATH used by the Next.js app. Input image uploads are decoded in the app process; the worker container has its own media tools.
- Ports `5432`, `1025`, `8025` and `8080` available.

## Start and verify

```powershell
Get-Command ffprobe, ffmpeg -ErrorAction Stop | Select-Object Name, Source
corepack pnpm services:up
corepack pnpm db:migrate
Invoke-WebRequest http://localhost:8080/healthz
```

The worker health response includes the FFmpeg version. Mailpit is available at <http://localhost:8025>. The Next.js app runs separately with `corepack pnpm dev` and uses the local values from `.env.example`.

## Persistent state and reset

Compose creates three named volumes: `shpitto-postgres` for database state, `shpitto-mail` for captured messages and `shpitto-assets` for generated files. `corepack pnpm services:down` stops containers and keeps these volumes. To intentionally reset the local profile, run `docker compose -f deploy/compose.local.yml down --volumes`; this deletes only the local demo data.

## Configuration boundary

The local profile sets `SHPTITTO_RUNTIME_PROFILE=local`, `STORAGE_DRIVER=local`, `GENERATION_DRIVER=mock` and `MAIL_DRIVER=local`. `src/config/env.ts` rejects these drivers when the runtime profile is `production`, so a local compose profile cannot silently become a production deployment even when a standalone Next.js build reports `NODE_ENV=production`. Cloud provider keys are not read by the worker image.

`TASK_RUNTIME=self_hosted` is the default and does not require Trigger credentials.
This local Mock profile and the isolated Railway acceptance provider worker do
not establish generic buyer production support. The runtime and production support boundary below applies before choosing a
production worker profile.

## Administration UI ownership

The delivered image and video templates include editable administration source under `src/components/ui`, `src/components/admin`, and `src/admin`. The primitives follow the shadcn/ui composition model and the page grouping is informed by shadcn-admin. shadcn-admin is not installed or required at runtime. The template owns its routes, session integration, resource adapter, capability manifest and styles.

Better Auth sessions, server-side operator roles, allowlisted reads, named commands, idempotency, audit records, transactions and Drizzle migrations remain the authority. Customize the shell and shared resource composition in source while preserving those server contracts. The image variant withholds media controls that are not implemented by the current image runtime; the video variant exposes the current video capability fields.

## Task runtime and production support boundary

### Selected deployment policy

The buyer-owned worker is the default task runtime: `TASK_RUNTIME=self_hosted`.
Trigger.dev is an optional future adapter direction, not an executable option in
this build or a baseline M4 prerequisite for self-hosted execution. This changes orchestration ownership, not
provider, credit, storage, webhook or authorization contracts. It does not mean
that every production service can be self-hosted.

Select exactly one task runtime for an outbox scope. Do not run a self-hosted
dispatcher and a Trigger dispatcher for the same scope. Worker replicas within
one supported runtime must still use the shared database lease fences.

### What the current source implements

| Profile | Current boundary |
| --- | --- |
| Local no-cloud demo | Mock generation, local storage and the local worker; see [local setup](local-setup.md). This is not a production provider worker. |
| Isolated Railway acceptance | The only runnable real-provider runtime: a provider worker with project binding, one workspace allowlist, private Railway PostgreSQL and private S3-compatible storage. New paid creates default to disabled. |
| Generic buyer production worker | The selected default architecture, but generic buyer production activation/deployment and the M8 entry are not yet implemented or proved. |
| Optional future Trigger | The selector rejects `TASK_RUNTIME=trigger`, even with credentials, as unavailable in this build. Shared helper contracts are not an executable/deployed profile or hosted PASS. |

The Railway worker requires the acceptance runtime profile, matching Railway
project IDs and an explicit workspace when active. Its runtime launcher validates
isolation before migrations, then starts the worker. Do not bypass that launcher,
weaken the private database guard or copy Railway identity variables into another
host to manufacture production support.

`allowCreate=false` prevents new provider creation, not all effects. Recovery can
still poll existing requests, ingest output and settle reservations. Neither that
flag nor a healthy process authorizes access to existing business objects.

Setting `TASK_RUNTIME=trigger` is rejected even with `TRIGGER_PROJECT_REF` and
`TRIGGER_SECRET_KEY`: scoped task registration and deployment must be verified
before that option can become executable. Do not bypass this rejection.

Shared batch cleanup now lives in `src/modules/assets/cleanup-batch.ts`.
`src/trigger/cleanup-assets.ts` contains compatibility re-exports only; it neither
loads the Trigger SDK nor registers a schedule. The unverified automatic
all-workspace cron was removed. The shared database-wide cleanup helper still
requires separate scope authority if invoked explicitly. The installed SDK and
historical helper receipts do not establish hosted execution.

### Runtime-independent recovery contract

- Dispatch, provider polling, callback inbox draining, deadline settlement and
  cleanup must reuse the same domain commands and durable PostgreSQL outbox.
- Leases expire after 60 seconds, renew every 20 seconds, and compare exact
  owner/token/generation. Expired ownership cannot be revived or serialized into
  a later run as authority. A persisted submission-start fence forbids a second
  paid create after an uncertain outcome.
- Run the independent deadline scan at a positive interval no greater than
  60 seconds in production. Local verification uses 10 seconds; the current
  isolated Railway worker also schedules its sweep every 10 seconds, outside
  dispatch polling. The interval is not an availability promise during outage.
- Retries must not extend accepted deadlines. After total database/runner outage,
  settle overdue work before advancing it; one bounded scan is not proof that
  the entire overdue backlog has drained.
- Monitor successful sweep completion independently and alert when it is older
  than three minutes. An in-process timestamp or HTTP 200 alone is insufficient.

The current worker uses `drainOverdueGenerationTasks`: each batch selects at most
100 overdue tasks, with up to 10 batches per drain, including the empty batch that
confirms clearance. A nonempty batch with no settlements or an exhausted budget
leaves recovery incomplete. Dispatch returns `recovery_pending` before claiming
outbox work or making provider calls until a drain confirms empty; subsequent
cycles continue recovery. The independent sweep uses the same scoped drain.

For an active, assigned worker, readiness requires successful, fresh completion
of all four independent loops: dispatch, sweep, inbox and cleanup. Health exposes
in-memory `loops.<name>.lastSuccessAt` and `busy`, with freshness limits of
120 seconds for dispatch/inbox and 180 seconds for sweep/cleanup. Errors do not
refresh that loop's success timestamp. A paused/unassigned process has no active
loops; an HTTP 200 alone does not establish active processing or scope authority.

These checks do not implement durable external heartbeat monitoring or alert
delivery; both remain unimplemented/unverified. A generic production rollout
still needs reviewed scope coverage, scoped maintenance, independent recovery
monitoring and clean-export deployment evidence.

### Release and acceptance limits

The export contracts include the existing isolated worker's startup sources and
exact image fixture inputs. Inclusion makes those sources available; it does not
make the acceptance-only image a supported generic production deployment. The
buyer command projection still needs review before a provider-worker command can
be advertised as part of the delivered command surface.

Production support requires clean-export deployment evidence, validated database
and workspace authority, schema/media-tool readiness, recovery monitoring and
the applicable real-provider evidence. Historical fixture receipts remain
fixtures. Missing optional Trigger credentials or hosted evidence do not block
the self-hosted baseline M4 path, but all applicable provider, recovery and
independent-review obligations remain. No whole-stage approval is implied.
