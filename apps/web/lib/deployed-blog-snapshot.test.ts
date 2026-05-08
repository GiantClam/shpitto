import { describe, expect, it } from "vitest";
import { buildDeployedBlogSnapshotFiles, injectDeployedBlogSnapshot } from "./deployed-blog-snapshot";
import type { BlogPostRecord } from "./blog-types";

const post: BlogPostRecord = {
  id: "post-1",
  projectId: "project-1",
  accountId: "account-1",
  ownerUserId: "user-1",
  slug: "hello-world",
  title: "Hello World",
  excerpt: "Intro",
  contentMd: "# Hello",
  contentHtml: "<p>Hello body</p>",
  status: "published",
  authorName: "Author",
  category: "News",
  tags: ["Launch"],
  coverImageUrl: "",
  coverImageAlt: "",
  seoTitle: "",
  seoDescription: "",
  themeKey: "",
  layoutKey: "",
  publishedAt: "2026-04-30T00:00:00.000Z",
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
};

describe("deployed blog snapshot", () => {
  it("generates API-supporting snapshot metadata and RSS without replacing generated Blog HTML", () => {
    const files = buildDeployedBlogSnapshotFiles({
      projectId: "project-1",
      posts: [post],
      settings: {
        projectId: "project-1",
        accountId: "account-1",
        ownerUserId: "user-1",
        enabled: true,
        navLabel: "Journal",
        homeFeaturedCount: 3,
        defaultLayoutKey: "",
        defaultThemeKey: "",
        rssEnabled: true,
        sitemapEnabled: true,
        createdAt: "2026-04-30T00:00:00.000Z",
        updatedAt: "2026-04-30T00:00:00.000Z",
      },
      generatedAt: "2026-04-30T00:00:00.000Z",
    });

    const paths = files.map((file) => file.path);
    expect(paths).not.toContain("/blog/index.html");
    expect(paths).toContain("/blog/hello-world/index.html");
    expect(paths).not.toContain("/blog/category/news/index.html");
    expect(paths).not.toContain("/blog/tag/launch/index.html");
    expect(paths).toContain("/blog/rss.xml");
    expect(paths).toContain("/shpitto-blog-snapshot.json");
    expect(files.find((file) => file.path === "/blog/rss.xml")?.content).toContain("Hello World");
    expect(files.find((file) => file.path === "/blog/hello-world/index.html")?.content).toContain("Hello body");
    const snapshot = JSON.parse(String(files.find((file) => file.path === "/shpitto-blog-snapshot.json")?.content || "{}"));
    expect(snapshot.postCount).toBe(1);
    expect(snapshot.posts[0].title).toBe("Hello World");
    expect(snapshot.settings.navLabel).toBe("Journal");
  });

  it("does not emit blog pages when settings disable blog", () => {
    const files = buildDeployedBlogSnapshotFiles({
      projectId: "project-1",
      posts: [post],
      settings: {
        projectId: "project-1",
        accountId: "account-1",
        ownerUserId: "user-1",
        enabled: false,
        navLabel: "Blog",
        homeFeaturedCount: 3,
        defaultLayoutKey: "",
        defaultThemeKey: "",
        rssEnabled: true,
        sitemapEnabled: true,
        createdAt: "2026-04-30T00:00:00.000Z",
        updatedAt: "2026-04-30T00:00:00.000Z",
      },
    });

    expect(files).toHaveLength(0);
  });

  it("injects snapshot files without dropping generated files", () => {
    const result = injectDeployedBlogSnapshot(
      {
        staticSite: {
          mode: "skill-direct",
          files: [
            {
              path: "/index.html",
              content: '<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><header><nav><a href="/">Home</a></nav></header>home</body></html>',
              type: "text/html",
            },
            { path: "/styles.css", content: "body{background:#111;color:#fff}", type: "text/css" },
          ],
        },
      },
      [{ path: "/shpitto-blog-snapshot.json", content: "{}", type: "application/json" }],
    );

    const paths = result.project.staticSite.files.map((file: { path: string }) => file.path);
    const home = result.project.staticSite.files.find((file: { path: string }) => file.path === "/index.html")?.content || "";
    expect(result.injected).toBe(true);
    expect(paths).toContain("/index.html");
    expect(paths).toContain("/styles.css");
    expect(paths).toContain("/shpitto-blog-snapshot.json");
    expect(paths).toContain("/shpitto-blog-post-shell.html");
    expect(paths).toContain("/shpitto-blog-theme.json");
    expect(home).toContain('href="/blog/"');
  });

  it("preserves generated blog HTML instead of replacing it with a snapshot shell", () => {
    const files = buildDeployedBlogSnapshotFiles({
      projectId: "project-1",
      posts: [post],
      settings: null,
      generatedAt: "2026-04-30T00:00:00.000Z",
    });
    const result = injectDeployedBlogSnapshot(
      {
        staticSite: {
          mode: "skill-direct",
          files: [
            {
              path: "/index.html",
              content:
                '<!doctype html><html><head><link rel="preconnect" href="https://fonts.example"><link rel="stylesheet" href="./styles.css"></head><body><header><nav><a href="/">Home</a></nav></header></body></html>',
              type: "text/html",
            },
            { path: "/styles.css", content: ":root{--accent:#f59e0b}", type: "text/css" },
            {
              path: "/blog/index.html",
              content:
                '<!doctype html><html lang="zh-CN"><head><link rel="stylesheet" href="../styles.css"></head><body><h1>博客</h1></body></html>',
              type: "text/html",
            },
          ],
        },
      },
      files,
    );

    const blog = result.project.staticSite.files.find((file: { path: string }) => file.path === "/blog/index.html")?.content || "";
    const shell = result.project.staticSite.files.find((file: { path: string }) => file.path === "/shpitto-blog-post-shell.html")?.content || "";
    const detail = result.project.staticSite.files.find((file: { path: string }) => file.path === "/blog/hello-world/index.html")?.content || "";
    const theme = JSON.parse(
      String(result.project.staticSite.files.find((file: { path: string }) => file.path === "/shpitto-blog-theme.json")?.content || "{}"),
    );
    expect(blog).toContain('<html lang="zh-CN">');
    expect(blog).toContain('href="../styles.css"');
    expect(blog).toContain("<h1>博客</h1>");
    expect(blog).not.toContain("shpitto-blog-page");
    expect(blog).toContain("data-shpitto-blog-root");
    expect(blog).toContain("/api/blog/posts");
    expect(blog).toContain("Hello World");
    expect(shell).toContain('<html lang="zh-CN">');
    expect(shell).toContain("__SHPITTO_BLOG_POST_CONTENT__");
    expect(shell).toContain('href="/styles.css"');
    expect(shell).not.toContain("Generated by Shpitto from the deployment-time Blog snapshot.");
    expect(detail).toContain('<html lang="zh-CN">');
    expect(detail).toContain("Hello body");
    expect(detail).not.toContain("shpitto-blog-page");
    expect(theme).toMatchObject({
      locale: "zh-CN",
      navLabel: "Blog",
      postShellPath: "/shpitto-blog-post-shell.html",
    });
  });

  it("hydrates an existing native blog mount instead of duplicating the bridge", () => {
    const files = buildDeployedBlogSnapshotFiles({
      projectId: "project-1",
      posts: [post],
      settings: null,
      generatedAt: "2026-04-30T00:00:00.000Z",
    });
    const result = injectDeployedBlogSnapshot(
      {
        staticSite: {
          mode: "skill-direct",
          files: [
            {
              path: "/blog/index.html",
              content:
                '<!doctype html><html><body><main><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article class="blog-card generated-card">Fallback</article></div></section></main></body></html>',
              type: "text/html",
            },
          ],
        },
      },
      files,
    );

    const blog = result.project.staticSite.files.find((file: { path: string }) => file.path === "/blog/index.html")?.content || "";
    expect((blog.match(/data-shpitto-blog-root/g) || []).length).toBe(1);
    expect(blog).toContain("Hello World");
    expect(blog).not.toContain("Fallback");
    expect(blog).toContain('class="blog-card generated-card"');
    expect(blog).toContain("data-filter-card");
    expect(blog).toContain("data-tags=");
    expect(blog).not.toContain('class="shpitto-blog-live-card"');
  });

  it("keeps generated tag filters working after snapshot hydration", () => {
    const files = buildDeployedBlogSnapshotFiles({
      projectId: "project-1",
      posts: [post],
      settings: null,
      generatedAt: "2026-04-30T00:00:00.000Z",
    });
    const result = injectDeployedBlogSnapshot(
      {
        staticSite: {
          mode: "skill-direct",
          files: [
            {
              path: "/blog/index.html",
              content:
                '<!doctype html><html><body><button data-filter-chip="all">All</button><button data-filter-chip="launch">Launch</button><main><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list><article class="blog-card" data-filter-card data-tags="fallback">Fallback</article></div></section></main></body></html>',
              type: "text/html",
            },
          ],
        },
      },
      files,
    );

    const blog = result.project.staticSite.files.find((file: { path: string }) => file.path === "/blog/index.html")?.content || "";
    expect(blog).toContain("data-shpitto-filter-bridge");
    expect(blog).toContain('data-filter-chip="launch"');
    expect(blog).toContain("data-filter-card");
    expect(blog).toContain("launch");
  });

  it("replaces a nested generated blog list without leaving fallback card fragments", () => {
    const files = buildDeployedBlogSnapshotFiles({
      projectId: "project-1",
      posts: [post],
      settings: null,
      generatedAt: "2026-04-30T00:00:00.000Z",
    });
    const result = injectDeployedBlogSnapshot(
      {
        staticSite: {
          mode: "skill-direct",
          files: [
            {
              path: "/blog/index.html",
              content:
                '<!doctype html><html><body><main><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div class="results-stack" data-shpitto-blog-list><article class="resource-card"><div class="resource-main"><strong>Fallback title</strong><p>Fallback body</p></div><div class="resource-aside">Fallback meta</div></article></div></section></main></body></html>',
              type: "text/html",
            },
          ],
        },
      },
      files,
    );

    const blog = result.project.staticSite.files.find((file: { path: string }) => file.path === "/blog/index.html")?.content || "";
    expect(blog).toContain("Hello World");
    expect(blog).toContain('class="resource-card"');
    expect(blog).not.toContain("Fallback title");
    expect(blog).not.toContain("Fallback body");
    expect(blog).not.toContain("Fallback meta");
  });
});
