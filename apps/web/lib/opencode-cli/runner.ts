import fs from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import type { OpenCodeContinuationMode, ShpittoOpenCodeRequest } from "./website-contract.ts";
import {
  OPENCODE_SAFE_ENVIRONMENT_KEYS,
  OPENCODE_SKILL_RESULT_PATH,
  type ShpittoSkillResult,
} from "./skill-manifest.ts";

export type OpenCodeCliCommandRunner = (
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    onOutput?: (stream: "stdout" | "stderr", chunk: string) => void;
  },
) => Promise<{ exitCode: number | null; stdout: string; stderr: string }>;

export type OpenCodeCliEvent = {
  type?: string;
  path?: string;
  payload?: Record<string, unknown>;
  raw: string;
};

export type OpenCodeCliRunResult = {
  status: "completed" | "failed";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  prompt: string;
  events: OpenCodeCliEvent[];
  updatedFiles: string[];
  summary: string;
  skillResult?: ShpittoSkillResult;
  failureReason?: string;
  sessionId?: string;
  continuationMode?: OpenCodeContinuationMode;
  sessionFile?: string;
};

export const OPENCODE_SESSION_PATH = ".shpitto/opencode-session.json";

export type PreparedOpenCodeCliEnvironment = {
  env: NodeJS.ProcessEnv;
  xdgDataHome?: string;
  seededAuthJsonPath?: string;
  cleanup: () => Promise<void>;
};

function quoteCmdArgIfNeeded(value: string): string {
  const raw = String(value || "");
  if (!/[\s"]/g.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function defaultCommandRunner(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    onOutput?: (stream: "stdout" | "stderr", chunk: string) => void;
  },
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const useCmd = process.platform === "win32";
    const child = useCmd
      ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", [quoteCmdArgIfNeeded(command), ...args.map(quoteCmdArgIfNeeded)].join(" ")], {
          cwd: options.cwd,
          env: options.env,
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
        })
      : spawn(command, args, {
          cwd: options.cwd,
          env: options.env,
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
        });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutMs = Math.max(1_000, Number(options.timeoutMs || process.env.SHPITTO_OPENCODE_TIMEOUT_MS || 180_000));
    const timeout = setTimeout(() => {
      if (settled) return;
      stderr += `${stderr ? "\n" : ""}OpenCode CLI timed out after ${timeoutMs}ms.`;
      try {
        child.kill("SIGTERM");
      } catch {}
      setTimeout(() => {
        if (settled) return;
        try {
          child.kill("SIGKILL");
        } catch {}
      }, 2_000).unref?.();
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      options.onOutput?.("stdout", text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      options.onOutput?.("stderr", text);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

function shouldIsolateOpenCodeDataHome(env: NodeJS.ProcessEnv): boolean {
  const raw = String(env.SHPITTO_OPENCODE_ISOLATE_DATA_HOME || "1").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(raw);
}

function shouldPreservePreparedOpenCodeDataHome(env: NodeJS.ProcessEnv): boolean {
  const raw = String(env.SHPITTO_OPENCODE_PRESERVE_DATA_HOME || "0").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

function buildOpenCodeAuthJsonCandidates(env: NodeJS.ProcessEnv): string[] {
  const candidates = new Set<string>();
  const explicit = String(env.SHPITTO_OPENCODE_AUTH_JSON || "").trim();
  if (explicit) candidates.add(explicit);
  const xdgDataHome = String(env.XDG_DATA_HOME || "").trim();
  if (xdgDataHome) candidates.add(path.join(xdgDataHome, "opencode", "auth.json"));
  const localAppData = String(env.LOCALAPPDATA || "").trim();
  if (localAppData) candidates.add(path.join(localAppData, "opencode", "auth.json"));
  const appData = String(env.APPDATA || "").trim();
  if (appData) candidates.add(path.join(appData, "opencode", "auth.json"));
  candidates.add(path.join(os.homedir(), ".local", "share", "opencode", "auth.json"));
  return Array.from(candidates);
}

async function resolveExistingOpenCodeAuthJson(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  for (const candidate of buildOpenCodeAuthJsonCandidates(env)) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  return undefined;
}

export async function prepareOpenCodeCliEnvironment(baseEnv: NodeJS.ProcessEnv): Promise<PreparedOpenCodeCliEnvironment> {
  if (!shouldIsolateOpenCodeDataHome(baseEnv)) {
    return {
      env: { ...baseEnv },
      cleanup: async () => {},
    };
  }

  const xdgDataHome = await fs.mkdtemp(path.join(os.tmpdir(), "shpitto-opencode-"));
  const opencodeDataDir = path.join(xdgDataHome, "opencode");
  await fs.mkdir(opencodeDataDir, { recursive: true });

  let seededAuthJsonPath: string | undefined;
  const sourceAuthJson = await resolveExistingOpenCodeAuthJson(baseEnv);
  if (sourceAuthJson) {
    const targetAuthJson = path.join(opencodeDataDir, "auth.json");
    try {
      await fs.copyFile(sourceAuthJson, targetAuthJson);
      seededAuthJsonPath = targetAuthJson;
    } catch {}
  }

  const env = {
    ...baseEnv,
    XDG_DATA_HOME: xdgDataHome,
  };
  let cleaned = false;

  return {
    env,
    xdgDataHome,
    seededAuthJsonPath,
    cleanup: async () => {
      if (cleaned || shouldPreservePreparedOpenCodeDataHome(baseEnv)) return;
      cleaned = true;
      await fs.rm(xdgDataHome, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

function normalizePathLike(value: unknown): string | undefined {
  const text = String(value || "").trim();
  if (!text) return undefined;
  if (!/[/.]/.test(text)) return undefined;
  const normalized = text.replace(/\\/g, "/");
  if (!/\.[a-z0-9]+$/i.test(normalized) && !normalized.includes("/")) return undefined;
  return normalized.startsWith("/") ? normalized : `/${normalized.replace(/^\/+/, "")}`;
}

function parseJsonEvent(line: string): OpenCodeCliEvent {
  try {
    const payload = JSON.parse(line);
    const pathLike =
      normalizePathLike((payload as any)?.path) ||
      normalizePathLike((payload as any)?.file) ||
      normalizePathLike((payload as any)?.target);
    return {
      type: String((payload as any)?.type || "").trim() || undefined,
      path: pathLike,
      payload: payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : undefined,
      raw: line,
    };
  } catch {
    return { raw: line };
  }
}

function extractUpdatedFiles(events: OpenCodeCliEvent[], stdout: string, stderr: string): string[] {
  const collected = new Set<string>();
  for (const event of events) {
    if (event.path) collected.add(event.path);
    const payload = event.payload || {};
    const arrays = [
      Array.isArray((payload as any).updatedFiles) ? ((payload as any).updatedFiles as unknown[]) : [],
      Array.isArray((payload as any).files) ? ((payload as any).files as unknown[]) : [],
    ];
    for (const group of arrays) {
      for (const item of group) {
        const pathLike = normalizePathLike(typeof item === "string" ? item : (item as any)?.path || (item as any)?.file);
        if (pathLike) collected.add(pathLike);
      }
    }
  }
  const combined = `${stdout}\n${stderr}`;
  for (const match of combined.matchAll(/(?:^|\s)([A-Za-z0-9_./-]+\.(?:tsx|ts|js|jsx|css|json|md|mjs))(?:\s|$)/g)) {
    const pathLike = normalizePathLike(match[1]);
    if (pathLike) collected.add(pathLike);
  }
  return Array.from(collected).sort((left, right) => left.localeCompare(right));
}

function buildOpenCodeEnvironment(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { NODE_ENV: baseEnv.NODE_ENV || "production" } as NodeJS.ProcessEnv;
  for (const key of OPENCODE_SAFE_ENVIRONMENT_KEYS) {
    if (baseEnv[key] !== undefined) env[key] = baseEnv[key];
  }
  for (const key of [
    "LOCALAPPDATA",
    "APPDATA",
    "XDG_DATA_HOME",
    "SHPITTO_OPENCODE_AUTH_JSON",
    "SHPITTO_OPENCODE_ISOLATE_DATA_HOME",
    "SHPITTO_OPENCODE_PRESERVE_DATA_HOME",
    "SHPITTO_OPENCODE_TIMEOUT_MS",
  ]) {
    if (baseEnv[key] !== undefined) env[key] = baseEnv[key];
  }
  env.NO_COLOR = "1";
  env.CI = baseEnv.CI || "1";
  return env;
}

async function listForbiddenWorkspaceFiles(workspaceRoot: string): Promise<string[]> {
  const forbidden: string[] = [];
  async function walk(currentRoot: string, relativeRoot = ""): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(currentRoot, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const relativePath = path.posix.join(relativeRoot.replace(/\\/g, "/"), entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || relativePath.startsWith("../")) forbidden.push(relativePath);
        else await walk(path.join(currentRoot, entry.name), relativePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (
        relativePath === ".env" ||
        (relativePath.startsWith(".env.") && relativePath !== ".env.example") ||
        relativePath.startsWith(".git/") ||
        relativePath.startsWith("../")
      ) {
        forbidden.push(relativePath);
      }
    }
  }
  await walk(workspaceRoot);
  return forbidden.sort((left, right) => left.localeCompare(right));
}

async function readSkillResult(workspaceRoot: string): Promise<ShpittoSkillResult | undefined> {
  try {
    const raw = await fs.readFile(path.join(workspaceRoot, OPENCODE_SKILL_RESULT_PATH), "utf8");
    const parsed = JSON.parse(raw) as Partial<ShpittoSkillResult>;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (typeof parsed.status !== "string" || typeof parsed.skillId !== "string") return undefined;
    return {
      status: parsed.status === "succeeded" || parsed.status === "failed" || parsed.status === "blocked" ? parsed.status : "failed",
      skillId: String(parsed.skillId || "").trim(),
      templateId: String(parsed.templateId || "").trim() || undefined,
      templateVersion: String(parsed.templateVersion || "").trim() || undefined,
      changedFiles: Array.isArray(parsed.changedFiles) ? parsed.changedFiles.map((item) => String(item || "").trim()).filter(Boolean) : [],
      checks: Array.isArray(parsed.checks) ? parsed.checks : [],
      previewUrl: parsed.previewUrl ? String(parsed.previewUrl) : null,
      deployment: parsed.deployment ?? null,
      auditId: String(parsed.auditId || "").trim() || undefined,
      rollback: parsed.rollback ?? null,
      summary: String(parsed.summary || "").trim(),
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    };
  } catch {
    return undefined;
  }
}

type OpenCodeSessionRecord = {
  sessionId: string;
  updatedAt: string;
  workspaceRoot: string;
  continuationMode: OpenCodeContinuationMode;
  workflowRunId?: string;
  stepId?: string;
};

function normalizeSessionId(value: unknown): string | undefined {
  const sessionId = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,200}$/.test(sessionId) ? sessionId : undefined;
}

async function readOpenCodeSessionId(workspaceRoot: string): Promise<string | undefined> {
  try {
    const record = JSON.parse(await fs.readFile(path.join(workspaceRoot, OPENCODE_SESSION_PATH), "utf8")) as Partial<OpenCodeSessionRecord>;
    return normalizeSessionId(record.sessionId);
  } catch {
    return undefined;
  }
}

async function persistOpenCodeSession(params: {
  workspaceRoot: string;
  sessionId: string;
  continuationMode: OpenCodeContinuationMode;
  workflowRunId?: string;
  stepId?: string;
}): Promise<void> {
  const sessionPath = path.join(params.workspaceRoot, OPENCODE_SESSION_PATH);
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  const record: OpenCodeSessionRecord = {
    sessionId: params.sessionId,
    updatedAt: new Date().toISOString(),
    workspaceRoot: path.resolve(params.workspaceRoot),
    continuationMode: params.continuationMode,
    workflowRunId: params.workflowRunId,
    stepId: params.stepId,
  };
  await fs.writeFile(sessionPath, JSON.stringify(record, null, 2), "utf8");
}

function findSessionIdInValue(value: unknown, depth = 0): string | undefined {
  if (depth > 5 || !value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSessionIdInValue(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (/^session(?:id|ID)?$|^session_id$/i.test(key)) {
      const found = normalizeSessionId(nested);
      if (found) return found;
    }
    const found = findSessionIdInValue(nested, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function extractOpenCodeSessionId(events: OpenCodeCliEvent[], stdout: string): string | undefined {
  for (const event of events) {
    const found = findSessionIdInValue(event.payload);
    if (found) return found;
  }
  for (const line of String(stdout || "").split(/\r?\n/g)) {
    try {
      const found = findSessionIdInValue(JSON.parse(line));
      if (found) return found;
    } catch {}
  }
  return undefined;
}

export function resolveOpenCodeTimeoutMs(request: Pick<ShpittoOpenCodeRequest, "taskClass">): number {
  const configured = Number(process.env.SHPITTO_OPENCODE_TIMEOUT_MS || 0);
  if (Number.isFinite(configured) && configured > 0) return Math.max(1_000, configured);
  const defaults: Record<ShpittoOpenCodeRequest["taskClass"], number> = {
    baseline_generation: 30 * 60_000,
    scoped_refinement: 15 * 60_000,
    feature_expansion: 30 * 60_000,
    template_inspection: 5 * 60_000,
    template_validation: 15 * 60_000,
    template_preview: 15 * 60_000,
    template_deployment: 30 * 60_000,
  };
  return defaults[request.taskClass] || 15 * 60_000;
}

export function buildOpenCodeWebsitePrompt(request: ShpittoOpenCodeRequest): string {
  const routes = request.structuredInputs.routes.map((route) => `- ${route}`).join("\n");
  const audience = request.structuredInputs.targetAudience.map((item) => `- ${item}`).join("\n");
  const criteria = request.successCriteria.map((item) => `- ${item}`).join("\n");
  return [
    "You are working inside a Shpitto-prepared Next.js App Router workspace.",
    "Read `AGENTS.md`, `.shpitto/request.json`, `.shpitto/template-manifest.json`, `.shpitto/skill-manifest.json`, `.shpitto/route-contract.json`, `.shpitto/selected-foundations.json`, `.shpitto/selected-seeds.json`, and `.shpitto/deployment-target.json` before editing.",
    `Load and follow the selected skill at .opencode/skills/${request.skillId}/SKILL.md. The skill file and manifest are authoritative; the skill ID alone is not an instruction.`,
    "Keep the project on Next.js App Router. Do not replace it with another framework.",
    "Preserve or improve the shared navigation and footer across all required routes.",
    "The result must stay static-first, deployable, and complete across all required routes.",
    "",
    `Skill: ${request.skillId}`,
    `Task class: ${request.taskClass}`,
    `Execution scope: ${request.executionScope}`,
    `OpenCode continuation: ${request.continuationMode || "new"}${request.sessionId ? ` (session ${request.sessionId})` : ""}`,
    `Workflow run: ${request.workflowRunId || "unassigned"}; step: ${request.stepId || "unassigned"}`,
    `Validation commands: ${(request.skillManifest?.validationCommands || []).join(", ") || "none declared"}`,
    request.taskClass === "template_deployment"
      ? "Do not claim deployment success from code changes alone; include the target adapter evidence or report the deployment as blocked."
      : "Do not claim a capability from metadata alone; record concrete checks in the skill result.",
    `Locale: ${request.structuredInputs.locale}`,
    "",
    "Target audience",
    audience || "- developers",
    "",
    "Required routes",
    routes || "- /",
    "",
    "Success criteria",
    criteria,
    "",
    `Before finishing, write the machine-readable result to ${request.skillManifest?.resultPath || OPENCODE_SKILL_RESULT_PATH}. Missing or invalid result evidence is a failed execution.`,
    "",
    "User intent summary",
    request.userIntentSummary,
  ].join("\n");
}

export async function runOpenCodeCli(params: {
  request: ShpittoOpenCodeRequest;
  workspaceRoot: string;
  commandRunner?: OpenCodeCliCommandRunner;
  onProgress?: (progress: { elapsedMs: number; stream?: "stdout" | "stderr"; chunk?: string }) => void | Promise<void>;
}): Promise<OpenCodeCliRunResult> {
  const prompt = buildOpenCodeWebsitePrompt(params.request);
  const requestedMode: OpenCodeContinuationMode = params.request.continuationMode || "new";
  const requestedSessionId =
    requestedMode === "new"
      ? undefined
      : normalizeSessionId(params.request.sessionId) ||
        normalizeSessionId(params.request.parentSessionId) ||
        (await readOpenCodeSessionId(params.workspaceRoot));
  const command = process.platform === "win32" ? "opencode.cmd" : "opencode";
  const args = [
    "run",
    "--format",
    "json",
    "--dir",
    params.workspaceRoot,
    "--pure",
  ];
  if (requestedSessionId) args.push("--session", requestedSessionId);
  else if (requestedMode === "continue" || requestedMode === "fork") args.push("--continue");
  if (requestedMode === "fork") args.push("--fork");
  const model = String(process.env.SHPITTO_OPENCODE_MODEL || "").trim();
  if (model) args.push("--model", model);
  const variant = String(process.env.SHPITTO_OPENCODE_VARIANT || "").trim();
  if (variant) args.push("--variant", variant);
  if (params.request.workspacePolicy?.allowAutoApproval && !params.request.workspacePolicy.allowProductionMutation) {
    args.push("--auto");
  }
  args.push(prompt);

  const env = buildOpenCodeEnvironment(process.env);
  if (requestedMode !== "new") env.SHPITTO_OPENCODE_ISOLATE_DATA_HOME = "0";
  const preparedEnv = await prepareOpenCodeCliEnvironment(env);
  const runner = params.commandRunner || defaultCommandRunner;
  const startedAt = Date.now();
  const heartbeatMs = Math.max(10_000, Number(process.env.SHPITTO_OPENCODE_HEARTBEAT_MS || 20_000));
  const heartbeat = params.onProgress
    ? setInterval(() => {
        Promise.resolve(params.onProgress?.({ elapsedMs: Date.now() - startedAt })).catch(() => undefined);
      }, heartbeatMs)
    : undefined;
  try {
    let commandResult:
      | { exitCode: number | null; stdout: string; stderr: string }
      | undefined;
    try {
      commandResult = await runner(command, args, {
        cwd: params.workspaceRoot,
        env: preparedEnv.env,
        timeoutMs: resolveOpenCodeTimeoutMs(params.request),
        onOutput: params.onProgress
          ? (stream, chunk) => {
              Promise.resolve(params.onProgress?.({ stream, chunk, elapsedMs: Date.now() - startedAt })).catch(() => undefined);
            }
          : undefined,
      });
    } catch (error) {
      const failureReason = String((error as any)?.message || error || "unknown OpenCode CLI failure").trim();
      return {
        status: "failed",
        exitCode: 1,
        stdout: "",
        stderr: failureReason,
        prompt,
        events: [],
        updatedFiles: [],
        summary: `OpenCode CLI invocation failed: ${failureReason}`,
        failureReason,
        continuationMode: requestedMode,
      };
    }
    const { exitCode, stdout, stderr } = commandResult;
    const events = stdout
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseJsonEvent(line));
    const sessionId = extractOpenCodeSessionId(events, stdout) || requestedSessionId;
    if (sessionId) {
      await persistOpenCodeSession({
        workspaceRoot: params.workspaceRoot,
        sessionId,
        continuationMode: requestedMode,
        workflowRunId: params.request.workflowRunId,
        stepId: params.request.stepId,
      });
    }
    const updatedFiles = extractUpdatedFiles(events, stdout, stderr);
    const skillResult = await readSkillResult(params.workspaceRoot);
    const requiresSkillResult = params.request.workspacePolicy?.requireSkillResult === true;
    const forbiddenWorkspaceFiles = await listForbiddenWorkspaceFiles(params.workspaceRoot);
    const errorEvent = events.find((event) => event.type === "error");
    const failureReason =
      exitCode === 0 && !errorEvent
        ? undefined
        : String(
            errorEvent?.payload?.error && typeof errorEvent.payload.error === "object"
              ? (errorEvent.payload.error as any)?.data?.message || (errorEvent.payload.error as any)?.message
              : errorEvent?.payload?.message || stderr || stdout || `opencode exited with code ${exitCode}`,
          ).trim();
    const resultFailure =
      !failureReason && forbiddenWorkspaceFiles.length > 0
        ? `OpenCode wrote forbidden workspace files: ${forbiddenWorkspaceFiles.join(", ")}.`
        : !failureReason && requiresSkillResult && !skillResult
        ? `OpenCode did not write a valid ${OPENCODE_SKILL_RESULT_PATH}.`
        : !failureReason && skillResult && skillResult.status !== "succeeded"
          ? skillResult.summary || `Skill ${skillResult.skillId} reported ${skillResult.status}.`
          : undefined;
    const finalFailureReason = failureReason || resultFailure;
    const resultFiles = skillResult?.changedFiles || [];
    const allUpdatedFiles = Array.from(new Set([...updatedFiles, ...resultFiles.map((file) => normalizePathLike(file)).filter(Boolean) as string[]])).sort();

    return {
      status: finalFailureReason ? "failed" : "completed",
      exitCode,
      stdout,
      stderr,
      prompt,
      events,
      updatedFiles: allUpdatedFiles,
      skillResult,
      summary: finalFailureReason
        ? `OpenCode CLI failed after preparing the workspace: ${finalFailureReason}`
        : `OpenCode CLI completed in ${params.workspaceRoot} with ${allUpdatedFiles.length} touched files.`,
      failureReason: finalFailureReason || undefined,
      sessionId,
      continuationMode: requestedMode,
      sessionFile: sessionId ? path.join(params.workspaceRoot, OPENCODE_SESSION_PATH) : undefined,
    };
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    await preparedEnv.cleanup();
  }
}
