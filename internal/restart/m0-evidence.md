# M0 implementation evidence — passed

Status: **PASS**. The exact local candidate passed independent review and integrator review. This record remains the M0 decision; M1 relocation is recorded separately in the pre-move and post-move manifests.

## Completed in this increment

- Read-only root/Git/local-authored-state inventory written to [inventory.json](inventory.json).
- Proposed relocation and restore policy written to [relocation-map.json](relocation-map.json) and [restore.md](restore.md).
- Current runtime observations recorded: Node 24.15.0, Corepack pnpm 12.6.0 and Docker 29.8.0 Linux daemon available.
- The isolated selected-stack prototype has a dedicated pnpm 12 lock, installed 459 packages, passed TypeScript 6.0.3 typecheck and produced Next.js 16.3.6 standalone output; see [build-evidence.json](../spikes/selected-stack/build-evidence.json) and [dependency-decisions.md](dependency-decisions.md).
- Better Auth session, server authorization, React-admin contract and role-revocation probes passed; see [auth-evidence.json](../spikes/selected-stack/auth/auth-evidence.json) and [admin-evidence.json](../spikes/selected-stack/admin/admin-evidence.json).
- Disposable PostgreSQL probes proved Better Auth session persistence across adapter restart, a persisted operator role through the React-admin authorization path, role revocation, one-effect domain idempotency, injected rollback, and a repeated Drizzle-applied migration with forced RLS that rejects cross-tenant reads/writes; see [admin-postgres-chain-evidence.json](../spikes/selected-stack/admin/admin-postgres-chain-evidence.json), [domain-evidence.json](../spikes/selected-stack/domain/domain-evidence.json), [migration-rls-evidence.json](../spikes/selected-stack/domain/migration-rls-evidence.json) and [better-auth-pg-evidence.json](../spikes/selected-stack/domain/better-auth-pg-evidence.json).
- Fumadocs static navigation/search, standalone host packaging and the Docker worker media fixture passed; host and container FFmpeg/ffprobe provenance, image/base digests and fixture hashes are recorded; see [docs-evidence.json](../spikes/selected-stack/docs/docs-evidence.json), [packaging-evidence.json](../spikes/selected-stack/packaging/packaging-evidence.json) and [worker-evidence.json](../spikes/selected-stack/packaging/worker-evidence.json).
- External account, budget and commercial prerequisites classified in [external-inputs.json](external-inputs.json).
- Single-owner ProviderPort/DTO, schema, migration and lock-order contract frozen in [contract-register.md](contract-register.md); external boundary decisions and deferred account evidence are in [integration-matrix.md](integration-matrix.md) and [external-inputs.json](external-inputs.json).
- Verification and acceptance record conventions documented in [verification-plan.md](verification-plan.md); the evidence index maps all requirements, scenarios, tests, tasks and gates, and the local record checker is [check-acceptance-record.py](check-acceptance-record.py).

## Follow-up after M0 PASS

1. M1 task 2.1 created the fresh preservation snapshot and M1 task 2.2 completed the approved source relocation; see [post-move-manifest.json](post-move-manifest.json) and [restore.md](restore.md).
2. Keep later account, budget, commercial, final production role/step-up, migration-chain and shipped-image notice work assigned to its stated M1–M8 gates.

The independent reviewer `m0_independent_review_hash_fixed` confirmed the exact migration file, bundle, manifest and candidate schema digests, OpenSpec validation, acceptance checker, JSON parsing and probe syntax. The integrator recorded `PASS` in the acceptance record. The later M1 relocation uses a separate journal and post-move restoration evidence, so the historical M0 review is not reused as M1 proof.

## Evidence boundary

No source path was moved or deleted. No dependency was installed into the legacy root. No provider, payment, payout or publication call was made.
