import type { AgentState } from "../../agent/graph.ts";
import { hasWorkflowArtifact } from "../artifacts.ts";

export function isFindingsStageComplete(state: AgentState): boolean {
  return hasWorkflowArtifact(state, "/findings.md");
}

