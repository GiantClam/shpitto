import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type StoredProject = {
  id: string;
  account_id: string;
  owner_user_id: string;
  name: string;
  source_app: string;
};

type StoredPost = {
  id: string;
  project_id: string;
  account_id: string;
  owner_user_id: string;
  source_app: string;
  slug: string;
  title: string;
  excerpt: string;
  content_md: string;
  content_html: string;
  status: string;
  author_name: string;
  category: string;
  tags_json: string;
  cover_image_url: string;
  cover_image_alt: string;
  seo_title: string;
  seo_description: string;
  theme_key: string;
  layout_key: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

const projects: StoredProject[] = [];
const posts: StoredPost[] = [];
const revisions: Array<Record<string, unknown>> = [];

function toPostRow(post: StoredPost) {
  return {
    id: post.id,
    projectId: post.project_id,
    accountId: post.account_id,
    ownerUserId: post.owner_user_id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    contentMd: post.content_md,
    contentHtml: post.content_html,
    status: post.status,
    authorName: post.author_name,
    category: post.category,
    tagsJson: post.tags_json,
    coverImageUrl: post.cover_image_url,
    coverImageAlt: post.cover_image_alt,
    seoTitle: post.seo_title,
    seoDescription: post.seo_description,
    themeKey: post.theme_key,
    layoutKey: post.layout_key,
    publishedAt: post.published_at,
    createdAt: post.created_at,
    updatedAt: post.updated_at,
  };
}

const fakeD1 = {
  isConfigured: () => true,
  ensureShpittoSchema: vi.fn(async () => {}),
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = String(sql || "");

    if (text.includes("FROM shpitto_projects")) {
      const [projectId, userId] = params as string[];
      return projects.filter(
        (project) => project.id === projectId && project.owner_user_id === userId && project.source_app === "shpitto",
      );
    }

    if (text.includes("FROM shpitto_blog_posts") && text.includes("SELECT slug")) {
      const [projectId, userId, excludePostId, _excludeAgain, desiredSlug] = params as [
        string,
        string,
        string | null,
        string | null,
        string,
      ];
      return posts
        .filter((post) => {
          if (post.project_id !== projectId || post.owner_user_id !== userId || post.source_app !== "shpitto") return false;
          if (excludePostId && post.id === excludePostId) return false;
          return post.slug === desiredSlug || post.slug.startsWith(`${desiredSlug}-`);
        })
        .map((post) => ({ slug: post.slug }));
    }

    if (text.includes("FROM shpitto_blog_posts") && text.includes("WHERE id = ?")) {
      const [postId, projectId, userId] = params as string[];
      const post = posts.find(
        (item) =>
          item.id === postId &&
          item.project_id === projectId &&
          item.owner_user_id === userId &&
          item.source_app === "shpitto",
      );
      return post ? [toPostRow(post)] : [];
    }

    if (text.includes("FROM shpitto_blog_posts") && text.includes("owner_user_id = ?")) {
      const [projectId, userId] = params as string[];
      return posts
        .filter(
          (post) =>
            post.project_id === projectId &&
            post.owner_user_id === userId &&
            post.source_app === "shpitto" &&
            post.status !== "archived",
        )
        .map(toPostRow);
    }

    return [];
  }),
  queryOne: vi.fn(async (sql: string, params: unknown[] = []) => {
    const rows = await fakeD1.query(sql, params);
    return rows[0] || null;
  }),
  execute: vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = String(sql || "");
    if (text.includes("INSERT INTO shpitto_blog_posts")) {
      const [
        id,
        projectId,
        accountId,
        ownerUserId,
        slug,
        title,
        excerpt,
        contentMd,
        contentHtml,
        status,
        authorName,
        category,
        tagsJson,
        coverImageUrl,
        coverImageAlt,
        seoTitle,
        seoDescription,
        themeKey,
        layoutKey,
        publishedAt,
        createdAt,
        updatedAt,
      ] = params as string[];

      const duplicate = posts.find((post) => post.project_id === projectId && post.slug === slug && post.id !== id);
      if (duplicate) {
        throw new Error("UNIQUE constraint failed: shpitto_blog_posts.project_id, shpitto_blog_posts.slug");
      }

      const next: StoredPost = {
        id,
        project_id: projectId,
        account_id: accountId,
        owner_user_id: ownerUserId,
        source_app: "shpitto",
        slug,
        title,
        excerpt,
        content_md: contentMd,
        content_html: contentHtml,
        status,
        author_name: authorName,
        category,
        tags_json: tagsJson,
        cover_image_url: coverImageUrl,
        cover_image_alt: coverImageAlt,
        seo_title: seoTitle,
        seo_description: seoDescription,
        theme_key: themeKey,
        layout_key: layoutKey,
        published_at: publishedAt || null,
        created_at: createdAt,
        updated_at: updatedAt,
      };

      const existingIndex = posts.findIndex((post) => post.id === id);
      if (existingIndex >= 0) posts[existingIndex] = next;
      else posts.push(next);
      return { success: true };
    }

    if (text.includes("INSERT INTO shpitto_blog_post_revisions")) {
      revisions.push({ sql: text, params: [...params] });
      return { success: true };
    }

    return { success: true };
  }),
};

vi.mock("./d1", () => ({
  getD1Client: () => fakeD1,
}));

vi.mock("./r2", () => ({
  getR2Client: () => ({
    toPublicUrl: (value: string) => `https://cdn.test/${value}`,
  }),
}));

describe("blog service integration", () => {
  beforeEach(() => {
    projects.length = 0;
    posts.length = 0;
    revisions.length = 0;
    fakeD1.ensureShpittoSchema.mockClear();
    fakeD1.query.mockClear();
    fakeD1.queryOne.mockClear();
    fakeD1.execute.mockClear();

    projects.push({
      id: "project-1",
      account_id: "account-1",
      owner_user_id: "user-1",
      name: "Demo Project",
      source_app: "shpitto",
    });
  });

  it("writes -2 slug for the second post with the same title", async () => {
    const { listProjectBlogPosts, upsertProjectBlogPost } = await import("./blog");

    const first = await upsertProjectBlogPost({
      projectId: "project-1",
      userId: "user-1",
      input: {
        title: "Hello World",
        contentMd: "First body",
      },
    });
    const second = await upsertProjectBlogPost({
      projectId: "project-1",
      userId: "user-1",
      input: {
        title: "Hello World",
        contentMd: "Second body",
      },
    });

    expect(first?.slug).toBe("hello-world");
    expect(second?.slug).toBe("hello-world-2");

    const allPosts = await listProjectBlogPosts({
      projectId: "project-1",
      userId: "user-1",
    });

    expect(allPosts.map((post) => post.slug)).toEqual(["hello-world", "hello-world-2"]);
    expect(revisions).toHaveLength(2);
  });

  it("infers category and tags from article content on publish", async () => {
    const { upsertProjectBlogPost } = await import("./blog");

    const post = await upsertProjectBlogPost({
      projectId: "project-1",
      userId: "user-1",
      input: {
        title: "AI SaaS 商业化实践",
        status: "published",
        contentMd: [
          "# AI SaaS 商业化实践",
          "",
          "围绕 AI 产品化、SaaS 交付与商业化路径，沉淀一套可复制的方法。",
          "",
          "## 商业化实践",
          "",
          "重点覆盖 AI 能力包装、产品定位与交付闭环。",
        ].join("\n"),
      },
    });

    expect(post?.category).toBe("AI");
    expect(post?.tags).toEqual(expect.arrayContaining(["AI", "SaaS", "商业化实践"]));
    expect(post?.tags).not.toContain("AI SaaS 商业化实践");
    expect(post?.seoTitle).toBe("AI SaaS 商业化实践");
    expect(post?.seoDescription).toContain("围绕 AI 产品化");
  });

  it("keeps draft taxonomy empty and re-infers on publish when the editor clears the fields", async () => {
    const { upsertProjectBlogPost } = await import("./blog");

    const draft = await upsertProjectBlogPost({
      projectId: "project-1",
      userId: "user-1",
      input: {
        title: "Untitled post",
        status: "draft",
        category: "",
        tags: [],
        contentMd: "# Untitled post\n\nStart writing your blog article here.",
      },
    });

    expect(draft?.category).toBe("");
    expect(draft?.tags).toEqual([]);

    const published = await upsertProjectBlogPost({
      projectId: "project-1",
      userId: "user-1",
      postId: draft?.id,
      input: {
        title: "AI SaaS 商业化实践",
        status: "published",
        category: "",
        tags: [],
        excerpt: "",
        contentMd: [
          "# AI SaaS 商业化实践",
          "",
          "围绕 AI 产品化、SaaS 交付与商业化路径，沉淀一套可复制的方法。",
          "",
          "## 商业化实践",
          "",
          "重点覆盖 AI 能力包装、产品定位与交付闭环。",
        ].join("\n"),
      },
    });

    expect(published?.category).toBe("AI");
    expect(published?.tags).toEqual(expect.arrayContaining(["AI", "SaaS", "商业化实践"]));
    expect((published?.tags || []).every((tag) => tag.length <= 18)).toBe(true);
  });

  it("normalizes explicit taxonomy and deduplicates tags", async () => {
    const { upsertProjectBlogPost } = await import("./blog");

    const post = await upsertProjectBlogPost({
      projectId: "project-1",
      userId: "user-1",
      input: {
        title: "DevOps rollout memo",
        status: "published",
        category: "  Engineering  ",
        tags: ["AI", "ai", " strategy ", "Engineering", "blog"],
        contentMd: "## DevOps rollout\n\nEngineering alignment and delivery cadence.",
      },
    });

    expect(post?.category).toBe("Engineering");
    expect(post?.tags).toEqual(["Engineering", "AI", "strategy"]);
  });

  it("rejects publish when category and tags cannot be inferred", async () => {
    const { BlogValidationError, upsertProjectBlogPost } = await import("./blog");

    await expect(
      upsertProjectBlogPost({
        projectId: "project-1",
        userId: "user-1",
        input: {
          title: "Untitled post",
          status: "published",
          excerpt: "Blog summary",
          contentMd: "This is a blog post with generic summary text only.",
        },
      }),
    ).rejects.toBeInstanceOf(BlogValidationError);
  });

  it("builds a publish preview from the same taxonomy rules", async () => {
    const { previewBlogPostPublishInput } = await import("./blog");

    const preview = previewBlogPostPublishInput({
      title: "AI SaaS 商业化实践",
      contentMd: [
        "# AI SaaS 商业化实践",
        "",
        "围绕 AI 产品化、SaaS 交付与商业化路径，沉淀一套可复制的方法。",
        "",
        "## 商业化实践",
        "",
        "重点覆盖 AI 能力包装、产品定位与交付闭环。",
      ].join("\n"),
      category: "",
      tags: [],
      excerpt: "",
    });

    expect(preview.category).toBe("AI");
    expect(preview.tags).toEqual(expect.arrayContaining(["AI", "SaaS", "商业化实践"]));
    expect(preview.slug).toBe("ai-saas-商业化实践");
  });

  it("recomputes managed slug excerpt and seo fields when an untitled draft is published", async () => {
    const { upsertProjectBlogPost, previewBlogPostPublishInput } = await import("./blog");

    const draft = await upsertProjectBlogPost({
      projectId: "project-1",
      userId: "user-1",
      input: {
        title: "Untitled post",
        status: "draft",
        slug: "untitled-post",
        excerpt: "Untitled post Start writing your blog article here.",
        seoTitle: "Untitled post",
        seoDescription: "Untitled post Start writing your blog article here.",
        contentMd: "# Untitled post\n\nStart writing your blog article here.",
      },
    });

    const preview = previewBlogPostPublishInput(
      {
        title: "AI SaaS Commercialization",
        status: "published",
        slug: "untitled-post",
        excerpt: "Untitled post Start writing your blog article here.",
        seoTitle: "Untitled post",
        seoDescription: "Untitled post Start writing your blog article here.",
        contentMd: [
          "# AI SaaS Commercialization",
          "",
          "Practical notes on AI productization, SaaS delivery, and commercialization.",
          "",
          "## Commercialization",
          "",
          "Focus on packaging AI capabilities, product positioning, and delivery loops.",
        ].join("\n"),
      },
      draft,
    );

    expect(preview.slug).toBe("ai-saas-commercialization");
    expect(preview.excerpt).toContain("Practical notes on AI productization");
    expect(preview.seoTitle).toBe("AI SaaS Commercialization");
    expect(preview.seoDescription).toContain("Practical notes on AI productization");
  });

  it("recomputes cleared managed fields instead of retaining stale draft metadata", async () => {
    const { upsertProjectBlogPost, previewBlogPostPublishInput } = await import("./blog");

    const draft = await upsertProjectBlogPost({
      projectId: "project-1",
      userId: "user-1",
      input: {
        title: "Untitled post",
        status: "draft",
        slug: "untitled-post",
        excerpt: "Untitled post Start writing your blog article here.",
        seoTitle: "Untitled post",
        seoDescription: "Untitled post Start writing your blog article here.",
        contentMd: "# Untitled post\n\nStart writing your blog article here.",
      },
    });

    const preview = previewBlogPostPublishInput(
      {
        title: "AI SaaS Commercialization Probe",
        status: "published",
        slug: "",
        excerpt: "",
        seoTitle: "",
        seoDescription: "",
        contentMd: [
          "# AI SaaS Commercialization",
          "",
          "## SaaS delivery",
          "",
          "Body paragraph for typing check.",
        ].join("\n"),
      },
      draft,
    );

    expect(preview.slug).toBe("ai-saas-commercialization-probe");
    expect(preview.seoTitle).toBe("AI SaaS Commercialization Probe");
    expect(preview.seoDescription).toContain("AI SaaS Commercialization");
    expect(preview.seoDescription).not.toContain("Start writing your blog article here.");
  });

  it("treats unique-suffixed draft slugs as auto-managed when the editor clears them", async () => {
    const { previewBlogPostPublishInput } = await import("./blog");

    const preview = previewBlogPostPublishInput(
      {
        title: "AI SaaS Commercialization Probe Frontend",
        status: "published",
        slug: "",
        excerpt: "",
        seoTitle: "",
        seoDescription: "",
        contentMd: "# AI SaaS Commercialization\n\n## SaaS delivery\n\nBody paragraph.",
      },
      {
        id: "post-1",
        projectId: "project-1",
        accountId: "account-1",
        ownerUserId: "user-1",
        slug: "untitled-post-11",
        title: "Untitled post",
        excerpt: "Untitled post Start writing your blog article here.",
        contentMd: "# Untitled post\n\nStart writing your blog article here.",
        contentHtml: "<h1>Untitled post</h1><p>Start writing your blog article here.</p>",
        status: "draft",
        authorName: "",
        category: "",
        tags: [],
        coverImageUrl: "",
        coverImageAlt: "",
        seoTitle: "Untitled post",
        seoDescription: "Untitled post Start writing your blog article here.",
        themeKey: "",
        layoutKey: "",
        publishedAt: null,
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T00:00:00.000Z",
      },
    );

    expect(preview.slug).toBe("ai-saas-commercialization-probe-frontend");
    expect(preview.seoTitle).toBe("AI SaaS Commercialization Probe Frontend");
    expect(preview.seoDescription).toContain("AI SaaS Commercialization");
  });

  it("normalizes editor markdown break placeholders before persistence", async () => {
    const { upsertProjectBlogPost } = await import("./blog");

    const post = await upsertProjectBlogPost({
      projectId: "project-1",
      userId: "user-1",
      input: {
        title: "Normalized markdown post",
        status: "published",
        contentMd: "# Local Blog Flow\n\n<br />\n\n## Delivery\n\nBody paragraph.",
      },
    });

    expect(post?.contentMd).toBe("# Local Blog Flow\n\n## Delivery\n\nBody paragraph.");
    expect(post?.excerpt).toBe("Local Blog Flow Delivery Body paragraph.");
    expect(post?.seoDescription).toBe("Local Blog Flow Delivery Body paragraph.");
    expect(post?.contentHtml).not.toContain("&lt;br /&gt;");
  });
});
