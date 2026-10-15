# Independent self-hosted runtime security review

Date: 2026-10-15. Reviewer: independent Codex native security-review agent
Ampere (`01a13fda-2275-71f0-acbd-b4140bd1fa9f`). Decision: **PASS for this
security slice**, with no actionable security regressions found.

## Reviewed boundaries

- Self-hosted execution is the default; optional Trigger activation fails closed.
- Railway acceptance, project, private-database, workspace and create-permission
  fences remain enforced.
- Worker loops start only after TCP binding succeeds. Overdue recovery precedes
  dispatch, and the persisted submission fence still prevents duplicate creates.
- Shared cleanup introduces no automatic global schedule or SDK activation.
- Export additions remain explicit. The root `.env.example` exception does not
  unignore other environment files; secret-pattern matches were fixture values.

The reviewer independently ran 31 local fixture tests, all passing. No real
environment files were read, files modified, or providers invoked by the review.

## Separate unchanged build-tracing risk

The production build passes but retains two Turbopack whole-project tracing
warnings involving `src/app/docs/_lib/source.ts` and `next.config.ts`. These
files are unchanged by this slice. Broad tracing can include unintended files;
the warning alone does not establish secret inclusion, and the reviewer found
no worsening attributable to this diff.

The integrator separately inspected filenames under `.next/standalone` and found
no `.env*` files. No secret values were read. This filename check is not a full
packaged-content or secret-value audit. Inspect the exact packaged deployment
contents before deployment; this slice does not resolve the baseline warning.

## Limits

This is not whole-M4 review, stage acceptance, integrator approval or deployment
approval. Live restart/recovery, durable external heartbeat/alerts, authentic
remaining provider application outcomes and current M3 applicability stay open.
