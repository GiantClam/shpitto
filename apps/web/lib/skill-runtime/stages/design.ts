import type { AgentState } from "../../agent/graph.ts";
import { hasWorkflowArtifact } from "../artifacts.ts";

export function isDesignStageComplete(state: AgentState): boolean {
  return hasWorkflowArtifact(state, "/design.md");
}

