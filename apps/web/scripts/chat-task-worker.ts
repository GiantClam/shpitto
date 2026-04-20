import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import type { AgentState } from "../lib/agent/graph.ts";
import { SkillRuntimeExecutor } from "../lib/skill-runtime/executor.ts";
import {
  claimNextQueuedChatTask,
  failChatTask,
  requeueStaleRunningTasks,
  updateChatTaskProgress,
} from "../lib/agent/chat-task-store.ts";

const WORKER_ID = `chat-worker-${crypto.randomUUID().slice(0, 12)}`;
const POLL_MS = Math.max(300, Number(process.env.CHAT_WORKER_POLL_MS || 1200));
const STALE_RUNNING_MS = Math.max(60_000, Number(process.env.CHAT_WORKER_STALE_RUNNING_MS || 1_200_000));
const ONCE = String(process.env.CHAT_WORKER_ONCE || "0").trim() === "1" || process.argv.includes("--once");

function toAgentState(value: unknown): AgentState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as AgentState;
  if (!Array.isArray(row.messages)) return undefined;
  if (typeof row.phase !== "string") return undefined;
  return row;
}

async function processOneTask(): Promise<boolean> {
  await requeueStaleRunningTasks(STALE_RUNNING_MS);
  const task = await claimNextQueuedChatTask(WORKER_ID);
  if (!task) return false;

  const inputState = toAgentState(task.result?.internal?.inputState);
  if (!inputState) {
    await failChatTask(task.id, "queued task missing internal.inputState payload");
    return true;
  }
  const skillId = String(task.result?.internal?.skillId || (inputState.workflow_context as any)?.skillId || "website-generation-workflow")
    .trim()
    .toLowerCase();

  await updateChatTaskProgress(task.id, {
    assistantText: `Worker ${WORKER_ID} started task execution.`,
    phase: "running",
    progress: {
      stage: "worker:claimed",
      skillId,
      round: 0,
      maxRounds: Math.max(1, Number(process.env.CHAT_ASYNC_MAX_ROUNDS_SKILL_NATIVE || 1)),
      checkpointSaved: false,
    },
  });

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
    await failChatTask(task.id, message || "worker execution failed");
  }

  return true;
}

export async function runChatTaskWorkerOnce(): Promise<boolean> {
  return processOneTask();
}

export async function runChatTaskWorkerLoop() {
  console.log(`[ChatTaskWorker] starting ${WORKER_ID}, poll=${POLL_MS}ms, once=${ONCE ? "yes" : "no"}`);
  while (true) {
    const hadTask = await processOneTask();
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
