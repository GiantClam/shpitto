import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getRememberedChatTask, getChatTask } from "../../../../../../lib/agent/chat-task-store";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";

export const runtime = "nodejs";

const TASK_STORE_LOOKUP_TIMEOUT_MS = Math.max(1_000, Number(process.env.CHAT_TASK_ROUTE_STORE_TIMEOUT_MS || 24_000));

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

function localChatTasksBaseDirs(): string[] {
  return Array.from(
    new Set([
      path.resolve(process.cwd(), ".tmp", "chat-tasks"),
      path.resolve(process.cwd(), "apps", "web", ".tmp", "chat-tasks"),
    ]),
  );
}

function resolveLocalPathCandidates(rawPath: string): string[] {
  const raw = String(rawPath || "").trim();
  if (!raw) return [];

  const normalized = raw.replace(/\\/g, "/");
  const suffixMatch = normalized.match(/(?:^|\/)\.tmp\/chat-tasks\/(.+)$/i);
  const candidates = [path.resolve(raw)];
  if (suffixMatch?.[1]) {
    const suffix = suffixMatch[1].replace(/^\/+/, "");
    candidates.push(...localChatTasksBaseDirs().map((baseDir) => path.join(baseDir, suffix)));
  }
  return Array.from(new Set(candidates));
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveWorkspaceRoot(task: any): Promise<string> {
  const internal = (task?.result?.internal || {}) as Record<string, any>;
  const workflowContext =
    internal.sessionState?.workflow_context ||
    internal.inputState?.workflow_context ||
    {};
  const explicitWorkspaceRoot = String(workflowContext.opencodeWorkspaceRoot || "").trim();
  for (const candidate of resolveLocalPathCandidates(explicitWorkspaceRoot)) {
    if (await pathExists(candidate)) return candidate;
  }

  const checkpointProjectPath = String(task?.result?.progress?.checkpointProjectPath || "").trim();
  for (const projectPath of resolveLocalPathCandidates(checkpointProjectPath)) {
    const workspaceRoot = path.join(path.dirname(projectPath), "opencode-workspace");
    if (await pathExists(workspaceRoot)) return workspaceRoot;
  }

  return "";
}

async function collectFilesRecursively(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile()) files.push(absolutePath);
    }
  }
  await walk(rootDir);
  return files.sort((left, right) => left.localeCompare(right));
}

function safeZipEntryPath(rootDir: string, absolutePath: string): string {
  const relative = path.relative(rootDir, absolutePath).replace(/\\/g, "/");
  const safe = relative
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
  if (!safe) throw new Error(`Invalid workspace file path: ${absolutePath}`);
  return safe;
}

function safeDownloadName(taskId: string): string {
  const safe = String(taskId || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${safe || "website-code"}.zip`;
}

function streamFileAndCleanup(filePath: string): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath);
  const cleanup = () => {
    void fs.rm(filePath, { force: true }).catch(() => {
      // Temporary download cleanup is best-effort after the response has ended.
    });
  };
  nodeStream.once("close", cleanup);
  nodeStream.once("error", cleanup);
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  let tempZipPath = "";
  try {
    const { taskId } = await ctx.params;
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) {
      return NextResponse.json({ ok: false, error: "Missing taskId." }, { status: 400 });
    }

    let task;
    try {
      task = await withTimeout(getChatTask(normalizedTaskId), TASK_STORE_LOOKUP_TIMEOUT_MS, "Task store lookup");
    } catch {
      task = getRememberedChatTask(normalizedTaskId);
    }
    if (!task) {
      return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
    }

    const authenticatedUserId = await getAuthenticatedRouteUserId();
    const ownerUserId = String(task.ownerUserId || "").trim();
    if (ownerUserId) {
      if (!authenticatedUserId) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      if (authenticatedUserId !== ownerUserId) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }

    const workspaceRoot = await resolveWorkspaceRoot(task);
    if (!workspaceRoot) {
      return NextResponse.json(
        { ok: false, error: "No exportable source workspace is available for this task yet." },
        { status: 404 },
      );
    }

    const files = await collectFilesRecursively(workspaceRoot);
    if (files.length === 0) {
      return NextResponse.json(
        { ok: false, error: "The prepared source workspace is empty." },
        { status: 404 },
      );
    }

    const zip = new JSZip();
    for (const absolutePath of files) {
      const entryPath = safeZipEntryPath(workspaceRoot, absolutePath);
      zip.file(entryPath, await fs.readFile(absolutePath));
    }

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const tempDir = path.join(tmpdir(), "shpitto-task-code-exports");
    await fs.mkdir(tempDir, { recursive: true });
    tempZipPath = path.join(tempDir, `${Date.now()}-${randomUUID()}-${safeDownloadName(normalizedTaskId)}`);
    await fs.writeFile(tempZipPath, zipBuffer);

    const fileName = safeDownloadName(normalizedTaskId);
    return new NextResponse(streamFileAndCleanup(tempZipPath), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(zipBuffer.byteLength),
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    if (tempZipPath) {
      await fs.rm(tempZipPath, { force: true }).catch(() => {});
    }
    const message = error instanceof Error ? error.message : "Failed to export task source code.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
