import type { AgentState } from "../../agent/graph.ts";
import { hasStaticArtifact } from "../artifacts.ts";

export function isStylesStageComplete(state: AgentState): boolean {
  return hasStaticArtifact(state, "/styles.css");
}

