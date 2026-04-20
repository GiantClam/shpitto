import type { AgentState } from "../../agent/graph.ts";
import { hasNonRootHtmlRoute } from "../artifacts.ts";

export function isPagesStageComplete(state: AgentState): boolean {
  return hasNonRootHtmlRoute(state);
}

