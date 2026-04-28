import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getChatTask } from "../../../../../../../lib/agent/chat-task-store";

export const runtime = "nodejs";

type PreviewSiteDirCacheEntry = {
  siteDir: string;
  expiresAt: number;
};

type VirtualPreviewFile = {
  path: string;
  content: string;
  type?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __shpittoPreviewSiteDirCache: Map<string, PreviewSiteDirCacheEntry> | undefined;
}

const PREVIEW_SITE_DIR_CACHE_TTL_MS = 60_000;

function getPreviewSiteDirCache(): Map<string, PreviewSiteDirCacheEntry> {
  if (!globalThis.__shpittoPreviewSiteDirCache) {
    globalThis.__shpittoPreviewSiteDirCache = new Map();
  }
  return globalThis.__shpittoPreviewSiteDirCache;
}

function renderPendingPreviewHtml(params: { taskId: string; stage?: string; status?: string }): string {
  const stage = String(params.stage || "").trim() || "preparing";
  const status = String(params.status || "").trim() || "running";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Preview is generating...</title>
    <style>
      :root { --bg:#0b1226; --surface:#162345; --text:#edf3ff; --muted:#9ab0d8; --primary:#5a78ff; }
      * { box-sizing: border-box; }
      body { margin:0; min-height:100svh; display:grid; place-items:center; background:linear-gradient(180deg,var(--bg),#101a34); color:var(--text); font-family:Inter,system-ui,-apple-system,sans-serif; }
      .card { width:min(640px,92vw); padding:28px; border-radius:16px; background:color-mix(in oklab, var(--surface) 82%, transparent); border:1px solid color-mix(in oklab, var(--primary) 26%, transparent); }
      .badge { display:inline-flex; padding:4px 10px; border-radius:999px; font-size:12px; color:#cfe0ff; background:color-mix(in oklab, var(--primary) 20%, transparent); border:1px solid color-mix(in oklab, var(--primary) 35%, transparent); }
      h1 { margin:12px 0 8px; font-size:24px; line-height:1.25; }
      p { margin:0; color:var(--muted); line-height:1.6; }
      code { color:#e9f1ff; font-size:12px; }
    </style>
  </head>
  <body>
    <section class="card">
      <span class="badge">Task ${params.taskId}</span>
      <h1>Preview is still generating...</h1>
      <p>Status: <code>${status}</code> · Stage: <code>${stage}</code></p>
      <p style="margin-top:10px;">The website files are not ready yet. This preview will be available automatically after the first HTML file is generated.</p>
    </section>
  </body>
</html>`;
}

function detectMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

function rewriteHtmlForPreview(html: string, previewBase: string): string {
  // Rewrite root-absolute href/src paths to task preview base to keep links and assets working.
  const attrRewritten = html.replace(
    /\b(href|src)=["']\/(?!\/|api\/|_next\/)([^"']*)["']/gi,
    (_m, attr: string, target: string) => `${attr}="${previewBase}/${target}"`,
  );

  const sharedAssetRewritten = attrRewritten.replace(
    /\b(href|src)=["'](?:(?:\.\.?\/)+)?(styles\.css|script\.js)([?#][^"']*)?["']/gi,
    (_m, attr: string, target: string, suffix = "") => `${attr}="${previewBase}/${target}${suffix}"`,
  );

  return sharedAssetRewritten.replace(/\bhref=["']\/["']/gi, `href="${previewBase}/"`);
}

function normalizePreviewFilePath(value: string): string {
  return String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function getArtifactFilesFromTask(task: any): VirtualPreviewFile[] {
  const candidates = [
    task?.result?.internal?.artifactSnapshot,
    task?.result?.internal?.sessionState?.site_artifacts,
    task?.result?.internal?.inputState?.site_artifacts,
    task?.result?.site_artifacts,
  ];
  const byPath = new Map<string, VirtualPreviewFile>();

  for (const candidate of candidates) {
    const files = candidate?.staticSite?.files;
    if (!Array.isArray(files)) continue;
    for (const file of files) {
      const filePath = normalizePreviewFilePath(String(file?.path || ""));
      if (!filePath || typeof file?.content !== "string") continue;
      byPath.set(filePath, {
        path: filePath,
        content: file.content,
        type: typeof file.type === "string" ? file.type : undefined,
      });
    }
  }

  return [...byPath.values()];
}

function resolveVirtualPreviewFile(task: any, parts: string[]): VirtualPreviewFile | undefined {
  const files = getArtifactFilesFromTask(task);
  if (files.length === 0) return undefined;

  const byPath = new Map(files.map((file) => [file.path, file]));
  const safeParts = parts.map(normalizePreviewFilePath).filter(Boolean);
  const target = normalizePreviewFilePath(safeParts.join("/"));
  const candidates = target
    ? [target, `${target}/index.html`]
    : ["index.html"];

  for (const candidate of candidates) {
    const file = byPath.get(candidate);
    if (file) return file;
  }

  return undefined;
}

async function resolveTargetFile(siteDir: string, parts: string[]): Promise<string> {
  const safeParts = parts.filter(Boolean);
  let candidate = path.resolve(siteDir, ...safeParts);
  const siteRoot = path.resolve(siteDir);
  if (!candidate.startsWith(siteRoot)) {
    throw new Error("Invalid preview path.");
  }

  let stat;
  try {
    stat = await fs.stat(candidate);
  } catch {
    stat = null;
  }

  if (!stat) {
    const maybeIndex = path.resolve(siteRoot, ...safeParts, "index.html");
    if (maybeIndex.startsWith(siteRoot)) {
      try {
        const indexStat = await fs.stat(maybeIndex);
        if (indexStat.isFile()) return maybeIndex;
      } catch {
        // ignore
      }
    }
    throw new Error("Preview file not found.");
  }

  if (stat.isDirectory()) {
    const indexFile = path.resolve(candidate, "index.html");
    if (!indexFile.startsWith(siteRoot)) throw new Error("Invalid preview path.");
    const indexStat = await fs.stat(indexFile);
    if (!indexStat.isFile()) throw new Error("Preview file not found.");
    return indexFile;
  }

  return candidate;
}

async function hasIndexHtml(siteDir: string): Promise<boolean> {
  const normalized = String(siteDir || "").trim();
  if (!normalized) return false;
  try {
    const stat = await fs.stat(normalized);
    if (!stat.isDirectory()) return false;
  } catch {
    return false;
  }
  try {
    const indexStat = await fs.stat(path.join(normalized, "index.html"));
    return indexStat.isFile();
  } catch {
    return false;
  }
}

function rememberPreviewSiteDir(taskId: string, siteDir: string) {
  const normalizedTaskId = String(taskId || "").trim();
  const normalizedSiteDir = String(siteDir || "").trim();
  if (!normalizedTaskId || !normalizedSiteDir) return;
  getPreviewSiteDirCache().set(normalizedTaskId, {
    siteDir: normalizedSiteDir,
    expiresAt: Date.now() + PREVIEW_SITE_DIR_CACHE_TTL_MS,
  });
}

async function getCachedPreviewSiteDir(taskId: string): Promise<string> {
  const cache = getPreviewSiteDirCache();
  const entry = cache.get(taskId);
  if (!entry) return "";
  if (entry.expiresAt < Date.now()) {
    cache.delete(taskId);
    return "";
  }
  if (await hasIndexHtml(entry.siteDir)) return entry.siteDir;
  cache.delete(taskId);
  return "";
}

function isSafeTaskIdForLocalLookup(taskId: string): boolean {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(taskId);
}

function getLocalTaskRoots(): string[] {
  const candidates = [
    path.resolve(process.cwd(), ".tmp", "chat-tasks"),
    path.resolve(process.cwd(), "apps", "web", ".tmp", "chat-tasks"),
  ];
  return Array.from(new Set(candidates));
}

async function resolveSiteDirFromLocalTaskRoot(taskRoot: string): Promise<string> {
  const candidates = [path.join(taskRoot, "latest", "site"), path.join(taskRoot, "site"), path.join(taskRoot, "latest")];
  const stepsRoot = path.join(taskRoot, "steps");
  try {
    const entries = await fs.readdir(stepsRoot, { withFileTypes: true });
    const stepDirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a));
    for (const stepDir of stepDirs) {
      candidates.push(path.join(stepsRoot, stepDir, "site"), path.join(stepsRoot, stepDir));
    }
  } catch {
    // ignore missing steps directory
  }

  for (const candidate of candidates) {
    if (await hasIndexHtml(candidate)) return candidate;
  }
  return "";
}

async function findLocalPreviewSiteDirByTaskId(taskId: string): Promise<string> {
  if (!isSafeTaskIdForLocalLookup(taskId)) return "";
  const cached = await getCachedPreviewSiteDir(taskId);
  if (cached) return cached;

  for (const root of getLocalTaskRoots()) {
    try {
      const directTaskRoot = path.join(root, taskId);
      const directSiteDir = await resolveSiteDirFromLocalTaskRoot(directTaskRoot);
      if (directSiteDir) {
        rememberPreviewSiteDir(taskId, directSiteDir);
        return directSiteDir;
      }

      const chatDirs = await fs.readdir(root, { withFileTypes: true });
      for (const chatDir of chatDirs) {
        if (!chatDir.isDirectory()) continue;
        const taskRoot = path.join(root, chatDir.name, taskId);
        const siteDir = await resolveSiteDirFromLocalTaskRoot(taskRoot);
        if (siteDir) {
          rememberPreviewSiteDir(taskId, siteDir);
          return siteDir;
        }
      }
    } catch {
      // ignore missing or unreadable local task roots
    }
  }

  return "";
}

async function resolveSiteDirFromTask(task: any): Promise<string> {
  const progress = task?.result?.progress || {};
  const explicit = String(progress?.checkpointSiteDir || "").trim();
  if (await hasIndexHtml(explicit)) return explicit;

  const candidates: string[] = [];
  const checkpointDir = String(progress?.checkpointDir || "").trim();
  if (checkpointDir) {
    candidates.push(path.join(checkpointDir, "site"), checkpointDir);
  }

  const checkpointProjectPath = String(progress?.checkpointProjectPath || "").trim();
  if (checkpointProjectPath) {
    const checkpointRoot = path.dirname(checkpointProjectPath);
    candidates.push(path.join(checkpointRoot, "site"));
    const stepsRoot = path.join(checkpointRoot, "steps");
    try {
      const entries = await fs.readdir(stepsRoot, { withFileTypes: true });
      const stepDirs = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a));
      for (const stepDir of stepDirs) {
        candidates.push(path.join(stepsRoot, stepDir, "site"), path.join(stepsRoot, stepDir));
      }
    } catch {
      // ignore missing steps directory
    }
  }

  const seen = new Set<string>();
  for (const rawCandidate of candidates) {
    const candidate = String(rawCandidate || "").trim();
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (await hasIndexHtml(resolved)) return resolved;
  }

  return "";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ taskId: string; path?: string[] }> },
) {
  const params = await ctx.params;
  const taskId = String(params?.taskId || "").trim();
  const parts = Array.isArray(params?.path) ? params.path : [];
  if (!taskId) {
    return NextResponse.json({ ok: false, error: "Missing taskId." }, { status: 400 });
  }

  let task: any;
  let taskLookupError: unknown;
  try {
    task = await getChatTask(taskId);
  } catch (error) {
    taskLookupError = error;
  }

  let siteDir = await resolveSiteDirFromTask(task);
  if (siteDir) {
    rememberPreviewSiteDir(taskId, siteDir);
  } else {
    siteDir = await findLocalPreviewSiteDirByTaskId(taskId);
  }

  if (!siteDir) {
    const virtualFile = resolveVirtualPreviewFile(task, parts);
    if (virtualFile) {
      const mime = virtualFile.type || detectMime(virtualFile.path);
      if (mime.startsWith("text/html")) {
        const previewBase = `/api/chat/tasks/${encodeURIComponent(taskId)}/preview`;
        return new NextResponse(rewriteHtmlForPreview(virtualFile.content, previewBase), {
          status: 200,
          headers: {
            "Content-Type": mime,
            "Cache-Control": "no-store, max-age=0",
          },
        });
      }

      return new NextResponse(virtualFile.content, {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    if (taskLookupError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Task store unavailable and no local preview checkpoint was found.",
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
    const status = String(task?.status || "").trim();
    if (status === "queued" || status === "running") {
      return new NextResponse(
        renderPendingPreviewHtml({
          taskId,
          status,
          stage: String(task?.result?.progress?.stage || ""),
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store, max-age=0",
          },
        },
      );
    }
    return NextResponse.json({ ok: false, error: "No preview directory for this task yet." }, { status: 404 });
  }

  let filePath = "";
  try {
    filePath = await resolveTargetFile(siteDir, parts);
  } catch (error) {
    const status = String(task?.status || "").trim();
    if (status === "queued" || status === "running") {
      return new NextResponse(
        renderPendingPreviewHtml({
          taskId,
          status,
          stage: String(task?.result?.progress?.stage || ""),
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store, max-age=0",
          },
        },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid preview path." },
      { status: 404 },
    );
  }

  let content: Buffer;
  try {
    content = await fs.readFile(filePath);
  } catch {
    return NextResponse.json({ ok: false, error: "Preview file read failed." }, { status: 404 });
  }

  const mime = detectMime(filePath);
  if (mime.startsWith("text/html")) {
    const previewBase = `/api/chat/tasks/${encodeURIComponent(taskId)}/preview`;
    const rewritten = rewriteHtmlForPreview(content.toString("utf-8"), previewBase);
    return new NextResponse(rewritten, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  return new NextResponse(new Uint8Array(content), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
