import type { BlogPostRecord, BlogSettingsRecord } from "./blog-types";

type StaticSiteFile = {
  path: string;
  content: string;
  type?: string;
};

type SnapshotInput = {
  projectId: string;
  posts: BlogPostRecord[];
  settings?: BlogSettingsRecord | null;
  generatedAt?: string;
};

type SnapshotTheme = {
  headHtml?: string;
};

type SnapshotPayload = {
  provider: "shpitto";
  mode: "deployment-d1-static-snapshot";
  projectId: string;
  generatedAt: string;
  postCount: number;
  posts: BlogPostRecord[];
  settings: {
    enabled: boolean;
    navLabel: string;
    rssEnabled: boolean;
    sitemapEnabled: boolean;
  };
};

const BLOG_POST_SHELL_PATH = "/shpitto-blog-post-shell.html";
const BLOG_THEME_PATH = "/shpitto-blog-theme.json";
const TITLE_PLACEHOLDER = "__SHPITTO_BLOG_SEO_TITLE__";
const DESCRIPTION_PLACEHOLDER = "__SHPITTO_BLOG_SEO_DESCRIPTION__";
const POST_TITLE_PLACEHOLDER = "__SHPITTO_BLOG_POST_TITLE__";
const POST_EXCERPT_PLACEHOLDER = "__SHPITTO_BLOG_POST_EXCERPT__";
const POST_META_PLACEHOLDER = "__SHPITTO_BLOG_POST_META__";
const POST_TAGS_PLACEHOLDER = "__SHPITTO_BLOG_POST_TAGS__";
const POST_COVER_PLACEHOLDER = "__SHPITTO_BLOG_POST_COVER__";
const POST_CONTENT_PLACEHOLDER = "__SHPITTO_BLOG_POST_CONTENT__";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: unknown) {
  return escapeHtml(value).replace(/\s+/g, " ");
}

function normalizeText(value: unknown, fallback = "") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function normalizeMultilineText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function parseJsonStringArray(value: unknown): string[] {
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

function normalizePath(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

function renderShell(params: { title: string; description: string; body: string; theme?: SnapshotTheme }) {
  const themeHeadHtml = String(params.theme?.headHtml || "").trim();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(params.title)}</title>
  <meta name="description" content="${escapeAttr(params.description)}" />
  ${themeHeadHtml}
  <style>
    .shpitto-blog-page { margin: 0; color: var(--text, #0f172a); background: var(--bg, #f8fafc); }
    .shpitto-blog-page * { box-sizing: border-box; }
    .shpitto-blog-page a { color: inherit; }
    .shpitto-blog-wrap { width: min(1040px, 92vw); margin: 0 auto; }
    .shpitto-blog-header, .shpitto-blog-footer { padding: 28px 0; }
    .shpitto-blog-header a { color: var(--accent, #0f766e); font-weight: 800; text-decoration: none; }
    .shpitto-blog-title { font-size: clamp(2rem, 5vw, 4.8rem); line-height: .95; letter-spacing: -.06em; margin: 24px 0; }
    .shpitto-blog-card-title { font-size: clamp(1.5rem, 3vw, 2.6rem); letter-spacing: -.04em; }
    .shpitto-blog-page p { line-height: 1.75; }
    .shpitto-blog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; margin: 28px 0 48px; }
    .shpitto-blog-card { background: color-mix(in oklab, var(--card, #fff) 92%, transparent); border: 1px solid var(--line, #e2e8f0); border-radius: 22px; padding: 22px; box-shadow: 0 16px 42px rgba(15,23,42,.08); }
    .shpitto-blog-card img, .shpitto-blog-cover { width: 100%; border-radius: 18px; object-fit: cover; max-height: 360px; }
    .shpitto-blog-meta { color: var(--muted, #64748b); font-size: .92rem; }
    .shpitto-blog-page .meta { color: var(--muted, #64748b); font-size: .92rem; }
    .shpitto-blog-tag { display: inline-flex; margin: 4px 6px 0 0; border: 1px solid var(--line, #e2e8f0); border-radius: 999px; padding: 4px 9px; color: var(--muted, #64748b); font-size: .82rem; text-decoration: none; }
    .shpitto-blog-post { background: var(--card, #fff); border: 1px solid var(--line, #e2e8f0); border-radius: 28px; padding: clamp(22px, 4vw, 54px); box-shadow: 0 16px 42px rgba(15,23,42,.08); }
    .shpitto-blog-post img { max-width: 100%; border-radius: 18px; }
  </style>
</head>
<body class="shpitto-blog-page">
  <header class="shpitto-blog-wrap shpitto-blog-header"><a href="/">Home</a> <span class="shpitto-blog-meta">/</span> <a href="/blog/">Blog</a></header>
  <main class="shpitto-blog-wrap">${params.body}</main>
  <footer class="shpitto-blog-wrap shpitto-blog-footer shpitto-blog-meta">Generated by Shpitto from the deployment-time Blog snapshot.</footer>
</body>
</html>`;
}

function renderPostCard(post: BlogPostRecord) {
  const tags = post.tags
    .map((tag) => `<a class="shpitto-blog-tag" href="/blog/tag/${encodeURIComponent(tag)}">${escapeHtml(tag)}</a>`)
    .join("");
  return `<article class="shpitto-blog-card">
    ${post.coverImageUrl ? `<img src="${escapeAttr(post.coverImageUrl)}" alt="${escapeAttr(post.coverImageAlt || post.title)}" loading="lazy" />` : ""}
    <p class="meta">${escapeHtml(post.category || "Resource")}${post.publishedAt ? ` · ${escapeHtml(post.publishedAt.slice(0, 10))}` : ""}</p>
    <h2 class="shpitto-blog-card-title"><a href="/blog/${encodeURIComponent(post.slug)}/">${escapeHtml(post.title)}</a></h2>
    <p>${escapeHtml(post.excerpt)}</p>
    <div>${tags}</div>
  </article>`;
}

function renderList(posts: BlogPostRecord[], title: string, description: string, theme?: SnapshotTheme) {
  const body = `<section>
    <p class="shpitto-blog-meta">${escapeHtml(description)}</p>
    <h1 class="shpitto-blog-title">${escapeHtml(title)}</h1>
    <div class="shpitto-blog-grid">${posts.length ? posts.map(renderPostCard).join("") : '<div class="shpitto-blog-card"><p>No published resources yet.</p></div>'}</div>
  </section>`;
  return renderShell({ title, description, body, theme });
}

function renderPost(post: BlogPostRecord, theme?: SnapshotTheme) {
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || post.title;
  const tags = post.tags
    .map((tag) => `<a class="shpitto-blog-tag" href="/blog/tag/${encodeURIComponent(tag)}">${escapeHtml(tag)}</a>`)
    .join("");
  const body = `<article class="shpitto-blog-post">
    ${post.coverImageUrl ? `<img class="shpitto-blog-cover" src="${escapeAttr(post.coverImageUrl)}" alt="${escapeAttr(post.coverImageAlt || post.title)}" />` : ""}
    <p class="meta">${escapeHtml(post.category || "Resource")}${post.publishedAt ? ` · ${escapeHtml(post.publishedAt.slice(0, 10))}` : ""}</p>
    <h1 class="shpitto-blog-title">${escapeHtml(post.title)}</h1>
    <p class="shpitto-blog-meta">${escapeHtml(post.excerpt)}</p>
    <div>${tags}</div>
    <section>${post.contentHtml || "<p>No content.</p>"}</section>
  </article>`;
  return renderShell({ title, description, body, theme });
}

function renderRss(posts: BlogPostRecord[]) {
  const items = posts
    .map((post) => `<item>
      <title>${escapeHtml(post.title)}</title>
      <link>/blog/${encodeURIComponent(post.slug)}/</link>
      <guid>/blog/${encodeURIComponent(post.slug)}/</guid>
      <description>${escapeHtml(post.excerpt)}</description>
      ${post.publishedAt ? `<pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>` : ""}
    </item>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Blog</title>
  <link>/blog</link>
  <description>Latest articles</description>
  ${items}
</channel></rss>`;
}

function buildSnapshotPayload(input: SnapshotInput, posts: BlogPostRecord[]): SnapshotPayload {
  const settings = input.settings;
  return {
    provider: "shpitto",
    mode: "deployment-d1-static-snapshot",
    projectId: input.projectId,
    generatedAt: input.generatedAt || new Date().toISOString(),
    postCount: posts.length,
    posts,
    settings: {
      enabled: settings?.enabled !== false,
      navLabel: normalizeText(settings?.navLabel, "Blog"),
      rssEnabled: settings?.rssEnabled !== false,
      sitemapEnabled: settings?.sitemapEnabled !== false,
    },
  };
}

function file(path: string, content: string, type = "text/html"): StaticSiteFile {
  return { path: normalizePath(path), content, type };
}

export function buildDeployedBlogSnapshotFiles(input: SnapshotInput): StaticSiteFile[] {
  const settings = input.settings;
  if (settings && !settings.enabled) return [];
  const posts = Array.isArray(input.posts) ? input.posts : [];
  const payload = buildSnapshotPayload(input, posts);
  const files: StaticSiteFile[] = [
    file(
      "/shpitto-blog-snapshot.json",
      JSON.stringify(payload, null, 2),
      "application/json",
    ),
  ];

  if (settings?.rssEnabled !== false) {
    files.push(file("/blog/rss.xml", renderRss(posts), "application/rss+xml"));
  }
  for (const post of posts) {
    if (!post.slug) continue;
    files.push(file(`/blog/${encodeURIComponent(post.slug)}/index.html`, renderPost(post), "text/html"));
  }

  return files;
}

function isHtmlFile(path: string, type?: string) {
  return path.toLowerCase().endsWith(".html") || String(type || "").toLowerCase().includes("html");
}

function isBlogPath(path: string) {
  const normalized = normalizePath(path).toLowerCase();
  return normalized === "/blog/index.html" || normalized.startsWith("/blog/");
}

function isBlogIndexPath(path: string) {
  return normalizePath(path).toLowerCase() === "/blog/index.html";
}

function hasBlogDataSourceContract(content: string) {
  const source = String(content || "");
  return (
    /data-shpitto-blog-root\b/i.test(source) &&
    /data-shpitto-blog-list\b/i.test(source) &&
    /data-shpitto-blog-api\s*=\s*["']\/api\/blog\/posts["']/i.test(source)
  );
}

function findGeneratedBlogSourceFile(files: StaticSiteFile[]) {
  return (
    files.find((file) => isBlogIndexPath(String(file.path || ""))) ||
    files.find((file) => isHtmlFile(String(file.path || ""), file.type) && hasBlogDataSourceContract(String(file.content || "")))
  );
}

function htmlPathToRoute(path: string) {
  const normalized = normalizePath(path);
  if (normalized === "/index.html") return "/";
  if (!normalized.endsWith("/index.html")) return "";
  return normalizePath(normalized.slice(0, -"/index.html".length) || "/");
}

function routeToHref(route: string) {
  const normalized = normalizePath(route);
  return normalized === "/" ? "/" : `${normalized}/`;
}

function extractThemeHeadHtml(files: StaticSiteFile[]) {
  const home = files.find((file) => normalizePath(String(file.path || "")) === "/index.html");
  const html = String(home?.content || "");
  if (!html) return "";

  const tags = new Set<string>();
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const lower = tag.toLowerCase();
    if (
      lower.includes('rel="stylesheet"') ||
      lower.includes("rel='stylesheet'") ||
      lower.includes('rel="preconnect"') ||
      lower.includes("rel='preconnect'") ||
      lower.includes('rel="preload"') ||
      lower.includes("rel='preload'") ||
      /\.css(?:["'?]|$)/i.test(tag)
    ) {
      tags.add(
        tag.replace(/\bhref=(["'])([^"']+)\1/gi, (_match, quote: string, href: string) => {
          const rawHref = String(href || "").trim();
          if (!rawHref || rawHref.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(rawHref) || rawHref.startsWith("#")) {
            return `href=${quote}${rawHref}${quote}`;
          }
          const normalizedHref = `/${rawHref.replace(/^\.\//, "").replace(/^\/+/, "")}`;
          return `href=${quote}${normalizedHref}${quote}`;
        }),
      );
    }
  }
  return Array.from(tags).join("\n  ");
}

function addThemeHeadToBlogHtml(content: string, themeHeadHtml: string) {
  const theme = String(themeHeadHtml || "").trim();
  if (!theme) return content;
  const existing = content.toLowerCase();
  const lines = theme
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !existing.includes(line.toLowerCase()));
  if (lines.length === 0) return content;
  const block = `  ${lines.join("\n  ")}\n`;
  if (/<style\b/i.test(content)) {
    return content.replace(/<style\b/i, `${block}  <style`);
  }
  return content.replace(/<\/head>/i, `${block}</head>`);
}

function extractHtmlLang(content: string) {
  const match = String(content || "").match(/<html\b[^>]*\blang=(["'])([^"']+)\1/i);
  return normalizeText(match?.[2], "zh-CN");
}

function normalizeRootAssetReferences(content: string) {
  return String(content || "")
    .replace(/\b(href|src)=(["'])\.\.\/([^"']+)\2/gi, (_match, attr: string, quote: string, assetPath: string) => {
      return `${attr}=${quote}/${String(assetPath || "").replace(/^\/+/, "")}${quote}`;
    })
    .replace(/\b(href|src)=(["'])\.\/([^"']+)\2/gi, (_match, attr: string, quote: string, assetPath: string) => {
      return `${attr}=${quote}/${String(assetPath || "").replace(/^\/+/, "")}${quote}`;
    });
}

function setShellHeadPlaceholders(content: string) {
  let next = String(content || "");
  if (/<title>[\s\S]*?<\/title>/i.test(next)) {
    next = next.replace(/<title>[\s\S]*?<\/title>/i, `<title>${TITLE_PLACEHOLDER}</title>`);
  } else {
    next = next.replace(/<head\b[^>]*>/i, (match) => `${match}\n  <title>${TITLE_PLACEHOLDER}</title>`);
  }

  if (/<meta\b[^>]*\bname=(["'])description\1[^>]*>/i.test(next)) {
    next = next.replace(
      /<meta\b[^>]*\bname=(["'])description\1[^>]*>/i,
      `<meta name="description" content="${DESCRIPTION_PLACEHOLDER}">`,
    );
  } else {
    next = next.replace(/<title>[\s\S]*?<\/title>/i, (match) => `${match}\n  <meta name="description" content="${DESCRIPTION_PLACEHOLDER}">`);
  }
  return next;
}

function buildPostShellArticle(payload: SnapshotPayload | null) {
  const navLabel = escapeHtml(payload?.settings.navLabel || "Blog");
  return `<section class="section shpitto-blog-post-section" data-shpitto-blog-post-root>
  <div class="container shpitto-blog-post-container">
    <article class="card shpitto-blog-post-card">
      ${POST_COVER_PLACEHOLDER}
      <p class="meta shpitto-blog-post-meta">${POST_META_PLACEHOLDER}</p>
      <h1 class="hero-title shpitto-blog-post-title">${POST_TITLE_PLACEHOLDER}</h1>
      <p class="section-copy shpitto-blog-post-excerpt">${POST_EXCERPT_PLACEHOLDER}</p>
      <div class="meta-tags shpitto-blog-post-tags">${POST_TAGS_PLACEHOLDER}</div>
      <section class="shpitto-blog-post-content">${POST_CONTENT_PLACEHOLDER}</section>
      <div class="hero-actions shpitto-blog-post-actions"><a class="button-secondary" href="/blog/">${navLabel}</a></div>
    </article>
  </div>
</section>`;
}

function buildPostShellFromGeneratedHtml(files: StaticSiteFile[], payload: SnapshotPayload | null, themeHeadHtml: string) {
  const blog = findGeneratedBlogSourceFile(files);
  const home = files.find((file) => normalizePath(String(file.path || "")) === "/index.html");
  const source = normalizeRootAssetReferences(addThemeHeadToBlogHtml(String(blog?.content || home?.content || ""), themeHeadHtml));
  if (!source) {
    return renderShell({
      title: TITLE_PLACEHOLDER,
      description: DESCRIPTION_PLACEHOLDER,
      body: buildPostShellArticle(payload),
      theme: { headHtml: themeHeadHtml },
    });
  }

  const article = buildPostShellArticle(payload);
  let shell = setShellHeadPlaceholders(source);
  if (/<main\b[^>]*>[\s\S]*?<\/main>/i.test(shell)) {
    shell = shell.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/i, (_match, open: string, close: string) => `${open}\n${article}\n${close}`);
  } else if (/<body\b[^>]*>[\s\S]*?<\/body>/i.test(shell)) {
    shell = shell.replace(/(<body\b[^>]*>)[\s\S]*?(<\/body>)/i, (_match, open: string, close: string) => `${open}\n<main>\n${article}\n</main>\n${close}`);
  } else {
    shell = renderShell({
      title: TITLE_PLACEHOLDER,
      description: DESCRIPTION_PLACEHOLDER,
      body: article,
      theme: { headHtml: themeHeadHtml },
    });
  }

  return shell;
}

function buildThemePayload(files: StaticSiteFile[], payload: SnapshotPayload | null) {
  const blog = findGeneratedBlogSourceFile(files);
  const home = files.find((file) => normalizePath(String(file.path || "")) === "/index.html");
  const source = String(blog?.content || home?.content || "");
  return {
    provider: "shpitto",
    mode: "deployment-blog-theme",
    locale: extractHtmlLang(source),
    navLabel: normalizeText(payload?.settings.navLabel, "Blog"),
    postShellPath: BLOG_POST_SHELL_PATH,
    generatedAt: new Date().toISOString(),
  };
}

function blogSnapshotSlugFromPath(path: string) {
  const match = normalizePath(path).match(/^\/blog\/([^/]+)\/index\.html$/i);
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function renderShellPostTags(post: BlogPostRecord) {
  return post.tags
    .map((tag) => `<a class="pill shpitto-blog-post-tag" href="/blog/tag/${encodeURIComponent(tag)}">${escapeHtml(tag)}</a>`)
    .join("");
}

function renderShellPostCover(post: BlogPostRecord) {
  if (!post.coverImageUrl) return "";
  return `<img class="shpitto-blog-post-cover" src="${escapeAttr(post.coverImageUrl)}" alt="${escapeAttr(post.coverImageAlt || post.title)}" loading="lazy" />`;
}

function fillPostShellHtml(shell: string, post: BlogPostRecord, navLabel = "Blog") {
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || post.title;
  const meta = [post.category || navLabel, post.publishedAt ? post.publishedAt.slice(0, 10) : ""]
    .filter(Boolean)
    .join(" · ");
  const replacements: Record<string, string> = {
    [TITLE_PLACEHOLDER]: escapeHtml(title),
    [DESCRIPTION_PLACEHOLDER]: escapeAttr(description),
    [POST_TITLE_PLACEHOLDER]: escapeHtml(post.title),
    [POST_EXCERPT_PLACEHOLDER]: escapeHtml(post.excerpt),
    [POST_META_PLACEHOLDER]: escapeHtml(meta),
    [POST_TAGS_PLACEHOLDER]: renderShellPostTags(post),
    [POST_COVER_PLACEHOLDER]: renderShellPostCover(post),
    [POST_CONTENT_PLACEHOLDER]: post.contentHtml || "<p>No content.</p>",
  };
  let html = shell;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value);
  }
  return html;
}

function hasBlogLink(content: string, href = "/blog/") {
  const target = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\/$/, "\\/?");
  return new RegExp(`href\\s*=\\s*["']${target}["']`, "i").test(content);
}

function injectBlogLinkIntoGeneratedHtml(content: string, navLabel = "Blog", href = "/blog/") {
  if (!content || hasBlogLink(content, href)) return content;
  const anchor = `<a href="${escapeAttr(href)}">${escapeHtml(navLabel || "Blog")}</a>`;
  if (/<nav\b[^>]*>[\s\S]*?<\/nav>/i.test(content)) {
    return content.replace(/(<\/nav>)/i, `${anchor}$1`);
  }
  if (/<header\b[^>]*>[\s\S]*?<\/header>/i.test(content)) {
    return content.replace(/(<\/header>)/i, `${anchor}$1`);
  }
  return content;
}

function safeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function readSnapshotPayload(files: StaticSiteFile[]): SnapshotPayload | null {
  const snapshot = files.find((item) => normalizePath(item.path) === "/shpitto-blog-snapshot.json");
  if (!snapshot) return null;
  try {
    const parsed = JSON.parse(String(snapshot.content || "{}"));
    if (parsed?.mode !== "deployment-d1-static-snapshot") return null;
    return {
      provider: "shpitto",
      mode: "deployment-d1-static-snapshot",
      projectId: normalizeText(parsed.projectId),
      generatedAt: normalizeText(parsed.generatedAt, new Date().toISOString()),
      postCount: Number(parsed.postCount || 0),
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      settings: {
        enabled: parsed.settings?.enabled !== false,
        navLabel: normalizeText(parsed.settings?.navLabel, "Blog"),
        rssEnabled: parsed.settings?.rssEnabled !== false,
        sitemapEnabled: parsed.settings?.sitemapEnabled !== false,
      },
    };
  } catch {
    return null;
  }
}

function escapeClassNameList(value: string) {
  return String(value || "")
    .split(/\s+/g)
    .map((item) => item.replace(/[^a-zA-Z0-9_-]+/g, ""))
    .filter(Boolean)
    .join(" ");
}

function inferGeneratedBlogCardClass(listHtml: string) {
  const match = String(listHtml || "").match(/<article\b[^>]*\bclass=(["'])([^"']+)\1/i);
  return escapeClassNameList(match?.[2] || "") || "shpitto-blog-live-card";
}

function renderLiveBlogCards(posts: BlogPostRecord[], options: { cardClass?: string } = {}) {
  const cardClass = escapeClassNameList(options.cardClass || "") || "shpitto-blog-live-card";
  if (!posts.length) {
    return `<article class="${cardClass}"><p>No published resources yet.</p></article>`;
  }
  return posts
    .map((post) => {
      const category = normalizeText(post.category, "Resource");
      const date = post.publishedAt ? normalizeText(post.publishedAt.slice(0, 10)) : "";
      const meta = [category, date].filter(Boolean).join(" · ");
      const tags = post.tags
        .slice(0, 4)
        .map((tag) => `<span class="shpitto-blog-live-tag">${escapeHtml(tag)}</span>`)
        .join("");
      return `<article class="${cardClass}" data-filter-card data-tags="${escapeAttr([category, ...post.tags].join(" ").toLowerCase())}">
        ${post.coverImageUrl ? `<img class="shpitto-blog-live-cover" src="${escapeAttr(post.coverImageUrl)}" alt="${escapeAttr(post.coverImageAlt || post.title)}" loading="lazy" />` : ""}
        <p class="shpitto-blog-live-meta">${escapeHtml(meta)}</p>
        <h3><a href="/blog/${encodeURIComponent(post.slug)}/">${escapeHtml(post.title)}</a></h3>
        <p>${escapeHtml(post.excerpt)}</p>
        ${tags ? `<div class="shpitto-blog-live-tags">${tags}</div>` : ""}
      </article>`;
    })
    .join("");
}

function replaceBlogListInnerHtml(content: string, replacement: (innerHtml: string) => string) {
  const source = String(content || "");
  const openMatch = /<([a-z0-9-]+)\b(?=[^>]*\bdata-shpitto-blog-list\b)[^>]*>/i.exec(source);
  if (!openMatch?.[0] || !openMatch[1]) return source;
  const tagName = openMatch[1].toLowerCase();
  const openStart = openMatch.index;
  const openEnd = openStart + openMatch[0].length;
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = openEnd;
  let depth = 1;
  let closeStart = -1;
  let closeEnd = -1;
  for (let match = tagPattern.exec(source); match; match = tagPattern.exec(source)) {
    const token = match[0];
    if (/^<\//.test(token)) {
      depth -= 1;
      if (depth === 0) {
        closeStart = match.index;
        closeEnd = match.index + token.length;
        break;
      }
    } else if (!/\/>$/.test(token)) {
      depth += 1;
    }
  }
  if (closeStart < 0 || closeEnd < 0) return source;
  const inner = source.slice(openEnd, closeStart);
  return `${source.slice(0, openEnd)}${replacement(inner)}${source.slice(closeStart)}`;
}

function buildBlogApiBridge(payload: SnapshotPayload) {
  const navLabel = normalizeText(payload.settings.navLabel, "Blog");
  const posts = payload.posts.slice(0, 12);
  const initialData = {
    ok: true,
    posts,
    settings: payload.settings,
  };
  return `
<!-- Shpitto Blog live data bridge: preserves generated theme while hydrating from the deployment D1 Worker API. -->
<section class="shpitto-blog-live" data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts">
  <div class="shpitto-blog-live-kicker">${escapeHtml(navLabel)}</div>
  <div class="shpitto-blog-live-heading">
    <h2>${escapeHtml(navLabel)}</h2>
    <p>Latest content records for this collection.</p>
  </div>
  <div class="shpitto-blog-live-grid" data-shpitto-blog-list>${renderLiveBlogCards(posts)}</div>
</section>
<script type="application/json" id="shpitto-blog-initial-data">${safeScriptJson(initialData)}</script>
<script>
(() => {
  const root = document.querySelector("[data-shpitto-blog-root]");
  if (!root) return;
  const list = root.querySelector("[data-shpitto-blog-list]");
  const api = root.getAttribute("data-shpitto-blog-api") || "/api/blog/posts";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] || char);
  const render = (posts) => {
    if (!list) return;
    const items = Array.isArray(posts) ? posts : [];
    list.innerHTML = items.length
      ? items.slice(0, 12).map((post) => {
          const slug = encodeURIComponent(String(post.slug || ""));
          const category = String(post.category || "Resource");
          const date = post.publishedAt ? String(post.publishedAt).slice(0, 10) : "";
          const meta = [category, date].filter(Boolean).join(" · ");
          const tags = Array.isArray(post.tags)
            ? post.tags.slice(0, 4).map((tag) => '<span class="shpitto-blog-live-tag">' + escapeHtml(tag) + '</span>').join("")
            : "";
          const cover = post.coverImageUrl
            ? '<img class="shpitto-blog-live-cover" src="' + escapeHtml(post.coverImageUrl) + '" alt="' + escapeHtml(post.coverImageAlt || post.title || "") + '" loading="lazy" />'
            : "";
          return '<article class="shpitto-blog-live-card">' + cover +
            '<p class="shpitto-blog-live-meta">' + escapeHtml(meta) + '</p>' +
            '<h3><a href="/blog/' + slug + '/">' + escapeHtml(post.title || "Untitled") + '</a></h3>' +
            '<p>' + escapeHtml(post.excerpt || "") + '</p>' +
            (tags ? '<div class="shpitto-blog-live-tags">' + tags + '</div>' : "") +
            '</article>';
        }).join("")
      : '<article class="shpitto-blog-live-card"><p>No published resources yet.</p></article>';
  };
  fetch(api + "?limit=12", { headers: { "accept": "application/json" } })
    .then((response) => response.ok ? response.json() : null)
    .then((data) => data && data.ok && render(data.posts))
    .catch(() => {});
})();
</script>
<style>
  .shpitto-blog-live { width: min(1120px, 92vw); margin: clamp(32px, 6vw, 72px) auto; padding: clamp(22px, 4vw, 42px); border: 1px solid color-mix(in oklab, currentColor 16%, transparent); border-radius: 28px; background: color-mix(in oklab, canvas 88%, transparent); }
  .shpitto-blog-live-kicker { text-transform: uppercase; letter-spacing: .16em; font-size: .78rem; opacity: .72; margin-bottom: 10px; }
  .shpitto-blog-live-heading { display: grid; gap: 8px; margin-bottom: 24px; }
  .shpitto-blog-live-heading h2 { margin: 0; font-size: clamp(2rem, 5vw, 4rem); line-height: .98; }
  .shpitto-blog-live-heading p { margin: 0; opacity: .72; }
  .shpitto-blog-live-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
  .shpitto-blog-live-card { display: grid; gap: 12px; padding: 18px; border: 1px solid color-mix(in oklab, currentColor 14%, transparent); border-radius: 22px; background: color-mix(in oklab, canvas 94%, transparent); }
  .shpitto-blog-live-card h3 { margin: 0; font-size: clamp(1.25rem, 2vw, 1.7rem); line-height: 1.1; }
  .shpitto-blog-live-card p { margin: 0; }
  .shpitto-blog-live-card a { color: inherit; }
  .shpitto-blog-live-cover { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 16px; }
  .shpitto-blog-live-meta { opacity: .68; font-size: .9rem; }
  .shpitto-blog-live-tags { display: flex; flex-wrap: wrap; gap: 8px; }
  .shpitto-blog-live-tag { border: 1px solid color-mix(in oklab, currentColor 18%, transparent); border-radius: 999px; padding: 4px 9px; font-size: .78rem; opacity: .78; }
</style>`;
}

function buildBlogFilterBridgeScript() {
  return `<script>
(() => {
  const bind = () => {
    const chips = Array.from(document.querySelectorAll("[data-filter-chip]"));
    const searchInputs = Array.from(document.querySelectorAll("[data-blog-search], [data-search-input], input[type='search']"));
    if (!chips.length && !searchInputs.length) return;
    const cardSelector = "[data-shpitto-blog-list] [data-filter-card], [data-shpitto-blog-list] article";
    let activeKey = chips.find((chip) => chip.getAttribute("aria-pressed") === "true")?.getAttribute("data-filter-chip") || "all";
    const normalize = (value) => String(value || "").trim().toLowerCase();
    const apply = (key = activeKey) => {
      activeKey = normalize(key) || "all";
      const query = normalize(searchInputs[0]?.value || "");
      const cards = Array.from(document.querySelectorAll(cardSelector));
      cards.forEach((card) => {
        const tags = normalize(card.getAttribute("data-tags") || card.textContent || "");
        const text = normalize(card.textContent || "");
        const tagMatch = activeKey === "all" || tags.includes(activeKey);
        const searchMatch = !query || text.includes(query);
        card.classList.toggle("hidden", !(tagMatch && searchMatch));
        card.hidden = !(tagMatch && searchMatch);
      });
      chips.forEach((chip) => {
        const isActive = normalize(chip.getAttribute("data-filter-chip")) === activeKey;
        chip.setAttribute("aria-pressed", String(isActive));
        chip.classList.toggle("is-active", isActive);
      });
    };
    chips.forEach((chip) => {
      if (chip.dataset.shpittoFilterBound === "1") return;
      chip.dataset.shpittoFilterBound = "1";
      chip.addEventListener("click", () => apply(chip.getAttribute("data-filter-chip") || "all"));
    });
    searchInputs.forEach((input) => {
      if (input.dataset.shpittoFilterBound === "1") return;
      input.dataset.shpittoFilterBound = "1";
      input.addEventListener("input", () => apply(activeKey));
    });
    apply(activeKey);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
  window.addEventListener("load", () => setTimeout(bind, 0), { once: true });
  setTimeout(bind, 600);
})();
</script>`;
}

function injectBlogFilterBridge(content: string) {
  const source = String(content || "");
  if (!/data-filter-chip|data-blog-search|data-search-input|type=["']search["']/i.test(source)) return source;
  if (/data-shpitto-filter-bridge/i.test(source)) return source;
  const script = buildBlogFilterBridgeScript().replace("<script>", '<script data-shpitto-filter-bridge>');
  if (/<\/body>/i.test(source)) return source.replace(/<\/body>/i, `${script}\n</body>`);
  return `${source}\n${script}`;
}

function injectBlogApiBridgeIntoGeneratedHtml(content: string, payload: SnapshotPayload | null) {
  if (!payload || payload.settings.enabled === false || !content) return content;
  const withFilterBridge = (html: string) => injectBlogFilterBridge(html);
  if (/data-shpitto-blog-root/i.test(content)) {
    const hydrated = replaceBlogListInnerHtml(content, (inner) =>
      renderLiveBlogCards(payload.posts.slice(0, 12), { cardClass: inferGeneratedBlogCardClass(inner) }),
    );
    const withApi = /data-shpitto-blog-api\s*=\s*["']\/api\/blog\/posts["']/i.test(hydrated)
      ? hydrated
      : hydrated.replace(/\bdata-shpitto-blog-root\b/i, 'data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"');
    return withFilterBridge(withApi);
  }
  const bridge = buildBlogApiBridge(payload);
  if (/<\/main>/i.test(content)) {
    return withFilterBridge(content.replace(/<\/main>/i, `${bridge}\n</main>`));
  }
  if (/<\/body>/i.test(content)) {
    return withFilterBridge(content.replace(/<\/body>/i, `${bridge}\n</body>`));
  }
  return withFilterBridge(`${content}\n${bridge}`);
}

export function injectDeployedBlogSnapshot(project: any, files: StaticSiteFile[]) {
  if (!Array.isArray(files) || files.length === 0) {
    return { project, injected: false, files: [] };
  }
  const existing = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
  const byPath = new Map<string, StaticSiteFile>();
  const normalizedExisting = existing.map((item: any) => ({
    path: normalizePath(String(item?.path || "")),
    content: String(item?.content || ""),
    type: String(item?.type || "") || undefined,
  }));
  const generatedBlogSource = findGeneratedBlogSourceFile(normalizedExisting);
  const generatedBlogHref = routeToHref(htmlPathToRoute(String(generatedBlogSource?.path || "/blog/index.html")) || "/blog");
  const themeHeadHtml = extractThemeHeadHtml(normalizedExisting);
  const payload = readSnapshotPayload(files);
  const postShellHtml = buildPostShellFromGeneratedHtml(normalizedExisting, payload, themeHeadHtml);
  const themePayload = buildThemePayload(normalizedExisting, payload);
  for (const item of existing) {
    const path = normalizePath(String(item?.path || ""));
    if (!path || path === "/") continue;
    const type = String(item?.type || "") || undefined;
    const content = String(item?.content || "");
    const nextContent = isHtmlFile(path, type) && (isBlogIndexPath(path) || hasBlogDataSourceContract(content))
      ? injectBlogApiBridgeIntoGeneratedHtml(addThemeHeadToBlogHtml(content, themeHeadHtml), payload)
      : isHtmlFile(path, type) && !isBlogPath(path)
        ? injectBlogLinkIntoGeneratedHtml(content, payload?.settings.navLabel, generatedBlogHref)
        : content;
    byPath.set(path, {
      path,
      content: nextContent,
      type,
    });
  }
  for (const item of files) {
    const path = normalizePath(item.path);
    const type = item.type;
    const detailSlug = blogSnapshotSlugFromPath(path);
    const detailPost = detailSlug ? payload?.posts.find((post) => post.slug === detailSlug) : null;
    const content = detailPost
      ? fillPostShellHtml(postShellHtml, detailPost, payload?.settings.navLabel)
      : isHtmlFile(path, type) && isBlogPath(path)
        ? addThemeHeadToBlogHtml(String(item.content || ""), themeHeadHtml)
        : String(item.content || "");
    byPath.set(path, { ...item, path, content });
  }
  byPath.set(BLOG_POST_SHELL_PATH, {
    path: BLOG_POST_SHELL_PATH,
    content: postShellHtml,
    type: "text/html",
  });
  byPath.set(BLOG_THEME_PATH, {
    path: BLOG_THEME_PATH,
    content: JSON.stringify(themePayload, null, 2),
    type: "application/json",
  });
  return {
    project: {
      ...project,
      staticSite: {
        ...(project?.staticSite || {}),
        mode: "skill-direct",
        files: Array.from(byPath.values()),
        generation: {
          ...((project?.staticSite || {}).generation || {}),
          blogSnapshot: {
            mode: "deployment-d1-static-snapshot",
            injectedAt: new Date().toISOString(),
            fileCount: files.length,
          },
        },
      },
    },
    injected: true,
    files,
  };
}

function rowToSnapshotPost(row: Record<string, unknown>): BlogPostRecord {
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
    status: normalizeText(row.status, "draft") as BlogPostRecord["status"],
    authorName: normalizeText(row.authorName),
    category: normalizeText(row.category),
    tags: parseJsonStringArray(row.tagsJson),
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

function rowToSnapshotSettings(row: Record<string, unknown> | null): BlogSettingsRecord | null {
  if (!row) return null;
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

export async function buildDeployedBlogSnapshotFilesFromD1(projectId: string) {
  const { getD1Client } = await import("./d1.ts");
  const d1 = getD1Client();
  if (!d1.isConfigured()) {
    return buildDeployedBlogSnapshotFiles({
      projectId,
      posts: [],
      settings: null,
    });
  }
  await d1.ensureShpittoSchema();

  const settings = rowToSnapshotSettings(
    await d1
      .queryOne<Record<string, unknown>>(
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
          AND source_app = 'shpitto'
        LIMIT 1;
        `,
        [projectId],
      )
      .catch(() => null),
  );
  const rows =
    settings?.enabled === false
      ? []
      : await d1
          .query<Record<string, unknown>>(
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
            LIMIT 50;
            `,
            [projectId],
          )
          .catch(() => []);
  const posts = rows.map(rowToSnapshotPost);
  return buildDeployedBlogSnapshotFiles({
    projectId,
    posts,
    settings,
  });
}
