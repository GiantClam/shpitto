# M1 scaffold and preservation evidence

Status: **PASS** for task 2.8. The exact working-tree candidate `working-tree-20260928-m1` passed independent review and integrator review; this does not claim identity, credits, billing, generation, or release readiness.

## Scope and candidate

- Branch: `codex/restart-shpitto-m0`
- Source commit before the working-tree changes: `6ad44be7b6f12fe028637f0300040bada826c47d`
- Legacy archive: `legacy/shpitto-platform/`
- New product roots: `src/`, `content/`, `skills/`, `deploy/`, `scripts/`, `.shpitto/`
- Candidate digests and the deterministic input lists are recorded in the M1 acceptance record at `internal/evidence/acceptance/M1/working-tree-20260928-m1/record.json`.

## Mandatory criteria

### M1-C01 — Preservation and source-only rollback

- The pre-move and post-move manifests account for all `1,686` inventoried source files and `25,585,005` source bytes.
- The post-move manifest reports zero source files remaining at mapped paths, zero destination hash/size mismatches, and zero unexpected or missing destination files.
- The relocation journal is `COMPLETED`; the root `.git` directory and history remain at the repository root.
- The disposable restore drill restored all `1,686` files and preserved an unrelated sentinel. The procedure is documented in `internal/restart/restore.md`.

Evidence: `internal/restart/pre-move-manifest.json`, `internal/restart/post-move-manifest.json`, `internal/restart/relocation-journal.json`, `internal/restart/restore.md`.

### M1-C02 — New-root isolation and reproducibility

- `corepack pnpm verify` passed typecheck, source-boundary, format, configuration, database, local-service, shell, content-boundary, root-integrity, acceptance-record, OpenSpec and standalone build checks.
- The root workspace is empty and the TypeScript/Docker boundaries exclude `legacy`, `apps`, `builder`, `packages`, `sites` and `internal`.
- The shell and content checks reject legacy/vendor imports, direct environment reads outside the environment module, untrusted export classes and deferred-behavior claims.
- `openspec validate restart-shpitto-video-saas --strict --json --no-interactive` passed.

Evidence: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `.dockerignore`, `scripts/check-root-integrity.mjs`, `scripts/check-source-boundaries.mjs`, `internal/restart/m1-root-scaffold-evidence.md`.

### M1-C03 — Persistent local dependencies and safe production configuration

- PostgreSQL, Mailpit, the worker and all three named volumes passed the local service contract and disposable Compose readiness/restart check.
- The worker health endpoint returned HTTP 200 and reported the pinned FFmpeg version after restart.
- Local Compose contains no cloud credential names; production configuration rejects local/mock drivers and sample secrets.

Evidence: `internal/restart/m1-local-services-evidence.md`, `deploy/compose.local.yml`, `deploy/worker.Dockerfile`, `scripts/check-local-services.mjs`, `scripts/worker-health.mjs`.

### M1-C04 — Owned product shells and content/export boundaries

- Marketing, auth, app, admin and Docs routes build with explicit loading and deferred-behavior states.
- The admin shell is client-only and separated from product routes; server guard seams are documented without creating a second auth implementation.
- Legacy harness guidance remains under `legacy/shpitto-platform/AGENTS.md`.
- The root contract, twelve-entry Skill registry, shared versioned Docs manifest and export classes identify the owning layer and exclude internal/legacy state from customer artifacts.

Evidence: `internal/restart/m1-shell-evidence.md`, `internal/restart/m1-content-boundary-evidence.md`, `.shpitto/contracts/root-contract.md`, `.shpitto/contracts/export-classes.json`, `skills/registry.json`, `content/docs/v1/manifest.json`.

## Deferred scope

Better Auth flows, workspace isolation, credits, billing, generation, operator resources, Fumadocs runtime, provider accounts, affiliate programs and customer release packaging remain assigned to M2–M8. The preview routes intentionally do not provide those behaviors.

## Reproduction commands

```powershell
corepack pnpm verify
openspec validate restart-shpitto-video-saas --strict --json --no-interactive
python -B internal/restart/check-acceptance-record.py internal/evidence/acceptance/M1/working-tree-20260928-m1/record.json
```

No provider, payment, payout, publication or hosted-service action was performed. No secrets were stored in the evidence.

## Review state

Independent reviewer `m1-gpt6-luna-review-20260928` recomputed the candidate digests, checked all evidence references and passed M1-C01 through M1-C04. The integrator recorded `PASS` for this exact candidate. A minor historical archive-untracked-count discrepancy (1,686 expected versus 1,683 observed) was reviewed and does not affect literal file accounting or the successful restore drill.
