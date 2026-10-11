import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

function loadRailwayStartEnv() {
  if (process.env.NODE_ENV === "test" || String(process.env.RAILWAY_START_LOAD_ENV || "").trim() === "0") return;
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

function normalizeMode(value: string) {
  return String(value || "chat")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

async function runChatWorker() {
  process.env.CHAT_WORKER_CLAIM_MODES = process.env.CHAT_WORKER_CLAIM_MODES || "generate,refine";
  const { runChatTaskWorkerLoop } = await import("./chat-task-worker.mts");
  await runChatTaskWorkerLoop();
}

async function runDeployWorker() {
  process.env.DEPLOY_WORKER_CLAIM_MODES = process.env.DEPLOY_WORKER_CLAIM_MODES || "deploy";
  process.env.CHAT_WORKER_CLAIM_MODES = process.env.DEPLOY_WORKER_CLAIM_MODES;
  process.env.CLOUDFLARE_DEPLOY_STRATEGY = process.env.CLOUDFLARE_DEPLOY_STRATEGY || "wrangler";
  process.env.SHPITTO_DEPLOY_BLOG_RUNTIME = process.env.SHPITTO_DEPLOY_BLOG_RUNTIME || "1";

  if (String(process.env.RAILWAY_DEPLOY_PREFLIGHT || "1").trim() !== "0") {
    const { runDeployWorkerPreflight } = await import("./deploy-worker-preflight.mts");
    const passed = await runDeployWorkerPreflight();
    if (!passed) {
      throw new Error("Railway deploy worker preflight failed.");
    }
  }

  const { runChatTaskWorkerLoop } = await import("./chat-task-worker.mts");
  await runChatTaskWorkerLoop();
}

async function main() {
  loadRailwayStartEnv();
  const mode = normalizeMode(process.env.RAILWAY_WORKER_MODE || process.env.SHPITTO_RAILWAY_WORKER_MODE || "chat");
  console.log(`[RailwayStart] mode=${mode}`);

  if (mode === "chat" || mode === "generate" || mode === "generation") {
    await runChatWorker();
    return;
  }
  if (mode === "deploy" || mode === "deployer" || mode === "cloudflare" || mode === "deploy-domain") {
    await runDeployWorker();
    return;
  }
  if (mode === "deploy-preflight" || mode === "preflight") {
    const { runDeployWorkerPreflight } = await import("./deploy-worker-preflight.mts");
    const passed = await runDeployWorkerPreflight();
    if (!passed) process.exitCode = 1;
    return;
  }

  throw new Error(`Unsupported RAILWAY_WORKER_MODE: ${mode}`);
}

void main().catch((error) => {
  console.error(`[RailwayStart] fatal error: ${String((error as Error)?.message || error || "unknown error")}`);
  process.exitCode = 1;
});
