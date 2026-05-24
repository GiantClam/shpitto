1. Reproduce and isolate the two blockers from the attached QA report: `/api/chat` 500 caused by missing chat-memory tables, and studio subpage failures caused by malformed workspace project IDs.
2. Add regression coverage before behavior changes where feasible:
   - chat-memory backend fallback when Supabase memory tables are missing
   - workspace/project route ID normalization for malformed `analysis-* / settings-* / assets-* / data-*` paths
3. Implement the smallest source/runtime fixes that restore the production flow without adding scenario-specific design patches.
4. Run focused tests, typecheck/build-relevant verification, and record remaining risk.
5. Follow up with a live production smoke pass, compare real responses with the attached QA report, and close the remaining runtime gaps around project-backed analysis/domain routes.
6. Reconcile the 2026-05-24 deep QA report against the current deployed behavior, separate already-fixed findings from still-reproducible blockers, and isolate the active owner layer for generation/preview gaps.
7. Fix the remaining active blockers in the smallest correct layer, prioritizing real generation-state / preview / project-state issues over stale report artifacts.
8. Re-run focused local verification and a production smoke pass that exercises the repaired flow end-to-end.
