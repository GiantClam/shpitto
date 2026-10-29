import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";
import { BlogValidationError, deleteProjectBlogPost, getProjectBlogPost, upsertProjectBlogPost } from "@/lib/blog";
import type { BlogPostUpsertInput } from "@/lib/blog-types";

export const runtime = "nodejs";

function readInput(body: unknown): BlogPostUpsertInput {
  const raw = (body || {}) as Record<string, unknown>;
  const input = (raw.input || raw) as Record<string, unknown>;
  return {
    slug: String(input.slug || "").trim() || undefined,
    title: String(input.title || "").trim(),
    excerpt: String(input.excerpt || "").trim(),
    contentMd: String(input.contentMd || input.content_md || "").trim(),
    status: String(input.status || "draft").trim() as BlogPostUpsertInput["status"],
    authorName: String(input.authorName || input.author_name || "").trim(),
    category: String(input.category || "").trim(),
    tags: Array.isArray(input.tags)
      ? input.tags.map((item) => String(item || "").trim()).filter(Boolean)
      : String(input.tags || "")
          .split(/[,，、;\n|/]+/)
          .map((item) => item.trim())
          .filter(Boolean),
    coverImageUrl: String(input.coverImageUrl || input.cover_image_url || "").trim(),
    coverImageAlt: String(input.coverImageAlt || input.cover_image_alt || "").trim(),
    seoTitle: String(input.seoTitle || input.seo_title || "").trim(),
    seoDescription: String(input.seoDescription || input.seo_description || "").trim(),
    themeKey: String(input.themeKey || input.theme_key || "").trim(),
    layoutKey: String(input.layoutKey || input.layout_key || "").trim(),
    publishedAt: String(input.publishedAt || input.published_at || "").trim() || null,
  };
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

    const post = await getProjectBlogPost({ projectId, userId, postId });
    if (!post) return NextResponse.json({ ok: false, error: "Blog post not found." }, { status: 404 });
    return NextResponse.json({ ok: true, post });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load blog post.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
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

    const body = await request.json().catch(() => ({}));
    const input = readInput(body);
    const post = await upsertProjectBlogPost({ projectId, userId, postId, input });
    if (!post) {
      return NextResponse.json({ ok: false, error: "Cloudflare D1 is not configured." }, { status: 503 });
    }
    return NextResponse.json({ ok: true, post });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update blog post.";
    return NextResponse.json({ ok: false, error: message }, { status: error instanceof BlogValidationError ? 400 : 500 });
  }
}

export async function DELETE(
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

    const deleted = await deleteProjectBlogPost({ projectId, userId, postId });
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Cloudflare D1 is not configured." }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete blog post.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
