import { describe, expect, it } from "vitest";
import {
  buildDeployedBlogRuntimeFiles,
  injectDeployedBlogRuntime,
  resolveBlogD1BindingConfig,
} from "./deployed-blog-runtime";

describe("deployed blog runtime", () => {
  it("builds a project-scoped Pages worker and manifest", () => {
    const files = buildDeployedBlogRuntimeFiles({
      projectId: "project-123",
      d1BindingName: "BLOG_DB",
      generatedAt: "2026-04-30T00:00:00.000Z",
    });

    const worker = files.find((file) => file.path === "/_worker.js");
    const manifest = files.find((file) => file.path === "/shpitto-blog-runtime.json");

    expect(worker?.type).toBe("application/javascript");
    expect(worker?.content).toContain('const PROJECT_ID = "project-123";');
    expect(worker?.content).toContain('const D1_BINDING_NAME = "BLOG_DB";');
    expect(worker?.content).toContain("env.ASSETS.fetch(request)");
    expect(worker?.content).toContain("shpitto_blog_posts");
    expect(worker?.content).toContain('path === "/sitemap.xml"');
    expect(worker?.content).not.toContain("CLOUDFLARE_API_TOKEN");

    expect(JSON.parse(String(manifest?.content || "{}"))).toMatchObject({
      mode: "deployment-d1-runtime",
      projectId: "project-123",
      d1BindingName: "BLOG_DB",
    });
    expect(String(manifest?.content || "")).toContain("/sitemap.xml");
    expect(String(manifest?.content || "")).toContain('"/blog"');
    expect(String(manifest?.content || "")).toContain('"/blog/:slug"');
    const routes = files.find((file) => file.path === "/_routes.json");
    expect(String(routes?.content || "")).toContain("/sitemap.xml");
    expect(String(routes?.content || "")).toContain("/api/blog/*");
    expect(String(routes?.content || "")).toContain('"/blog"');
    expect(String(routes?.content || "")).toContain('"/blog/"');
    expect(String(routes?.content || "")).toContain("/blog/*");
  });

  it("emits syntactically valid module worker source", async () => {
    const worker = buildDeployedBlogRuntimeFiles({
      projectId: "project-123",
      d1BindingName: "DB",
    }).find((file) => file.path === "/_worker.js")?.content;

    const mod = await import(`data:text/javascript;base64,${Buffer.from(String(worker || "")).toString("base64")}`);
    expect(mod.default).toEqual(expect.objectContaining({ fetch: expect.any(Function) }));
  });

  it("renders dynamic Blog detail pages through the generated post shell", async () => {
    const worker = buildDeployedBlogRuntimeFiles({
      projectId: "project-123",
      d1BindingName: "DB",
    }).find((file) => file.path === "/_worker.js")?.content;

    const mod = await import(`data:text/javascript;base64,${Buffer.from(String(worker || "")).toString("base64")}`);
    const postRow = {
      id: "post-1",
      project_id: "project-123",
      slug: "hello-world",
      title: "你好世界",
      excerpt: "中文摘要",
      content_html: "<p>中文正文</p>",
      author_name: "作者",
      category: "新闻",
      tags_json: JSON.stringify(["发布"]),
      cover_image_url: "",
      cover_image_alt: "",
      seo_title: "你好世界 SEO",
      seo_description: "中文 SEO 摘要",
      published_at: "2026-04-30T00:00:00.000Z",
      updated_at: "2026-04-30T00:00:00.000Z",
    };
    const env = {
      DB: {
        prepare(sql: string) {
          return {
            bind(...args: unknown[]) {
              return {
                async first() {
                  if (sql.includes("shpitto_blog_settings")) {
                    return {
                      enabled: 1,
                      nav_label: "博客",
                      rss_enabled: 1,
                      sitemap_enabled: 1,
                    };
                  }
                  if (sql.includes("shpitto_blog_posts") && args.includes("hello-world")) return postRow;
                  return null;
                },
                async all() {
                  return { results: [postRow] };
                },
              };
            },
          };
        },
      },
      ASSETS: {
        async fetch(request: Request) {
          const pathname = new URL(request.url).pathname;
          if (pathname === "/shpitto-blog-post-shell.html") {
            return new Response(null, { status: 308, headers: { location: "/shpitto-blog-post-shell" } });
          }
          if (pathname === "/shpitto-blog-post-shell") {
            return new Response(
              '<!doctype html><html lang="zh-CN"><head><title>__SHPITTO_BLOG_SEO_TITLE__</title><meta name="description" content="__SHPITTO_BLOG_SEO_DESCRIPTION__"><link rel="stylesheet" href="/styles.css"></head><body><header><a href="/blog/">博客</a></header><main><article data-shpitto-blog-post-root><h1>__SHPITTO_BLOG_POST_TITLE__</h1><p>__SHPITTO_BLOG_POST_META__</p><div>__SHPITTO_BLOG_POST_CONTENT__</div></article></main><footer>站点页脚</footer></body></html>',
              { status: 200 },
            );
          }
          return new Response("Not found", { status: 404 });
        },
      },
    };

    const response = await mod.default.fetch(new Request("https://example.test/blog/hello-world/"), env);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain("<title>你好世界 SEO</title>");
    expect(html).toContain("中文正文");
    expect(html).toContain("站点页脚");
    expect(html).not.toContain("Powered by Shpitto Blog runtime");
  });

  it("filters public Blog API and collection pages by tag, category, and search", async () => {
    const worker = buildDeployedBlogRuntimeFiles({
      projectId: "project-123",
      d1BindingName: "DB",
    }).find((file) => file.path === "/_worker.js")?.content;

    const mod = await import(`data:text/javascript;base64,${Buffer.from(String(worker || "")).toString("base64")}`);
    const rows = [
      {
        id: "post-1",
        project_id: "project-123",
        slug: "devops",
        title: "DevOps 研发体系",
        excerpt: "研发效能",
        content_html: "<p>研发体系正文</p>",
        author_name: "Bays",
        category: "研发",
        tags_json: JSON.stringify(["研发", "DevOps"]),
        cover_image_url: "",
        cover_image_alt: "",
        seo_title: "",
        seo_description: "",
        published_at: "2026-04-30T00:00:00.000Z",
        updated_at: "2026-04-30T00:00:00.000Z",
      },
      {
        id: "post-2",
        project_id: "project-123",
        slug: "ai-saas",
        title: "AI SaaS 创业",
        excerpt: "创业商业化",
        content_html: "<p>AI 创业正文</p>",
        author_name: "Bays",
        category: "创业",
        tags_json: JSON.stringify(["AI", "创业"]),
        cover_image_url: "",
        cover_image_alt: "",
        seo_title: "",
        seo_description: "",
        published_at: "2026-04-29T00:00:00.000Z",
        updated_at: "2026-04-29T00:00:00.000Z",
      },
    ];
    const env = {
      DB: {
        prepare(sql: string) {
          return {
            bind(...args: unknown[]) {
              return {
                async first() {
                  if (sql.includes("shpitto_blog_settings")) {
                    return { enabled: 1, nav_label: "博客", rss_enabled: 1, sitemap_enabled: 1 };
                  }
                  return rows.find((row) => args.includes(row.slug)) || null;
                },
                async all() {
                  return { results: rows };
                },
              };
            },
          };
        },
      },
      ASSETS: { async fetch() { return new Response("asset", { status: 200 }); } },
    };

    const tagResponse = await mod.default.fetch(new Request("https://example.test/api/blog/posts?tag=AI"), env);
    const tagJson = await tagResponse.json();
    expect(tagJson.posts.map((post: any) => post.slug)).toEqual(["ai-saas"]);

    const searchResponse = await mod.default.fetch(new Request("https://example.test/api/blog/posts?search=DevOps"), env);
    const searchJson = await searchResponse.json();
    expect(searchJson.posts.map((post: any) => post.slug)).toEqual(["devops"]);

    const pageResponse = await mod.default.fetch(new Request("https://example.test/blog/tag/AI/"), env);
    const pageHtml = await pageResponse.text();
    expect(pageResponse.status).toBe(200);
    expect(pageHtml).toContain("AI SaaS 创业");
    expect(pageHtml).not.toContain("DevOps 研发体系");
  });

  it("renders the Blog root collection when /blog/index.html is missing", async () => {
    const worker = buildDeployedBlogRuntimeFiles({
      projectId: "project-123",
      d1BindingName: "DB",
    }).find((file) => file.path === "/_worker.js")?.content;

    const mod = await import(`data:text/javascript;base64,${Buffer.from(String(worker || "")).toString("base64")}`);
    const rows = [
      {
        id: "post-1",
        project_id: "project-123",
        slug: "hello-world",
        title: "Hello World",
        excerpt: "Runtime blog root fallback",
        content_html: "<p>Hello body</p>",
        author_name: "Bays",
        category: "Notes",
        tags_json: JSON.stringify(["AI"]),
        cover_image_url: "",
        cover_image_alt: "",
        seo_title: "",
        seo_description: "",
        published_at: "2026-04-30T00:00:00.000Z",
        updated_at: "2026-04-30T00:00:00.000Z",
      },
    ];
    const env = {
      DB: {
        prepare(sql: string) {
          return {
            bind() {
              return {
                async first() {
                  if (sql.includes("shpitto_blog_settings")) {
                    return { enabled: 1, nav_label: "Blog", rss_enabled: 1, sitemap_enabled: 1 };
                  }
                  return null;
                },
                async all() {
                  return { results: rows };
                },
              };
            },
          };
        },
      },
      ASSETS: {
        async fetch() {
          return new Response("Not found", { status: 404 });
        },
      },
    };

    const response = await mod.default.fetch(new Request("https://example.test/blog/"), env);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Hello World");
    expect(html).toContain('/blog/hello-world/');
  });

  it("injects runtime files without dropping generated static files", () => {
    const prevRuntime = process.env.SHPITTO_DEPLOY_BLOG_RUNTIME;
    const input = {
      staticSite: {
        mode: "skill-direct",
        files: [
          {
            path: "/index.html",
            content: "<!doctype html><html><body>mock</body></html>",
            type: "text/html",
          },
        ],
      },
    };

    try {
      process.env.SHPITTO_DEPLOY_BLOG_RUNTIME = "1";
      const result = injectDeployedBlogRuntime(input, {
        projectId: "project-123",
        d1BindingName: "DB",
        generatedAt: "2026-04-30T00:00:00.000Z",
      });

      const paths = result.project.staticSite.files.map((file: { path: string }) => file.path);
      expect(result.injected).toBe(true);
      expect(paths).toContain("/index.html");
      expect(paths).toContain("/_worker.js");
      expect(paths).toContain("/shpitto-blog-runtime.json");
    } finally {
      if (prevRuntime === undefined) delete process.env.SHPITTO_DEPLOY_BLOG_RUNTIME;
      else process.env.SHPITTO_DEPLOY_BLOG_RUNTIME = prevRuntime;
    }
  });

  it("resolves the Pages D1 binding from deployment environment", () => {
    const prevDatabaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
    const prevDbId = process.env.CLOUDFLARE_D1_DB_ID;
    const prevBinding = process.env.SHPITTO_DEPLOY_BLOG_D1_BINDING;

    try {
      process.env.CLOUDFLARE_D1_DATABASE_ID = "d1-id";
      delete process.env.CLOUDFLARE_D1_DB_ID;
      process.env.SHPITTO_DEPLOY_BLOG_D1_BINDING = "BLOG-DB";

      expect(resolveBlogD1BindingConfig()).toEqual({
        bindingName: "BLOG_DB",
        databaseId: "d1-id",
      });
    } finally {
      if (prevDatabaseId === undefined) delete process.env.CLOUDFLARE_D1_DATABASE_ID;
      else process.env.CLOUDFLARE_D1_DATABASE_ID = prevDatabaseId;
      if (prevDbId === undefined) delete process.env.CLOUDFLARE_D1_DB_ID;
      else process.env.CLOUDFLARE_D1_DB_ID = prevDbId;
      if (prevBinding === undefined) delete process.env.SHPITTO_DEPLOY_BLOG_D1_BINDING;
      else process.env.SHPITTO_DEPLOY_BLOG_D1_BINDING = prevBinding;
    }
  });
});
