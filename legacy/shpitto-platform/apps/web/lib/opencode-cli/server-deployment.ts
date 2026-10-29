import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

export type ServerDeploymentTarget = "vercel" | "railway" | "docker";

export type ServerDeploymentResult = {
  target: ServerDeploymentTarget;
  deploymentId: string;
  deploymentUrl: string;
  productionUrl?: string;
  workspaceRoot: string;
  buildOutput: string;
  deployOutput: string;
  rollbackCommand: string;
};

export type ServerWorkspaceValidationResult = {
  workspaceRoot: string;
  buildOutput: string;
};

export type ServerDeploymentCommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

function safeToken(value: unknown, fallback: string): string {
  const token = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return token || fallback;
}

function resolvePackageManager(): { command: string; prefix: string[] } {
  const configured = String(process.env.SHPITTO_PACKAGE_MANAGER || "pnpm").trim();
  return process.platform === "win32"
    ? { command: `${configured}.cmd`, prefix: [] }
    : { command: configured, prefix: [] };
}

function defaultCommandRunner(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
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
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`${command} ${args.join(" ")} failed with exit code ${exitCode}.`);
      (error as any).stdout = stdout;
      (error as any).stderr = stderr;
      reject(error);
    });
  });
}

function findUrl(output: string): string | undefined {
  return Array.from(String(output || "").matchAll(/https:\/\/[^\s'"<>]+/g))
    .map((match) => match[0].replace(/[),.]+$/, ""))
    .find((url) => !url.includes("localhost"));
}

function findDeploymentId(output: string, fallback: string): string {
  const match = String(output || "").match(/(?:deployment|id)[=: /]+([a-zA-Z0-9_.-]{6,})/i);
  return match?.[1] || fallback;
}

function redactOutput(value: string, env: NodeJS.ProcessEnv): string {
  return [
    env.STRIPE_SECRET_KEY,
    env.STRIPE_WEBHOOK_SECRET,
    env.REPLICATE_API_TOKEN,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.RAILWAY_TOKEN,
    env.VERCEL_TOKEN,
  ]
    .map((secret) => String(secret || ""))
    .filter((secret) => secret.length >= 8)
    .reduce((text: string, secret: string) => text.replaceAll(secret, "[REDACTED]"), String(value || ""));
}

async function assertServerWorkspace(workspaceRoot: string): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const packagePath = path.join(root, "package.json");
  const manifestPath = path.join(root, ".shpitto", "deployment-target.json");
  const packageJson = JSON.parse(await fs.readFile(packagePath, "utf8")) as Record<string, unknown>;
  if (!packageJson.dependencies || typeof packageJson.dependencies !== "object") {
    throw new Error("Server deployment workspace has no runtime dependencies.");
  }
  await fs.access(manifestPath);
}

export async function validateServerCapableTemplate(params: {
  workspaceRoot: string;
  env?: NodeJS.ProcessEnv;
  commandRunner?: ServerDeploymentCommandRunner;
}): Promise<ServerWorkspaceValidationResult> {
  const workspaceRoot = path.resolve(params.workspaceRoot);
  await assertServerWorkspace(workspaceRoot);
  const runner = params.commandRunner || defaultCommandRunner;
  const env = {
    ...process.env,
    ...(params.env || {}),
    CI: process.env.CI || "1",
    NO_COLOR: "1",
  };
  const packageManager = resolvePackageManager();
  const install = await runner(packageManager.command, [...packageManager.prefix, "install", "--no-frozen-lockfile"], {
    cwd: workspaceRoot,
    env,
  });
  const build = await runner(packageManager.command, [...packageManager.prefix, "build"], {
    cwd: workspaceRoot,
    env,
  });
  return {
    workspaceRoot,
    buildOutput: redactOutput(`${install.stdout}\n${install.stderr}\n${build.stdout}\n${build.stderr}`, env).trim(),
  };
}

export async function deployServerCapableTemplate(params: {
  workspaceRoot: string;
  target: ServerDeploymentTarget;
  projectName?: string;
  env?: NodeJS.ProcessEnv;
  commandRunner?: ServerDeploymentCommandRunner;
}): Promise<ServerDeploymentResult> {
  const workspaceRoot = path.resolve(params.workspaceRoot);
  const validation = await validateServerCapableTemplate({
    workspaceRoot,
    env: params.env,
    commandRunner: params.commandRunner,
  });
  const runner = params.commandRunner || defaultCommandRunner;
  const env = {
    ...process.env,
    ...(params.env || {}),
    CI: process.env.CI || "1",
    NO_COLOR: "1",
  };
  const projectName = safeToken(params.projectName, "shpitto-template").toLowerCase();
  let deployOutput = "";
  let deploymentUrl = "";
  let productionUrl: string | undefined;
  if (params.target === "vercel") {
    const command = process.platform === "win32" ? "vercel.cmd" : "vercel";
    const result = await runner(command, ["deploy", "--prod", "--yes", "--name", projectName], {
      cwd: workspaceRoot,
      env,
    });
    deployOutput = `${result.stdout}\n${result.stderr}`.trim();
    deploymentUrl = findUrl(deployOutput) || `https://${projectName}.vercel.app`;
    productionUrl = deploymentUrl;
  } else if (params.target === "railway") {
    const command = process.platform === "win32" ? "railway.cmd" : "railway";
    const result = await runner(command, ["up", "--ci", "--detach"], {
      cwd: workspaceRoot,
      env,
    });
    deployOutput = `${result.stdout}\n${result.stderr}`.trim();
    deploymentUrl = findUrl(deployOutput) || String(process.env.RAILWAY_PUBLIC_DOMAIN || "").trim();
    if (!deploymentUrl) throw new Error("Railway deployment completed without a public URL.");
    productionUrl = deploymentUrl;
  } else if (params.target === "docker") {
    await fs.access(path.join(workspaceRoot, "Dockerfile"));
    const imageTag = `${projectName}:latest`;
    const result = await runner("docker", ["build", "--tag", imageTag, "."], {
      cwd: workspaceRoot,
      env,
    });
    deployOutput = `${result.stdout}\n${result.stderr}`.trim();
    deploymentUrl = `docker://${imageTag}`;
  } else {
    throw new Error(`Unsupported server deployment target: ${params.target}.`);
  }

  const deploymentId = findDeploymentId(deployOutput, `${projectName}-${Date.now().toString(36)}`);
  const safeDeployOutput = redactOutput(deployOutput, env);
  return {
    target: params.target,
    deploymentId,
    deploymentUrl,
    productionUrl,
    workspaceRoot,
    buildOutput: validation.buildOutput,
    deployOutput: safeDeployOutput,
    rollbackCommand:
      params.target === "vercel"
        ? `vercel rollback ${projectName} --yes`
        : params.target === "railway"
          ? `railway redeploy --service ${safeToken(process.env.RAILWAY_SERVICE_ID, "service")}`
          : `docker image rm ${projectName}:latest`,
  };
}
