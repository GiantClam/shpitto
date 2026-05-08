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

const DEFAULT_SETTINGS_FORM: BlogSettingsForm = {
  enabled: true,
  navLabel: "Blog",
  homeFeaturedCount: 3,
};

const EMPTY_PUBLISH_FIELDS: PublishFields = {
  slug: "",
  category: "",
  tags: [],
};

const DEFAULT_DRAFT_FORM: BlogItemForm = {
  ...EMPTY_FORM,
  title: "Untitled post",
  contentMd: "# Untitled post\n\nStart writing your blog article here.",
};

const THEME_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "editorial", label: "Editorial" },
  { value: "minimal", label: "Minimal" },
  { value: "immersive", label: "Immersive" },
];

const LAYOUT_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "feature", label: "Feature" },
  { value: "standard", label: "Standard" },
  { value: "grid", label: "Grid" },
];

function formatDateLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "-";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTimeLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "-";
  return d.toLocaleString();
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

export function ProjectBlogWorkspace({
  projectId,
  projectTitle,
  locale = "en",
}: {
  projectId: string;
  projectTitle: string;
  locale?: Locale;
}) {
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
  const [form, setForm] = useState<BlogItemForm>(EMPTY_FORM);
  const [settingsForm, setSettingsForm] = useState<BlogSettingsForm>(DEFAULT_SETTINGS_FORM);
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
        throw new Error(data.error || "Failed to load blog posts.");
      }
      const nextPosts = sortBlogPosts(data.posts);
      setPosts(nextPosts);
      if (data.settings) {
        setSettingsForm({
          enabled: data.settings.enabled !== false,
          navLabel: data.settings.navLabel || "Blog",
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
      setError(String(err?.message || err || "Failed to load blog posts."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

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
        throw new Error(data.error || "Failed to load blog assets.");
      }
      setAssets(data.assets);
    } catch {
      setAssets([]);
    } finally {
      setLoadingAssets(false);
    }
  }, [projectId, selectedPostId]);

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
      title: baseForm.title || "Untitled post",
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
      setError("Add a title or content before saving.");
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
        throw new Error(data.error || "Failed to save blog post.");
      }
      const nextPost = data.post;
      setNotice(options?.successNotice || (options?.nextStatus === "published" ? "Post published." : "Post saved."));
      setPosts((prev) => sortBlogPosts([nextPost, ...prev.filter((item) => item.id !== nextPost.id)]));
      setSelectedPostId(nextPost.id);
      if (viewMode === "editor" || selectedPostId === nextPost.id) {
        syncFormFromPost(nextPost);
      }
      return nextPost;
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to save blog post."));
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
        throw new Error(data.error || "Failed to preview publish taxonomy.");
      }
      setPublishPreview(data.preview);
      setPublishFields({
        slug: data.preview.slug || "",
        category: data.preview.category || "",
        tags: data.preview.tags || [],
      });
    } catch (err: any) {
      setPublishPreviewError(String(err?.message || err || "Failed to preview publish taxonomy."));
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
      ...DEFAULT_DRAFT_FORM,
    };
    setViewMode("editor");
    setSelectedPostId("");
    setForm(draftForm);
    setFormSourcePostId("");
    resetPublishState();
    setSaving(true);
    setNotice("Creating draft...");
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
        throw new Error(data.error || "Failed to create draft post.");
      }
      const nextPost = data.post;
      setNotice("Draft created.");
      setPosts((prev) => sortBlogPosts([nextPost, ...prev.filter((item) => item.id !== nextPost.id)]));
      setSelectedPostId(nextPost.id);
      syncFormFromPost(nextPost);
    } catch (err: any) {
      setError(`${String(err?.message || err || "Failed to create draft post.")} You can keep editing and save again.`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedPostId || saving) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this blog post?")) return;
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
        throw new Error(data.error || "Failed to delete blog post.");
      }
      setNotice("Post deleted.");
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
      setError(String(err?.message || err || "Failed to delete blog post."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUnpublish(post: BlogPostRecord) {
    await persistPost({
      postId: post.id,
      baseForm: buildFormFromPost(post),
      nextStatus: "draft",
      successNotice: "Post unpublished.",
    });
  }

  async function handleConfirmPublish() {
    const nextPost = await persistPost({
      postId: selectedPostId,
      baseForm: form,
      nextStatus: "published",
      publishFields,
      successNotice: "Post published.",
    });
    if (nextPost) {
      resetPublishState();
    }
  }

  async function handleCoverImageUpload(file: File | null) {
    if (!file || uploadingCover) return;
    if (!selectedPostId) {
      setError("Create or select a post before uploading a cover image.");
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
        throw new Error(data.error || "Failed to upload cover image.");
      }
      setForm((prev) => ({
        ...prev,
        coverImageUrl: data.asset?.url || prev.coverImageUrl,
        coverImageAlt: data.asset?.alt || prev.coverImageAlt || prev.title,
      }));
      setNotice("Cover image uploaded to R2.");
      await fetchPosts();
      await fetchAssets();
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to upload cover image."));
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleDeleteAsset(assetId: string) {
    if (!selectedPostId || !assetId || loadingAssets) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this blog asset from R2?")) return;
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
        throw new Error(data.error || "Failed to delete blog asset.");
      }
      setNotice("Blog asset deleted.");
      await fetchAssets();
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to delete blog asset."));
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
        throw new Error(data.error || "Failed to save blog settings.");
      }
      setSettingsForm({
        enabled: data.settings.enabled !== false,
        navLabel: data.settings.navLabel || "Blog",
        homeFeaturedCount: Math.max(1, Number(data.settings.homeFeaturedCount || 3)),
      });
      setNotice("Blog settings saved.");
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to save blog settings."));
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-[var(--shp-text)]">{projectTitle} Blog</h3>
            <p className="mt-1 text-sm text-[var(--shp-muted)]">
              Manage the public blog with a simple editor flow: list, edit, publish, unpublish.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void fetchPosts()}
              className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)] hover:text-[var(--shp-text)]"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleCreateDraft()}
              className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,var(--shp-surface)_86%)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_22%,var(--shp-surface)_78%)]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              New post
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--shp-muted)]">Posts</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--shp-text)]">{posts.length}</p>
          </div>
          <div className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--shp-muted)]">Published</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--shp-text)]">{featuredCount}</p>
          </div>
          <div className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--shp-muted)]">RSS / Sitemap</p>
            <p className="mt-1 text-sm text-[var(--shp-text)]">Always on</p>
          </div>
          <div className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--shp-muted)]">Locale</p>
            <p className="mt-1 text-sm text-[var(--shp-text)]">{locale.toUpperCase()}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-3">
          <div className="grid gap-3 md:grid-cols-[1fr_120px_auto_auto]">
            <label className="space-y-1 text-xs">
              <span className="text-[var(--shp-muted)]">Navigation label</span>
              <input
                value={settingsForm.navLabel}
                onChange={(event) => setSettingsForm((prev) => ({ ...prev, navLabel: event.target.value }))}
                className="h-9 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none"
                placeholder="Blog"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-[var(--shp-muted)]">Featured</span>
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
              Enabled
            </label>
            <button
              type="button"
              onClick={() => void handleSettingsSave()}
              disabled={savingSettings}
              className="self-end rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingSettings ? "Saving..." : "Save settings"}
            </button>
          </div>
          <p className="mt-3 text-xs text-[var(--shp-muted)]">
            RSS and sitemap stay enabled by default and are not user-editable in this workspace.
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
              placeholder="Search posts..."
              className="h-10 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
            />
          </div>

          <div className="mt-4 space-y-3">
            {filteredPosts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-4 py-8 text-center text-sm text-[var(--shp-muted)]">
                No posts found.
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
                        <p className="truncate font-semibold text-[var(--shp-text)]">{post.title || "Untitled post"}</p>
                        <span className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${statusTone(post.status)}`}>
                          {post.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--shp-muted)]">Last modified {formatDateTimeLabel(post.updatedAt || post.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          enterEditor(post);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-xs text-[var(--shp-text)]"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        Edit
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
                          Unpublish
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
                          Publish
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
                Back to list
              </button>
              <h4 className="mt-3 text-xl font-semibold text-[var(--shp-text)]">
                {selectedPost ? selectedPost.title || "Untitled post" : form.title || "Untitled post"}
              </h4>
              <p className="mt-1 text-xs text-[var(--shp-muted)]">
                {selectedPost
                  ? `Last modified ${formatDateTimeLabel(selectedPost.updatedAt || selectedPost.createdAt)}`
                  : saving
                    ? "Creating draft record..."
                    : "Unsaved draft. Save to create the server record."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void persistPost({
                    nextStatus: selectedPost?.status || form.status || "draft",
                    successNotice: selectedPost?.status === "published" ? "Published changes saved." : "Draft saved.",
                  })
                }
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)] hover:text-[var(--shp-text)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {selectedPost?.status === "published" ? "Save changes" : "Save draft"}
              </button>
              {selectedPost?.status === "published" || selectedPost?.status === "scheduled" ? (
                <button
                  type="button"
                  onClick={() => selectedPost && void handleUnpublish(selectedPost)}
                  disabled={saving || !selectedPost}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 px-3 py-2 text-sm text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Unpublish
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void loadPublishPreview()}
                  disabled={saving || !selectedPostId}
                  className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,var(--shp-surface)_86%)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_22%,var(--shp-surface)_78%)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  Publish
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={saving || !selectedPostId}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-400/40 px-3 py-2 text-sm text-rose-700 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>

          {publishPanelOpen ? (
            <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_8%,var(--shp-surface)_92%)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h5 className="text-sm font-semibold text-[var(--shp-text)]">Publish confirmation</h5>
                  <p className="mt-1 text-xs text-[var(--shp-muted)]">
                    Confirm slug and article taxonomy before the post goes public.
                  </p>
                </div>
                <span className="text-xs text-[var(--shp-muted)]">
                  {loadingPublishPreview ? "Refreshing..." : "Server-side publish preview"}
                </span>
              </div>

              {publishPreviewError ? (
                <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
                  {publishPreviewError}
                </div>
              ) : null}

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-[var(--shp-muted)]">Slug</span>
                  <input
                    value={publishFields.slug}
                    onChange={(event) => setPublishFields((prev) => ({ ...prev, slug: event.target.value }))}
                    className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                    placeholder="article-slug"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-[var(--shp-muted)]">Category</span>
                  <input
                    value={publishFields.category}
                    onChange={(event) => setPublishFields((prev) => ({ ...prev, category: event.target.value }))}
                    className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                    placeholder="Category"
                  />
                </label>
                <label className="space-y-2 text-sm md:col-span-2">
                  <span className="text-[var(--shp-muted)]">Tags</span>
                  <input
                    value={publishFields.tags.join(", ")}
                    onChange={(event) => setPublishFields((prev) => ({ ...prev, tags: normalizeTagInput(event.target.value) }))}
                    className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                    placeholder="tag-one, tag-two"
                  />
                </label>
              </div>

              {publishPreview ? (
                <div className="mt-4 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-bg)_4%)] p-3 text-sm">
                  <p className="font-medium text-[var(--shp-text)]">{publishPreview.seoTitle || form.title || "Untitled post"}</p>
                  <p className="mt-1 text-xs text-[var(--shp-muted)]">{publishPreview.seoDescription || "-"}</p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={resetPublishState}
                  className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmPublish()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,var(--shp-surface)_86%)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Confirm publish
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm md:col-span-2">
              <span className="text-[var(--shp-muted)]">Title</span>
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                placeholder="Article title"
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-[var(--shp-muted)]">Theme</span>
              <select
                value={form.themeKey || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, themeKey: event.target.value }))}
                className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
              >
                {THEME_OPTIONS.map((option) => (
                  <option key={option.value || "auto"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-[var(--shp-muted)]">Layout</span>
              <select
                value={form.layoutKey || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, layoutKey: event.target.value }))}
                className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
              >
                {LAYOUT_OPTIONS.map((option) => (
                  <option key={option.value || "auto"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm md:col-span-2">
              <span className="text-[var(--shp-muted)]">Cover image</span>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-surface)_90%)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_18%,var(--shp-surface)_82%)]">
                  {uploadingCover ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload cover to R2
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
                  Inline images can be uploaded directly from the editor toolbar. Slug and category are confirmed only at publish time.
                </span>
              </div>
              {form.coverImageUrl ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.coverImageUrl} alt={form.coverImageAlt || form.title || "Blog cover"} className="max-h-56 w-full object-cover" />
                </div>
              ) : null}
            </label>

            <label className="space-y-2 text-sm md:col-span-2">
              <span className="text-[var(--shp-muted)]">Cover image alt text</span>
              <input
                value={form.coverImageAlt || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, coverImageAlt: event.target.value }))}
                className="h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
                placeholder="Describe the cover image"
              />
            </label>

            <div className="space-y-2 text-sm md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[var(--shp-muted)]">Markdown content</span>
                <span className="text-xs text-[var(--shp-muted)]">Editor mode only</span>
              </div>
              {editorIsSyncing ? (
                <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_54%,transparent)] px-4 py-12 text-center text-sm text-[var(--shp-muted)]">
                  Loading selected post...
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
                  imageAltText={form.title || form.coverImageAlt || "Blog image"}
                  onChange={(contentMd) => {
                    setForm((prev) => (prev.contentMd === contentMd ? prev : { ...prev, contentMd }));
                  }}
                />
              )}
            </div>
          </div>

          <article className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_92%,var(--shp-bg)_8%)] p-4">
            <div className="flex items-center justify-between gap-2">
              <h5 className="text-sm font-semibold text-[var(--shp-text)]">R2 assets</h5>
              <button
                type="button"
                onClick={() => void fetchAssets()}
                disabled={loadingAssets || !selectedPostId}
                className="text-xs text-[var(--shp-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingAssets ? "Loading..." : "Refresh"}
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {(assets || []).length === 0 ? (
                <p className="text-xs text-[var(--shp-muted)]">
                  {selectedPostId ? "No uploaded assets for this post yet." : "Create or select a post to manage assets."}
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
                          setNotice("Asset URL copied.");
                        }}
                        className="rounded border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-2 py-1 text-[11px] text-[var(--shp-muted)]"
                      >
                        Copy URL
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteAsset(asset.id)}
                        className="rounded border border-rose-400/40 px-2 py-1 text-[11px] text-rose-700"
                      >
                        Delete
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
