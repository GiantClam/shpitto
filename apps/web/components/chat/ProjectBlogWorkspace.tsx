"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, PencilLine, Plus, RefreshCcw, Search, Sparkles, Trash2, Upload } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { buildBlogExcerpt } from "@/lib/blog-markdown";
import type { BlogPostRecord, BlogPostUpsertInput } from "@/lib/blog-types";
import { BlogMilkdownEditor } from "./BlogMilkdownEditor";

type BlogListResponse = {
  ok: boolean;
  project?: {
    id: string;
    name: string;
  };
  settings?: {
    enabled?: boolean;
    navLabel?: string;
    homeFeaturedCount?: number;
    rssEnabled?: boolean;
    sitemapEnabled?: boolean;
  };
  posts?: BlogPostRecord[];
  error?: string;
};

type BlogSettingsForm = {
  enabled: boolean;
  navLabel: string;
  homeFeaturedCount: number;
};

type BlogAssetUploadResponse = {
  ok: boolean;
  asset?: {
    id: string;
    url: string;
    alt: string;
    r2ObjectKey: string;
  };
  error?: string;
};

type BlogAssetListResponse = {
  ok: boolean;
  assets?: Array<{
    id: string;
    url: string;
    alt: string;
    caption: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  }>;
  error?: string;
};

type BlogPublishPreviewResponse = {
  ok: boolean;
  preview?: {
    title: string;
    slug: string;
    excerpt: string;
    category: string;
    tags: string[];
    seoTitle: string;
    seoDescription: string;
    status: BlogPostRecord["status"];
  };
  error?: string;
};

type BlogItemForm = BlogPostUpsertInput & {
  status: BlogPostUpsertInput["status"];
};

type PublishFields = {
  slug: string;
  category: string;
  tags: string[];
};

type BlogWorkspaceCopy = {
  defaultNavLabel: string;
  untitledPost: string;
  draftTemplate: string;
  statusPublished: string;
  statusScheduled: string;
  statusDraft: string;
  statusArchived: string;
  loadPostsError: string;
  loadAssetsError: string;
  emptySaveError: string;
  savePostError: string;
  postPublished: string;
  postSaved: string;
  previewPublishError: string;
  creatingDraft: string;
  createDraftError: string;
  createDraftRetryHint: string;
  draftCreated: string;
  confirmDeletePost: string;
  deletePostError: string;
  postDeleted: string;
  postUnpublished: string;
  uploadCoverBeforeSelect: string;
  uploadCoverError: string;
  coverUploaded: string;
  confirmDeleteAsset: string;
  deleteAssetError: string;
  assetDeleted: string;
  saveSettingsError: string;
  settingsSaved: string;
  headerTitle: (projectTitle: string) => string;
  headerDescription: string;
  refresh: string;
  newPost: string;
  statsPosts: string;
  statsPublished: string;
  statsFeeds: string;
  statsFeedsValue: string;
  statsLocale: string;
  viewPublishedPost: string;
  settingsNavLabel: string;
  settingsFeatured: string;
  settingsEnabled: string;
  settingsSave: string;
  settingsSaving: string;
  settingsNote: string;
  searchPlaceholder: string;
  noPosts: string;
  lastModified: string;
  edit: string;
  publish: string;
  unpublish: string;
  backToList: string;
  creatingDraftRecord: string;
  unsavedDraft: string;
  saveChanges: string;
  saveDraft: string;
  publishedChangesSaved: string;
  draftSaved: string;
  delete: string;
  publishConfirmationTitle: string;
  publishConfirmationBody: string;
  publishPreviewRefreshing: string;
  publishPreviewReady: string;
  slug: string;
  slugPlaceholder: string;
  category: string;
  categoryPlaceholder: string;
  tags: string;
  tagsPlaceholder: string;
  cancel: string;
  confirmPublish: string;
  title: string;
  titlePlaceholder: string;
  theme: string;
  layout: string;
  coverImage: string;
  uploadCoverToR2: string;
  editorToolbarNote: string;
  blogCoverAlt: string;
  coverImageAlt: string;
  coverImageAltPlaceholder: string;
  markdownContent: string;
  editorOnly: string;
  loadingSelectedPost: string;
  blogImageAlt: string;
  r2Assets: string;
  loading: string;
  noUploadedAssets: string;
  selectPostForAssets: string;
  assetUrlCopied: string;
  copyUrl: string;
  themeOptions: Array<{ value: string; label: string }>;
  layoutOptions: Array<{ value: string; label: string }>;
};

const EMPTY_FORM: BlogItemForm = {
  title: "",
  slug: "",
  excerpt: "",
  contentMd: "",
  status: "draft",
  authorName: "",
  category: "",
  tags: [],
  coverImageUrl: "",
  coverImageAlt: "",
  seoTitle: "",
  seoDescription: "",
  themeKey: "",
  layoutKey: "",
  publishedAt: null,
};

const EMPTY_PUBLISH_FIELDS: PublishFields = {
  slug: "",
  category: "",
  tags: [],
};

function getBlogWorkspaceCopy(locale: Locale): BlogWorkspaceCopy {
  if (locale === "zh") {
    return {
      defaultNavLabel: "\u535a\u5ba2",
      untitledPost: "\u672a\u547d\u540d\u6587\u7ae0",
      draftTemplate: "# \u672a\u547d\u540d\u6587\u7ae0\n\n\u5728\u8fd9\u91cc\u5f00\u59cb\u64b0\u5199\u535a\u5ba2\u5185\u5bb9\u3002",
      statusPublished: "\u5df2\u53d1\u5e03",
      statusScheduled: "\u5df2\u5b9a\u65f6",
      statusDraft: "\u8349\u7a3f",
      statusArchived: "\u5df2\u5f52\u6863",
      loadPostsError: "\u52a0\u8f7d\u535a\u5ba2\u6587\u7ae0\u5931\u8d25\u3002",
      loadAssetsError: "\u52a0\u8f7d\u535a\u5ba2\u8d44\u4ea7\u5931\u8d25\u3002",
      emptySaveError: "\u8bf7\u5148\u586b\u5199\u6807\u9898\u6216\u5185\u5bb9\u518d\u4fdd\u5b58\u3002",
      savePostError: "\u4fdd\u5b58\u535a\u5ba2\u6587\u7ae0\u5931\u8d25\u3002",
      postPublished: "\u6587\u7ae0\u5df2\u53d1\u5e03\u3002",
      postSaved: "\u6587\u7ae0\u5df2\u4fdd\u5b58\u3002",
      previewPublishError: "\u751f\u6210\u53d1\u5e03\u9884\u89c8\u5931\u8d25\u3002",
      creatingDraft: "\u6b63\u5728\u521b\u5efa\u8349\u7a3f...",
      createDraftError: "\u521b\u5efa\u8349\u7a3f\u5931\u8d25\u3002",
      createDraftRetryHint: "\u4f60\u53ef\u4ee5\u7ee7\u7eed\u7f16\u8f91\u5e76\u518d\u6b21\u4fdd\u5b58\u3002",
      draftCreated: "\u8349\u7a3f\u5df2\u521b\u5efa\u3002",
      confirmDeletePost: "\u786e\u8ba4\u5220\u9664\u8fd9\u7bc7\u535a\u5ba2\u6587\u7ae0\u5417\uff1f",
      deletePostError: "\u5220\u9664\u535a\u5ba2\u6587\u7ae0\u5931\u8d25\u3002",
      postDeleted: "\u6587\u7ae0\u5df2\u5220\u9664\u3002",
      postUnpublished: "\u6587\u7ae0\u5df2\u53d6\u6d88\u53d1\u5e03\u3002",
      uploadCoverBeforeSelect: "\u8bf7\u5148\u521b\u5efa\u6216\u9009\u62e9\u6587\u7ae0\uff0c\u518d\u4e0a\u4f20\u5c01\u9762\u56fe\u3002",
      uploadCoverError: "\u4e0a\u4f20\u5c01\u9762\u56fe\u5931\u8d25\u3002",
      coverUploaded: "\u5c01\u9762\u56fe\u5df2\u4e0a\u4f20\u5230 R2\u3002",
      confirmDeleteAsset: "\u786e\u8ba4\u4ece R2 \u5220\u9664\u8fd9\u4e2a\u535a\u5ba2\u8d44\u4ea7\u5417\uff1f",
      deleteAssetError: "\u5220\u9664\u535a\u5ba2\u8d44\u4ea7\u5931\u8d25\u3002",
      assetDeleted: "\u535a\u5ba2\u8d44\u4ea7\u5df2\u5220\u9664\u3002",
      saveSettingsError: "\u4fdd\u5b58\u535a\u5ba2\u8bbe\u7f6e\u5931\u8d25\u3002",
      settingsSaved: "\u535a\u5ba2\u8bbe\u7f6e\u5df2\u4fdd\u5b58\u3002",
      headerTitle: (projectTitle) => `${projectTitle} \u535a\u5ba2`,
      headerDescription: "\u901a\u8fc7\u7b80\u5355\u7684\u7f16\u8f91\u6d41\u7a0b\u7ba1\u7406\u5bf9\u5916\u535a\u5ba2\uff1a\u5217\u8868\u3001\u7f16\u8f91\u3001\u53d1\u5e03\u3001\u53d6\u6d88\u53d1\u5e03\u3002",
      refresh: "\u5237\u65b0",
      newPost: "\u65b0\u5efa\u6587\u7ae0",
      statsPosts: "\u6587\u7ae0\u6570",
      statsPublished: "\u5df2\u53d1\u5e03",
      statsFeeds: "RSS / Sitemap",
      statsFeedsValue: "\u59cb\u7ec8\u5f00\u542f",
      statsLocale: "\u8bed\u8a00",
      viewPublishedPost: "\u67e5\u770b\u5df2\u53d1\u5e03\u6587\u7ae0",
      settingsNavLabel: "\u5bfc\u822a\u6807\u7b7e",
      settingsFeatured: "\u9996\u9875\u7cbe\u9009",
      settingsEnabled: "\u542f\u7528",
      settingsSave: "\u4fdd\u5b58\u8bbe\u7f6e",
      settingsSaving: "\u4fdd\u5b58\u4e2d...",
      settingsNote: "RSS \u548c sitemap \u9ed8\u8ba4\u4f1a\u4fdd\u6301\u542f\u7528\uff0c\u6b64\u5de5\u4f5c\u533a\u4e0d\u652f\u6301\u4fee\u6539\u3002",
      searchPlaceholder: "\u641c\u7d22\u6587\u7ae0...",
      noPosts: "\u6682\u65e0\u6587\u7ae0\u3002",
      lastModified: "\u6700\u540e\u4fee\u6539",
      edit: "\u7f16\u8f91",
      publish: "\u53d1\u5e03",
      unpublish: "\u53d6\u6d88\u53d1\u5e03",
      backToList: "\u8fd4\u56de\u5217\u8868",
      creatingDraftRecord: "\u6b63\u5728\u521b\u5efa\u8349\u7a3f\u8bb0\u5f55...",
      unsavedDraft: "\u672a\u4fdd\u5b58\u7684\u8349\u7a3f\u3002\u4fdd\u5b58\u540e\u5373\u53ef\u5728\u670d\u52a1\u7aef\u521b\u5efa\u8bb0\u5f55\u3002",
      saveChanges: "\u4fdd\u5b58\u4fee\u6539",
      saveDraft: "\u4fdd\u5b58\u8349\u7a3f",
      publishedChangesSaved: "\u5df2\u4fdd\u5b58\u5df2\u53d1\u5e03\u6587\u7ae0\u7684\u4fee\u6539\u3002",
      draftSaved: "\u8349\u7a3f\u5df2\u4fdd\u5b58\u3002",
      delete: "\u5220\u9664",
      publishConfirmationTitle: "\u53d1\u5e03\u786e\u8ba4",
      publishConfirmationBody: "\u5728\u6587\u7ae0\u516c\u5f00\u4e4b\u524d\uff0c\u8bf7\u786e\u8ba4 slug \u548c\u5206\u7c7b\u4fe1\u606f\u3002",
      publishPreviewRefreshing: "\u5237\u65b0\u4e2d...",
      publishPreviewReady: "\u670d\u52a1\u7aef\u53d1\u5e03\u9884\u89c8",
      slug: "Slug",
      slugPlaceholder: "article-slug",
      category: "\u5206\u7c7b",
      categoryPlaceholder: "\u5206\u7c7b\u540d\u79f0",
      tags: "\u6807\u7b7e",
      tagsPlaceholder: "tag-one, tag-two",
      cancel: "\u53d6\u6d88",
      confirmPublish: "\u786e\u8ba4\u53d1\u5e03",
      title: "\u6807\u9898",
      titlePlaceholder: "\u6587\u7ae0\u6807\u9898",
      theme: "\u4e3b\u9898",
      layout: "\u5e03\u5c40",
      coverImage: "\u5c01\u9762\u56fe",
      uploadCoverToR2: "\u4e0a\u4f20\u5c01\u9762\u5230 R2",
      editorToolbarNote: "\u53ef\u4ee5\u5728\u7f16\u8f91\u5668\u5de5\u5177\u680f\u91cc\u76f4\u63a5\u4e0a\u4f20\u884c\u5185\u56fe\u7247\u3002Slug \u548c\u5206\u7c7b\u4ec5\u5728\u53d1\u5e03\u65f6\u786e\u8ba4\u3002",
      blogCoverAlt: "\u535a\u5ba2\u5c01\u9762\u56fe",
      coverImageAlt: "\u5c01\u9762\u56fe\u66ff\u4ee3\u6587\u672c",
      coverImageAltPlaceholder: "\u63cf\u8ff0\u8fd9\u5f20\u5c01\u9762\u56fe",
      markdownContent: "Markdown \u5185\u5bb9",
      editorOnly: "\u4ec5\u7f16\u8f91\u5668\u6a21\u5f0f",
      loadingSelectedPost: "\u6b63\u5728\u52a0\u8f7d\u6240\u9009\u6587\u7ae0...",
      blogImageAlt: "\u535a\u5ba2\u56fe\u7247",
      r2Assets: "R2 \u8d44\u4ea7",
      loading: "\u52a0\u8f7d\u4e2d...",
      noUploadedAssets: "\u8fd9\u7bc7\u6587\u7ae0\u8fd8\u6ca1\u6709\u4e0a\u4f20\u8d44\u4ea7\u3002",
      selectPostForAssets: "\u8bf7\u5148\u521b\u5efa\u6216\u9009\u62e9\u4e00\u7bc7\u6587\u7ae0\u518d\u7ba1\u7406\u8d44\u4ea7\u3002",
      assetUrlCopied: "\u8d44\u4ea7 URL \u5df2\u590d\u5236\u3002",
      copyUrl: "\u590d\u5236 URL",
      themeOptions: [
        { value: "", label: "\u81ea\u52a8" },
        { value: "editorial", label: "\u7f16\u8f91\u98ce" },
        { value: "minimal", label: "\u6781\u7b80" },
        { value: "immersive", label: "\u6c89\u6d78\u5f0f" },
      ],
      layoutOptions: [
        { value: "", label: "\u81ea\u52a8" },
        { value: "feature", label: "\u4e13\u9898" },
        { value: "standard", label: "\u6807\u51c6" },
        { value: "grid", label: "\u7f51\u683c" },
      ],
    };
  }

  return {
    defaultNavLabel: "Blog",
    untitledPost: "Untitled post",
    draftTemplate: "# Untitled post\n\nStart writing your blog article here.",
    statusPublished: "Published",
    statusScheduled: "Scheduled",
    statusDraft: "Draft",
    statusArchived: "Archived",
    loadPostsError: "Failed to load blog posts.",
    loadAssetsError: "Failed to load blog assets.",
    emptySaveError: "Add a title or content before saving.",
    savePostError: "Failed to save blog post.",
    postPublished: "Post published.",
    postSaved: "Post saved.",
    previewPublishError: "Failed to preview publish taxonomy.",
    creatingDraft: "Creating draft...",
    createDraftError: "Failed to create draft post.",
    createDraftRetryHint: "You can keep editing and save again.",
    draftCreated: "Draft created.",
    confirmDeletePost: "Delete this blog post?",
    deletePostError: "Failed to delete blog post.",
    postDeleted: "Post deleted.",
    postUnpublished: "Post unpublished.",
    uploadCoverBeforeSelect: "Create or select a post before uploading a cover image.",
    uploadCoverError: "Failed to upload cover image.",
    coverUploaded: "Cover image uploaded to R2.",
    confirmDeleteAsset: "Delete this blog asset from R2?",
    deleteAssetError: "Failed to delete blog asset.",
    assetDeleted: "Blog asset deleted.",
    saveSettingsError: "Failed to save blog settings.",
    settingsSaved: "Blog settings saved.",
    headerTitle: (projectTitle) => `${projectTitle} Blog`,
    headerDescription: "Manage the public blog with a simple editor flow: list, edit, publish, unpublish.",
    refresh: "Refresh",
    newPost: "New post",
    statsPosts: "Posts",
    statsPublished: "Published",
    statsFeeds: "RSS / Sitemap",
    statsFeedsValue: "Always on",
    statsLocale: "Locale",
    viewPublishedPost: "View published post",
    settingsNavLabel: "Navigation label",
    settingsFeatured: "Featured",
    settingsEnabled: "Enabled",
    settingsSave: "Save settings",
    settingsSaving: "Saving...",
    settingsNote: "RSS and sitemap stay enabled by default and are not user-editable in this workspace.",
    searchPlaceholder: "Search posts...",
    noPosts: "No posts found.",
    lastModified: "Last modified",
    edit: "Edit",
    publish: "Publish",
    unpublish: "Unpublish",
    backToList: "Back to list",
    creatingDraftRecord: "Creating draft record...",
    unsavedDraft: "Unsaved draft. Save to create the server record.",
    saveChanges: "Save changes",
    saveDraft: "Save draft",
    publishedChangesSaved: "Published changes saved.",
    draftSaved: "Draft saved.",
    delete: "Delete",
    publishConfirmationTitle: "Publish confirmation",
    publishConfirmationBody: "Confirm slug and article taxonomy before the post goes public.",
    publishPreviewRefreshing: "Refreshing...",
    publishPreviewReady: "Server-side publish preview",
    slug: "Slug",
    slugPlaceholder: "article-slug",
    category: "Category",
    categoryPlaceholder: "Category",
    tags: "Tags",
    tagsPlaceholder: "tag-one, tag-two",
    cancel: "Cancel",
    confirmPublish: "Confirm publish",
    title: "Title",
    titlePlaceholder: "Article title",
    theme: "Theme",
    layout: "Layout",
    coverImage: "Cover image",
    uploadCoverToR2: "Upload cover to R2",
    editorToolbarNote: "Inline images can be uploaded directly from the editor toolbar. Slug and category are confirmed only at publish time.",
    blogCoverAlt: "Blog cover",
    coverImageAlt: "Cover image alt text",
    coverImageAltPlaceholder: "Describe the cover image",
    markdownContent: "Markdown content",
    editorOnly: "Editor mode only",
    loadingSelectedPost: "Loading selected post...",
    blogImageAlt: "Blog image",
    r2Assets: "R2 assets",
    loading: "Loading...",
    noUploadedAssets: "No uploaded assets for this post yet.",
    selectPostForAssets: "Create or select a post to manage assets.",
    assetUrlCopied: "Asset URL copied.",
    copyUrl: "Copy URL",
    themeOptions: [
      { value: "", label: "Auto" },
      { value: "editorial", label: "Editorial" },
      { value: "minimal", label: "Minimal" },
      { value: "immersive", label: "Immersive" },
    ],
    layoutOptions: [
      { value: "", label: "Auto" },
      { value: "feature", label: "Feature" },
      { value: "standard", label: "Standard" },
      { value: "grid", label: "Grid" },
    ],
  };
}

function buildDefaultSettingsForm(copy: BlogWorkspaceCopy): BlogSettingsForm {
  return {
    enabled: true,
    navLabel: copy.defaultNavLabel,
    homeFeaturedCount: 3,
  };
}

function buildDefaultDraftForm(copy: BlogWorkspaceCopy): BlogItemForm {
  return {
    ...EMPTY_FORM,
    title: copy.untitledPost,
    contentMd: copy.draftTemplate,
  };
}

function formatDateLabel(value: string, locale: Locale) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "-";
  return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTimeLabel(value: string, locale: Locale) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "-";
  return d.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

function normalizeTagInput(value: string) {
  return String(value || "")
    .split(/[\n,\uFF0C\u3001;\uFF1B|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sortBlogPosts(items: BlogPostRecord[]) {
  function statusRank(status: BlogPostRecord["status"]) {
    if (status === "published") return 0;
    if (status === "scheduled") return 1;
    if (status === "draft") return 2;
    return 3;
  }

  return [...items].sort((left, right) => {
    const rankDiff = statusRank(left.status) - statusRank(right.status);
    if (rankDiff !== 0) return rankDiff;
    const leftPrimary = Date.parse(left.publishedAt || left.updatedAt || left.createdAt || "") || 0;
    const rightPrimary = Date.parse(right.publishedAt || right.updatedAt || right.createdAt || "") || 0;
    if (rightPrimary !== leftPrimary) return rightPrimary - leftPrimary;
    const leftCreated = Date.parse(left.createdAt || "") || 0;
    const rightCreated = Date.parse(right.createdAt || "") || 0;
    return rightCreated - leftCreated;
  });
}

function buildFormFromPost(post: BlogPostRecord | null): BlogItemForm {
  if (!post) return { ...EMPTY_FORM };
  return {
    title: post.title || "",
    slug: post.slug || "",
    excerpt: post.excerpt || "",
    contentMd: post.contentMd || "",
    status: post.status || "draft",
    authorName: post.authorName || "",
    category: post.category || "",
    tags: post.tags || [],
    coverImageUrl: post.coverImageUrl || "",
    coverImageAlt: post.coverImageAlt || "",
    seoTitle: post.seoTitle || "",
    seoDescription: post.seoDescription || "",
    themeKey: post.themeKey || "",
    layoutKey: post.layoutKey || "",
    publishedAt: post.publishedAt || null,
  };
}

function statusTone(status: BlogPostRecord["status"]) {
  if (status === "published") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-700";
  if (status === "scheduled") return "border-amber-400/40 bg-amber-500/10 text-amber-700";
  if (status === "archived") return "border-slate-400/40 bg-slate-500/10 text-slate-700";
  return "border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_98%,var(--shp-bg)_2%)] text-[var(--shp-muted)]";
}

function statusLabel(status: BlogPostRecord["status"], copy: BlogWorkspaceCopy) {
  if (status === "published") return copy.statusPublished;
  if (status === "scheduled") return copy.statusScheduled;
  if (status === "archived") return copy.statusArchived;
  return copy.statusDraft;
}

function buildProjectPreviewBlogHref(projectId: string, slug?: string) {
  const base = `/api/projects/${encodeURIComponent(projectId)}/preview/blog`;
  return slug ? `${base}/${encodeURIComponent(slug)}/` : `${base}/`;
}

function buildPublishedBlogHref(projectId: string, previewUrl: string, slug?: string) {
  const fallback = buildProjectPreviewBlogHref(projectId, slug);
  const normalized = String(previewUrl || "").trim();
  if (!normalized) return fallback;

  const target = slug ? `blog/${encodeURIComponent(slug)}/` : "blog/";
  const absoluteUrlPattern = /^[a-z][a-z0-9+.-]*:\/\//i;
  const isAbsolute = absoluteUrlPattern.test(normalized);

  try {
    const base = new URL(normalized, "http://preview.local");
    if (/\/index\.html$/i.test(base.pathname)) {
      base.pathname = base.pathname.replace(/\/index\.html$/i, "/");
    } else if (!base.pathname.endsWith("/")) {
      base.pathname = `${base.pathname}/`;
    }
    base.search = "";
    base.hash = "";

    const resolved = new URL(target, base);
    return isAbsolute ? resolved.toString() : `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

export function ProjectBlogWorkspace({
  projectId,
  projectTitle,
  projectPreviewUrl = "",
  locale = "en",
}: {
  projectId: string;
  projectTitle: string;
  projectPreviewUrl?: string;
  locale?: Locale;
}) {
  const blogCopy = getBlogWorkspaceCopy(locale);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadingPublishPreview, setLoadingPublishPreview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [posts, setPosts] = useState<BlogPostRecord[]>([]);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [formSourcePostId, setFormSourcePostId] = useState("");
  const [form, setForm] = useState<BlogItemForm>(() => ({ ...EMPTY_FORM }));
  const [settingsForm, setSettingsForm] = useState<BlogSettingsForm>(() => buildDefaultSettingsForm(blogCopy));
  const [assets, setAssets] = useState<BlogAssetListResponse["assets"]>([]);
  const [viewMode, setViewMode] = useState<"list" | "editor">("list");
  const [publishPanelOpen, setPublishPanelOpen] = useState(false);
  const [publishFields, setPublishFields] = useState<PublishFields>(EMPTY_PUBLISH_FIELDS);
  const [publishPreview, setPublishPreview] = useState<BlogPublishPreviewResponse["preview"]>();
  const [publishPreviewError, setPublishPreviewError] = useState("");

  const selectedPost = useMemo(() => posts.find((item) => item.id === selectedPostId) || null, [posts, selectedPostId]);

  const filteredPosts = useMemo(() => {
    const keyword = String(search || "").trim().toLowerCase();
    if (!keyword) return posts;
    return posts.filter((post) => {
      const haystack = [post.title, post.slug, post.excerpt, post.category, post.authorName, post.status, ...(post.tags || [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [posts, search]);

  const featuredCount = posts.filter((post) => post.status === "published").length;
  const editorIsSyncing = Boolean(selectedPostId && formSourcePostId !== selectedPostId);

  const syncFormFromPost = useCallback((post: BlogPostRecord | null) => {
    const nextForm = buildFormFromPost(post);
    setForm(nextForm);
    setFormSourcePostId(post?.id || "");
  }, []);

  const resetPublishState = useCallback(() => {
    setPublishPanelOpen(false);
    setPublishPreview(undefined);
    setPublishPreviewError("");
    setPublishFields(EMPTY_PUBLISH_FIELDS);
    setLoadingPublishPreview(false);
  }, []);

  const enterEditor = useCallback(
    (post: BlogPostRecord) => {
      setSelectedPostId(post.id);
      syncFormFromPost(post);
      setViewMode("editor");
      resetPublishState();
    },
    [resetPublishState, syncFormFromPost],
  );

  const fetchPosts = useCallback(async () => {
    if (!projectId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/blog`, {
        cache: "no-store",
      });
      const data = (await res.json()) as BlogListResponse;
      if (!res.ok || !data.ok || !Array.isArray(data.posts)) {
        throw new Error(data.error || blogCopy.loadPostsError);
      }
      const nextPosts = sortBlogPosts(data.posts);
      setPosts(nextPosts);
      if (data.settings) {
        setSettingsForm({
          enabled: data.settings.enabled !== false,
          navLabel: data.settings.navLabel || blogCopy.defaultNavLabel,
          homeFeaturedCount: Math.max(1, Number(data.settings.homeFeaturedCount || 3)),
        });
      }
      setSelectedPostId((prev) => {
        if (prev && nextPosts.some((item) => item.id === prev)) return prev;
        return nextPosts[0]?.id || "";
      });
    } catch (err: any) {
      setPosts([]);
      setSelectedPostId("");
      setError(String(err?.message || err || blogCopy.loadPostsError));
    } finally {
      setLoading(false);
    }
  }, [blogCopy.defaultNavLabel, blogCopy.loadPostsError, projectId]);

  const fetchAssets = useCallback(async () => {
    if (!projectId.trim() || !selectedPostId.trim()) {
      setAssets([]);
      return;
    }
    setLoadingAssets(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/blog/${encodeURIComponent(selectedPostId)}/assets`,
        {
          cache: "no-store",
        },
      );
      const data = (await res.json()) as BlogAssetListResponse;
      if (!res.ok || !data.ok || !Array.isArray(data.assets)) {
        throw new Error(data.error || blogCopy.loadAssetsError);
      }
      setAssets(data.assets);
    } catch {
      setAssets([]);
    } finally {
      setLoadingAssets(false);
    }
  }, [blogCopy.loadAssetsError, projectId, selectedPostId]);

  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (viewMode !== "editor") return;
    if (!selectedPostId) {
      if (formSourcePostId) syncFormFromPost(null);
      return;
    }
    if (formSourcePostId === selectedPostId) return;
    syncFormFromPost(selectedPost);
  }, [formSourcePostId, selectedPost, selectedPostId, syncFormFromPost, viewMode]);

  useEffect(() => {
    if (viewMode !== "editor") return;
    void fetchAssets();
  }, [fetchAssets, viewMode]);

  function buildRequestInput(baseForm: BlogItemForm, options?: { nextStatus?: BlogPostRecord["status"]; publishFields?: Partial<PublishFields> }) {
    const nextTags = Array.isArray(options?.publishFields?.tags)
      ? options?.publishFields?.tags || []
      : Array.isArray(baseForm.tags)
        ? baseForm.tags
        : normalizeTagInput(String((baseForm.tags as any) || ""));

    return {
      ...baseForm,
      status: options?.nextStatus || baseForm.status || "draft",
      title: baseForm.title || blogCopy.untitledPost,
      slug: options?.publishFields?.slug ?? baseForm.slug ?? "",
      category: options?.publishFields?.category ?? baseForm.category ?? "",
      tags: nextTags,
      excerpt: baseForm.excerpt || buildBlogExcerpt(baseForm.contentMd || ""),
      contentMd: baseForm.contentMd || "",
      seoTitle: baseForm.seoTitle || "",
      seoDescription: baseForm.seoDescription || "",
    };
  }

  async function persistPost(options?: {
    postId?: string;
    baseForm?: BlogItemForm;
    nextStatus?: BlogPostRecord["status"];
    publishFields?: Partial<PublishFields>;
    successNotice?: string;
  }) {
    if (saving) return null;
    const baseForm = options?.baseForm || form;
    const postId = options?.postId || selectedPostId;
    if (!postId && !baseForm.title.trim() && !baseForm.contentMd.trim()) {
      setError(blogCopy.emptySaveError);
      return null;
    }
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const payload = {
        input: buildRequestInput(baseForm, {
          nextStatus: options?.nextStatus,
          publishFields: options?.publishFields,
        }),
      };
      const res = await fetch(
        postId
          ? `/api/projects/${encodeURIComponent(projectId)}/blog/${encodeURIComponent(postId)}`
          : `/api/projects/${encodeURIComponent(projectId)}/blog`,
        {
          method: postId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as { ok: boolean; post?: BlogPostRecord; error?: string };
      if (!res.ok || !data.ok || !data.post) {
        throw new Error(data.error || blogCopy.savePostError);
      }
      const nextPost = data.post;
      setNotice(options?.successNotice || (options?.nextStatus === "published" ? blogCopy.postPublished : blogCopy.postSaved));
      setPosts((prev) => sortBlogPosts([nextPost, ...prev.filter((item) => item.id !== nextPost.id)]));
      setSelectedPostId(nextPost.id);
      if (viewMode === "editor" || selectedPostId === nextPost.id) {
        syncFormFromPost(nextPost);
      }
      return nextPost;
    } catch (err: any) {
      setError(String(err?.message || err || blogCopy.savePostError));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function loadPublishPreview(baseForm?: BlogItemForm, postId?: string) {
    const sourceForm = baseForm || form;
    const sourcePost = postId ? posts.find((item) => item.id === postId) || null : selectedPost;
    setLoadingPublishPreview(true);
    setPublishPreview(undefined);
    setPublishPreviewError("");
    setPublishPanelOpen(true);
    try {
      const previewInput = buildRequestInput(sourceForm, {
        nextStatus: "published",
        publishFields: {
          slug: sourcePost?.status === "published" || sourcePost?.status === "scheduled" ? sourceForm.slug || "" : "",
          category: sourceForm.category || "",
          tags: sourceForm.tags || [],
        },
      });
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/blog/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: postId || selectedPostId || undefined,
          input: previewInput,
        }),
      });
      const data = (await res.json()) as BlogPublishPreviewResponse;
      if (!res.ok || !data.ok || !data.preview) {
        throw new Error(data.error || blogCopy.previewPublishError);
      }
      setPublishPreview(data.preview);
      setPublishFields({
        slug: data.preview.slug || "",
        category: data.preview.category || "",
        tags: data.preview.tags || [],
      });
    } catch (err: any) {
      setPublishPreviewError(String(err?.message || err || blogCopy.previewPublishError));
      setPublishFields({
        slug: sourcePost?.status === "published" || sourcePost?.status === "scheduled" ? sourceForm.slug || "" : "",
        category: sourceForm.category || "",
        tags: Array.isArray(sourceForm.tags) ? sourceForm.tags : [],
      });
    } finally {
      setLoadingPublishPreview(false);
    }
  }

  async function handleCreateDraft() {
    if (saving) return;
    const draftForm: BlogItemForm = {
      ...buildDefaultDraftForm(blogCopy),
    };
    setViewMode("editor");
    setSelectedPostId("");
    setForm(draftForm);
    setFormSourcePostId("");
    resetPublishState();
    setSaving(true);
    setNotice(blogCopy.creatingDraft);
    setError("");
    try {
      const payload = {
        input: draftForm,
      };
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/blog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok: boolean; post?: BlogPostRecord; error?: string };
      if (!res.ok || !data.ok || !data.post) {
        throw new Error(data.error || blogCopy.createDraftError);
      }
      const nextPost = data.post;
      setNotice(blogCopy.draftCreated);
      setPosts((prev) => sortBlogPosts([nextPost, ...prev.filter((item) => item.id !== nextPost.id)]));
      setSelectedPostId(nextPost.id);
      syncFormFromPost(nextPost);
    } catch (err: any) {
      setError(`${String(err?.message || err || blogCopy.createDraftError)} ${blogCopy.createDraftRetryHint}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedPostId || saving) return;
    if (typeof window !== "undefined" && !window.confirm(blogCopy.confirmDeletePost)) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const deletingId = selectedPostId;
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/blog/${encodeURIComponent(deletingId)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || blogCopy.deletePostError);
      }
      setNotice(blogCopy.postDeleted);
      let nextSelectedPostId = "";
      setPosts((prev) => {
        const nextPosts = prev.filter((item) => item.id !== deletingId);
        nextSelectedPostId = nextPosts[0]?.id || "";
        return nextPosts;
      });
      setSelectedPostId(nextSelectedPostId);
      setViewMode("list");
      syncFormFromPost(null);
      resetPublishState();
    } catch (err: any) {
      setError(String(err?.message || err || blogCopy.deletePostError));
    } finally {
      setSaving(false);
    }
  }

  async function handleUnpublish(post: BlogPostRecord) {
    await persistPost({
      postId: post.id,
      baseForm: buildFormFromPost(post),
      nextStatus: "draft",
      successNotice: blogCopy.postUnpublished,
    });
  }

  async function handleConfirmPublish() {
    const nextPost = await persistPost({
      postId: selectedPostId,
      baseForm: form,
      nextStatus: "published",
      publishFields,
      successNotice: blogCopy.postPublished,
    });
    if (nextPost) {
      resetPublishState();
    }
  }

  async function handleCoverImageUpload(file: File | null) {
    if (!file || uploadingCover) return;
    if (!selectedPostId) {
      setError(blogCopy.uploadCoverBeforeSelect);
      return;
    }
    setUploadingCover(true);
    setNotice("");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("alt", form.coverImageAlt || form.title || file.name);
      formData.append("setAsCover", "1");
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/blog/${encodeURIComponent(selectedPostId)}/assets`,
        {
          method: "POST",
          body: formData,
        },
      );
      const data = (await res.json()) as BlogAssetUploadResponse;
      if (!res.ok || !data.ok || !data.asset?.url) {
        throw new Error(data.error || blogCopy.uploadCoverError);
      }
      setForm((prev) => ({
        ...prev,
        coverImageUrl: data.asset?.url || prev.coverImageUrl,
        coverImageAlt: data.asset?.alt || prev.coverImageAlt || prev.title,
      }));
      setNotice(blogCopy.coverUploaded);
      await fetchPosts();
      await fetchAssets();
    } catch (err: any) {
      setError(String(err?.message || err || blogCopy.uploadCoverError));
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleDeleteAsset(assetId: string) {
    if (!selectedPostId || !assetId || loadingAssets) return;
    if (typeof window !== "undefined" && !window.confirm(blogCopy.confirmDeleteAsset)) return;
    setLoadingAssets(true);
    setNotice("");
    setError("");
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/blog/${encodeURIComponent(selectedPostId)}/assets?assetId=${encodeURIComponent(assetId)}`,
        {
          method: "DELETE",
        },
      );
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || blogCopy.deleteAssetError);
      }
      setNotice(blogCopy.assetDeleted);
      await fetchAssets();
    } catch (err: any) {
      setError(String(err?.message || err || blogCopy.deleteAssetError));
    } finally {
      setLoadingAssets(false);
    }
  }

  async function handleSettingsSave() {
    if (savingSettings) return;
    setSavingSettings(true);
    setNotice("");
    setError("");
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/blog/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            ...settingsForm,
            rssEnabled: true,
            sitemapEnabled: true,
          },
        }),
      });
      const data = (await res.json()) as { ok: boolean; settings?: BlogListResponse["settings"]; error?: string };
      if (!res.ok || !data.ok || !data.settings) {
        throw new Error(data.error || blogCopy.saveSettingsError);
      }
      setSettingsForm({
        enabled: data.settings.enabled !== false,
        navLabel: data.settings.navLabel || blogCopy.defaultNavLabel,
        homeFeaturedCount: Math.max(1, Number(data.settings.homeFeaturedCount || 3)),
      });
      setNotice(blogCopy.settingsSaved);
    } catch (err: any) {
      setError(String(err?.message || err || blogCopy.saveSettingsError));
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-[var(--shp-text)]">{blogCopy.headerTitle(projectTitle)}</h3>
            <p className="mt-1 text-sm text-[var(--shp-muted)]">
              {blogCopy.headerDescription}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void fetchPosts()}
              className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)] hover:text-[var(--shp-text)]"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              {blogCopy.refresh}
            </button>
            <button
              type="button"
              onClick={() => void handleCreateDraft()}
              className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,var(--shp-surface)_86%)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_22%,var(--shp-surface)_78%)]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {blogCopy.newPost}
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--shp-muted)]">{blogCopy.statsPosts}</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--shp-text)]">{posts.length}</p>
          </div>
          <div className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--shp-muted)]">{blogCopy.statsPublished}</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--shp-text)]">{featuredCount}</p>
          </div>
          <div className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--shp-muted)]">{blogCopy.statsFeeds}</p>
            <p className="mt-1 text-sm text-[var(--shp-text)]">{blogCopy.statsFeedsValue}</p>
          </div>
          <div className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--shp-muted)]">{blogCopy.statsLocale}</p>
            <p className="mt-1 text-sm text-[var(--shp-text)]">{locale.toUpperCase()}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-3">
          <div className="grid gap-3 md:grid-cols-[1fr_120px_auto_auto]">
            <label className="space-y-1 text-xs">
              <span className="text-[var(--shp-muted)]">{blogCopy.settingsNavLabel}</span>
              <input
                value={settingsForm.navLabel}
                onChange={(event) => setSettingsForm((prev) => ({ ...prev, navLabel: event.target.value }))}
                className="h-9 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none"
                placeholder={blogCopy.defaultNavLabel}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-[var(--shp-muted)]">{blogCopy.settingsFeatured}</span>
              <input
                type="number"
                min={1}
                max={12}
                value={settingsForm.homeFeaturedCount}
                onChange={(event) => setSettingsForm((prev) => ({ ...prev, homeFeaturedCount: Number(event.target.value || 3) }))}
                className="h-9 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none"
              />
            </label>
            <label className="flex items-center gap-2 self-end text-xs text-[var(--shp-muted)]">
              <input
                type="checkbox"
                checked={settingsForm.enabled}
                onChange={(event) => setSettingsForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              {blogCopy.settingsEnabled}
            </label>
            <button
              type="button"
              onClick={() => void handleSettingsSave()}
              disabled={savingSettings}
              className="self-end rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingSettings ? blogCopy.settingsSaving : blogCopy.settingsSave}
            </button>
          </div>
          <p className="mt-3 text-xs text-[var(--shp-muted)]">
            {blogCopy.settingsNote}
          </p>
        </div>

        {notice ? (
          <div className="mt-4 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>

      {viewMode === "list" ? (
        <section className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-[var(--shp-muted)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={blogCopy.searchPlaceholder}
              className="h-10 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
            />
          </div>

          <div className="mt-4 space-y-3">
            {filteredPosts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-4 py-8 text-center text-sm text-[var(--shp-muted)]">
                {blogCopy.noPosts}
              </div>
            ) : (
              filteredPosts.map((post) => (
                <article
                  key={post.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => enterEditor(post)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      enterEditor(post);
                    }
                  }}
                  className="cursor-pointer rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-bg)_4%)] p-4 transition-colors hover:bg-[color-mix(in_oklab,var(--shp-surface)_100%,var(--shp-bg)_0%)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-[var(--shp-text)]">{post.title || blogCopy.untitledPost}</p>
                        <span className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${statusTone(post.status)}`}>
                          {statusLabel(post.status, blogCopy)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--shp-muted)]">
                        {blogCopy.lastModified} {formatDateTimeLabel(post.updatedAt || post.createdAt, locale)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {post.status === "published" && post.slug ? (
                        <a
                          href={buildPublishedBlogHref(projectId, projectPreviewUrl, post.slug)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-xs text-[var(--shp-text)]"
                        >
                          <RefreshCcw className="h-3.5 w-3.5" />
                          {blogCopy.viewPublishedPost}
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          enterEditor(post);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-xs text-[var(--shp-text)]"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        {blogCopy.edit}
                      </button>
                      {post.status === "published" || post.status === "scheduled" ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleUnpublish(post);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 px-3 py-2 text-xs text-amber-700"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                          {blogCopy.unpublish}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            enterEditor(post);
                            void loadPublishPreview(buildFormFromPost(post), post.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-surface)_90%)] px-3 py-2 text-xs font-semibold text-[var(--shp-text)]"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {blogCopy.publish}
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 line-clamp-2 text-sm text-[var(--shp-muted)]">
                    {post.excerpt || buildBlogExcerpt(post.contentMd || "")}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-4 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <button
                type="button"
                onClick={() => {
                  setViewMode("list");
                  resetPublishState();
                }}
                className="inline-flex items-center gap-2 text-sm text-[var(--shp-primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                {blogCopy.backToList}
              </button>
              <h4 className="mt-3 text-xl font-semibold text-[var(--shp-text)]">
                {selectedPost ? selectedPost.title || blogCopy.untitledPost : form.title || blogCopy.untitledPost}
              </h4>
              <p className="mt-1 text-xs text-[var(--shp-muted)]">
                {selectedPost
                  ? `${blogCopy.lastModified} ${formatDateTimeLabel(selectedPost.updatedAt || selectedPost.createdAt, locale)}`
                  : saving
                    ? blogCopy.creatingDraftRecord
                    : blogCopy.unsavedDraft}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedPost?.status === "published" && selectedPost.slug ? (
                <a
                  href={buildPublishedBlogHref(projectId, projectPreviewUrl, selectedPost.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)] hover:text-[var(--shp-text)]"
                >
                  <RefreshCcw className="h-4 w-4" />
                  {blogCopy.viewPublishedPost}
                </a>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  void persistPost({
                    nextStatus: selectedPost?.status || form.status || "draft",
                    successNotice: selectedPost?.status === "published" ? blogCopy.publishedChangesSaved : blogCopy.draftSaved,
                  })
                }
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)] hover:text-[var(--shp-text)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {selectedPost?.status === "published" ? blogCopy.saveChanges : blogCopy.saveDraft}
              </button>
              {selectedPost?.status === "published" || selectedPost?.status === "scheduled" ? (
                <button
                  type="button"
                  onClick={() => selectedPost && void handleUnpublish(selectedPost)}
                  disabled={saving || !selectedPost}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 px-3 py-2 text-sm text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {blogCopy.unpublish}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void loadPublishPreview()}
                  disabled={saving || !selectedPostId}
                  className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,var(--shp-surface)_86%)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_22%,var(--shp-surface)_78%)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {blogCopy.publish}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={saving || !selectedPostId}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-400/40 px-3 py-2 text-sm text-rose-700 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {blogCopy.delete}
              </button>
            </div>
          </div>

          {publishPanelOpen ? (
            <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_8%,var(--shp-surface)_92%)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h5 className="text-sm font-semibold text-[var(--shp-text)]">{blogCopy.publishConfirmationTitle}</h5>
                  <p className="mt-1 text-xs text-[var(--shp-muted)]">
                    {blogCopy.publishConfirmationBody}
                  </p>
                </div>
                <span className="text-xs text-[var(--shp-muted)]">
                  {loadingPublishPreview ? blogCopy.publishPreviewRefreshing : blogCopy.publishPreviewReady}
                </span>
              </div>

              {publishPreviewError ? (
                <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
                  {publishPreviewError}
                </div>
              ) : null}

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-[var(--shp-muted)]">{blogCopy.slug}</span>
                  <input
                    value={publishFields.slug}
                    onChange={(event) => setPublishFields((prev) => ({ ...prev, slug: event.target.value }))}
                    className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                    placeholder={blogCopy.slugPlaceholder}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-[var(--shp-muted)]">{blogCopy.category}</span>
                  <input
                    value={publishFields.category}
                    onChange={(event) => setPublishFields((prev) => ({ ...prev, category: event.target.value }))}
                    className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                    placeholder={blogCopy.categoryPlaceholder}
                  />
                </label>
                <label className="space-y-2 text-sm md:col-span-2">
                  <span className="text-[var(--shp-muted)]">{blogCopy.tags}</span>
                  <input
                    value={publishFields.tags.join(", ")}
                    onChange={(event) => setPublishFields((prev) => ({ ...prev, tags: normalizeTagInput(event.target.value) }))}
                    className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                    placeholder={blogCopy.tagsPlaceholder}
                  />
                </label>
              </div>

              {publishPreview ? (
                <div className="mt-4 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-bg)_4%)] p-3 text-sm">
                  <p className="font-medium text-[var(--shp-text)]">{publishPreview.seoTitle || form.title || blogCopy.untitledPost}</p>
                  <p className="mt-1 text-xs text-[var(--shp-muted)]">{publishPreview.seoDescription || "-"}</p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={resetPublishState}
                  className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)]"
                >
                  {blogCopy.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmPublish()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,var(--shp-surface)_86%)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {blogCopy.confirmPublish}
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm md:col-span-2">
              <span className="text-[var(--shp-muted)]">{blogCopy.title}</span>
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                placeholder={blogCopy.titlePlaceholder}
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-[var(--shp-muted)]">{blogCopy.theme}</span>
              <select
                value={form.themeKey || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, themeKey: event.target.value }))}
                className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
              >
                {blogCopy.themeOptions.map((option) => (
                  <option key={option.value || "auto"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-[var(--shp-muted)]">{blogCopy.layout}</span>
              <select
                value={form.layoutKey || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, layoutKey: event.target.value }))}
                className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
              >
                {blogCopy.layoutOptions.map((option) => (
                  <option key={option.value || "auto"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm md:col-span-2">
              <span className="text-[var(--shp-muted)]">{blogCopy.coverImage}</span>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-surface)_90%)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_18%,var(--shp-surface)_82%)]">
                  {uploadingCover ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {blogCopy.uploadCoverToR2}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif"
                    className="hidden"
                    disabled={uploadingCover || !selectedPostId}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] || null;
                      event.currentTarget.value = "";
                      void handleCoverImageUpload(file);
                    }}
                  />
                </label>
                <span className="text-xs text-[var(--shp-muted)]">
                  {blogCopy.editorToolbarNote}
                </span>
              </div>
              {form.coverImageUrl ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.coverImageUrl} alt={form.coverImageAlt || form.title || blogCopy.blogCoverAlt} className="max-h-56 w-full object-cover" />
                </div>
              ) : null}
            </label>

            <label className="space-y-2 text-sm md:col-span-2">
              <span className="text-[var(--shp-muted)]">{blogCopy.coverImageAlt}</span>
              <input
                value={form.coverImageAlt || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, coverImageAlt: event.target.value }))}
                className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                placeholder={blogCopy.coverImageAltPlaceholder}
              />
            </label>

            <div className="space-y-2 text-sm md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[var(--shp-muted)]">{blogCopy.markdownContent}</span>
                <span className="text-xs text-[var(--shp-muted)]">{blogCopy.editorOnly}</span>
              </div>
              {editorIsSyncing ? (
                <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_54%,transparent)] px-4 py-12 text-center text-sm text-[var(--shp-muted)]">
                  {blogCopy.loadingSelectedPost}
                </div>
              ) : (
                <BlogMilkdownEditor
                  key={selectedPostId || "new-blog-post"}
                  value={form.contentMd || ""}
                  disabled={saving}
                  imageUploadUrl={
                    selectedPostId
                      ? `/api/projects/${encodeURIComponent(projectId)}/blog/${encodeURIComponent(selectedPostId)}/assets`
                      : undefined
                  }
                  imageAltText={form.title || form.coverImageAlt || blogCopy.blogImageAlt}
                  onChange={(contentMd) => {
                    setForm((prev) => (prev.contentMd === contentMd ? prev : { ...prev, contentMd }));
                  }}
                />
              )}
            </div>
          </div>

          <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-4">
            <div className="flex items-center justify-between gap-2">
              <h5 className="text-sm font-semibold text-[var(--shp-text)]">{blogCopy.r2Assets}</h5>
              <button
                type="button"
                onClick={() => void fetchAssets()}
                disabled={loadingAssets || !selectedPostId}
                className="text-xs text-[var(--shp-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingAssets ? blogCopy.loading : blogCopy.refresh}
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {(assets || []).length === 0 ? (
                <p className="text-xs text-[var(--shp-muted)]">
                  {selectedPostId ? blogCopy.noUploadedAssets : blogCopy.selectPostForAssets}
                </p>
              ) : (
                (assets || []).map((asset) => (
                  <div
                    key={asset.id}
                    className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_98%,var(--shp-bg)_2%)] p-2"
                  >
                    <p className="truncate text-xs font-medium text-[var(--shp-text)]">{asset.alt || asset.url}</p>
                    <p className="mt-1 truncate text-[11px] text-[var(--shp-muted)]">{asset.url}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(asset.url);
                          setNotice(blogCopy.assetUrlCopied);
                        }}
                        className="rounded border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-2 py-1 text-[11px] text-[var(--shp-muted)]"
                      >
                        {blogCopy.copyUrl}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteAsset(asset.id)}
                        className="rounded border border-rose-400/40 px-2 py-1 text-[11px] text-rose-700"
                      >
                        {blogCopy.delete}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>
      )}
    </div>
  );
}
