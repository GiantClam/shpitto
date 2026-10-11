import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getChatTask,
  getChatTaskEvents,
  getRememberedChatTask,
  sanitizeTaskResultForClient,
} from "../../../../../lib/agent/chat-task-store";
import {
  listPreviewSiteFiles,
  resolveRequiredFilesFromTaskPlanText,
  siteHasPreviewEntrypoint,
} from "../../../../../lib/agent/chat-preview-site";

export const runtime = "nodejs";

const TASK_STORE_LOOKUP_TIMEOUT_MS = Math.max(1_000, Number(process.env.CHAT_TASK_ROUTE_STORE_TIMEOUT_MS || 24_000));

type LocalTaskCheckpoint = {
  chatId: string;
  taskId: string;
  taskRoot: string;
  siteDir: string;
  manifest?: Record<string, any>;
  files: string[];
  requiredFiles: string[];
  missingFiles: string[];
};

function isSafeTaskIdForLocalLookup(taskId: string): boolean {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(taskId);
}

function getLocalTaskRoots(): string[] {
  return Array.from(
    new Set([
      path.resolve(/* turbopackIgnore: true */ process.cwd(), ".tmp", "chat-tasks"),
      path.resolve(/* turbopackIgnore: true */ process.cwd(), "apps", "web", ".tmp", "chat-tasks"),
    ]),
  );
}

async function readJsonFile(filePath: string): Promise<Record<string, any> | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, any>;
  } catch {
    return undefined;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readTextFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function resolveRequiredFiles(latestDir: string): Promise<string[]> {
  const taskPlan = await readTextFile(path.join(latestDir, "workflow", "task_plan.md"));
  return resolveRequiredFilesFromTaskPlanText(taskPlan);
}

async function resolveLocalTaskCheckpointFromRoot(params: {
  chatId: string;
  taskId: string;
  taskRoot: string;
}): Promise<LocalTaskCheckpoint | undefined> {
  const latestDir = path.join(params.taskRoot, "latest");
  const candidates = [path.join(latestDir, "site"), path.join(params.taskRoot, "site")];
  for (const siteDir of candidates) {
    if (!(await siteHasPreviewEntrypoint(siteDir))) continue;
    const files = await listPreviewSiteFiles(siteDir);
    const requiredFiles = await resolveRequiredFiles(latestDir);
    const fileSet = new Set(files);
    return {
      chatId: params.chatId,
      taskId: params.taskId,
      taskRoot: params.taskRoot,
      siteDir,
      manifest: await readJsonFile(path.join(latestDir, "manifest.json")),
      files,
      requiredFiles,
      missingFiles: requiredFiles.filter((file) => !fileSet.has(file)),
    };
  }
  return undefined;
}

async function findLocalTaskCheckpoint(taskId: string): Promise<LocalTaskCheckpoint | undefined> {
  if (!isSafeTaskIdForLocalLookup(taskId)) return undefined;

  for (const root of getLocalTaskRoots()) {
    try {
      const direct = await resolveLocalTaskCheckpointFromRoot({
        chatId: "local",
        taskId,
        taskRoot: path.join(root, taskId),
      });
      if (direct) return direct;

      const chatDirs = await fs.readdir(root, { withFileTypes: true });
      for (const chatDir of chatDirs) {
        if (!chatDir.isDirectory()) continue;
        const checkpoint = await resolveLocalTaskCheckpointFromRoot({
          chatId: chatDir.name,
          taskId,
          taskRoot: path.join(root, chatDir.name, taskId),
        });
        if (checkpoint) return checkpoint;
      }
    } catch {
      // Ignore missing or unreadable local task roots.
    }
  }

  return undefined;
}

function localCheckpointLooksComplete(checkpoint: LocalTaskCheckpoint): boolean {
  if (checkpoint.missingFiles.length > 0) return false;
  const status = String(checkpoint.manifest?.status || "").trim().toLowerCase();
  if (!status) return true;
  if (status === "done" || status === "completed" || status === "succeeded") return true;
  if (status.includes("validation")) return true;
  return !status.startsWith("generating:");
}

function buildLocalFallbackTaskResponse(checkpoint: LocalTaskCheckpoint) {
  const now = Date.now();
  const status = localCheckpointLooksComplete(checkpoint) ? "succeeded" : "running";
  const manifest = checkpoint.manifest || {};
  const missingFiles = checkpoint.missingFiles.map((file) => `/${file}`);
  const generatedFiles = checkpoint.files.map((file) => `/${file}`);
  const stage = status === "succeeded" ? "done" : String(manifest.status || "running");
  const timestamp = Date.parse(String(manifest.latestUpdatedAt || manifest.savedAt || "")) || now;

  return {
    ok: true,
    task: {
      id: checkpoint.taskId,
      chatId: checkpoint.chatId,
      status,
      createdAt: Date.parse(String(manifest.savedAt || "")) || now,
      updatedAt: timestamp,
      result: {
        assistantText:
          status === "succeeded"
            ? "Recovered generated preview from local checkpoint."
            : "Recovered partial generated preview from local checkpoint.",
        phase: status === "succeeded" ? "end" : "running",
        progress: {
          stage,
          stageMessage:
            status === "succeeded"
              ? "Recovered generated preview from local checkpoint."
              : "Recovered partial local checkpoint; generation is still incomplete.",
          checkpointSaved: true,
          checkpointDir: checkpoint.taskRoot,
          checkpointSiteDir: checkpoint.siteDir,
          checkpointWorkflowDir: path.join(checkpoint.taskRoot, "latest", "workflow"),
          fileCount: checkpoint.files.length,
          requiredFileCount: checkpoint.requiredFiles.length,
          missingFileCount: checkpoint.missingFiles.length,
          missingFiles,
          generatedFiles,
          nativeStatus: String(manifest.status || ""),
        },
      },
    },
    events: [
      {
        id: `local-${checkpoint.taskId}`,
        eventType: "task_local_checkpoint_recovered",
        stage,
        payload: {
          checkpointSiteDir: checkpoint.siteDir,
          fileCount: checkpoint.files.length,
          requiredFileCount: checkpoint.requiredFiles.length,
          missingFiles,
          source: "local_checkpoint_fallback",
        },
        createdAt: new Date(timestamp).toISOString(),
      },
    ],
    recoveredFromLocalCheckpoint: true,
  };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const params = await ctx.params;
  const taskId = String(params?.taskId || "").trim();
  if (!taskId) {
    return NextResponse.json({ ok: false, error: "Missing taskId." }, { status: 400 });
  }

  let task;
  let taskLookupError: unknown;
  try {
    task = await withTimeout(getChatTask(taskId), TASK_STORE_LOOKUP_TIMEOUT_MS, "Task store lookup");
  } catch (error) {
    taskLookupError = error;
    task = getRememberedChatTask(taskId);
  }

  if (!task) {
    const localCheckpoint = await findLocalTaskCheckpoint(taskId);
    if (localCheckpoint) {
      return NextResponse.json(buildLocalFallbackTaskResponse(localCheckpoint), {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }
    if (taskLookupError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Task store unavailable and no local checkpoint was found.",
          details:
            process.env.NODE_ENV === "development"
              ? taskLookupError instanceof Error
                ? taskLookupError.message
                : String(taskLookupError)
              : undefined,
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
  }

  let events: Awaited<ReturnType<typeof getChatTaskEvents>> = [];
  try {
    events = await getChatTaskEvents(taskId, 200);
  } catch {
    events = [];
  }

  return NextResponse.json(
    {
      ok: true,
      task: {
        id: task.id,
        chatId: task.chatId,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        result: sanitizeTaskResultForClient(task.result),
      },
      events: events.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        stage: event.stage,
        payload: event.payload || null,
        createdAt: event.created_at,
      })),
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
