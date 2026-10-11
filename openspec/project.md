# Shpitto restart specification workspace

Status: implementation planning; application work has not started as part of this change.

## Entry points and authority

1. Current user decisions and confirmed D01-D31 govern product scope.
2. The [restart change](changes/restart-shpitto-video-saas/proposal.md), its capability specs, [design](changes/restart-shpitto-video-saas/design.md) and [tasks](changes/restart-shpitto-video-saas/tasks.md) govern the proposed implementation. Explicit engineering defaults E01-E05 are not retroactive user confirmations.
3. The [detailed technical baseline](../docs/plans/2026-09-27-shpitto-detailed-technical-design.md) supplies version pins, schema, algorithms, endpoint mappings and limits. The change design identifies deliberate clarifications to that baseline.
4. The [requirements](../docs/plans/2026-09-27-shpitto-restart-requirements.md), [PRD](../.omx/plans/prd-shpitto-restart.md), [earlier plan](../.omx/plans/shpitto-restart-plan.md), [acceptance catalog](../.omx/plans/test-spec-shpitto-restart.md), and [admin assessment](../docs/plans/2026-09-27-shpitto-admin-foundation-assessment.md) preserve reasoning and D/J/G/T identities. Superseded wording is corrected or labeled; historical review does not approve new text automatically.
5. Chinese documents are a full review surface. Resolve translation disagreement against explicit product decisions and English normative text, then correct both.

See the [Chinese review entry](reviews/shpitto-restart.zh-CN.md), [traceability](changes/restart-shpitto-video-saas/traceability.md), and [baseline manifest](baseline-manifest.json).

## Artifact state

`changes/restart-shpitto-video-saas/specs/` contains proposed additions. `specs/` remains empty until implementation is complete and archiving is appropriate. An artifact can be complete while every implementation task remains unchecked. CLI validation proves structure, not runtime correctness or release readiness.

The restart is one coordinated change because credit, task, payment and delivery invariants cross capabilities. Numbered milestone tasks provide execution slices. Completing a phase does not justify archiving the whole change. Independent future releases require an explicit change dependency map and unique requirement ownership.

## Repository guidance transition

Root `AGENTS.md` still governs the legacy checkout. Planning does not rewrite its runtime repair rules. M1 task 2.7 preserves the old harness alongside legacy source and installs new root guidance referencing OpenSpec. Old website-generation runtime rules must not become new application contracts.

Only named reviewed baseline files are unignored. Private state, logs and other docs remain ignored. Tracking eligibility is not staging, committing or publishing.
