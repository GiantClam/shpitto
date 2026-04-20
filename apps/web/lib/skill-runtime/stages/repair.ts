import type { AgentState } from "../../agent/graph.ts";

export function isRepairStageComplete(state: AgentState): boolean {
  return String(state?.phase || "").trim().toLowerCase() === "end";
}

