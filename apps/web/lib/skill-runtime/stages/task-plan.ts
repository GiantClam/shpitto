import type { AgentState } from "../../agent/graph.ts";
import { hasWorkflowArtifact } from "../artifacts.ts";

export function isTaskPlanStageComplete(state: AgentState): boolean {
  return hasWorkflowArtifact(state, "/task_plan.md");
}

