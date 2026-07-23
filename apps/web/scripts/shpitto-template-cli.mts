import fs from "node:fs/promises";
import path from "node:path";
import {
  buildWorkspaceAgentsPolicy,
  materializeSkillResources,
  resolveSkillManifest,
  runOpenCodeCli,
  type ShpittoOpenCodeRequest,
  type ShpittoSkillResult,
} from "../lib/opencode-cli/index.ts";
import { deployServerCapableTemplate } from "../lib/opencode-cli/server-deployment.ts";
import { packageSourceWorkspace } from "../lib/opencode-cli/source-deployment.ts";

type Operation = "inspect" | "modify" | "validate" | "preview" | "deploy";

const SKILLS: Record<Operation, string> = {
  inspect: "template-inspect",
  modify: "template-modify",
  validate: "template-validate",
  preview: "template-preview",
  deploy: "template-deploy",
};

const TASK_CLASSES: Record<Operation, ShpittoOpenCodeRequest["taskClass"]> = {
  inspect: "template_inspection",
  modify: "scoped_refinement",
  validate: "template_validation",
  preview: "template_preview",
  deploy: "template_deployment",
};

function usage(): never {
  console.error("Usage: pnpm template:cli <inspect|modify|validate|preview|deploy> <workspace> [--json]");
  process.exit(64);
}

function parseArgs(argv: string[]): { operation: Operation; workspaceRoot: string; json: boolean } {
  const operation = String(argv[0] || "").trim().toLowerCase() as Operation;
  const workspaceRoot = String(argv[1] || "").trim();
  if (!SKILLS[operation] || !workspaceRoot) usage();
  return { operation, workspaceRoot: path.resolve(workspaceRoot), json: argv.includes("--json") };
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

function resultEnvelope(operation: Operation, request: ShpittoOpenCodeRequest, run: Awaited<ReturnType<typeof runOpenCodeCli>>, deployment: unknown | null = null): ShpittoSkillResult {
  return {
    status: run.status === "completed" ? "succeeded" : "failed",
    skillId: request.skillId,
    templateId: request.templateContext.templateId,
    templateVersion: String((request as any).templateVersion || "v1"),
    changedFiles: run.updatedFiles,
    checks: run.skillResult?.checks || [],
    previewUrl: run.skillResult?.previewUrl || null,
    deployment,
    auditId: run.skillResult?.auditId || `cli-${Date.now().toString(36)}`,
    rollback: run.skillResult?.rollback || (deployment as any)?.rollbackCommand || null,
    summary: run.summary,
    errors: run.failureReason ? [run.failureReason] : run.skillResult?.errors || [],
  };
}

async function main(): Promise<void> {
  const { operation, workspaceRoot, json } = parseArgs(process.argv.slice(2));
  const requestPath = path.join(workspaceRoot, ".shpitto", "request.json");
  const request = await readJson<ShpittoOpenCodeRequest>(requestPath);
  const manifest = resolveSkillManifest(SKILLS[operation]);
  const operationRequest: ShpittoOpenCodeRequest = {
    ...request,
    skillId: SKILLS[operation],
    taskClass: TASK_CLASSES[operation],
    projectRoot: workspaceRoot,
    executionScope: `template-${operation}`,
    skillManifest: manifest,
    workspacePolicy: manifest.workspacePolicy,
    successCriteria:
      operation === "inspect"
        ? ["report manifest, routes, integrations, and runtime state without application mutation"]
        : operation === "deploy"
          ? ["validate the workspace", "record truthful deployment and rollback evidence"]
          : ["follow the selected skill contract", "record concrete checks and changed files"],
  };
  await fs.writeFile(requestPath, JSON.stringify(operationRequest, null, 2), "utf8");
  await fs.writeFile(path.join(workspaceRoot, ".shpitto", "skill-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await fs.writeFile(path.join(workspaceRoot, "AGENTS.md"), buildWorkspaceAgentsPolicy(manifest), "utf8");
  await materializeSkillResources({ workspaceRoot, request: operationRequest });

  const run = await runOpenCodeCli({ request: operationRequest, workspaceRoot });
  let deployment: unknown | null = null;
  if (operation === "deploy" && run.status === "completed") {
    const target = await readJson<{ target?: string; runtime?: string }>(path.join(workspaceRoot, ".shpitto", "deployment-target.json"));
    if (target.runtime === "server" && (target.target === "vercel" || target.target === "railway" || target.target === "docker" || target.target === "source")) {
      if (String(process.env.SHPITTO_PRODUCTIZED_DEPLOY_APPROVED || "") !== "1") {
        throw new Error("Deployment is policy-gated. Set SHPITTO_PRODUCTIZED_DEPLOY_APPROVED=1 in an approved environment.");
      }
      deployment =
        target.target === "source"
          ? await packageSourceWorkspace({ workspaceRoot })
          : await deployServerCapableTemplate({ workspaceRoot, target: target.target });
    }
  }
  const result = resultEnvelope(operation, operationRequest, run, deployment);
  await fs.writeFile(path.join(workspaceRoot, ".shpitto", "skill-result.json"), JSON.stringify(result, null, 2), "utf8");
  if (json) console.log(JSON.stringify(result));
  else console.log(`${result.status}: ${result.summary}`);
  if (result.status !== "succeeded") process.exitCode = 1;
}

main().catch((error) => {
  console.error(String((error as any)?.message || error || "Template CLI failed."));
  process.exitCode = 1;
});
