# M0 selected-stack dependency decision record

Status: **READY_FOR_REVIEW — pnpm 12 target prototype, PostgreSQL/Better Auth boundary, Docs/admin packaging and container media provenance are recorded**. M0 remains open only for independent review; final production operator-role administration/step-up, release migrations, account-backed integrations and shipped-image notices belong to later gates. The legacy root lockfile remains untouched.

## Selected baseline from the approved design

| Area | Target | Current local observation |
| --- | --- | --- |
| Runtime/package manager | Node 24 LTS / pnpm 12.6.0 | Node `v24.15.0` and Corepack-activated pnpm `12.6.0` are available in the isolated prototype |
| Web | Next.js 16.3.6 / React 19.3.0 / TypeScript 6.0.3 | Not installed as a target app dependency in the legacy root |
| Data/identity | PostgreSQL 17 / Drizzle 0.45.3 / Better Auth 1.7.6 | Disposable Drizzle migration, forced RLS and Better Auth adapter/pool restart probes passed; final release chain is M1 |
| Admin/docs | Project-owned shadcn/ui-style admin source / Fumadocs 16.15.14 | Admin isolation, source-owned component boundary and Fumadocs static source/search probes passed in the current implementation |
| Billing/jobs | Stripe 22.6.2 / Trigger 4.6.4 | Package resolution is locked; account-backed event/recovery evidence remains M5 |
| Media | S3 client 3.1141.0 / Resend 6.30.0 / sharp 0.35.4 / FFmpeg 7.x | Pinned Debian worker image generated/transcoded/probed a fixture; final shipped notices remain M8 |

## Evidence and decision

- The current root package is `industry-v0` and its declared application dependencies are LangChain/OpenAI utilities, not the selected restart stack.
- `pnpm list --depth 0` shows the current legacy dependency graph; it must not be reused as the new product lock without a reviewed migration.
- Node 24, Docker CLI and Corepack pnpm 12.6.0 are available locally. The selected application packages use an isolated lock and compatibility build.
- No unsupported peer override has been added. The legacy lockfile remains untouched; all target installs are isolated.

## M0 decision

The selected versions are feasible for the restart implementation and remain isolated from the legacy root. Any provider or package incompatibility discovered later must update the approved design/specs, this decision record and the affected acceptance evidence together. No source relocation is authorized until the independent M0 review passes.


## Prototype result

The isolated prototype generated a dedicated pnpm 12 lockfile, installed 459 packages with the frozen lock, passed TypeScript 6.0.3 typecheck and produced Next standalone output. Better Auth persistence, server authorization, a disposable persisted operator role, Fumadocs static search, migration ownership, forced-RLS isolation, PostgreSQL rollback and the Docker worker fixture are recorded in the selected-stack probe files. Direct package license metadata is in [license-report.json](license-report.json). The prototype does not claim final production role administration/step-up, final release migration, external account or commercial evidence.
