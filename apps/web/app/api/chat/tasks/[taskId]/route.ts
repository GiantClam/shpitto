import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getChatTask, getChatTaskEvents, sanitizeTaskResultForClient } from "../../../../../lib/agent/chat-task-store";

export const runtime = "nodejs";

type LocalTaskCheckpoint = {
  chatId: string;
  taskId: string;
  taskRoot: string;
  siteDir: string;
  manifest?: Record<string, any>;
  files: string[];
};

function isSafeTaskIdForLocalLookup(taskId: string): boolean {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(taskId);
}

function getLocalTaskRoots(): string[] {
  return Array.from(
    new Set([
      path.resolve(process.cwd(), ".tmp", "chat-tasks"),
      path.resolve(process.cwd(), "apps", "web", ".tmp", "chat-tasks"),
    ]),
  );
}

async function hasIndexHtml(siteDir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(siteDir, "index.html"));
    return stat.isFile();
  } catch {
    return false;
  }
}

async function listSiteFiles(siteDir: string): Promise<string[]> {
  const output: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      output.push(path.relative(siteDir, fullPath).replace(/\\/g, "/"));
    }
  }
  try {
    await walk(siteDir);
  } catch {
    return [];
  }
  return output.sort();
}

async function readJsonFile(filePath: string): Promise<Record<string, any> | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, any>;
  } catch {
    return undefined;
  }
}

async function resolveLocalTaskCheckpointFromRoot(params: {
  chatId: string;
  taskId: string;
  taskRoot: string;
}): Promise<LocalTaskCheckpoint | undefined> {
  const latestDir = path.join(params.taskRoot, "latest");
  const candidates = [path.join(latestDir, "site"), path.join(params.taskRoot, "site")];
  for (const siteDir of candidates) {
    if (!(await hasIndexHtml(siteDir))) continue;
    return {
      chatId: params.chatId,
      taskId: params.taskId,
      taskRoot: params.taskRoot,
      siteDir,
      manifest: await readJsonFile(path.join(latestDir, "manifest.json")),
      files: await listSiteFiles(siteDir),
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
      // ignore missing or unreadable local task roots
    }
  }

  return undefined;
}

function localCheckpointLooksComplete(checkpoint: LocalTaskCheckpoint): boolean {
  const files = new Set(checkpoint.files);
  return files.has("index.html") && files.has("styles.css") && files.has("script.js");
}

function buildLocalFallbackTaskResponse(checkpoint: LocalTaskCheckpoint) {
  const now = Date.now();
  const status = localCheckpointLooksComplete(checkpoint) ? "succeeded" : "running";
  const manifest = checkpoint.manifest || {};
  return {
    ok: true,
    task: {
      id: checkpoint.taskId,
      chatId: checkpoint.chatId,
      status,
      createdAt: Date.parse(String(manifest.savedAt || "")) || now,
      updatedAt: Date.parse(String(manifest.latestUpdatedAt || manifest.savedAt || "")) || now,
      result: {
        assistantText:
          status === "succeeded"
            ? "Recovered generated preview from local checkpoint."
            : "Recovered partial generated preview from local checkpoint.",
        phase: status === "succeeded" ? "end" : "running",
        progress: {
          stage: status === "succeeded" ? "done" : String(manifest.status || "running"),
          stageMessage:
            status === "succeeded"
              ? "本地生成结果已恢复，可预览。"
              : "本地生成结果部分恢复，仍显示为生成中。",
          checkpointSaved: true,
          checkpointDir: checkpoint.taskRoot,
          checkpointSiteDir: checkpoint.siteDir,
          checkpointWorkflowDir: path.join(checkpoint.taskRoot, "latest", "workflow"),
          fileCount: checkpoint.files.length,
          generatedFiles: checkpoint.files.map((file) => `/${file}`),
          nativeStatus: String(manifest.status || ""),
        },
      },
    },
    events: [
      {
        id: `local-${checkpoint.taskId}`,
        eventType: "task_local_checkpoint_recovered",
        stage: status === "succeeded" ? "done" : String(manifest.status || "running"),
        payload: {
          checkpointSiteDir: checkpoint.siteDir,
          fileCount: checkpoint.files.length,
          source: "local_checkpoint_fallback",
        },
        createdAt: new Date(Date.parse(String(manifest.latestUpdatedAt || manifest.savedAt || "")) || now).toISOString(),
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
    task = await getChatTask(taskId);
  } catch (error) {
    taskLookupError = error;
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
