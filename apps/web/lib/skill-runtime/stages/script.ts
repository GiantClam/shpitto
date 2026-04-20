import type { AgentState } from "../../agent/graph.ts";
import { hasStaticArtifact } from "../artifacts.ts";

export function isScriptStageComplete(state: AgentState): boolean {
  return hasStaticArtifact(state, "/script.js");
}

