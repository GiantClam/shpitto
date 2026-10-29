import type { AgentState } from "../agent/graph.ts";
import { SKILL_RUNTIME_FIXED_PHASES, type SkillRuntimePhase } from "./phase-types.ts";

type GenericFile = {
  path?: string;
  content?: string;
};

function normalizePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

export function mergeAgentState(base: AgentState, patch: Partial<AgentState>): AgentState {
  const patchMessages = Array.isArray((patch as any)?.messages) ? ((patch as any).messages as any[]) : [];
  return {
    ...base,
    ...patch,
    messages: [...(base.messages || []), ...patchMessages],
  };
}

export function getWorkflowArtifactFiles(state: AgentState): GenericFile[] {
  const siteArtifacts = (state as any)?.site_artifacts || {};
  return Array.isArray(siteArtifacts?.workflowArtifacts?.files) ? siteArtifacts.workflowArtifacts.files : [];
}

export function getStaticArtifactFiles(state: AgentState): GenericFile[] {
  const siteArtifacts = (state as any)?.site_artifacts || {};
  return Array.isArray(siteArtifacts?.staticSite?.files) ? siteArtifacts.staticSite.files : [];
}

export function getPages(state: AgentState): Array<{ path?: string; html?: string }> {
  const siteArtifacts = (state as any)?.site_artifacts || {};
  return Array.isArray(siteArtifacts?.pages) ? siteArtifacts.pages : [];
}

export function getGeneratedFilePaths(state: AgentState): string[] {
  return getStaticArtifactFiles(state)
    .map((file) => normalizePath(String(file?.path || "")))
    .filter((filePath) => !!filePath && filePath !== "/");
}

export function hasWorkflowArtifact(state: AgentState, targetPath: string): boolean {
  const expected = normalizePath(targetPath).toLowerCase();
  return getWorkflowArtifactFiles(state).some((file) => normalizePath(String(file?.path || "")).toLowerCase() === expected);
}

export function hasStaticArtifact(state: AgentState, targetPath: string): boolean {
  const expected = normalizePath(targetPath).toLowerCase();
  return getStaticArtifactFiles(state).some((file) => normalizePath(String(file?.path || "")).toLowerCase() === expected);
}

export function hasNonRootHtmlRoute(state: AgentState): boolean {
  const pageFromFiles = getStaticArtifactFiles(state).some((file) => {
    const path = normalizePath(String(file?.path || "")).toLowerCase();
    if (!path.endsWith(".html")) return false;
    return path !== "/index.html";
  });
  if (pageFromFiles) return true;
  return getPages(state).some((page) => {
    const route = String(page?.path || "").trim();
    return !!route && route !== "/";
  });
}

export function collectCompletedPhases(state: AgentState): SkillRuntimePhase[] {
  const completed: SkillRuntimePhase[] = [];
  if (hasWorkflowArtifact(state, "/task_plan.md")) completed.push("task_plan");
  if (hasWorkflowArtifact(state, "/findings.md")) completed.push("findings");
  if (hasWorkflowArtifact(state, "/design.md")) completed.push("design");
  if (hasStaticArtifact(state, "/styles.css")) completed.push("styles");
  if (hasStaticArtifact(state, "/script.js")) completed.push("script");
  if (hasStaticArtifact(state, "/index.html")) completed.push("index");
  if (hasNonRootHtmlRoute(state)) completed.push("pages");
  if (String(state?.phase || "").trim().toLowerCase() === "end") completed.push("repair");
  return SKILL_RUNTIME_FIXED_PHASES.filter((phase) => completed.includes(phase));
}

export function artifactCounts(state: AgentState): { workflow: number; static: number; pages: number } {
  return {
    workflow: getWorkflowArtifactFiles(state).length,
    static: getStaticArtifactFiles(state).length,
    pages: getPages(state).length,
  };
}
