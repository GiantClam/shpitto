import "server-only";
import { randomUUID } from "node:crypto";
import { getOwnedProjectState, saveProjectState } from "./agent/db";
import { BLOG_FALLBACK_POSTS } from "./blog-content";
import { buildBlogExcerpt, normalizeBlogMarkdown, normalizeBlogSlug, renderMarkdownToHtml, resolveUniqueBlogSlug } from "./blog-markdown";
import { buildDeployedBlogSnapshotFilesFromD1, injectDeployedBlogSnapshot } from "./deployed-blog-snapshot";
import { getD1Client } from "./d1";
import { getR2Client } from "./r2";
import type { BlogAssetRecord, BlogPostRecord, BlogPostStatus, BlogPostUpsertInput, BlogSettingsRecord } from "./blog-types";

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value: unknown, fallback = "") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

export class BlogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlogValidationError";
  }
}

export type BlogPostPublishPreview = {
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  status: BlogPostStatus;
};

function normalizeMultilineText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

const TAXONOMY_TAG_LIMIT = 6;
const TAXONOMY_CATEGORY_MAX_LENGTH = 40;
const TAXONOMY_TAG_MAX_LENGTH = 28;
const TAXONOMY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "article",
  "blog",
  "content",
  "draft",
  "e2e",
  "for",
  "from",
  "guide",
  "how",
  "insight",
  "notes",
  "post",
  "report",
  "section",
  "summary",
  "the",
  "this",
  "untitled",
  "with",
  "文章",
  "博客",
  "内容",
  "标题",
  "摘要",
  "标签",
  "分类",
]);

function normalizeTaxonomyValue(value: unknown, maxLength: number) {
  const normalized = String(value ?? "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[#*_~`>\[\]\(\)]+/g, " ")
    .replace(/[|/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,，、;；:：\-_.\s]+|[,，、;；:：\-_.\s]+$/g, "");
  if (!normalized) return "";
  if (/^\d+$/.test(normalized)) return "";
  return normalized.slice(0, maxLength).trim();
}

function normalizeTagList(values: unknown, fallback: string[] = []) {
  const source = Array.isArray(values)
    ? values
    : String(values ?? "")
        .split(/[,，、;\n|/]+/)
        .map((item) => item.trim());
  const deduped = new Map<string, string>();
  for (const raw of source) {
    const normalized = normalizeTaxonomyValue(raw, TAXONOMY_TAG_MAX_LENGTH);
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase();
    if (TAXONOMY_STOP_WORDS.has(key)) continue;
    if (!deduped.has(key)) deduped.set(key, normalized);
    if (deduped.size >= TAXONOMY_TAG_LIMIT) break;
  }
  return deduped.size ? Array.from(deduped.values()) : fallback;
}

function stripMarkdownForTaxonomy(value: string) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^>\s*/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[#*_~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTaxonomySegments(title: string, excerpt: string, contentMd: string) {
  const segments: Array<{ value: string; weight: number }> = [];
  if (title) segments.push({ value: title, weight: 5 });
  if (excerpt) segments.push({ value: excerpt, weight: 4 });

  const lines = String(contentMd || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let headingCount = 0;
  let paragraphCount = 0;
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      if (headingCount < 6) segments.push({ value: line.replace(/^#{1,6}\s+/, ""), weight: 4 });
      headingCount += 1;
      continue;
    }
    if (!/^[-*+]|^\d+\./.test(line) && paragraphCount < 4) {
      segments.push({ value: line, weight: 2 });
      paragraphCount += 1;
    }
    if (headingCount >= 6 && paragraphCount >= 4) break;
  }
  return segments;
}

function isMeaningfulTaxonomyCandidate(value: string) {
  if (!value) return false;
  const normalized = normalizeTaxonomyValue(value, TAXONOMY_CATEGORY_MAX_LENGTH);
  if (!normalized) return false;
  const lower = normalized.toLocaleLowerCase();
  if (TAXONOMY_STOP_WORDS.has(lower)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount > 4) return false;
  if (words.length > 0 && words.every((word) => TAXONOMY_STOP_WORDS.has(word.toLocaleLowerCase()))) return false;
  const isAcronym = /^[A-Z0-9.+-]{2,12}$/.test(normalized);
  const hasHan = /[\p{Script=Han}]/u.test(normalized);
  const hasLatin = /[A-Za-z]/.test(normalized);
  if (!isAcronym && normalized.length > 18) return false;
  if (hasHan && !normalized.includes(" ") && normalized.length > 10) return false;
  if (hasHan && hasLatin && normalized.length > 14) return false;
  if (hasHan && hasLatin && normalized.includes(" ")) return false;
  if (/^[a-z]+$/i.test(normalized) && normalized.length < 3 && !/^[A-Z0-9.+-]{2,12}$/.test(normalized)) return false;
  if (!/[\p{L}\p{N}]/u.test(normalized)) return false;
  return true;
}

function collectTaxonomyCandidates(title: string, excerpt: string, contentMd: string) {
  const scored = new Map<string, { value: string; score: number }>();
  const segments = buildTaxonomySegments(title, excerpt, contentMd);
  for (const segment of segments) {
    const cleaned = stripMarkdownForTaxonomy(segment.value);
    if (!cleaned) continue;
    const chunkCandidates = cleaned.split(/[|｜/、,:：;；。.!！？()\[\]{}<>《》"'“”‘’]+/g);
    const tokenCandidates =
      cleaned.match(
        segment.weight >= 4
          ? /[\p{Script=Han}]{2,10}|[A-Za-z][A-Za-z0-9.+-]{1,24}/gu
          : /[\p{Script=Han}]{2,10}|[A-Z][A-Za-z0-9.+-]{1,24}/gu,
      ) || [];
    for (const candidate of [...chunkCandidates, ...tokenCandidates]) {
      const normalized = normalizeTaxonomyValue(candidate, TAXONOMY_CATEGORY_MAX_LENGTH);
      if (!isMeaningfulTaxonomyCandidate(normalized)) continue;
      const key = normalized.toLocaleLowerCase();
      const existing = scored.get(key);
      const nextScore = (existing?.score || 0) + segment.weight;
      scored.set(key, { value: existing?.value || normalized, score: nextScore });
    }
  }
  return Array.from(scored.values())
    .sort((a, b) => b.score - a.score || a.value.length - b.value.length)
    .map((item) => item.value);
}

function inferCategory(params: {
  explicitCategory: string;
  retainedCategory: string;
  candidates: string[];
  fallbackTags: string[];
  shouldInfer: boolean;
}) {
  const explicit = normalizeTaxonomyValue(params.explicitCategory, TAXONOMY_CATEGORY_MAX_LENGTH);
  if (explicit) return explicit;
  const retained = normalizeTaxonomyValue(params.retainedCategory, TAXONOMY_CATEGORY_MAX_LENGTH);
  if (retained) return retained;
  if (!params.shouldInfer) return "";
  let bestCandidate = "";
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of params.candidates) {
    const normalized = normalizeTaxonomyValue(candidate, TAXONOMY_CATEGORY_MAX_LENGTH);
    if (!normalized) continue;
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    if (normalized.length > TAXONOMY_CATEGORY_MAX_LENGTH || wordCount > 3) continue;
    let score = 0;
    if (/^[A-Z0-9.+-]{2,12}$/.test(normalized)) score += 4;
    if (/[\p{Script=Han}]/u.test(normalized) && normalized.length <= 8) score += 3;
    if (wordCount === 1) score += 2;
    if (normalized.length <= 12) score += 1;
    if (normalized.includes(" ")) score -= 2;
    if (score > bestScore) {
      bestCandidate = normalized;
      bestScore = score;
    }
  }
  return bestCandidate || normalizeTaxonomyValue(params.fallbackTags[0] || "", TAXONOMY_CATEGORY_MAX_LENGTH);
}

function inferTags(params: {
  explicitTags: unknown;
  hasExplicitTags: boolean;
  retainedTags: string[];
  candidates: string[];
  category: string;
  shouldInfer: boolean;
}) {
  const normalizedExplicitTags = normalizeTagList(params.explicitTags, []);
  const base = params.hasExplicitTags ? normalizedExplicitTags : normalizeTagList(params.retainedTags, []);
  const seeded = params.category
    ? [
        params.category,
        ...base.filter((item) => item.toLocaleLowerCase() !== params.category.toLocaleLowerCase()),
      ]
    : [...base];
  const merged = normalizeTagList(seeded);
  if (params.hasExplicitTags && normalizedExplicitTags.length > 0) return merged;
  if (!params.shouldInfer || merged.length >= TAXONOMY_TAG_LIMIT) return merged;

  const supplemental = params.candidates.filter(
    (item) => !merged.some((tag) => tag.toLocaleLowerCase() === item.toLocaleLowerCase()),
  );
  return normalizeTagList([...merged, ...supplemental]);
}

function ensurePublishTaxonomyComplete(params: {
  title: string;
  contentMd: string;
  category: string;
  tags: string[];
  status: BlogPostStatus;
}) {
  if (params.status !== "published" && params.status !== "scheduled") return;
  if (!params.title.trim()) {
    throw new BlogValidationError("Published blog posts require a title.");
  }
  if (!params.contentMd.trim()) {
    throw new BlogValidationError("Published blog posts require content.");
  }
  if (!params.category.trim()) {
    throw new BlogValidationError("Category is required for published blog posts. Add a category or provide clearer headings.");
  }
  if (!params.tags.length) {
    throw new BlogValidationError("At least one tag is required for published blog posts. Add tags or provide clearer article keywords.");
  }
}

function isAutoManagedSlugForTitle(slug: string, title: string) {
  const normalizedSlug = normalizeText(slug);
  const baseSlug = normalizeBlogSlug(title, title);
  if (!normalizedSlug || !baseSlug) return false;
  if (normalizedSlug === baseSlug) return true;
  const escapedBase = baseSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escapedBase}-\\d+$`).test(normalizedSlug);
}

function sanitizeObjectKeySegment(input: string, fallback = "asset") {
  const normalized = String(input || "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || fallback;
}

function normalizeImageContentType(value: string, fileName: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.startsWith("image/")) return normalized;
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".gif")) return "image/gif";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".svg")) return "image/svg+xml";
  if (lowerName.endsWith(".avif")) return "image/avif";
  return "";
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  const raw = String(value || "[]").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => normalizeText(item)).filter(Boolean) : [];
  } catch {
    return raw
      .split(",")
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
}

function rowToPost(row: Record<string, unknown>): BlogPostRecord {
  return {
    id: normalizeText(row.id),
    projectId: normalizeText(row.projectId),
    accountId: normalizeText(row.accountId),
    ownerUserId: normalizeText(row.ownerUserId),
    slug: normalizeText(row.slug),
    title: normalizeText(row.title),
    excerpt: normalizeText(row.excerpt),
    contentMd: normalizeMultilineText(row.contentMd),
    contentHtml: normalizeMultilineText(row.contentHtml),
    status: (normalizeText(row.status, "draft") as BlogPostStatus) || "draft",
    authorName: normalizeText(row.authorName),
    category: normalizeText(row.category),
    tags: parseJsonArray(row.tagsJson),
    coverImageUrl: normalizeText(row.coverImageUrl),
    coverImageAlt: normalizeText(row.coverImageAlt),
    seoTitle: normalizeText(row.seoTitle),
    seoDescription: normalizeText(row.seoDescription),
    themeKey: normalizeText(row.themeKey),
    layoutKey: normalizeText(row.layoutKey),
    publishedAt: row.publishedAt ? normalizeText(row.publishedAt) : null,
    createdAt: normalizeText(row.createdAt),
    updatedAt: normalizeText(row.updatedAt),
  };
}

function rowToSettings(row: Record<string, unknown>): BlogSettingsRecord {
  return {
    projectId: normalizeText(row.projectId),
    accountId: normalizeText(row.accountId),
    ownerUserId: normalizeText(row.ownerUserId),
    enabled: Boolean(Number(row.enabled ?? 1)),
    navLabel: normalizeText(row.navLabel, "Blog"),
    homeFeaturedCount: Math.max(1, Number(row.homeFeaturedCount || 3)),
    defaultLayoutKey: normalizeText(row.defaultLayoutKey),
    defaultThemeKey: normalizeText(row.defaultThemeKey),
    rssEnabled: true,
    sitemapEnabled: true,
    createdAt: normalizeText(row.createdAt),
    updatedAt: normalizeText(row.updatedAt),
  };
}

function rowToAsset(row: Record<string, unknown>): BlogAssetRecord {
  const r2ObjectKey = normalizeText(row.r2ObjectKey);
  return {
    id: normalizeText(row.id),
    postId: normalizeText(row.postId),
    projectId: normalizeText(row.projectId),
    accountId: normalizeText(row.accountId),
    ownerUserId: normalizeText(row.ownerUserId),
    r2ObjectKey,
    url: getR2Client().toPublicUrl(r2ObjectKey) || "",
    mimeType: normalizeText(row.mimeType),
    sizeBytes: Number(row.sizeBytes || 0),
    width: row.width == null ? null : Number(row.width || 0),
    height: row.height == null ? null : Number(row.height || 0),
    alt: normalizeText(row.alt),
    caption: normalizeText(row.caption),
    createdAt: normalizeText(row.createdAt),
    updatedAt: normalizeText(row.updatedAt),
  };
}

async function ensureBlogSchemaReady() {
  const d1 = getD1Client();
  await d1.ensureShpittoSchema();
  return d1;
}

async function ensureOwnedProject(projectId: string, userId: string) {
  const d1 = await ensureBlogSchemaReady();
  const project = await d1.queryOne<Record<string, unknown>>(
    `
    SELECT id, account_id, owner_user_id, name
    FROM shpitto_projects
    WHERE id = ?
      AND owner_user_id = ?
      AND source_app = 'shpitto'
    LIMIT 1;
    `,
    [projectId, userId],
  );
  if (!project) {
    throw new Error("Project not found or unauthorized.");
  }
  return {
    id: normalizeText(project.id),
    accountId: normalizeText(project.account_id),
    ownerUserId: normalizeText(project.owner_user_id),
    name: normalizeText(project.name, "Project"),
  };
}

function normalizePostStatus(value: unknown): BlogPostStatus {
  const status = normalizeText(value, "draft").toLowerCase();
  if (status === "scheduled" || status === "published" || status === "archived") return status;
  return "draft";
}

function inferPublishedAt(input: BlogPostUpsertInput, existing?: BlogPostRecord | null) {
  const explicit = normalizeText(input.publishedAt || "");
  if (explicit) return explicit;
  if (existing?.publishedAt) return existing.publishedAt;
  if (normalizePostStatus(input.status) === "published") return nowIso();
  return existing?.publishedAt || null;
}

function resolveManagedInputFields(input: BlogPostUpsertInput, existing?: BlogPostRecord | null) {
  if (!existing) {
    return {
      input,
      recomputeSlug: false,
      recomputeExcerpt: false,
      recomputeSeoTitle: false,
      recomputeSeoDescription: false,
    };
  }

  const titleChanged = normalizeText(input.title, existing.title) !== existing.title;
  const contentChanged = String(input.contentMd ?? existing.contentMd ?? "").trim() !== String(existing.contentMd || "").trim();
  const existingExcerptAuto = !existing.excerpt || existing.excerpt === buildBlogExcerpt(existing.contentMd || "");
  const existingSlugAuto = isAutoManagedSlugForTitle(existing.slug, existing.title);
  const existingSeoTitleAuto = !existing.seoTitle || existing.seoTitle === existing.title;
  const existingSeoDescriptionAuto =
    !existing.seoDescription ||
    existing.seoDescription === existing.excerpt ||
    existing.seoDescription === buildBlogExcerpt(existing.contentMd || "");

  const nextInput = { ...input };
  let recomputeSlug = false;
  let recomputeExcerpt = false;
  let recomputeSeoTitle = false;
  let recomputeSeoDescription = false;
  const hasExplicitSlug = Object.prototype.hasOwnProperty.call(input, "slug");
  const hasExplicitExcerpt = Object.prototype.hasOwnProperty.call(input, "excerpt");
  const hasExplicitSeoTitle = Object.prototype.hasOwnProperty.call(input, "seoTitle");
  const hasExplicitSeoDescription = Object.prototype.hasOwnProperty.call(input, "seoDescription");
  const slugCleared = hasExplicitSlug && String(input.slug ?? "").trim() === "";
  const excerptCleared = hasExplicitExcerpt && String(input.excerpt ?? "").trim() === "";
  const seoTitleCleared = hasExplicitSeoTitle && String(input.seoTitle ?? "").trim() === "";
  const seoDescriptionCleared = hasExplicitSeoDescription && String(input.seoDescription ?? "").trim() === "";

  if (
    existingSlugAuto &&
    ((titleChanged && String(input.slug ?? "").trim() === existing.slug) || slugCleared)
  ) {
    nextInput.slug = undefined;
    recomputeSlug = true;
  }
  if (
    existingExcerptAuto &&
    ((contentChanged && String(input.excerpt ?? "").trim() === existing.excerpt) || excerptCleared)
  ) {
    nextInput.excerpt = undefined;
    recomputeExcerpt = true;
  }
  if (
    existingSeoTitleAuto &&
    ((titleChanged && String(input.seoTitle ?? "").trim() === existing.seoTitle) || seoTitleCleared)
  ) {
    nextInput.seoTitle = undefined;
    recomputeSeoTitle = true;
  }
  if (
    existingSeoDescriptionAuto &&
    (((titleChanged || contentChanged) && String(input.seoDescription ?? "").trim() === existing.seoDescription) ||
      seoDescriptionCleared)
  ) {
    nextInput.seoDescription = undefined;
    recomputeSeoDescription = true;
  }

  return {
    input: nextInput,
    recomputeSlug,
    recomputeExcerpt,
    recomputeSeoTitle,
    recomputeSeoDescription,
  };
}

function normalizePostInput(input: BlogPostUpsertInput, existing?: BlogPostRecord | null) {
  const managed = resolveManagedInputFields(input, existing);
  const managedInput = managed.input;
  const title = normalizeText(managedInput.title, existing?.title || "Untitled post");
  const slug = normalizeBlogSlug(
    managed.recomputeSlug ? title : managedInput.slug || existing?.slug || title,
    title,
  );
  const contentMd = normalizeBlogMarkdown(String(managedInput.contentMd ?? existing?.contentMd ?? ""));
  const excerpt =
    normalizeText((managed.recomputeExcerpt ? "" : managedInput.excerpt) || "") ||
    buildBlogExcerpt(contentMd) ||
    (managed.recomputeExcerpt ? "" : existing?.excerpt || "") ||
    "";
  const status = normalizePostStatus(managedInput.status || existing?.status || "draft");
  const shouldInferTaxonomy = status === "published" || status === "scheduled";
  const publishedAt = inferPublishedAt(managedInput, existing);
  const hasExplicitCategory = Object.prototype.hasOwnProperty.call(managedInput, "category");
  const hasExplicitTags = Object.prototype.hasOwnProperty.call(managedInput, "tags");
  const candidates = collectTaxonomyCandidates(title, excerpt, contentMd);
  const category = inferCategory({
    explicitCategory: hasExplicitCategory ? managedInput.category || "" : "",
    retainedCategory: hasExplicitCategory ? "" : existing?.category || "",
    candidates,
    fallbackTags: hasExplicitTags ? [] : existing?.tags || [],
    shouldInfer: shouldInferTaxonomy,
  });
  const tags = inferTags({
    explicitTags: hasExplicitTags ? managedInput.tags || [] : [],
    hasExplicitTags,
    retainedTags: hasExplicitTags ? [] : existing?.tags || [],
    candidates,
    category,
    shouldInfer: shouldInferTaxonomy,
  });
  ensurePublishTaxonomyComplete({ title, contentMd, category, tags, status });

  return {
    title,
    slug,
    excerpt,
    contentMd,
    contentHtml: renderMarkdownToHtml(contentMd),
    status,
    authorName: normalizeText(managedInput.authorName || existing?.authorName || ""),
    category,
    tags,
    coverImageUrl: normalizeText(managedInput.coverImageUrl || existing?.coverImageUrl || ""),
    coverImageAlt: normalizeText(managedInput.coverImageAlt || existing?.coverImageAlt || ""),
    seoTitle: normalizeText(
      (managed.recomputeSeoTitle ? "" : managedInput.seoTitle) ||
        (managed.recomputeSeoTitle ? "" : existing?.seoTitle || "") ||
        title,
    ),
    seoDescription: normalizeText(
      (managed.recomputeSeoDescription ? "" : managedInput.seoDescription) ||
        (managed.recomputeSeoDescription ? "" : existing?.seoDescription || "") ||
        excerpt,
    ),
    themeKey: normalizeText(managedInput.themeKey || existing?.themeKey || ""),
    layoutKey: normalizeText(managedInput.layoutKey || existing?.layoutKey || ""),
    publishedAt,
  };
}

export function previewBlogPostPublishInput(input: BlogPostUpsertInput, existing?: BlogPostRecord | null): BlogPostPublishPreview {
  const normalized = normalizePostInput(
    {
      ...input,
      status: "published",
    },
    existing,
  );
  return {
    title: normalized.title,
    slug: normalized.slug,
    excerpt: normalized.excerpt,
    category: normalized.category,
    tags: normalized.tags,
    seoTitle: normalized.seoTitle,
    seoDescription: normalized.seoDescription,
    status: normalized.status,
  };
}

async function listProjectOccupiedSlugs(params: {
  projectId: string;
  userId: string;
  desiredSlug: string;
  excludePostId?: string | null;
}) {
  const d1 = await ensureBlogSchemaReady();
  if (!d1.isConfigured()) return [] as string[];
  const rows = await d1.query<Record<string, unknown>>(
    `
    SELECT slug
    FROM shpitto_blog_posts
    WHERE project_id = ?
      AND owner_user_id = ?
      AND source_app = 'shpitto'
      AND (? IS NULL OR id <> ?)
      AND (slug = ? OR slug LIKE ?)
    ORDER BY slug ASC;
    `,
    [
      params.projectId,
      params.userId,
      params.excludePostId || null,
      params.excludePostId || null,
      params.desiredSlug,
      `${params.desiredSlug}-%`,
    ],
  );
  return rows
    .map((row) => normalizeText(row.slug))
    .filter(Boolean);
}

async function resolveProjectUniqueSlug(params: {
  projectId: string;
  userId: string;
  desiredSlug: string;
  excludePostId?: string | null;
}) {
  const occupied = await listProjectOccupiedSlugs(params);
  return resolveUniqueBlogSlug(params.desiredSlug, occupied);
}

function isProjectSlugUniqueConflict(error: unknown) {
  const text = String(error instanceof Error ? error.message : error || "").toLowerCase();
  if (!text) return false;
  return text.includes("unique") && text.includes("slug");
}

async function syncProjectPublishedBlogArtifacts(projectId: string, userId: string) {
  const projectState = await getOwnedProjectState(projectId, userId);
  const projectJson = projectState?.projectJson as any;
  if (!projectJson || typeof projectJson !== "object") return;
  if (!Array.isArray(projectJson?.staticSite?.files) || projectJson.staticSite.files.length === 0) return;

  const snapshotFiles = await buildDeployedBlogSnapshotFilesFromD1(projectId);
  const injected = injectDeployedBlogSnapshot(projectJson, snapshotFiles);
  await saveProjectState(userId, injected.project, undefined, projectId);
}

export async function listProjectBlogPosts(params: {
  projectId: string;
  userId: string;
  includeArchived?: boolean;
}): Promise<BlogPostRecord[]> {
  const d1 = await ensureBlogSchemaReady();
  if (!d1.isConfigured()) return [];
  await ensureOwnedProject(params.projectId, params.userId);
  const rows = await d1.query<Record<string, unknown>>(
    `
    SELECT
      id,
      project_id AS projectId,
      account_id AS accountId,
      owner_user_id AS ownerUserId,
      slug,
      title,
      excerpt,
      content_md AS contentMd,
      content_html AS contentHtml,
      status,
      author_name AS authorName,
      category,
      tags_json AS tagsJson,
      cover_image_url AS coverImageUrl,
      cover_image_alt AS coverImageAlt,
      seo_title AS seoTitle,
      seo_description AS seoDescription,
      theme_key AS themeKey,
      layout_key AS layoutKey,
      published_at AS publishedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM shpitto_blog_posts
    WHERE project_id = ?
      AND owner_user_id = ?
      AND source_app = 'shpitto'
      ${params.includeArchived ? "" : "AND status <> 'archived'"}
    ORDER BY
      CASE WHEN status = 'published' THEN 0 WHEN status = 'scheduled' THEN 1 WHEN status = 'draft' THEN 2 ELSE 3 END,
      COALESCE(published_at, updated_at) DESC,
      created_at DESC;
    `,
    [params.projectId, params.userId],
  );
  return rows.map(rowToPost);
}

export async function getProjectBlogPost(params: {
  projectId: string;
  userId: string;
  postId: string;
}): Promise<BlogPostRecord | null> {
  const d1 = await ensureBlogSchemaReady();
  if (!d1.isConfigured()) return null;
  await ensureOwnedProject(params.projectId, params.userId);
  const row = await d1.queryOne<Record<string, unknown>>(
    `
    SELECT
      id,
      project_id AS projectId,
      account_id AS accountId,
      owner_user_id AS ownerUserId,
      slug,
      title,
      excerpt,
      content_md AS contentMd,
      content_html AS contentHtml,
      status,
      author_name AS authorName,
      category,
      tags_json AS tagsJson,
      cover_image_url AS coverImageUrl,
      cover_image_alt AS coverImageAlt,
      seo_title AS seoTitle,
      seo_description AS seoDescription,
      theme_key AS themeKey,
      layout_key AS layoutKey,
      published_at AS publishedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM shpitto_blog_posts
    WHERE id = ?
      AND project_id = ?
      AND owner_user_id = ?
      AND source_app = 'shpitto'
    LIMIT 1;
    `,
    [params.postId, params.projectId, params.userId],
  );
  return row ? rowToPost(row) : null;
}

export async function getPublicBlogPostBySlug(projectId: string, slug: string) {
  const d1 = await ensureBlogSchemaReady();
  if (!d1.isConfigured()) return null;
  const row = await d1.queryOne<Record<string, unknown>>(
    `
    SELECT
      id,
      project_id AS projectId,
      account_id AS accountId,
      owner_user_id AS ownerUserId,
      slug,
      title,
      excerpt,
      content_md AS contentMd,
      content_html AS contentHtml,
      status,
      author_name AS authorName,
      category,
      tags_json AS tagsJson,
      cover_image_url AS coverImageUrl,
      cover_image_alt AS coverImageAlt,
      seo_title AS seoTitle,
      seo_description AS seoDescription,
      theme_key AS themeKey,
      layout_key AS layoutKey,
      published_at AS publishedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM shpitto_blog_posts
    WHERE project_id = ?
      AND slug = ?
      AND source_app = 'shpitto'
      AND status = 'published'
    LIMIT 1;
    `,
    [projectId, slug],
  );
  return row ? rowToPost(row) : null;
}

export async function listPublicBlogPosts(projectId: string, limit = 12): Promise<BlogPostRecord[]> {
  const d1 = await ensureBlogSchemaReady();
  if (!d1.isConfigured()) return [];
  const rows = await d1.query<Record<string, unknown>>(
    `
    SELECT
      id,
      project_id AS projectId,
      account_id AS accountId,
      owner_user_id AS ownerUserId,
      slug,
      title,
      excerpt,
      content_md AS contentMd,
      content_html AS contentHtml,
      status,
      author_name AS authorName,
      category,
      tags_json AS tagsJson,
      cover_image_url AS coverImageUrl,
      cover_image_alt AS coverImageAlt,
      seo_title AS seoTitle,
      seo_description AS seoDescription,
      theme_key AS themeKey,
      layout_key AS layoutKey,
      published_at AS publishedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM shpitto_blog_posts
    WHERE project_id = ?
      AND source_app = 'shpitto'
      AND status = 'published'
    ORDER BY COALESCE(published_at, updated_at) DESC, created_at DESC
    LIMIT ?;
    `,
    [projectId, Math.max(1, Math.min(50, limit))],
  );
  return rows.map(rowToPost);
}

export async function getProjectBlogSettings(projectId: string, userId?: string): Promise<BlogSettingsRecord | null> {
  const d1 = await ensureBlogSchemaReady();
  if (!d1.isConfigured()) return null;
  const params: unknown[] = [projectId];
  const ownerFilter = userId ? "AND owner_user_id = ?" : "";
  if (userId) params.push(userId);
  const row = await d1.queryOne<Record<string, unknown>>(
    `
    SELECT
      project_id AS projectId,
      account_id AS accountId,
      owner_user_id AS ownerUserId,
      enabled,
      nav_label AS navLabel,
      home_featured_count AS homeFeaturedCount,
      default_layout_key AS defaultLayoutKey,
      default_theme_key AS defaultThemeKey,
      rss_enabled AS rssEnabled,
      sitemap_enabled AS sitemapEnabled,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM shpitto_blog_settings
    WHERE project_id = ?
      ${ownerFilter}
      AND source_app = 'shpitto'
    LIMIT 1;
    `,
    params,
  );
  return row ? rowToSettings(row) : null;
}

export async function upsertProjectBlogSettings(params: {
  projectId: string;
  userId: string;
  enabled?: boolean;
  navLabel?: string;
  homeFeaturedCount?: number;
  defaultLayoutKey?: string;
  defaultThemeKey?: string;
  rssEnabled?: boolean;
  sitemapEnabled?: boolean;
}) {
  const d1 = await ensureBlogSchemaReady();
  if (!d1.isConfigured()) return null;
  const project = await ensureOwnedProject(params.projectId, params.userId);
  const now = nowIso();
  const existing = await getProjectBlogSettings(params.projectId, params.userId);
  await d1.execute(
    `
    INSERT INTO shpitto_blog_settings (
      project_id, account_id, owner_user_id, source_app, enabled, nav_label, home_featured_count,
      default_layout_key, default_theme_key, rss_enabled, sitemap_enabled, created_at, updated_at
    )
    VALUES (?, ?, ?, 'shpitto', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      account_id = excluded.account_id,
      owner_user_id = excluded.owner_user_id,
      source_app = excluded.source_app,
      enabled = excluded.enabled,
      nav_label = excluded.nav_label,
      home_featured_count = excluded.home_featured_count,
      default_layout_key = excluded.default_layout_key,
      default_theme_key = excluded.default_theme_key,
      rss_enabled = excluded.rss_enabled,
      sitemap_enabled = excluded.sitemap_enabled,
      updated_at = excluded.updated_at;
    `,
    [
      project.id,
      project.accountId,
      params.userId,
      params.enabled === false ? 0 : 1,
      normalizeText(params.navLabel, existing?.navLabel || "Blog"),
      Math.max(1, Math.min(12, Number(params.homeFeaturedCount || existing?.homeFeaturedCount || 3))),
      normalizeText(params.defaultLayoutKey, existing?.defaultLayoutKey || ""),
      normalizeText(params.defaultThemeKey, existing?.defaultThemeKey || ""),
      1,
      1,
      existing?.createdAt || now,
      now,
    ],
  );
  await syncProjectPublishedBlogArtifacts(params.projectId, params.userId).catch((error) => {
    console.warn(`[blog] syncProjectPublishedBlogArtifacts(settings) failed: ${String((error as any)?.message || error || "unknown")}`);
  });
  return getProjectBlogSettings(params.projectId, params.userId);
}

export async function upsertProjectBlogPost(params: {
  projectId: string;
  userId: string;
  postId?: string;
  input: BlogPostUpsertInput;
}) {
  const d1 = await ensureBlogSchemaReady();
  if (!d1.isConfigured()) return null;
  const project = await ensureOwnedProject(params.projectId, params.userId);
  const now = nowIso();
  const existing = params.postId
    ? await getProjectBlogPost({ projectId: params.projectId, userId: params.userId, postId: params.postId })
    : null;
  const normalized = normalizePostInput(params.input, existing);

  if (!normalized.contentMd.trim()) {
    throw new BlogValidationError("Blog content is required.");
  }

  const postId = existing?.id || params.postId || randomUUID();
  const revisionVersion = existing ? 2 : 1;
  const normalizedBase = { ...normalized };
  let persistedSlug = await resolveProjectUniqueSlug({
    projectId: params.projectId,
    userId: params.userId,
    desiredSlug: normalizedBase.slug,
    excludePostId: existing?.id || postId,
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await d1.execute(
        `
        INSERT INTO shpitto_blog_posts (
          id, project_id, account_id, owner_user_id, source_app, slug, title, excerpt, content_md, content_html,
          status, author_name, category, tags_json, cover_image_url, cover_image_alt, seo_title, seo_description,
          theme_key, layout_key, published_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, 'shpitto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          title = excluded.title,
          excerpt = excluded.excerpt,
          content_md = excluded.content_md,
          content_html = excluded.content_html,
          status = excluded.status,
          author_name = excluded.author_name,
          category = excluded.category,
          tags_json = excluded.tags_json,
          cover_image_url = excluded.cover_image_url,
          cover_image_alt = excluded.cover_image_alt,
          seo_title = excluded.seo_title,
          seo_description = excluded.seo_description,
          theme_key = excluded.theme_key,
          layout_key = excluded.layout_key,
          published_at = excluded.published_at,
          updated_at = excluded.updated_at;
        `,
        [
          postId,
          project.id,
          project.accountId,
          params.userId,
          persistedSlug,
          normalizedBase.title,
          normalizedBase.excerpt,
          normalizedBase.contentMd,
          normalizedBase.contentHtml,
          normalizedBase.status,
          normalizedBase.authorName,
          normalizedBase.category,
          JSON.stringify(normalizedBase.tags),
          normalizedBase.coverImageUrl,
          normalizedBase.coverImageAlt,
          normalizedBase.seoTitle,
          normalizedBase.seoDescription,
          normalizedBase.themeKey,
          normalizedBase.layoutKey,
          normalizedBase.publishedAt,
          existing?.createdAt || now,
          now,
        ],
      );
      break;
    } catch (error) {
      if (!isProjectSlugUniqueConflict(error) || attempt >= 3) {
        throw error;
      }
      persistedSlug = await resolveProjectUniqueSlug({
        projectId: params.projectId,
        userId: params.userId,
        desiredSlug: normalizedBase.slug,
        excludePostId: existing?.id || postId,
      });
    }
  }

  await d1.execute(
    `
    INSERT INTO shpitto_blog_post_revisions (
      id, post_id, project_id, account_id, owner_user_id, source_app, version, snapshot_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, 'shpitto', ?, ?, ?);
    `,
    [
      randomUUID(),
      postId,
      project.id,
      project.accountId,
      params.userId,
      revisionVersion,
      JSON.stringify({
        ...normalized,
        postId,
      }),
      now,
    ],
  );

  await syncProjectPublishedBlogArtifacts(params.projectId, params.userId).catch((error) => {
    console.warn(`[blog] syncProjectPublishedBlogArtifacts(post) failed: ${String((error as any)?.message || error || "unknown")}`);
  });
  return getProjectBlogPost({ projectId: params.projectId, userId: params.userId, postId });
}

export async function deleteProjectBlogPost(params: { projectId: string; userId: string; postId: string }) {
  const d1 = await ensureBlogSchemaReady();
  if (!d1.isConfigured()) return false;
  await ensureOwnedProject(params.projectId, params.userId);
  await d1.execute(
    `
    DELETE FROM shpitto_blog_posts
    WHERE id = ?
      AND project_id = ?
      AND owner_user_id = ?
      AND source_app = 'shpitto';
    `,
    [params.postId, params.projectId, params.userId],
  );
  await syncProjectPublishedBlogArtifacts(params.projectId, params.userId).catch((error) => {
    console.warn(`[blog] syncProjectPublishedBlogArtifacts(delete) failed: ${String((error as any)?.message || error || "unknown")}`);
  });
  return true;
}

export async function listProjectBlogAssets(params: {
  projectId: string;
  userId: string;
  postId: string;
}): Promise<BlogAssetRecord[]> {
  const d1 = await ensureBlogSchemaReady();
  if (!d1.isConfigured()) return [];
  await ensureOwnedProject(params.projectId, params.userId);
  const post = await getProjectBlogPost({
    projectId: params.projectId,
    userId: params.userId,
    postId: params.postId,
  });
  if (!post) throw new Error("Blog post not found or unauthorized.");

  const rows = await d1.query<Record<string, unknown>>(
    `
    SELECT
      id,
      post_id AS postId,
      project_id AS projectId,
      account_id AS accountId,
      owner_user_id AS ownerUserId,
      r2_object_key AS r2ObjectKey,
      mime_type AS mimeType,
      size_bytes AS sizeBytes,
      width,
      height,
      alt,
      caption,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM shpitto_blog_assets
    WHERE post_id = ?
      AND project_id = ?
      AND owner_user_id = ?
      AND source_app = 'shpitto'
    ORDER BY created_at DESC;
    `,
    [params.postId, params.projectId, params.userId],
  );
  return rows.map(rowToAsset);
}

export async function deleteProjectBlogAsset(params: {
  projectId: string;
  userId: string;
  postId: string;
  assetId: string;
}) {
  const d1 = await ensureBlogSchemaReady();
  if (!d1.isConfigured()) return false;

  const r2 = getR2Client();
  await ensureOwnedProject(params.projectId, params.userId);
  const row = await d1.queryOne<Record<string, unknown>>(
    `
    SELECT r2_object_key AS r2ObjectKey
    FROM shpitto_blog_assets
    WHERE id = ?
      AND post_id = ?
      AND project_id = ?
      AND owner_user_id = ?
      AND source_app = 'shpitto'
    LIMIT 1;
    `,
    [params.assetId, params.postId, params.projectId, params.userId],
  );
  if (!row) return false;

  const objectKey = normalizeText(row.r2ObjectKey);
  if (objectKey && r2.isConfigured()) {
    await r2.deleteObject(objectKey);
  }

  await d1.execute(
    `
    DELETE FROM shpitto_blog_assets
    WHERE id = ?
      AND post_id = ?
      AND project_id = ?
      AND owner_user_id = ?
      AND source_app = 'shpitto';
    `,
    [params.assetId, params.postId, params.projectId, params.userId],
  );
  await syncProjectPublishedBlogArtifacts(params.projectId, params.userId).catch((error) => {
    console.warn(`[blog] syncProjectPublishedBlogArtifacts(asset-delete) failed: ${String((error as any)?.message || error || "unknown")}`);
  });
  return true;
}

export async function uploadProjectBlogAsset(params: {
  projectId: string;
  userId: string;
  postId: string;
  fileName: string;
  body: Buffer;
  contentType?: string;
  alt?: string;
  caption?: string;
  setAsCover?: boolean;
}): Promise<BlogAssetRecord> {
  const d1 = await ensureBlogSchemaReady();
  if (!d1.isConfigured()) throw new Error("Cloudflare D1 is not configured.");

  const r2 = getR2Client();
  if (!r2.isConfigured()) throw new Error("Cloudflare R2 is not configured.");

  const project = await ensureOwnedProject(params.projectId, params.userId);
  const post = await getProjectBlogPost({
    projectId: params.projectId,
    userId: params.userId,
    postId: params.postId,
  });
  if (!post) throw new Error("Blog post not found or unauthorized.");

  const safeFileName = sanitizeObjectKeySegment(params.fileName, "image");
  const contentType = normalizeImageContentType(params.contentType || "", safeFileName);
  if (!contentType) throw new Error("Only image uploads are supported for blog assets.");

  const assetId = randomUUID();
  const now = nowIso();
  const objectKey = [
    "blog-assets",
    sanitizeObjectKeySegment(params.userId, "user"),
    sanitizeObjectKeySegment(params.projectId, "project"),
    sanitizeObjectKeySegment(params.postId, "post"),
    `${assetId}-${safeFileName}`,
  ].join("/");
  const publicUrl = r2.toPublicUrl(objectKey);
  if (!publicUrl) throw new Error("R2_PUBLIC_BASE_URL is required for public blog images.");

  await r2.putObject(objectKey, params.body, {
    contentType,
    cacheControl: "public, max-age=31536000, immutable",
  });

  await d1.execute(
    `
    INSERT INTO shpitto_blog_assets (
      id, post_id, project_id, account_id, owner_user_id, source_app, r2_object_key,
      mime_type, size_bytes, width, height, alt, caption, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 'shpitto', ?, ?, ?, NULL, NULL, ?, ?, ?, ?);
    `,
    [
      assetId,
      post.id,
      project.id,
      project.accountId,
      params.userId,
      objectKey,
      contentType,
      params.body.byteLength,
      normalizeText(params.alt || post.coverImageAlt || post.title),
      normalizeText(params.caption || ""),
      now,
      now,
    ],
  );

  if (params.setAsCover !== false) {
    await d1.execute(
      `
      UPDATE shpitto_blog_posts
      SET cover_image_url = ?,
          cover_image_alt = ?,
          updated_at = ?
      WHERE id = ?
        AND project_id = ?
        AND owner_user_id = ?
        AND source_app = 'shpitto';
      `,
      [
        publicUrl,
        normalizeText(params.alt || post.coverImageAlt || post.title),
        now,
        post.id,
        params.projectId,
        params.userId,
      ],
    );
  }

  await syncProjectPublishedBlogArtifacts(params.projectId, params.userId).catch((error) => {
    console.warn(`[blog] syncProjectPublishedBlogArtifacts(asset-upload) failed: ${String((error as any)?.message || error || "unknown")}`);
  });

  const row = await d1.queryOne<Record<string, unknown>>(
    `
    SELECT
      id,
      post_id AS postId,
      project_id AS projectId,
      account_id AS accountId,
      owner_user_id AS ownerUserId,
      r2_object_key AS r2ObjectKey,
      mime_type AS mimeType,
      size_bytes AS sizeBytes,
      width,
      height,
      alt,
      caption,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM shpitto_blog_assets
    WHERE id = ?
    LIMIT 1;
    `,
    [assetId],
  );
  if (!row) throw new Error("Blog asset upload did not persist.");
  return rowToAsset(row);
}

export async function publishDueScheduledBlogPosts(now = nowIso()) {
  const d1 = await ensureBlogSchemaReady();
  if (!d1.isConfigured()) return 0;
  const result = await d1.execute(
    `
    UPDATE shpitto_blog_posts
    SET status = 'published',
        updated_at = ?
    WHERE source_app = 'shpitto'
      AND status = 'scheduled'
      AND published_at IS NOT NULL
      AND published_at <= ?;
    `,
    [now, now],
  );
  return Number((result as any)?.meta?.changes || 0);
}

export function resolvePublicBlogProjectId() {
  return (
    process.env.SHPITTO_PUBLIC_BLOG_PROJECT_ID ||
    process.env.NEXT_PUBLIC_BLOG_PROJECT_ID ||
    process.env.SHPITTO_DEFAULT_BLOG_PROJECT_ID ||
    ""
  ).trim();
}

export async function getPublicBlogIndex(projectId?: string) {
  const resolvedProjectId = String(projectId || resolvePublicBlogProjectId() || "").trim();
  if (!resolvedProjectId) return BLOG_FALLBACK_POSTS;
  if (!getD1Client().isConfigured()) return BLOG_FALLBACK_POSTS;
  const settings = await getProjectBlogSettings(resolvedProjectId).catch(() => null);
  if (settings && !settings.enabled) return [];
  const posts = await listPublicBlogPosts(resolvedProjectId, 12).catch(() => []);
  return posts;
}

export async function getPublicBlogPost(projectId: string, slug: string) {
  const resolvedProjectId = String(projectId || resolvePublicBlogProjectId() || "").trim();
  if (!resolvedProjectId) {
    return BLOG_FALLBACK_POSTS.find((item) => item.slug === slug) || null;
  }
  if (!getD1Client().isConfigured()) {
    return BLOG_FALLBACK_POSTS.find((item) => item.slug === slug) || null;
  }
  const settings = await getProjectBlogSettings(resolvedProjectId).catch(() => null);
  if (settings && !settings.enabled) return null;
  const post = await getPublicBlogPostBySlug(resolvedProjectId, slug).catch(() => null);
  if (post) return post;
  return null;
}
