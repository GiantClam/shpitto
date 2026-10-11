import { NextRequest, NextResponse } from "next/server";
import { deleteProjectBlogAsset, listProjectBlogAssets, uploadProjectBlogAsset } from "@/lib/blog";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";

export const runtime = "nodejs";

const MAX_BLOG_IMAGE_BYTES = Math.max(256 * 1024, Number(process.env.BLOG_IMAGE_UPLOAD_MAX_BYTES || 8 * 1024 * 1024));

function isSupportedImage(file: File) {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(name);
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ projectId: string; postId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId, postId: rawPostId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    const postId = decodeURIComponent(String(rawPostId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });
    if (!postId) return NextResponse.json({ ok: false, error: "Missing postId." }, { status: 400 });

    const assets = await listProjectBlogAssets({ projectId, userId, postId });
    return NextResponse.json({ ok: true, assets });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load blog assets.";
    const status = /not found|unauthorized/i.test(message) ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string; postId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId, postId: rawPostId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    const postId = decodeURIComponent(String(rawPostId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });
    if (!postId) return NextResponse.json({ ok: false, error: "Missing postId." }, { status: 400 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No image file received." }, { status: 400 });
    }
    if (!isSupportedImage(file)) {
      return NextResponse.json({ ok: false, error: "Only image files can be uploaded." }, { status: 415 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.byteLength > MAX_BLOG_IMAGE_BYTES) {
      return NextResponse.json(
        { ok: false, error: `Image exceeds max upload size (${MAX_BLOG_IMAGE_BYTES} bytes).` },
        { status: 413 },
      );
    }

    const alt = String(formData.get("alt") || "").trim();
    const caption = String(formData.get("caption") || "").trim();
    const setAsCover = String(formData.get("setAsCover") || "1") !== "0";
    const asset = await uploadProjectBlogAsset({
      projectId,
      userId,
      postId,
      fileName: file.name,
      contentType: file.type || undefined,
      body: bytes,
      alt,
      caption,
      setAsCover,
    });

    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload blog image.";
    const status = /not configured|required/.test(message) ? 503 : /not found|unauthorized/i.test(message) ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string; postId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId, postId: rawPostId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    const postId = decodeURIComponent(String(rawPostId || "").trim());
    const assetId = String(request.nextUrl.searchParams.get("assetId") || "").trim();
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });
    if (!postId) return NextResponse.json({ ok: false, error: "Missing postId." }, { status: 400 });
    if (!assetId) return NextResponse.json({ ok: false, error: "Missing assetId." }, { status: 400 });

    const deleted = await deleteProjectBlogAsset({ projectId, userId, postId, assetId });
    if (!deleted) return NextResponse.json({ ok: false, error: "Blog asset not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete blog asset.";
    const status = /not configured|required/.test(message) ? 503 : /not found|unauthorized/i.test(message) ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
