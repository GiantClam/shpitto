import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import type { AgentState } from "../lib/agent/graph.ts";
import { SkillRuntimeExecutor } from "../lib/skill-runtime/executor.ts";
import {
  claimNextQueuedChatTask,
  failChatTask,
  requeueStaleRunningTasks,
  runChatTaskConsistencySweep,
  updateChatTaskProgress,
} from "../lib/agent/chat-task-store.ts";

function loadWorkerEnv() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const webRoot = path.resolve(scriptDir, "..");
  const repoRoot = path.resolve(webRoot, "..", "..");

  const envFiles = [
    path.resolve(repoRoot, ".env"),
    path.resolve(webRoot, ".env"),
    path.resolve(webRoot, ".env.local"),
  ];

  for (const envPath of envFiles) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, override: false });
  }
}

loadWorkerEnv();

const WORKER_ID = `chat-worker-${crypto.randomUUID().slice(0, 12)}`;
const POLL_MS = Math.max(300, Number(process.env.CHAT_WORKER_POLL_MS || 1200));
const STALE_RUNNING_MS = Math.max(60_000, Number(process.env.CHAT_WORKER_STALE_RUNNING_MS || 1_200_000));
const RETRY_ATTEMPTS = Math.max(1, Number(process.env.CHAT_WORKER_NETWORK_RETRY_ATTEMPTS || 4));
const RETRY_BASE_MS = Math.max(100, Number(process.env.CHAT_WORKER_NETWORK_RETRY_BASE_MS || 400));
const RETRY_MAX_MS = Math.max(RETRY_BASE_MS, Number(process.env.CHAT_WORKER_NETWORK_RETRY_MAX_MS || 5_000));
const RETRY_JITTER_MS = Math.max(0, Number(process.env.CHAT_WORKER_NETWORK_RETRY_JITTER_MS || 250));
const CONSISTENCY_SWEEP_ENABLED = String(process.env.CHAT_WORKER_CONSISTENCY_SWEEP_ENABLED || "1").trim() !== "0";
const CONSISTENCY_SWEEP_INTERVAL_MS = Math.max(
  10_000,
  Number(process.env.CHAT_WORKER_CONSISTENCY_SWEEP_INTERVAL_MS || 45_000),
);
const CONSISTENCY_SWEEP_LIMIT = Math.max(5, Number(process.env.CHAT_WORKER_CONSISTENCY_SWEEP_LIMIT || 80));
const CONSISTENCY_SWEEP_MAX_TASK_AGE_MS = Math.max(
  60_000,
  Number(process.env.CHAT_WORKER_CONSISTENCY_SWEEP_MAX_TASK_AGE_MS || 1000 * 60 * 60 * 6),
);
const ONCE = String(process.env.CHAT_WORKER_ONCE || "0").trim() === "1" || process.argv.includes("--once");
let lastConsistencySweepAt = 0;

function toAgentState(value: unknown): AgentState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as AgentState;
  if (!Array.isArray(row.messages)) return undefined;
  if (typeof row.phase !== "string") return undefined;
  return row;
}

function summarizeError(error: unknown): string {
  const text = String(error instanceof Error ? error.message : error || "").trim();
  if (!text) return "unknown error";
  const compact = text.replace(/\s+/g, " ");
  return compact.length > 240 ? `${compact.slice(0, 240)}...` : compact;
}

function isRetryableNetworkError(error: unknown): boolean {
  const text = String(error instanceof Error ? error.message : error || "")
    .toLowerCase()
    .trim();
  if (!text) return false;
  return [
    "fetch failed",
    "connect timeout",
    "und_err_connect_timeout",
    "etimedout",
    "econnreset",
    "econnrefused",
    "ehostunreach",
    "eai_again",
    "socket hang up",
    "network request failed",
    "temporarily unavailable",
    "gateway timeout",
    "service unavailable",
    "status 429",
    "status 503",
    "status 504",
  ].some((token) => text.includes(token));
}

function retryDelayMs(attempt: number): number {
  const exp = Math.max(0, attempt - 1);
  const base = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, exp));
  const jitter = RETRY_JITTER_MS > 0 ? Math.floor(Math.random() * RETRY_JITTER_MS) : 0;
  return Math.min(RETRY_MAX_MS, base + jitter);
}

async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const retryable = isRetryableNetworkError(error);
      if (!retryable || attempt >= RETRY_ATTEMPTS) {
        throw error;
      }
      const waitMs = retryDelayMs(attempt);
      console.warn(
        `[ChatTaskWorker] ${label} failed (attempt ${attempt}/${RETRY_ATTEMPTS}), retrying in ${waitMs}ms: ${summarizeError(error)}`,
      );
      await sleep(waitMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || `${label} failed`));
}

async function maybeRunConsistencySweep(force = false): Promise<void> {
  if (!CONSISTENCY_SWEEP_ENABLED) return;
  const currentTs = Date.now();
  if (!force && currentTs - lastConsistencySweepAt < CONSISTENCY_SWEEP_INTERVAL_MS) return;
  lastConsistencySweepAt = currentTs;

  try {
    const summary = await withRetry("consistency sweep", () =>
      runChatTaskConsistencySweep({
        limit: CONSISTENCY_SWEEP_LIMIT,
        maxTaskAgeMs: CONSISTENCY_SWEEP_MAX_TASK_AGE_MS,
      }),
    );
    if (summary.timelineRepaired > 0 || summary.sessionTouched > 0) {
      console.log(
        `[ChatTaskWorker] consistency sweep: scanned=${summary.scanned}, sessionTouched=${summary.sessionTouched}, timelineRepaired=${summary.timelineRepaired}`,
      );
    }
  } catch (error) {
    console.error("[ChatTaskWorker] consistency sweep failed:", error);
  }
}

async function processOneTask(): Promise<boolean> {
  await withRetry("requeue stale tasks", () => requeueStaleRunningTasks(STALE_RUNNING_MS));
  const task = await withRetry("claim next queued task", () => claimNextQueuedChatTask(WORKER_ID));
  if (!task) return false;

  const inputState = toAgentState(task.result?.internal?.inputState);
  if (!inputState) {
    try {
      await withRetry("mark invalid queued task as failed", () =>
        failChatTask(task.id, "queued task missing internal.inputState payload"),
      );
    } catch (error) {
      console.error("[ChatTaskWorker] failed to mark invalid queued task:", error);
    }
    return true;
  }
  const skillId = String(task.result?.internal?.skillId || (inputState.workflow_context as any)?.skillId || "website-generation-workflow")
    .trim()
    .toLowerCase();

  await withRetry("persist claimed task progress", () =>
    updateChatTaskProgress(task.id, {
      assistantText: `Worker ${WORKER_ID} started task execution.`,
      phase: "running",
      progress: {
        stage: "worker:claimed",
        skillId,
        round: 0,
        maxRounds: Math.max(1, Number(process.env.CHAT_ASYNC_MAX_ROUNDS_SKILL_NATIVE || 1)),
        checkpointSaved: false,
      },
    }),
  );

  try {
    await SkillRuntimeExecutor.runTask({
      taskId: task.id,
      chatId: task.chatId,
      inputState,
      workerId: WORKER_ID,
      skillId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await withRetry("persist task failure state", () => failChatTask(task.id, message || "worker execution failed"));
    } catch (markFailError) {
      console.error("[ChatTaskWorker] failed to persist task failure state:", markFailError);
      console.error("[ChatTaskWorker] original task error:", error);
    }
  }

  return true;
}

export async function runChatTaskWorkerOnce(): Promise<boolean> {
  const processed = await processOneTask();
  await maybeRunConsistencySweep(true);
  return processed;
}

export async function runChatTaskWorkerLoop() {
  console.log(
    `[ChatTaskWorker] starting ${WORKER_ID}, poll=${POLL_MS}ms, once=${ONCE ? "yes" : "no"}, consistencySweep=${CONSISTENCY_SWEEP_ENABLED ? "on" : "off"}`,
  );
  while (true) {
    let hadTask = false;
    try {
      hadTask = await processOneTask();
      await maybeRunConsistencySweep(false);
    } catch (error) {
      console.error("[ChatTaskWorker] loop iteration failed:", error);
      hadTask = false;
      await maybeRunConsistencySweep(false);
    }
    if (ONCE) break;
    if (!hadTask) {
      await sleep(POLL_MS);
    }
  }
  console.log(`[ChatTaskWorker] exiting ${WORKER_ID}`);
}

async function main() {
  await runChatTaskWorkerLoop();
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entryUrl && import.meta.url === entryUrl) {
  main().catch((error) => {
    console.error("[ChatTaskWorker] fatal error:", error);
    process.exit(1);
  });
}
