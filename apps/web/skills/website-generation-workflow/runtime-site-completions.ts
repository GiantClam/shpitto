import type { AgentState } from "../../lib/agent/graph.ts";
import { renderMarkdownToHtml } from "../../lib/blog-markdown.ts";
import type { BlogPostUpsertInput } from "../../lib/blog-types.ts";

type RuntimeFile = { path: string; content: string; type: string };
type Locale = "zh-CN" | "en" | "bilingual";
type VisibleLocale = "zh-CN" | "en";
type BlogPreview = {
  required: boolean;
  reason: string;
  navLabel: string;
  posts: BlogPostUpsertInput[];
};
type PageBlueprintDecision = {
  requirementText?: string;
};

type CompletionDeps = {
  normalizePath: (value: string) => string;
  routeToHtmlPath: (route: string) => string;
  ensureHtmlDocument: (html: string) => string;
  htmlToReadableText: (html: string) => string;
  dedupeFiles: (files: any[]) => RuntimeFile[];
  cloneJson: <T>(value: T) => T;
  escapeHtml: (value: string) => string;
  syncPagesFromStaticFiles: (project: any) => any;
  ensureSkillDirectStaticProject: (project: any) => any;
  toVisibleLocale: (locale: Locale) => VisibleLocale;
  buildBlogContentWorkflowPreview: (params: {
    inputState: AgentState;
    project: any;
    locale: Locale;
  }) => BlogPreview;
  collectPrimaryBlogSourceText: (inputState: AgentState) => string;
  collectDeployBlogSourceText: (inputState: AgentState, project: any) => string;
  inferBlogBrand: (text: string, locale: VisibleLocale) => string;
  diffStaticProjectFiles: (beforeProject: any, afterProject: any) => string[];
  listProjectRoutes: (project: any) => string[];
  buildLocalDecisionPlan: (state: any) => PageBlueprintDecision;
  extractRequirementText: (state: AgentState) => string;
  renderLocalPage: (params: {
    route: string;
    decision: any;
    requirementText: string;
  }) => string;
  structuralRouteAliasMap: Array<{ route: string; keys: string[] }>;
};

export function sanitizeBlogIndexEditorialScaffoldText(html: string) {
  let next = String(html || "");
  if (!next) return next;

  const replacements: Array<[RegExp, string]> = [
    [/\u5185\u5bb9\u9605\u8bfb\u8def\u5f84/g, "\u5185\u5bb9\u4e3b\u9898\u8109\u7edc"],
    [/\u9605\u8bfb\u8def\u5f84/g, "\u5185\u5bb9\u8109\u7edc"],
    [/\u9605\u8bfb\u65b9\u5f0f/g, "\u5185\u5bb9\u7ec4\u7ec7"],
    [/\u63a8\u8350\u9605\u8bfb\u987a\u5e8f/g, "\u672c\u9875\u4e3b\u9898\u7f16\u6392"],
    [/\u5982\u4f55\u9605\u8bfb/g, "\u672c\u9875\u4e3b\u9898"],
    [/\u5e26\u56de\u66f4\u5b8c\u6574\u7684\u5185\u5bb9\u9605\u8bfb\u8def\u5f84/g, "\u7ee7\u7eed\u5c55\u5f00\u66f4\u5b8c\u6574\u7684\u5185\u5bb9\u4e3b\u9898"],
    [/\u7ec4\u6210\u4e86\u4e00\u6761\u6e05\u6670\u7684\u9605\u8bfb\u8def\u5f84/g, "\u7ec4\u6210\u4e86\u4e00\u7ec4\u6e05\u6670\u7684\u5185\u5bb9\u4e3b\u9898"],
    [/content reading path/gi, "content themes"],
    [/reading path/gi, "content themes"],
    [/reading method/gi, "content structure"],
    [/suggested reading order/gi, "article themes"],
    [/how to read/gi, "article themes"],
    [/reader path/gi, "content themes"],
  ];

  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }

  return next;
}

function sanitizeBlogIndexEditorialScaffold(project: any, deps: CompletionDeps) {
  const next = deps.cloneJson(project);
  const files = deps.dedupeFiles((next?.staticSite?.files || []) as any[]);
  let changed = false;
  const sanitizedFiles = files.map((file) => {
    const filePath = deps.normalizePath(String(file?.path || ""));
    const content = String(file?.content || "");
    if (filePath !== "/blog/index.html") return file;
    const sanitized = sanitizeBlogIndexEditorialScaffoldText(content);
    if (sanitized === content) return file;
    changed = true;
    return {
      ...file,
      content: sanitized,
    };
  });

  if (!changed) return next;

  next.staticSite = {
    ...(next?.staticSite || {}),
    mode: "skill-direct",
    files: sanitizedFiles,
  };

  if (Array.isArray(next?.pages)) {
    next.pages = next.pages.map((page: any) => {
      const route = deps.normalizePath(String(page?.path || ""));
      if (route !== "/blog") return page;
      return {
        ...page,
        html: sanitizeBlogIndexEditorialScaffoldText(String(page?.html || "")),
      };
    });
  }

  return deps.syncPagesFromStaticFiles(next);
}

export function extractOrderedBlogDetailRoutesFromProject(project: any, deps: CompletionDeps): string[] {
  const files = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
  const blogIndexHtml = String(
    files.find((file: any) => deps.normalizePath(String(file?.path || "")) === "/blog/index.html")?.content || "",
  );
  const discovered = new Set<string>();
  const pattern = /href=["'](\/blog\/(?!tag\/|category\/|rss\.xml)([^"'?#]+?)\/?)["']/gi;
  for (const match of blogIndexHtml.matchAll(pattern)) {
    const route = deps.normalizePath(String(match[1] || "").replace(/\/+$/g, ""));
    if (!route || route === "/blog") continue;
    discovered.add(route);
  }
  for (const file of files) {
    const filePath = deps.normalizePath(String(file?.path || ""));
    const match = filePath.match(/^\/blog\/([^/]+)\/index\.html$/i);
    if (!match?.[1]) continue;
    discovered.add(`/blog/${match[1]}`);
  }
  return Array.from(discovered);
}

export function slugFromBlogDetailRoute(route: string, deps: CompletionDeps): string {
  return String(deps.normalizePath(route).split("/").filter(Boolean).pop() || "").trim();
}

export function projectHasStaticBlogDetailFile(project: any, route: string, deps: CompletionDeps): boolean {
  const targetPath = `${deps.normalizePath(route)}/index.html`;
  const files = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
  return files.some((file: any) => deps.normalizePath(String(file?.path || "")) === targetPath);
}

export function renderGeneratedBlogDetailPage(params: {
  post: BlogPostUpsertInput;
  locale: VisibleLocale;
  brandName: string;
  navLabel: string;
  relatedPosts: BlogPostUpsertInput[];
  deps: CompletionDeps;
}): string {
  const { post, locale, brandName, navLabel, relatedPosts, deps } = params;
  const lang = locale === "en" ? "en" : "zh";
  const readMoreLabelZh = "\u7ee7\u7eed\u9605\u8bfb";
  const readMoreLabelEn = "Continue reading";
  const backToBlogLabelZh = "\u8fd4\u56de\u535a\u5ba2";
  const backToBlogLabelEn = "Back to blog";
  const backHomeLabelZh = "\u8fd4\u56de\u9996\u9875";
  const backHomeLabelEn = "See home";
  const articleLabelZh = "\u6587\u7ae0\u6b63\u6587";
  const articleLabelEn = "Article body";
  const relatedTitleZh = "\u76f8\u5173\u6587\u7ae0";
  const relatedTitleEn = "Related entries";
  const returnTitleZh = "\u8fd4\u56de\u535a\u5ba2\u7ee7\u7eed\u6d4f\u89c8\u5b8c\u6574\u5185\u5bb9";
  const returnTitleEn = "Return to the blog and continue reading";
  const skipLinkZh = "\u8df3\u5230\u4e3b\u8981\u5185\u5bb9";
  const skipLinkEn = "Skip to main content";
  const navHomeZh = "\u9996\u9875";
  const navHomeEn = "Home";
  const navBlogZh = "\u535a\u5ba2";
  const navBlogEn = "Blog";
  const metaBits = [post.category, ...(Array.isArray(post.tags) ? post.tags.slice(0, 2) : [])].filter(Boolean);
  const metaText = metaBits.join(" \u00b7 ");
  const articleHtml = renderMarkdownToHtml(String(post.contentMd || "").trim());
  const relatedHtml = relatedPosts
    .slice(0, 2)
    .map((item) => {
      const slug = String(item.slug || "").trim();
      const title = deps.escapeHtml(String(item.title || "").trim());
      const excerpt = deps.escapeHtml(String(item.excerpt || "").trim());
      if (!slug || !title) return "";
      return [
        '<article class="feature-card">',
        `  <span class="feature-card__eyebrow">${deps.escapeHtml(navLabel)}</span>`,
        `  <h3><a href="/blog/${deps.escapeHtml(slug)}/" class="article-card__link">${title}</a></h3>`,
        `  <p>${excerpt}</p>`,
        '</article>',
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n");

  const ariaText = (zh: string, en: string): string => (locale === "en" ? en : zh);

  return deps.ensureHtmlDocument(`<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${deps.escapeHtml(String(post.seoTitle || post.title || `${brandName} ${navLabel}`).trim())}</title>
  <meta name="description" content="${deps.escapeHtml(String(post.seoDescription || post.excerpt || '').trim())}" />
  <link rel="stylesheet" href="../../styles.css" />
  <script src="../../script.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">${deps.escapeHtml(locale === "en" ? skipLinkEn : skipLinkZh)}</a>
  <header class="site-header" role="banner">
    <div class="site-header__inner">
      <a class="brand" href="/" aria-label="${deps.escapeHtml(brandName)}">
        <span class="brand__mark" aria-hidden="true">${deps.escapeHtml(String(brandName || 'S').trim().charAt(0) || 'S')}</span>
        <span class="brand__text">${deps.escapeHtml(brandName)}</span>
      </a>
      <nav class="topnav" aria-label="${ariaText("主导航", "Primary navigation")}">
        <a href="/">${deps.escapeHtml(locale === 'en' ? navHomeEn : navHomeZh)}</a>
        <a href="/blog" aria-current="page">${deps.escapeHtml(navLabel)}</a>
      </nav>
    </div>
  </header>
  <main id="main">
    <article class="site-shell">
      <header class="page-hero" aria-labelledby="post-title">
        <div class="page-hero__grid">
          <div>
            <p class="hero__lede">${deps.escapeHtml(navLabel)}</p>
            <h1 id="post-title">${deps.escapeHtml(String(post.title || '').trim())}</h1>
            ${post.excerpt ? `<p class="page-hero__intro">${deps.escapeHtml(String(post.excerpt || '').trim())}</p>` : ''}
            ${metaText ? `<div class="article-card__meta" style="margin-top:1.2rem;"><span>${deps.escapeHtml(metaText)}</span></div>` : ''}
          </div>
        </div>
      </header>
      <div class="prose" aria-label="${ariaText(articleLabelZh, articleLabelEn)}">${articleHtml}</div>
    </article>
    <section class="section site-shell" aria-labelledby="related-title">
      <div class="section__head">
        <div>
          <p class="hero__lede">${deps.escapeHtml(locale === 'en' ? readMoreLabelEn : readMoreLabelZh)}</p>
          <h2 class="section__title" id="related-title">${deps.escapeHtml(locale === 'en' ? relatedTitleEn : relatedTitleZh)}</h2>
        </div>
      </div>
      <div class="feature-grid">
        ${relatedHtml}
      </div>
    </section>
    <section class="section site-shell" aria-labelledby="back-title">
      <div class="panel">
        <div class="page-hero__grid" style="align-items:center">
          <div>
            <p class="hero__lede">${deps.escapeHtml(locale === 'en' ? backToBlogLabelEn : backToBlogLabelZh)}</p>
            <h2 class="section__title" id="back-title">${deps.escapeHtml(locale === 'en' ? returnTitleEn : returnTitleZh)}</h2>
            <div class="page-hero__actions">
              <a class="button--accent" href="/blog">${deps.escapeHtml(locale === 'en' ? backToBlogLabelEn : backToBlogLabelZh)}</a>
              <a class="button--ghost" href="/">${deps.escapeHtml(locale === 'en' ? backHomeLabelEn : backHomeLabelZh)}</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>`);
}

function slugToken(input: string, fallback: string): string {
  const normalized = String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return normalized || fallback;
}

function isBlogDetailCompletionRefineInstruction(instruction: string): boolean {
  const normalized = String(instruction || "").trim().toLowerCase();
  if (!normalized) return false;
  return /(?:blog|article|post|内容页|详情页|明细页|文章页|detail page|detail pages)/i.test(normalized) &&
    /(?:缺少|缺失|补齐|补全|补充|complete|fill|missing|add|generate|create)/i.test(normalized);
}

function normalizeStructuralRouteCandidate(
  value: string,
  deps: CompletionDeps,
): string | undefined {
  const raw = String(value || "").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  if (!raw) return undefined;
  if (raw.startsWith("/")) {
    const normalized = deps.normalizePath(raw.replace(/\/+$/g, ""));
    return normalized || undefined;
  }

  const lowered = raw.toLowerCase().replace(/\s+/g, " ").trim();
  for (const alias of deps.structuralRouteAliasMap) {
    if (alias.keys.some((key) => lowered === key || lowered.includes(key))) {
      return alias.route;
    }
  }

  if (/^[a-z][a-z0-9\s/_-]{1,48}$/i.test(raw)) {
    const slug = slugToken(raw, "");
    if (slug) return deps.normalizePath(`/${slug}`);
  }

  return undefined;
}

export function extractStructuralRefineRouteAdditions(
  project: any,
  instruction: string,
  deps: CompletionDeps,
): string[] {
  const text = String(instruction || "").trim();
  if (!text) return [];
  if (!/(?:新增|添加|增加|补充|创建|create|add|new|include|missing)/i.test(text)) {
    return [];
  }

  const existingRoutes = new Set(deps.listProjectRoutes(project));
  const discovered = new Set<string>();
  const pushRoute = (candidate: string | undefined) => {
    const route = normalizeStructuralRouteCandidate(candidate || "", deps);
    if (!route || existingRoutes.has(route)) return;
    discovered.add(route);
  };

  for (const match of text.matchAll(/(?:^|[\s(：:])((?:\/[a-z0-9][a-z0-9/_-]*)+)(?=$|[\s).，。；;])/gi)) {
    pushRoute(match[1]);
  }
  for (const match of text.matchAll(/(?:新增|添加|增加|补充|创建)\s*(?:一个|一页|页面|路由)?\s*([A-Za-z][A-Za-z0-9\s/_-]{1,40}|[\u4e00-\u9fff]{2,16})\s*(?:页面|页|路由)?/gi)) {
    pushRoute(match[1]);
  }
  for (const match of text.matchAll(/(?:add|create|include)\s+(?:a|an|one|another)?\s*([a-z][a-z0-9\s/_-]{1,40})\s+(?:page|route)/gi)) {
    pushRoute(match[1]);
  }
  for (const match of text.matchAll(/["'“”]([^"'“”]{2,48})["'“”]\s*(?:页面|页|page|route)/gi)) {
    pushRoute(match[1]);
  }

  return Array.from(discovered).sort((a, b) => a.localeCompare(b));
}

function materializeStructuralRefineAddedRoutes(params: {
  project: any;
  inputState: AgentState;
  instruction: string;
  locale: Locale;
  deps: CompletionDeps;
}): { project: any; changedFiles: string[] } {
  const addRoutes = extractStructuralRefineRouteAdditions(params.project, params.instruction, params.deps);
  if (addRoutes.length === 0) {
    return { project: params.project, changedFiles: [] };
  }

  const next = params.deps.ensureSkillDirectStaticProject(params.project);
  const stateForDecision = params.deps.cloneJson(params.inputState || {});
  stateForDecision.sitemap = Array.from(new Set([...params.deps.listProjectRoutes(next), ...addRoutes]));
  const decision = params.deps.buildLocalDecisionPlan(stateForDecision);
  const requirementText =
    String(decision?.requirementText || "").trim() ||
    params.deps.extractRequirementText(stateForDecision) ||
    params.instruction;
  const files = params.deps.dedupeFiles((next?.staticSite?.files || []) as any[]);
  const byPath = new Map(files.map((file) => [params.deps.normalizePath(String(file.path || "")), { ...file }] as const));
  const homeHtml = params.deps.ensureHtmlDocument(String(byPath.get("/index.html")?.content || ""));
  const homeNavBlock = String(homeHtml.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/i)?.[0] || "");
  const homeFooterBlock = String(homeHtml.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/i)?.[0] || "");
  const changed = new Set<string>();

  for (const route of addRoutes) {
    const targetPath = params.deps.routeToHtmlPath(route);
    if (byPath.has(targetPath)) continue;
    let html = params.deps.renderLocalPage({
      route,
      decision,
      requirementText,
    });
    if (homeNavBlock) {
      html = html.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/i, homeNavBlock);
    }
    if (homeFooterBlock) {
      html = /<footer\b[^>]*>[\s\S]*?<\/footer>/i.test(html)
        ? html.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/i, homeFooterBlock)
        : html.replace(/<\/body>/i, `${homeFooterBlock}\n</body>`);
    }
    byPath.set(targetPath, {
      path: targetPath,
      type: "text/html",
      content: html,
    });
    changed.add(targetPath);
  }

  if (changed.size === 0) {
    return { project: params.project, changedFiles: [] };
  }

  next.staticSite = {
    ...(next.staticSite || {}),
    mode: "skill-direct",
    files: Array.from(byPath.values()),
  };
  return {
    project: params.deps.syncPagesFromStaticFiles(next),
    changedFiles: Array.from(changed).sort((a, b) => a.localeCompare(b)),
  };
}

export function materializeWebsiteBlogDetailPages(params: {
  project: any;
  inputState: AgentState;
  locale: Locale;
  deps: CompletionDeps;
}): any {
  const baseProject = sanitizeBlogIndexEditorialScaffold(
    params.deps.ensureSkillDirectStaticProject(params.project),
    params.deps,
  );
  const preview = params.deps.buildBlogContentWorkflowPreview({
    project: baseProject,
    inputState: params.inputState,
    locale: params.locale,
  });
  if (!preview.required || !Array.isArray(preview.posts) || preview.posts.length === 0) return baseProject;

  const visibleLocale = params.deps.toVisibleLocale(params.locale);
  const desiredRoutes = extractOrderedBlogDetailRoutesFromProject(baseProject, params.deps);
  const postRoutes = desiredRoutes.length > 0
    ? desiredRoutes
    : preview.posts.map((post) => `/blog/${slugToken(String(post.slug || "").trim(), "post")}`);
  const brandSourceText =
    params.deps.collectPrimaryBlogSourceText(params.inputState) ||
    params.deps.collectDeployBlogSourceText(params.inputState, baseProject);
  const brandName =
    String(baseProject?.branding?.name || params.deps.inferBlogBrand(brandSourceText, visibleLocale)).trim() ||
    (visibleLocale === "zh-CN" ? "网站" : "Site");
  const navLabel = String(preview.navLabel || "").trim() || (visibleLocale === "zh-CN" ? "博客" : "Blog");
  const posts = preview.posts.map((post, index) => {
    const route = postRoutes[index] || `/blog/${slugToken(String(post.slug || "").trim(), `post-${index + 1}`)}`;
    const slug = slugFromBlogDetailRoute(route, params.deps) || slugToken(String(post.slug || "").trim(), `post-${index + 1}`);
    return { ...post, slug };
  });

  const next = params.deps.cloneJson(baseProject);
  const files = params.deps.dedupeFiles((next?.staticSite?.files || []) as any[]);
  const pagesByRoute = new Map<string, { path: string; html: string }>(
    (Array.isArray(next?.pages) ? next.pages : []).map(
      (page: any) =>
        [
          params.deps.normalizePath(String(page?.path || "")),
          { path: params.deps.normalizePath(String(page?.path || "")), html: String(page?.html || "") },
        ] as const,
    ),
  );

  const generatedFiles: RuntimeFile[] = [];
  posts.forEach((post, index) => {
    const route = postRoutes[index] || `/blog/${post.slug}`;
    if (projectHasStaticBlogDetailFile({ staticSite: { files } }, route, params.deps)) return;
    const relatedPosts = posts.filter((item) => item.slug !== post.slug);
    const html = renderGeneratedBlogDetailPage({
      post,
      locale: visibleLocale,
      brandName,
      navLabel,
      relatedPosts,
      deps: params.deps,
    });
    generatedFiles.push({
      path: `${params.deps.normalizePath(route)}/index.html`,
      content: html,
      type: "text/html",
    });
    pagesByRoute.set(params.deps.normalizePath(route), { path: params.deps.normalizePath(route), html });
  });

  if (generatedFiles.length === 0) return next;
  next.staticSite = {
    ...(next.staticSite || {}),
    mode: "skill-direct",
    files: params.deps.dedupeFiles([...files, ...generatedFiles]),
  };
  next.pages = Array.from(pagesByRoute.values()).sort((a, b) => {
    if (a.path === "/") return -1;
    if (b.path === "/") return 1;
    return a.path.localeCompare(b.path);
  });
  return next;
}

export function applyWebsiteStructuralRefineCompletions(params: {
  project: any;
  inputState: AgentState;
  instruction: string;
  locale: Locale;
  deps: CompletionDeps;
}): { project: any; changedFiles: string[] } {
  let currentProject = params.project;
  const changed = new Set<string>();

  const addedRoutes = materializeStructuralRefineAddedRoutes(params);
  if (addedRoutes.changedFiles.length > 0) {
    currentProject = addedRoutes.project;
    for (const filePath of addedRoutes.changedFiles) changed.add(filePath);
  }

  const normalizedInstruction = String(params.instruction || "").trim();
  if (isBlogDetailCompletionRefineInstruction(normalizedInstruction)) {
    const materialized = materializeWebsiteBlogDetailPages({
      project: currentProject,
      inputState: params.inputState,
      locale: params.locale,
      deps: params.deps,
    });
    const changedFiles = params.deps.diffStaticProjectFiles(currentProject, materialized).filter((filePath) =>
      /^\/blog\/.+\/index\.html$/i.test(filePath)
    );
    currentProject = materialized;
    for (const filePath of changedFiles) changed.add(filePath);
  }

  return {
    project: currentProject,
    changedFiles: Array.from(changed).sort((a, b) => a.localeCompare(b)),
  };
}
