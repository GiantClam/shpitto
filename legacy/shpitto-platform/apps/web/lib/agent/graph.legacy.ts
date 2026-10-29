/**
 * Legacy graph execution path has been moved out of the default main flow.
 *
 * Default generation path:
 * - apps/web/lib/agent/graph.ts -> SkillRuntimeExecutor (skill_native)
 *
 * This file exists as an explicit marker for the retired legacy branch.
 * Re-enable only for debugging/migration experiments in a separate entrypoint,
 * never in the default production path.
 */

export const LEGACY_GRAPH_RETIRED = true;

export function legacyGraphUnavailable(): never {
  throw new Error(
    "Legacy graph path is retired from the default runtime. Use skill_native executor in graph.ts.",
  );
}
