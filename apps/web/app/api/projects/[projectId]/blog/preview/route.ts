import { NextRequest, NextResponse } from "next/server";
import { previewBlogPostPublishInput, BlogValidationError, getProjectBlogPost } from "@/lib/blog";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";
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

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const raw = (body || {}) as Record<string, unknown>;
    const postId = String(raw.postId || raw.post_id || "").trim();
    const input = readInput(body);
    const existing = postId ? await getProjectBlogPost({ projectId, userId, postId }) : null;
    const preview = previewBlogPostPublishInput(input, existing);
    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to preview blog post.";
    return NextResponse.json({ ok: false, error: message }, { status: error instanceof BlogValidationError ? 400 : 500 });
  }
}
