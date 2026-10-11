# M1 root scaffold evidence

Status: **READY_FOR_REVIEW** for task 2.3. This evidence covers the new single-package root only; it does not close the M1 gate or claim application journeys.

## Observed result

- Frozen-lock install completed with Node `24.15.0`, Corepack pnpm `12.6.0`, `--frozen-lockfile --ignore-scripts` and exit code `0`.
- The root lock digest is `fe3def4e775fb6d0f14fa598dcc9f60853993b3f26da4a139e06d8a351ff351a`, matching the accepted selected-stack prototype.
- `corepack pnpm typecheck` passed.
- `corepack pnpm lint` passed the legacy/vendor import boundary policy.
- `corepack pnpm format:check` passed.
- `corepack pnpm verify:config` passed placeholder and production demo-driver checks.
- `corepack pnpm verify` passed, including root integrity, acceptance-record, OpenSpec and database-boundary checks; the command also ran the Next standalone build.
- `openspec validate restart-shpitto-video-saas --strict --json --no-interactive` passed.
- The M0 acceptance-record checker still passes with zero errors.

## New-root boundaries

- `pnpm-workspace.yaml` declares an empty workspace; legacy source is not a workspace package.
- `tsconfig.json` excludes `legacy`, `apps`, `builder`, `packages`, `sites` and `internal` from application compilation.
- `.dockerignore` excludes legacy, vendor, planning and private state from the application build context.
- `scripts/check-source-boundaries.mjs` rejects legacy/vendor imports and direct environment reads outside `src/config/env.ts`.
- `src/config/env.ts` rejects empty/sample secrets and local/mock drivers when `NODE_ENV=production`.
- `.env.example` contains placeholders only; no provider, payment or database secret is copied from the old root.

## Candidate configuration digests

| File | SHA-256 |
| --- | --- |
| `package.json` | `30a2aadff66936c96c3cb73c1a314c56fccc994fcce55a9719fd6d28fd0742d9` |
| `pnpm-lock.yaml` | `fe3def4e775fb6d0f14fa598dcc9f60853993b3f26da4a139e06d8a351ff351a` |
| `pnpm-workspace.yaml` | `7bbb598297aee1551dbe71d705698aa2483e2589dd1cb931b5d4f10f15852d38` |
| `next.config.ts` | `d8ae11b4bcde426a4a8e06d64b4b99a7100b9148201484c3b7c2c9294f9eb668` |
| `tsconfig.json` | `f0bea185f97cae276c33c750226471415285048416a8e4813218a599d9ad4b28` |
| `.dockerignore` | `219ed95a54953f98a590a6aada3f3e2e34692cc114790507dfa3136c9be13f37` |
| `.env.example` | `45258955463ca5f104c44f922f48c75f8caed79598e0cefcc8bbd8546d141160` |
| `src/config/env.ts` | `a551b8476e0c9f4f65ce3b51814548ee6a9c53eacd9f827a57b48833985bd82b` |
| `scripts/check-root-integrity.mjs` | `df22dcb0d083328edeed82ff7699d7e68aaf313c1ab272d2ab37eb5dd8255c09` |
| `scripts/check-config.mjs` | `396ca22ea5201cde47fc3823518a0095db76c4dc04b926e49cca36be9ed43604` |
| `.github/workflows/verify-root.yml` | `3bf11ffff60f33d92154ab856f23ff79e3e543d45c15bd16ebcfe0af6105f80d` |

## Deferred work

The new root still contains placeholder product routes. Customer guidance boundaries, buyer-facing journeys and the final M1 gate remain tasks 2.7–2.8 and are not represented as completed behavior here. Database, local-service and shell foundations are covered separately by [m1-db-boundary-evidence.md](m1-db-boundary-evidence.md), [m1-local-services-evidence.md](m1-local-services-evidence.md) and [m1-shell-evidence.md](m1-shell-evidence.md).
