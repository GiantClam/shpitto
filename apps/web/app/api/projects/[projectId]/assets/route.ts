import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";
import { getR2Client } from "@/lib/r2";
import { getLatestChatTaskForChat } from "@/lib/agent/chat-task-store";
import {
  deleteProjectAsset,
  filterAssets,
  getProjectAssetVersionInfo,
  listProjectAssets,
  summarizeAssetStats,
  syncGeneratedProjectAssetsFromSite,
  type ProjectAssetCategory,
  type ProjectAssetSource,
  uploadProjectAssets,
} from "@/lib/project-assets";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = Math.max(256 * 1024, Number(process.env.PROJECT_ASSET_UPLOAD_MAX_BYTES || 20 * 1024 * 1024));

function toCategory(input: string): "all" | ProjectAssetCategory {
  const normalized = String(input || "").trim().toLowerCase();
  if (normalized === "image" || normalized === "images") return "image";
  if (normalized === "code") return "code";
  if (normalized === "document" || normalized === "documents" || normalized === "doc") return "document";
  if (normalized === "other") return "other";
  return "all";
}

function toUploadSource(input: string): ProjectAssetSource {
  const normalized = String(input || "").trim().toLowerCase();
  if (normalized === "chat_upload" || normalized === "chat-upload" || normalized === "chat") return "chat_upload";
  if (normalized === "generated") return "generated";
  return "upload";
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });

    const r2 = getR2Client();
    if (!r2.isConfigured()) {
      return NextResponse.json({
        ok: true,
        assets: [],
        stats: { totalFiles: 0, totalBytes: 0 },
        versions: {
          currentVersion: "",
          publishedVersion: "",
          versionCount: 0,
          nextVersion: "1.0.0",
          hasUnpublishedChanges: false,
          updatedAt: Date.now(),
        },
        r2Configured: false,
      });
    }

    const category = toCategory(request.nextUrl.searchParams.get("category") || "");
    const query = String(request.nextUrl.searchParams.get("q") || "").trim();
    let assets = await listProjectAssets({
      ownerUserId: userId,
      projectId,
    });
    if (assets.length === 0) {
      const latestTask = await getLatestChatTaskForChat(projectId);
      const generatedFiles = Array.isArray(latestTask?.result?.progress?.generatedFiles)
        ? (latestTask?.result?.progress?.generatedFiles as string[])
        : [];
      const checkpointSiteDir = String(latestTask?.result?.progress?.checkpointSiteDir || "").trim();
      if (latestTask?.id && checkpointSiteDir && generatedFiles.length > 0) {
        await syncGeneratedProjectAssetsFromSite({
          ownerUserId: userId,
          projectId,
          taskId: latestTask.id,
          siteDir: checkpointSiteDir,
          generatedFiles,
        }).catch(() => {
          // best effort sync for historical tasks
        });
        assets = await listProjectAssets({
          ownerUserId: userId,
          projectId,
        });
      }
    }
    const versions = await getProjectAssetVersionInfo({
      ownerUserId: userId,
      projectId,
    });
    const filtered = filterAssets(assets, { query, category });
    return NextResponse.json({
      ok: true,
      assets: filtered,
      stats: summarizeAssetStats(filtered),
      versions,
      r2Configured: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list project assets.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!getR2Client().isConfigured()) {
      return NextResponse.json({ ok: false, error: "Cloudflare R2 is not configured." }, { status: 503 });
    }

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });

    const formData = await request.formData();
    const source = toUploadSource(String(formData.get("source") || ""));
    const files = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File);
    if (!files.length) {
      return NextResponse.json({ ok: false, error: "No files received." }, { status: 400 });
    }

    const uploadInputs: Array<{
      fileName: string;
      body: Uint8Array;
      contentType?: string;
    }> = [];
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      if (bytes.byteLength > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { ok: false, error: `File "${file.name}" exceeds max upload size (${MAX_UPLOAD_BYTES} bytes).` },
          { status: 413 },
        );
      }
      uploadInputs.push({
        fileName: file.name,
        contentType: file.type || undefined,
        body: bytes,
      });
    }
    const uploadResult = await uploadProjectAssets({
      ownerUserId: userId,
      projectId,
      source,
      files: uploadInputs,
    });
    const versions = await getProjectAssetVersionInfo({
      ownerUserId: userId,
      projectId,
    });

    return NextResponse.json({
      ok: true,
      uploaded: uploadResult.uploaded,
      versions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload files.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as { key?: string };
    const key = String(body.key || "").trim();
    if (!key) return NextResponse.json({ ok: false, error: "Missing asset key." }, { status: 400 });

    await deleteProjectAsset({
      ownerUserId: userId,
      projectId,
      key,
    });
    const versions = await getProjectAssetVersionInfo({
      ownerUserId: userId,
      projectId,
    });
    return NextResponse.json({ ok: true, versions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete asset.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
