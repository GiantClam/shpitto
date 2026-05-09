type StaticSiteFile = {
  path: string;
  content: string;
  type?: string;
};

type BlogRuntimeParams = {
  projectId: string;
  d1BindingName?: string;
  generatedAt?: string;
};

export type BlogD1BindingConfig = {
  bindingName: string;
  databaseId: string;
};

function normalizeProjectId(value: string) {
  return String(value || "").trim();
}

function normalizeBindingName(value: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "DB";
}

export function isDeployedBlogRuntimeEnabled() {
  return String(process.env.SHPITTO_DEPLOY_BLOG_RUNTIME || "").trim() === "1";
}

export function resolveBlogD1BindingConfig(): BlogD1BindingConfig | null {
  const databaseId = String(
    process.env.CLOUDFLARE_D1_DATABASE_ID ||
      process.env.CLOUDFLARE_D1_DB_ID ||
      process.env.D1_DATABASE_ID ||
      "",
  ).trim();
  if (!databaseId) return null;
  return {
    bindingName: normalizeBindingName(process.env.SHPITTO_DEPLOY_BLOG_D1_BINDING || "DB"),
    databaseId,
  };
}

export function buildDeployedBlogRuntimeFiles(params: BlogRuntimeParams): StaticSiteFile[] {
  const projectId = normalizeProjectId(params.projectId);
  if (!projectId) return [];
  const d1BindingName = normalizeBindingName(params.d1BindingName || "DB");
  const generatedAt = String(params.generatedAt || new Date().toISOString());

  return [
    {
      path: "/_worker.js",
      type: "application/javascript",
      content: buildWorkerSource({ projectId, d1BindingName }),
    },
    {
      path: "/shpitto-blog-runtime.json",
      type: "application/json",
      content: JSON.stringify(
        {
          provider: "shpitto",
          mode: "deployment-d1-runtime",
          projectId,
          d1BindingName,
          generatedAt,
          routes: [
            "/api/blog/posts",
            "/api/blog/posts/:slug",
            "/blog",
            "/blog/",
            "/blog/:slug",
            "/blog/tag/:tag",
            "/blog/category/:category",
            "/blog/rss.xml",
            "/sitemap.xml",
          ],
        },
        null,
        2,
      ),
    },
    {
      path: "/_routes.json",
      type: "application/json",
      content: JSON.stringify(
        {
          version: 1,
          include: ["/api/blog/*", "/blog/*", "/sitemap.xml"],
          exclude: [],
        },
        null,
        2,
      ),
    },
  ];
}

export function injectDeployedBlogRuntime(
  project: any,
  params: BlogRuntimeParams,
): { project: any; injected: boolean; files: StaticSiteFile[] } {
  const runtimeFiles = buildDeployedBlogRuntimeFiles(params);
  if (!isDeployedBlogRuntimeEnabled() || runtimeFiles.length === 0) {
    return { project, injected: false, files: [] };
  }

  const existingFiles = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
  const byPath = new Map<string, StaticSiteFile>();
  for (const file of existingFiles) {
    const path = normalizeStaticPath(String(file?.path || ""));
    if (!path) continue;
    byPath.set(path, {
      path,
      content: String(file?.content || ""),
      type: String(file?.type || "") || undefined,
    });
  }
  for (const file of runtimeFiles) {
    byPath.set(file.path, file);
  }

  const next = {
    ...project,
    staticSite: {
      ...(project?.staticSite || {}),
      mode: "skill-direct",
      files: Array.from(byPath.values()),
      generation: {
        ...((project?.staticSite || {}).generation || {}),
        blogRuntime: {
          mode: "deployment-d1-runtime",
          projectId: normalizeProjectId(params.projectId),
          d1BindingName: normalizeBindingName(params.d1BindingName || "DB"),
          injectedAt: params.generatedAt || new Date().toISOString(),
        },
      },
    },
  };

  return { project: next, injected: true, files: runtimeFiles };
}

function normalizeStaticPath(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

function buildWorkerSource(params: { projectId: string; d1BindingName: string }) {
  const projectIdLiteral = JSON.stringify(params.projectId);
  const d1BindingLiteral = JSON.stringify(params.d1BindingName);

  return `const PROJECT_ID = ${projectIdLiteral};
const D1_BINDING_NAME = ${d1BindingLiteral};
const SOURCE_APP = "shpitto";
const BLOG_POST_SHELL_PATH = "/shpitto-blog-post-shell.html";
const BLOG_THEME_PATH = "/shpitto-blog-theme.json";

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
      ...(init.headers || {}),
    },
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\\n/g, " ");
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function isZhText(value) {
  return /[\u3400-\u9fff]/.test(String(value || ""));
}

function runtimeLocaleFrom(...parts) {
  return parts.some(isZhText) ? "zh-CN" : "en";
}

function toPost(row) {
  return {
    id: String(row.id || ""),
    projectId: String(row.project_id || ""),
    slug: String(row.slug || ""),
    title: String(row.title || "Untitled post"),
    excerpt: String(row.excerpt || ""),
    contentHtml: String(row.content_html || ""),
    authorName: String(row.author_name || ""),
    category: String(row.category || ""),
    tags: parseTags(row.tags_json),
    coverImageUrl: String(row.cover_image_url || ""),
    coverImageAlt: String(row.cover_image_alt || ""),
    seoTitle: String(row.seo_title || ""),
    seoDescription: String(row.seo_description || ""),
    publishedAt: row.published_at ? String(row.published_at) : null,
    updatedAt: String(row.updated_at || ""),
  };
}

function normalizePathname(value) {
  const path = String(value || "/").replace(/\\/+$/g, "") || "/";
  return path;
}

function decodeSegment(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function blogSlugFromPath(path) {
  if (!path.startsWith("/blog/")) return "";
  if (path === "/blog/rss.xml") return "";
  const rest = path.slice("/blog/".length);
  if (!rest || rest.includes("/")) return "";
  return decodeSegment(rest);
}

function blogCollectionFilterFromPath(path) {
  const tagPrefix = "/blog/tag/";
  const categoryPrefix = "/blog/category/";
  if (path.startsWith(tagPrefix)) {
    const rest = path.slice(tagPrefix.length);
    if (rest && !rest.includes("/")) return { tag: decodeSegment(rest) };
  }
  if (path.startsWith(categoryPrefix)) {
    const rest = path.slice(categoryPrefix.length);
    if (rest && !rest.includes("/")) return { category: decodeSegment(rest) };
  }
  return null;
}

function normalizeFilterValue(value) {
  return String(value || "").trim().toLowerCase();
}

function postMatchesFilters(post, filters = {}) {
  const tag = normalizeFilterValue(filters.tag);
  const category = normalizeFilterValue(filters.category);
  const search = normalizeFilterValue(filters.search || filters.q);
  if (tag && !(post.tags || []).some((item) => normalizeFilterValue(item) === tag)) return false;
  if (category && normalizeFilterValue(post.category) !== category) return false;
  if (search) {
    const haystack = [
      post.title,
      post.excerpt,
      post.contentHtml,
      post.category,
      ...(post.tags || []),
    ].join(" ").toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  return true;
}

function getDb(env) {
  return env && env[D1_BINDING_NAME] ? env[D1_BINDING_NAME] : null;
}

async function fetchAsset(request, env) {
  if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
    return env.ASSETS.fetch(request);
  }
  return new Response("Not found", { status: 404 });
}

async function fetchAssetText(request, env, pathname) {
  if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== "function") return "";
  let currentPath = pathname;
  const seen = new Set();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (seen.has(currentPath)) return "";
    seen.add(currentPath);
    const url = new URL(request.url);
    url.pathname = currentPath;
    url.search = "";
    const response = await env.ASSETS.fetch(new Request(url.toString(), request));
    if (response.ok) return response.text();
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") || "";
      if (location) {
        currentPath = new URL(location, url.toString()).pathname;
        continue;
      }
    }
    if (currentPath.endsWith(".html")) {
      currentPath = currentPath.slice(0, -".html".length);
      continue;
    }
    break;
  }
  return "";
}

async function querySettings(db) {
  const row = await db
    .prepare(
      "SELECT enabled, nav_label, rss_enabled, sitemap_enabled FROM shpitto_blog_settings WHERE project_id = ? AND source_app = ? LIMIT 1",
    )
    .bind(PROJECT_ID, SOURCE_APP)
    .first();
  if (!row) {
    return { enabled: true, navLabel: "Blog", rssEnabled: true, sitemapEnabled: true };
  }
  return {
    enabled: Number(row.enabled ?? 1) !== 0,
    navLabel: String(row.nav_label || "Blog"),
    rssEnabled: true,
    sitemapEnabled: true,
  };
}

async function listPosts(db, options = {}) {
  const limit = typeof options === "number" ? options : Number(options.limit || 50);
  const result = await db
    .prepare(
      \`SELECT id, project_id, slug, title, excerpt, content_html, author_name, category, tags_json, cover_image_url, cover_image_alt, seo_title, seo_description, published_at, updated_at
       FROM shpitto_blog_posts
       WHERE project_id = ? AND source_app = ? AND status = 'published'
       ORDER BY COALESCE(published_at, updated_at) DESC, created_at DESC
       LIMIT ?\`,
    )
    .bind(PROJECT_ID, SOURCE_APP, Math.max(1, Math.min(50, Number(limit) || 50)))
    .all();
  const posts = Array.isArray(result.results) ? result.results.map(toPost) : [];
  return posts.filter((post) => postMatchesFilters(post, typeof options === "number" ? {} : options));
}

async function getPostBySlug(db, slug) {
  const row = await db
    .prepare(
      \`SELECT id, project_id, slug, title, excerpt, content_html, author_name, category, tags_json, cover_image_url, cover_image_alt, seo_title, seo_description, published_at, updated_at
       FROM shpitto_blog_posts
       WHERE project_id = ? AND source_app = ? AND status = 'published' AND slug = ?
       LIMIT 1\`,
    )
    .bind(PROJECT_ID, SOURCE_APP, slug)
    .first();
  return row ? toPost(row) : null;
}

function renderShell({ title, description, body }) {
  const locale = runtimeLocaleFrom(title, description, body);
  const homeLabel = locale === "zh-CN" ? "首页" : "Home";
  const blogLabel = locale === "zh-CN" ? "博客" : "Blog";
  return \`<!doctype html>
<html lang="\${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>\${escapeHtml(title)}</title>
  <meta name="description" content="\${escapeAttr(description || title)}" />
  <style>
    :root { color-scheme: light; --bg:#f8fafc; --text:#0f172a; --muted:#64748b; --line:#e2e8f0; --card:#fff; --accent:#0f766e; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: radial-gradient(circle at top left, #ecfeff, transparent 34rem), var(--bg); }
    a { color: inherit; }
    .wrap { width: min(1040px, 92vw); margin: 0 auto; }
    header, footer { padding: 28px 0; }
    header a { color: var(--accent); font-weight: 800; text-decoration: none; }
    h1 { font-size: clamp(2rem, 5vw, 4.8rem); line-height: .95; letter-spacing: -.06em; margin: 24px 0; }
    h2 { font-size: clamp(1.5rem, 3vw, 2.6rem); letter-spacing: -.04em; }
    p { line-height: 1.75; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; margin: 28px 0 48px; }
    .card { background: color-mix(in oklab, var(--card) 92%, transparent); border: 1px solid var(--line); border-radius: 22px; padding: 22px; box-shadow: 0 16px 42px rgba(15,23,42,.08); }
    .card img, .cover { width: 100%; border-radius: 18px; object-fit: cover; max-height: 360px; }
    .meta { color: var(--muted); font-size: .92rem; }
    .tag { display: inline-flex; margin: 4px 6px 0 0; border: 1px solid var(--line); border-radius: 999px; padding: 4px 9px; color: var(--muted); font-size: .82rem; text-decoration: none; }
    article { background: var(--card); border: 1px solid var(--line); border-radius: 28px; padding: clamp(22px, 4vw, 54px); box-shadow: 0 16px 42px rgba(15,23,42,.08); }
    article img { max-width: 100%; border-radius: 18px; }
  </style>
</head>
<body>
  <header class="wrap"><a href="/">\${homeLabel}</a> <span class="meta">/</span> <a href="/blog">\${blogLabel}</a></header>
  <main class="wrap">\${body}</main>
  <footer class="wrap meta"></footer>
</body>
</html>\`;
}

function renderPostCard(post, cardClass = "card") {
  const tagHtml = post.tags.map((tag) => \`<a class="tag" href="/blog/tag/\${encodeURIComponent(tag)}">\${escapeHtml(tag)}</a>\`).join("");
  const tagsText = [post.category || "", ...(post.tags || [])].join(" ").toLowerCase();
  return \`<article class="\${escapeAttr(cardClass || "card")}" data-filter-card data-tags="\${escapeAttr(tagsText)}">
    \${post.coverImageUrl ? \`<img src="\${escapeAttr(post.coverImageUrl)}" alt="\${escapeAttr(post.coverImageAlt || post.title)}" loading="lazy" />\` : ""}
    <p class="meta">\${escapeHtml(post.category || "Article")} \${post.publishedAt ? " · " + escapeHtml(post.publishedAt.slice(0, 10)) : ""}</p>
    <h2><a href="/blog/\${encodeURIComponent(post.slug)}/">\${escapeHtml(post.title)}</a></h2>
    <p>\${escapeHtml(post.excerpt)}</p>
    <div>\${tagHtml}</div>
  </article>\`;
}

function renderList(posts, title = "Blog", description = "Latest articles") {
  const body = \`<section>
    <p class="meta">\${escapeHtml(description)}</p>
    <h1>\${escapeHtml(title)}</h1>
    <section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts">
      <div class="grid" data-shpitto-blog-list>\${posts.length ? posts.map(renderPostCard).join("") : '<div class="card"><p>No published posts yet.</p></div>'}</div>
    </section>
  </section>\`;
  return renderShell({ title, description, body });
}

function inferGeneratedCardClass(html) {
  const match = String(html || "").match(/data-shpitto-blog-list[\\s\\S]*?<article\\b[^>]*\\bclass=(["'])([^"']+)\\1/i);
  return match ? match[2] : "card";
}

function setListShellHead(html, title, description) {
  let next = String(html || "");
  if (/<title>[\\s\\S]*?<\\/title>/i.test(next)) {
    next = next.replace(/<title>[\\s\\S]*?<\\/title>/i, \`<title>\${escapeHtml(title)}</title>\`);
  }
  if (/<meta\\b[^>]*name=(["'])description\\1[^>]*>/i.test(next)) {
    next = next.replace(/<meta\\b[^>]*name=(["'])description\\1[^>]*>/i, \`<meta name="description" content="\${escapeAttr(description || title)}">\`);
  }
  return next;
}

function renderGeneratedListBody(posts, title, description, cardClass) {
  const cards = posts.length
    ? posts.map((post) => renderPostCard(post, cardClass)).join("")
    : '<article class="card"><p>No published posts yet.</p></article>';
  return \`<section class="section shpitto-blog-collection-section">
    <div class="container">
      <p class="meta">\${escapeHtml(description)}</p>
      <h1>\${escapeHtml(title)}</h1>
      <section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts">
        <div class="blog-grid" data-shpitto-blog-list>\${cards}</div>
      </section>
    </div>
  </section>\`;
}

function collectionPageTitle(filter, value, settings) {
  const locale = runtimeLocaleFrom(settings?.navLabel || "", value || "", "");
  if (locale === "zh-CN") {
    return filter.tag ? \`标签：\${value}\` : \`分类：\${value}\`;
  }
  return filter.tag ? \`Tag: \${value}\` : \`Category: \${value}\`;
}

function fillListShell(shell, posts, title, description) {
  const source = String(shell || "");
  if (!source || !/<\\/main>/i.test(source)) return "";
  const cardClass = inferGeneratedCardClass(source);
  const body = renderGeneratedListBody(posts, title, description, cardClass);
  let html = setListShellHead(source, title, description);
  if (/<main\\b[^>]*>[\\s\\S]*?<\\/main>/i.test(html)) {
    html = html.replace(/(<main\\b[^>]*>)[\\s\\S]*?(<\\/main>)/i, (_match, open, close) => \`\${open}\n\${body}\n\${close}\`);
  } else {
    html = html.replace(/<\\/body>/i, \`\${body}\n</body>\`);
  }
  return html;
}

async function renderListResponse(request, env, posts, title = "Blog", description = "Latest articles") {
  const shell = await fetchAssetText(request, env, "/blog/index.html");
  const html = shell && /<html[\\s>]/i.test(shell) && /<\\/main>/i.test(shell)
    ? fillListShell(shell, posts, title, description)
    : "";
  return new Response(html || renderList(posts, title, description), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}

function renderPost(post) {
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || post.title;
  const tags = post.tags.map((tag) => \`<a class="tag" href="/blog/tag/\${encodeURIComponent(tag)}">\${escapeHtml(tag)}</a>\`).join("");
  const body = \`<article>
    \${post.coverImageUrl ? \`<img class="cover" src="\${escapeAttr(post.coverImageUrl)}" alt="\${escapeAttr(post.coverImageAlt || post.title)}" />\` : ""}
    <p class="meta">\${escapeHtml(post.category || "Article")} \${post.publishedAt ? " · " + escapeHtml(post.publishedAt.slice(0, 10)) : ""}</p>
    <h1>\${escapeHtml(post.title)}</h1>
    <p class="meta">\${escapeHtml(post.excerpt)}</p>
    <div>\${tags}</div>
    <section>\${post.contentHtml || "<p>No content.</p>"}</section>
  </article>\`;
  return renderShell({ title, description, body });
}

function renderPostTags(post) {
  return post.tags
    .map((tag) => \`<a class="pill shpitto-blog-post-tag" href="/blog/tag/\${encodeURIComponent(tag)}">\${escapeHtml(tag)}</a>\`)
    .join("");
}

function renderPostCover(post) {
  if (!post.coverImageUrl) return "";
  return \`<img class="shpitto-blog-post-cover" src="\${escapeAttr(post.coverImageUrl)}" alt="\${escapeAttr(post.coverImageAlt || post.title)}" loading="lazy" />\`;
}

function fillPostShell(shell, post, settings) {
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || post.title;
  const meta = [post.category || settings.navLabel || "Blog", post.publishedAt ? post.publishedAt.slice(0, 10) : ""]
    .filter(Boolean)
    .join(" · ");
  const replacements = {
    "__SHPITTO_BLOG_SEO_TITLE__": escapeHtml(title),
    "__SHPITTO_BLOG_SEO_DESCRIPTION__": escapeAttr(description),
    "__SHPITTO_BLOG_POST_TITLE__": escapeHtml(post.title),
    "__SHPITTO_BLOG_POST_EXCERPT__": escapeHtml(post.excerpt),
    "__SHPITTO_BLOG_POST_META__": escapeHtml(meta),
    "__SHPITTO_BLOG_POST_TAGS__": renderPostTags(post),
    "__SHPITTO_BLOG_POST_COVER__": renderPostCover(post),
    "__SHPITTO_BLOG_POST_CONTENT__": post.contentHtml || "<p>No content.</p>",
  };
  let html = String(shell || "");
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value);
  }
  return html;
}

async function renderPostResponse(request, env, post, settings) {
  const shell = await fetchAssetText(request, env, BLOG_POST_SHELL_PATH);
  const html = shell && shell.includes("__SHPITTO_BLOG_POST_CONTENT__")
    ? fillPostShell(shell, post, settings)
    : renderPost(post);
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
}

function renderRss(posts, requestUrl) {
  const origin = new URL(requestUrl).origin;
  const items = posts
    .map((post) => \`<item>
      <title>\${escapeHtml(post.title)}</title>
      <link>\${origin}/blog/\${encodeURIComponent(post.slug)}</link>
      <guid>\${origin}/blog/\${encodeURIComponent(post.slug)}</guid>
      <description>\${escapeHtml(post.excerpt)}</description>
      \${post.publishedAt ? \`<pubDate>\${new Date(post.publishedAt).toUTCString()}</pubDate>\` : ""}
    </item>\`)
    .join("");
  return \`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Blog</title>
  <link>\${origin}/blog</link>
  <description>Latest articles</description>
  \${items}
</channel></rss>\`;
}

function renderSitemap(posts, requestUrl) {
  const origin = new URL(requestUrl).origin;
  const urls = [
    \`\${origin}/\`,
    \`\${origin}/blog/\`,
    ...posts.map((post) => \`\${origin}/blog/\${encodeURIComponent(post.slug)}/\`),
  ];
  const items = Array.from(new Set(urls))
    .map((loc) => \`  <url><loc>\${escapeHtml(loc)}</loc></url>\`)
    .join("\\n");
  return \`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
\${items}
</urlset>\`;
}

async function handleBlogRequest(request, env) {
  const db = getDb(env);
  const url = new URL(request.url);
  const path = normalizePathname(url.pathname);
  const isBlogIndex = path === "/blog";
  const blogSlug = blogSlugFromPath(path);
  if (!db) {
    if (blogSlug || isBlogIndex) return fetchAsset(request, env);
    return json({ ok: false, error: \`D1 binding \${D1_BINDING_NAME} is not configured.\` }, { status: 503 });
  }
  const settings = await querySettings(db);
  if (!settings.enabled) {
    return path.startsWith("/api/")
      ? json({ ok: true, posts: [], settings })
      : new Response("Blog is disabled.", { status: 404 });
  }

  if (path === "/api/blog/posts") {
    const filters = {
      limit: Number(url.searchParams.get("limit") || 50),
      tag: url.searchParams.get("tag") || "",
      category: url.searchParams.get("category") || "",
      search: url.searchParams.get("search") || url.searchParams.get("q") || "",
    };
    const posts = await listPosts(db, filters);
    return json({ ok: true, posts, settings, filters });
  }
  if (path.startsWith("/api/blog/posts/")) {
    const slug = decodeSegment(path.slice("/api/blog/posts/".length));
    const post = await getPostBySlug(db, slug);
    return post ? json({ ok: true, post, settings }) : json({ ok: false, error: "Post not found." }, { status: 404 });
  }

  if (path === "/blog/rss.xml") {
    if (!settings.rssEnabled) return new Response("RSS is disabled.", { status: 404 });
    const posts = await listPosts(db, 50);
    return new Response(renderRss(posts, request.url), {
      headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  }

  if (blogSlug) {
    const post = await getPostBySlug(db, blogSlug);
    return post ? renderPostResponse(request, env, post, settings) : fetchAsset(request, env);
  }

  const collectionFilter = blogCollectionFilterFromPath(path);
  if (collectionFilter) {
    const posts = await listPosts(db, { ...collectionFilter, limit: 50 });
    const value = collectionFilter.tag || collectionFilter.category || "";
    const title = collectionPageTitle(collectionFilter, value, settings);
    return renderListResponse(request, env, posts, title, settings.navLabel || "Blog");
  }

  if (isBlogIndex) {
    const posts = await listPosts(db, 50);
    return renderListResponse(request, env, posts, settings.navLabel || "Blog", "Latest articles");
  }

  const posts = await listPosts(db, 50);
  if (path === "/sitemap.xml") {
    if (!settings.sitemapEnabled) return new Response("Sitemap is disabled.", { status: 404 });
    return new Response(renderSitemap(posts, request.url), {
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  }

  return fetchAsset(request, env);
}

export default {
  async fetch(request, env) {
    const path = normalizePathname(new URL(request.url).pathname);
    if (path === "/blog" || path === "/blog/rss.xml" || path === "/sitemap.xml" || path === "/api/blog/posts" || path.startsWith("/api/blog/posts/") || blogSlugFromPath(path) || blogCollectionFilterFromPath(path)) {
      try {
        return await handleBlogRequest(request, env);
      } catch (error) {
        return json({ ok: false, error: String(error && error.message ? error.message : error || "Blog runtime error.") }, { status: 500 });
      }
    }
    return fetchAsset(request, env);
  },
};
`;
}
