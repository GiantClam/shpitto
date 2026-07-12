import fs from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import type { ShpittoOpenCodeRequest } from "./website-contract.ts";

export type OpenCodeCliCommandRunner = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
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
  failureReason?: string;
};

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
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
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
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
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

export function buildOpenCodeWebsitePrompt(request: ShpittoOpenCodeRequest): string {
  const routes = request.structuredInputs.routes.map((route) => `- ${route}`).join("\n");
  const audience = request.structuredInputs.targetAudience.map((item) => `- ${item}`).join("\n");
  const criteria = request.successCriteria.map((item) => `- ${item}`).join("\n");
  return [
    "You are working inside a Shpitto-prepared Next.js App Router workspace.",
    "Read `.shpitto/request.json`, `.shpitto/template-manifest.json`, `.shpitto/route-contract.json`, `.shpitto/selected-foundations.json`, `.shpitto/selected-seeds.json`, and `.shpitto/deployment-target.json` before editing.",
    "Keep the project on Next.js App Router. Do not replace it with another framework.",
    "Preserve or improve the shared navigation and footer across all required routes.",
    "The result must stay static-first, deployable, and complete across all required routes.",
    "",
    `Skill: ${request.skillId}`,
    `Task class: ${request.taskClass}`,
    `Execution scope: ${request.executionScope}`,
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
    "User intent summary",
    request.userIntentSummary,
  ].join("\n");
}

export async function runOpenCodeCli(params: {
  request: ShpittoOpenCodeRequest;
  workspaceRoot: string;
  commandRunner?: OpenCodeCliCommandRunner;
}): Promise<OpenCodeCliRunResult> {
  const prompt = buildOpenCodeWebsitePrompt(params.request);
  const command = process.platform === "win32" ? "opencode.cmd" : "opencode";
  const args = [
    "run",
    "--format",
    "json",
    "--dir",
    params.workspaceRoot,
    "--pure",
  ];
  const model = String(process.env.SHPITTO_OPENCODE_MODEL || "").trim();
  if (model) args.push("--model", model);
  const variant = String(process.env.SHPITTO_OPENCODE_VARIANT || "").trim();
  if (variant) args.push("--variant", variant);
  if (String(process.env.SHPITTO_OPENCODE_SKIP_PERMISSIONS || "1").trim() !== "0") {
    args.push("--dangerously-skip-permissions");
  }
  args.push(prompt);

  const env = {
    ...process.env,
    NO_COLOR: "1",
    CI: process.env.CI || "1",
  };
  const preparedEnv = await prepareOpenCodeCliEnvironment(env);
  const runner = params.commandRunner || defaultCommandRunner;
  try {
    let commandResult:
      | { exitCode: number | null; stdout: string; stderr: string }
      | undefined;
    try {
      commandResult = await runner(command, args, {
        cwd: path.dirname(params.workspaceRoot),
        env: preparedEnv.env,
        timeoutMs: Math.max(1_000, Number(process.env.SHPITTO_OPENCODE_TIMEOUT_MS || 180_000)),
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
      };
    }
    const { exitCode, stdout, stderr } = commandResult;
    const events = stdout
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseJsonEvent(line));
    const updatedFiles = extractUpdatedFiles(events, stdout, stderr);
    const errorEvent = events.find((event) => event.type === "error");
    const failureReason =
      exitCode === 0 && !errorEvent
        ? undefined
        : String(
            errorEvent?.payload?.error && typeof errorEvent.payload.error === "object"
              ? (errorEvent.payload.error as any)?.data?.message || (errorEvent.payload.error as any)?.message
              : errorEvent?.payload?.message || stderr || stdout || `opencode exited with code ${exitCode}`,
          ).trim();

    return {
      status: failureReason ? "failed" : "completed",
      exitCode,
      stdout,
      stderr,
      prompt,
      events,
      updatedFiles,
      summary: failureReason
        ? `OpenCode CLI failed after preparing the workspace: ${failureReason}`
        : `OpenCode CLI completed in ${params.workspaceRoot} with ${updatedFiles.length} touched files.`,
      failureReason: failureReason || undefined,
    };
  } finally {
    await preparedEnv.cleanup();
  }
}
