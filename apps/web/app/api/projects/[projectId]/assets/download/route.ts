import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";
import {
  getProjectAssetObject,
  listProjectAssets,
  type ProjectAssetRecord,
} from "@/lib/project-assets";

export const runtime = "nodejs";

function safeDownloadName(projectId: string): string {
  const safe = String(projectId || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${safe || "project-assets"}.zip`;
}

function safeZipPath(asset: ProjectAssetRecord): string {
  const raw = String(asset.path || asset.name || "asset").replace(/\\/g, "/");
  const safe = raw
    .split("/")
    .map((segment) => segment.trim().replace(/[^a-zA-Z0-9._ -]+/g, "_"))
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
  return safe || safeDownloadName(asset.id).replace(/\.zip$/i, "");
}

function uniqueZipPath(basePath: string, used: Set<string>): string {
  const normalized = String(basePath || "asset").replace(/^\/+/, "") || "asset";
  if (!used.has(normalized)) {
    used.add(normalized);
    return normalized;
  }

  const dir = path.posix.dirname(normalized);
  const ext = path.posix.extname(normalized);
  const stem = path.posix.basename(normalized, ext);
  for (let index = 2; ; index += 1) {
    const candidateName = `${stem}-${index}${ext}`;
    const candidate = dir === "." ? candidateName : `${dir}/${candidateName}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

function streamFileAndCleanup(filePath: string): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath);
  const cleanup = () => {
    void rm(filePath, { force: true }).catch(() => {
      // Temporary download cleanup is best-effort after the response has ended.
    });
  };
  nodeStream.once("close", cleanup);
  nodeStream.once("error", cleanup);
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  let tempZipPath = "";
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });

    const assets = await listProjectAssets({ ownerUserId: userId, projectId });
    if (assets.length === 0) {
      return NextResponse.json({ ok: false, error: "No project assets to download." }, { status: 404 });
    }

    const zip = new JSZip();
    const usedPaths = new Set<string>();
    for (const asset of assets) {
      const object = await getProjectAssetObject({
        ownerUserId: userId,
        projectId,
        key: asset.key,
      });
      if (!object || object.skipped || !object.ok || !("body" in object) || !object.body) {
        throw new Error(`Failed to read asset "${asset.path || asset.name}".`);
      }
      zip.file(uniqueZipPath(safeZipPath(asset), usedPaths), Buffer.from(object.body));
    }

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const tempDir = path.join(tmpdir(), "shpitto-asset-downloads");
    await mkdir(tempDir, { recursive: true });
    tempZipPath = path.join(tempDir, `${Date.now()}-${randomUUID()}-${safeDownloadName(projectId)}`);
    await writeFile(tempZipPath, zipBuffer);

    const fileName = safeDownloadName(projectId);
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
      await rm(tempZipPath, { force: true }).catch(() => {});
    }
    const message = error instanceof Error ? error.message : "Failed to download project assets.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
