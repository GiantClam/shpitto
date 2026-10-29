import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { BundleResult } from "./bundler.ts";

export type WranglerDeployResult = {
  deploymentUrl: string;
  productionUrl: string;
  projectName: string;
  branch: string;
  outputDir: string;
  stdout: string;
  stderr: string;
};

export type WranglerCommandRunner = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

export type DeployWithWranglerOptions = {
  taskId: string;
  projectName: string;
  bundle: BundleResult;
  branch?: string;
  outputRoot?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  commandRunner?: WranglerCommandRunner;
};

function normalizeBundlePath(raw: string): string {
  const normalized = String(raw || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");
  if (!normalized || normalized.includes("../") || normalized === "..") {
    throw new Error(`Unsafe bundle path for Wrangler deploy: ${raw}`);
  }
  return normalized;
}

function safeToken(value: string, fallback: string): string {
  const token = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return token || fallback;
}

function resolveWranglerCommand(): { command: string; argsPrefix: string[] } {
  const configured = String(process.env.WRANGLER_BIN || "").trim();
  if (configured) {
    const parts = configured.split(/\s+/).filter(Boolean);
    return { command: parts[0] || configured, argsPrefix: parts.slice(1) };
  }
  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    argsPrefix: ["--yes", "wrangler"],
  };
}

function parseWranglerDeploymentUrl(stdout: string, stderr: string, projectName: string): string {
  const text = `${stdout}\n${stderr}`;
  const urls = Array.from(text.matchAll(/https:\/\/[a-zA-Z0-9.-]+\.pages\.dev\b/g)).map((match) => match[0]);
  return urls[0] || `https://${projectName}.pages.dev`;
}

function quoteCmdArgIfNeeded(value: string) {
  const raw = String(value || "");
  if (!/[\s"]/g.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

export async function materializeBundleForWrangler(
  bundle: BundleResult,
  outputDir: string,
): Promise<{ outputDir: string; fileCount: number }> {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  let fileCount = 0;
  for (const entry of bundle.fileEntries || []) {
    const relativePath = normalizeBundlePath(entry.path);
    const targetPath = path.resolve(outputDir, relativePath);
    const relativeToRoot = path.relative(outputDir, targetPath);
    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      throw new Error(`Bundle path escapes Wrangler output directory: ${entry.path}`);
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const content = entry.base64Content
      ? Buffer.from(entry.base64Content, "base64")
      : Buffer.from(String(entry.content || ""), "utf8");
    await fs.writeFile(targetPath, content);
    fileCount += 1;
  }

  return { outputDir, fileCount };
}

function defaultCommandRunner(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string }> {
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
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`wrangler pages deploy failed with exit code ${code}: ${stderr || stdout}`);
      (error as any).stdout = stdout;
      (error as any).stderr = stderr;
      reject(error);
    });
  });
}

export async function deployWithWrangler(options: DeployWithWranglerOptions): Promise<WranglerDeployResult> {
  const projectName = safeToken(options.projectName, "shpitto-site").toLowerCase();
  const taskId = safeToken(options.taskId, "deploy-task");
  const branch = safeToken(options.branch || "main", "main");
  const outputRoot =
    options.outputRoot ||
    path.resolve(process.cwd(), ".tmp", "deployments", `${taskId}-${Date.now().toString(36)}`);
  const outputDir = path.resolve(outputRoot, projectName);

  await materializeBundleForWrangler(options.bundle, outputDir);

  const { command, argsPrefix } = resolveWranglerCommand();
  const args = [
    ...argsPrefix,
    "pages",
    "deploy",
    outputDir,
    "--project-name",
    projectName,
    "--branch",
    branch,
    "--commit-dirty=true",
  ];
  const env = {
    ...process.env,
    ...(options.env || {}),
    NO_COLOR: "1",
    CI: process.env.CI || "1",
  };
  const runner = options.commandRunner || defaultCommandRunner;
  const { stdout, stderr } = await runner(command, args, {
    cwd: options.cwd || process.cwd(),
    env,
  });
  const deploymentUrl = parseWranglerDeploymentUrl(stdout, stderr, projectName);

  return {
    deploymentUrl,
    productionUrl: `https://${projectName}.pages.dev`,
    projectName,
    branch,
    outputDir,
    stdout,
    stderr,
  };
}
