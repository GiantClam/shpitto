import type { AgentState } from "../../agent/graph.ts";
import { hasStaticArtifact } from "../artifacts.ts";

export function isIndexStageComplete(state: AgentState): boolean {
  return hasStaticArtifact(state, "/index.html");
}

