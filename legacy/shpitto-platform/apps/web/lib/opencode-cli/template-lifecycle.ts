import fs from "node:fs/promises";
import path from "node:path";
import type { AgentState } from "../agent/graph.ts";
import {
  buildPreparedWorkspaceBundle,
  materializePreparedWorkspace,
  materializePreparedWorkspaceContractOverlay,
  type PreparedStaticSiteFile,
  type PreparedWorkspaceBundle,
} from "./nextjs-baseline.ts";
import {
  buildShpittoOpenCodeBundle,
  isProductizedBaselineSkillId,
  type OpenCodeTaskClass,
  type ShpittoOpenCodeRequest,
} from "./website-contract.ts";
import { OPENCODE_SKILL_RESULT_PATH, resolveSkillManifest } from "./skill-manifest.ts";
import { runOpenCodeCli, type OpenCodeCliRunResult } from "./runner.ts";

export type ProductizedTemplateOperation = "generate" | "refine" | "validate" | "preview" | "deploy";

export type PreparedTemplateLifecycle = {
  request: ShpittoOpenCodeRequest;
  workspaceRoot: string;
  sourceWorkspaceRoot?: string;
  operationSkillId: string;
  bundle: PreparedWorkspaceBundle;
  projectArtifact: Record<string, unknown>;
  staticSiteFiles: PreparedStaticSiteFile[];
};

export type ProductizedTemplateRun = PreparedTemplateLifecycle & {
  openCodeResult: OpenCodeCliRunResult;
};

const OPERATION_SKILLS: Record<Exclude<ProductizedTemplateOperation, "generate">, string> = {
  refine: "template-modify",
  validate: "template-validate",
  preview: "template-preview",
  deploy: "template-deploy",
};

const OPERATION_TASK_CLASSES: Record<Exclude<ProductizedTemplateOperation, "generate">, OpenCodeTaskClass> = {
  refine: "scoped_refinement",
  validate: "template_validation",
  preview: "template_preview",
  deploy: "template_deployment",
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T;
}

function normalizeWorkspaceRoot(value: string): string {
  const root = path.resolve(String(value || "").trim());
  if (!root || root === path.parse(root).root) throw new Error("A non-root template workspace is required.");
  return root;
}

function normalizeStaticFiles(value: unknown): PreparedStaticSiteFile[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      path: String((item as any)?.path || "").trim(),
      type: String((item as any)?.type || "text/plain").trim() || "text/plain",
      content: String((item as any)?.content || ""),
    }))
    .filter((item) => item.path);
}

function resolveOperationSkillId(operation: ProductizedTemplateOperation, baseSkillId: string): string {
  if (operation === "generate") return String(baseSkillId || "build-ai-image-tool").trim().toLowerCase();
  return OPERATION_SKILLS[operation];
}

function resolveOperationContextSkillId(baseSkillId: string, workflow: Record<string, unknown>): string {
  const explicit = String(workflow.templateSkillId || workflow.baseSkillId || baseSkillId || "").trim().toLowerCase();
  return isProductizedBaselineSkillId(explicit) ? explicit : "build-ai-image-tool";
}

async function copyWorkspace(sourceRoot: string, targetRoot: string): Promise<void> {
  const source = normalizeWorkspaceRoot(sourceRoot);
  const target = normalizeWorkspaceRoot(targetRoot);
  if (source === target) throw new Error("Source and target template workspaces must be different.");
  await fs.access(path.join(source, ".shpitto", "request.json"));
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true, force: true, errorOnExist: false });
}

function buildOperationSuccessCriteria(operation: ProductizedTemplateOperation): string[] {
  if (operation === "refine") {
    return [
      "preserve the current template manifest and product-owned runtime routes",
      "apply only the requested bounded change",
      "run the validation command and report changed files",
    ];
  }
  if (operation === "validate") {
    return ["validate the manifest, routes, server routes, provider, billing, CMS, and build health", "report blockers truthfully"];
  }
  if (operation === "preview") {
    return ["validate the current workspace", "produce isolated preview evidence without changing production state"];
  }
  if (operation === "deploy") {
    return ["validate the current workspace", "verify the declared server-capable deployment target", "record deployment evidence and rollback information"];
  }
  return [
    "all required routes exist",
    "the output remains a deployable Next.js App Router project",
    "result includes a complete website baseline, not only a homepage",
  ];
}

function updateProjectArtifact(params: {
  projectArtifact: Record<string, unknown>;
  workspaceRoot: string;
  operation: ProductizedTemplateOperation;
  staticSiteFiles: PreparedStaticSiteFile[];
  serverCapable: boolean;
}): Record<string, unknown> {
  const project = cloneJson(params.projectArtifact);
  const staticSite = project.staticSite && typeof project.staticSite === "object" ? cloneJson(project.staticSite) : {};
  project.framework = "nextjs-app-router";
  project.staticSite = {
    ...(staticSite as Record<string, unknown>),
    mode: params.serverCapable ? "shpitto-opencode-nextjs-server" : "shpitto-opencode-nextjs-baseline",
    serverCapable: params.serverCapable,
    workspaceRoot: params.workspaceRoot,
    lastOperation: params.operation,
    files: params.staticSiteFiles,
  };
  project.shpittoWorkspace = {
    ...(project.shpittoWorkspace && typeof project.shpittoWorkspace === "object" ? project.shpittoWorkspace : {}),
    rootDir: params.workspaceRoot,
    requestFile: path.join(params.workspaceRoot, ".shpitto", "request.json"),
    framework: "nextjs-app-router",
    runtime: params.serverCapable ? "server" : "static",
  };
  return project;
}

export async function prepareProductizedTemplateWorkspace(params: {
  operation: ProductizedTemplateOperation;
  baseSkillId: string;
  state: AgentState;
  workspaceRoot: string;
  sourceWorkspaceRoot?: string;
  projectArtifact?: Record<string, unknown>;
  previewRoot?: string;
}): Promise<PreparedTemplateLifecycle> {
  const workflow = ((params.state as any)?.workflow_context || {}) as Record<string, unknown>;
  const operationSkillId = resolveOperationSkillId(params.operation, params.baseSkillId);
  const contextSkillId = resolveOperationContextSkillId(params.baseSkillId, workflow);
  const taskClass = params.operation === "generate" ? "baseline_generation" : OPERATION_TASK_CLASSES[params.operation];
  const contractBundle = buildShpittoOpenCodeBundle({
    skillId: operationSkillId,
    templateSkillId: contextSkillId,
    state: params.state,
    projectRoot: params.workspaceRoot,
    taskClass,
    executionScope: params.operation === "generate" ? "full-baseline" : `template-${params.operation}`,
  });
  contractBundle.request.successCriteria = buildOperationSuccessCriteria(params.operation);

  let bundle: PreparedWorkspaceBundle;
  let projectArtifact: Record<string, unknown>;
  let staticSiteFiles: PreparedStaticSiteFile[];
  if (params.operation === "generate") {
    bundle = await materializePreparedWorkspace({
      ...contractBundle,
      workspaceRoot: params.workspaceRoot,
      previewRoot: params.previewRoot,
    });
    projectArtifact = bundle.projectArtifact;
    staticSiteFiles = bundle.staticSiteFiles;
  } else {
    if (!params.sourceWorkspaceRoot) {
      throw new Error(`A source workspace is required for template ${params.operation}.`);
    }
    await copyWorkspace(params.sourceWorkspaceRoot, params.workspaceRoot);
    bundle = buildPreparedWorkspaceBundle({
      ...contractBundle,
      workspaceRoot: params.workspaceRoot,
    });
    await materializePreparedWorkspaceContractOverlay({
      ...contractBundle,
      workspaceRoot: params.workspaceRoot,
    });
    await fs.rm(path.join(params.workspaceRoot, OPENCODE_SKILL_RESULT_PATH), { force: true }).catch(() => undefined);
    projectArtifact = updateProjectArtifact({
      projectArtifact: params.projectArtifact || {},
      workspaceRoot: params.workspaceRoot,
      operation: params.operation,
      staticSiteFiles: normalizeStaticFiles((params.projectArtifact as any)?.staticSite?.files),
      serverCapable: contractBundle.request.templateContext.templateFamily === "ai-image-tool-platform",
    });
    staticSiteFiles = normalizeStaticFiles((projectArtifact as any)?.staticSite?.files);
    await fs.writeFile(
      path.join(params.workspaceRoot, ".shpitto", "project-artifact.json"),
      JSON.stringify(projectArtifact, null, 2),
      "utf8",
    );
    if (params.previewRoot) {
      await fs.rm(params.previewRoot, { recursive: true, force: true });
      await fs.mkdir(params.previewRoot, { recursive: true });
      for (const file of staticSiteFiles) {
        const target = path.join(params.previewRoot, file.path.replace(/^\/+/, ""));
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, file.content, "utf8");
      }
    }
  }

  return {
    request: contractBundle.request,
    workspaceRoot: params.workspaceRoot,
    sourceWorkspaceRoot: params.sourceWorkspaceRoot,
    operationSkillId,
    bundle,
    projectArtifact,
    staticSiteFiles,
  };
}

export async function runProductizedTemplateOperation(params: {
  operation: ProductizedTemplateOperation;
  baseSkillId: string;
  state: AgentState;
  workspaceRoot: string;
  sourceWorkspaceRoot?: string;
  projectArtifact?: Record<string, unknown>;
  previewRoot?: string;
  onProgress?: (progress: { elapsedMs: number; stream?: "stdout" | "stderr"; chunk?: string }) => void | Promise<void>;
}): Promise<ProductizedTemplateRun> {
  const prepared = await prepareProductizedTemplateWorkspace(params);
  const openCodeResult = await runOpenCodeCli({
    request: prepared.request,
    workspaceRoot: prepared.workspaceRoot,
    onProgress: params.onProgress,
  });
  return { ...prepared, openCodeResult };
}

export function resolveTemplateOperationSkillId(operation: ProductizedTemplateOperation, baseSkillId: string): string {
  return resolveOperationSkillId(operation, baseSkillId);
}

export function templateOperationManifest(operation: ProductizedTemplateOperation, baseSkillId: string) {
  return resolveSkillManifest(resolveOperationSkillId(operation, baseSkillId));
}
