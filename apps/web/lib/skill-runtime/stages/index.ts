import type { AgentState } from "../../agent/graph.ts";
import type { SkillRuntimePhase } from "./types.ts";
import { SKILL_RUNTIME_FIXED_PHASES } from "./types.ts";
import { isTaskPlanStageComplete } from "./task-plan.ts";
import { isFindingsStageComplete } from "./findings.ts";
import { isDesignStageComplete } from "./design.ts";
import { isStylesStageComplete } from "./styles.ts";
import { isScriptStageComplete } from "./script.ts";
import { isIndexStageComplete } from "./index-page.ts";
import { isPagesStageComplete } from "./pages.ts";
import { isRepairStageComplete } from "./repair.ts";

const STAGE_CHECKERS: Record<SkillRuntimePhase, (state: AgentState) => boolean> = {
  task_plan: isTaskPlanStageComplete,
  findings: isFindingsStageComplete,
  design: isDesignStageComplete,
  styles: isStylesStageComplete,
  script: isScriptStageComplete,
  index: isIndexStageComplete,
  pages: isPagesStageComplete,
  repair: isRepairStageComplete,
};

export function isRuntimePhaseComplete(state: AgentState, phase: SkillRuntimePhase): boolean {
  const checker = STAGE_CHECKERS[phase];
  return checker(state);
}

export function resolveNextRuntimePhase(state: AgentState): SkillRuntimePhase | undefined {
  for (const phase of SKILL_RUNTIME_FIXED_PHASES) {
    if (!isRuntimePhaseComplete(state, phase)) return phase;
  }
  return undefined;
}

