import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildWranglerToml, getContactEmailWorkerEnvConfig, loadSharedEnv } from "./shared-env.mts";

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

function hasPlaceholder(text: string) {
  return /REPLACE_WITH_/i.test(text);
}

function includesLine(text: string, needle: string) {
  return text.toLowerCase().includes(needle.toLowerCase());
}

export async function runContactEmailWorkerPreflight(): Promise<boolean> {
  const loadedEnvFiles = loadSharedEnv();
  const envConfig = getContactEmailWorkerEnvConfig();
  const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const wranglerPath = path.resolve(workerRoot, "wrangler.toml");
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  if (
    envConfig.accountId &&
    envConfig.d1DatabaseId &&
    envConfig.emailFrom &&
    (!fs.existsSync(wranglerPath) || hasPlaceholder(fs.readFileSync(wranglerPath, "utf8")))
  ) {
    fs.writeFileSync(wranglerPath, buildWranglerToml(envConfig), "utf8");
  }

  const wranglerExists = fs.existsSync(wranglerPath);
  checks.push({
    name: "wrangler.toml",
    passed: wranglerExists,
    detail: wranglerExists ? wranglerPath : "missing and could not be generated from shared env files",
  });

  const wranglerText = wranglerExists ? fs.readFileSync(wranglerPath, "utf8") : "";
  checks.push({
    name: "shared-env",
    passed: loadedEnvFiles.length > 0,
    detail: loadedEnvFiles.length > 0 ? loadedEnvFiles.join(", ") : "no .env/.env.local files found",
  });
  checks.push({
    name: "binding-email-queue-db",
    passed: includesLine(wranglerText, 'binding = "EMAIL_QUEUE_DB"'),
    detail: includesLine(wranglerText, 'binding = "EMAIL_QUEUE_DB"') ? "EMAIL_QUEUE_DB binding present" : "EMAIL_QUEUE_DB binding missing",
  });
  checks.push({
    name: "cron-trigger",
    passed: includesLine(wranglerText, "[triggers]") && includesLine(wranglerText, "crons"),
    detail: includesLine(wranglerText, "[triggers]") ? "cron trigger configured" : "cron trigger missing",
  });
  checks.push({
    name: "email-from",
    passed: Boolean(envConfig.emailFrom) && includesLine(wranglerText, "CLOUDFLARE_EMAIL_FROM") && !hasPlaceholder(wranglerText),
    detail: includesLine(wranglerText, "CLOUDFLARE_EMAIL_FROM")
      ? hasPlaceholder(wranglerText)
        ? "wrangler.toml still contains placeholder values"
        : "CLOUDFLARE_EMAIL_FROM present"
      : "CLOUDFLARE_EMAIL_FROM missing",
  });
  checks.push({
    name: "cloudflare-account-id-source",
    passed: Boolean(envConfig.accountId),
    detail: envConfig.accountId ? "account id available from shared env" : "missing CLOUDFLARE_EMAIL_ACCOUNT_ID/CLOUDFLARE_ACCOUNT_ID",
  });
  checks.push({
    name: "cloudflare-d1-id-source",
    passed: Boolean(envConfig.d1DatabaseId),
    detail: envConfig.d1DatabaseId ? "D1 database id available from shared env" : "missing CLOUDFLARE_D1_DATABASE_ID/D1_DATABASE_ID",
  });
  checks.push({
    name: "cloudflare-email-token-source",
    passed: Boolean(envConfig.apiToken),
    detail: envConfig.apiToken ? "email api token available from shared env for secret sync" : "missing CLOUDFLARE_EMAIL_API_TOKEN/CLOUDFLARE_API_TOKEN",
  });

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const wrangler = await runCommand(command, ["--yes", "wrangler", "--version"]);
  checks.push({
    name: "wrangler-cli",
    passed: wrangler.ok,
    detail: wrangler.output || "wrangler --version completed",
  });

  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }

  console.log("REMINDER secret sync: pnpm -C apps/contact-email-worker run sync:secrets");
  console.log("REMINDER optional: pnpm -C apps/contact-email-worker exec wrangler secret put CONTACT_EMAIL_HEALTH_TOKEN");

  return checks.every((check) => check.passed);
}

async function main() {
  const passed = await runContactEmailWorkerPreflight();
  if (!passed) process.exitCode = 1;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entryUrl && import.meta.url === entryUrl) {
  void main().catch((error) => {
    console.error(`FAIL contact-email-worker-preflight: ${String((error as Error)?.message || error || "unknown error")}`);
    process.exitCode = 1;
  });
}
