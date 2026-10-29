import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { resolveBlogD1BindingConfig } from "../lib/deployed-blog-runtime.ts";

function loadEnv() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const webRoot = path.resolve(scriptDir, "..");
  const repoRoot = path.resolve(webRoot, "..", "..");
  for (const envPath of [
    path.resolve(repoRoot, ".env"),
    path.resolve(webRoot, ".env"),
    path.resolve(webRoot, ".env.local"),
    path.resolve(scriptDir, ".env"),
    path.resolve(scriptDir, ".env.local"),
  ]) {
    if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false, quiet: true });
  }
}

function hasEnv(name: string) {
  return Boolean(String(process.env[name] || "").trim());
}

function maskPresence(name: string) {
  const value = String(process.env[name] || "");
  return value.trim() ? `present:${value.length}` : "missing";
}

function quoteCmdArgIfNeeded(value: string) {
  const raw = String(value || "");
  if (!/[\s"]/g.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function runCommand(command: string, args: string[], timeoutMs = 20_000): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    let output = "";
    let child: ReturnType<typeof spawn>;
    try {
      const useCmd = process.platform === "win32";
      child = useCmd
        ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", [quoteCmdArgIfNeeded(command), ...args.map(quoteCmdArgIfNeeded)].join(" ")], {
            stdio: ["ignore", "pipe", "pipe"],
            shell: false,
            env: { ...process.env, NO_COLOR: "1", CI: "1" },
          })
        : spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        env: { ...process.env, NO_COLOR: "1", CI: "1" },
      });
    } catch (error) {
      resolve({ ok: false, output: String((error as Error)?.message || error || "spawn failed") });
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, output: `timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, output: String(error.message || error) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: output.trim().slice(0, 240) });
    });
  });
}

export async function runDeployWorkerPreflight(): Promise<boolean> {
  loadEnv();
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];
  const binding = resolveBlogD1BindingConfig();
  const supabaseKeyPresent = hasEnv("SUPABASE_SERVICE_ROLE_KEY") || hasEnv("SUPABASE_SERVICE_KEY");
  const proxyPresent = hasEnv("SUPABASE_TASK_PROXY_URL") || hasEnv("HTTPS_PROXY") || hasEnv("HTTP_PROXY");

  checks.push({
    name: "supabase-url",
    passed: hasEnv("NEXT_PUBLIC_SUPABASE_URL") || hasEnv("SUPABASE_URL"),
    detail: `NEXT_PUBLIC_SUPABASE_URL=${maskPresence("NEXT_PUBLIC_SUPABASE_URL")}; SUPABASE_URL=${maskPresence("SUPABASE_URL")}`,
  });
  checks.push({
    name: "supabase-service-key",
    passed: supabaseKeyPresent,
    detail: `SUPABASE_SERVICE_ROLE_KEY=${maskPresence("SUPABASE_SERVICE_ROLE_KEY")}; SUPABASE_SERVICE_KEY=${maskPresence("SUPABASE_SERVICE_KEY")}`,
  });
  checks.push({
    name: "cloudflare-account",
    passed: hasEnv("CLOUDFLARE_ACCOUNT_ID"),
    detail: `CLOUDFLARE_ACCOUNT_ID=${maskPresence("CLOUDFLARE_ACCOUNT_ID")}`,
  });
  checks.push({
    name: "cloudflare-token",
    passed: hasEnv("CLOUDFLARE_API_TOKEN"),
    detail: `CLOUDFLARE_API_TOKEN=${maskPresence("CLOUDFLARE_API_TOKEN")}`,
  });
  checks.push({
    name: "blog-d1-binding",
    passed: Boolean(binding?.databaseId),
    detail: binding?.databaseId ? `binding=${binding.bindingName}; databaseId=present:${binding.databaseId.length}` : "D1 database id missing",
  });
  checks.push({
    name: "supabase-proxy",
    passed: true,
    detail: proxyPresent ? "proxy env present" : "proxy env not set; direct Supabase access will be used",
  });

  const wranglerBin = String(process.env.WRANGLER_BIN || "").trim();
  const command = wranglerBin ? wranglerBin.split(/\s+/)[0] : process.platform === "win32" ? "npx.cmd" : "npx";
  const args = wranglerBin ? [...wranglerBin.split(/\s+/).slice(1), "--version"] : ["--yes", "wrangler", "--version"];
  const wrangler = await runCommand(command, args);
  checks.push({
    name: "wrangler-cli",
    passed: wrangler.ok,
    detail: wrangler.output || "wrangler --version completed",
  });

  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }

  return checks.every((check) => check.passed);
}

async function main() {
  const passed = await runDeployWorkerPreflight();
  if (!passed) process.exitCode = 1;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entryUrl && import.meta.url === entryUrl) {
  void main().catch((error) => {
    console.error(`FAIL deploy-worker-preflight: ${String((error as Error)?.message || error || "unknown error")}`);
    process.exitCode = 1;
  });
}
