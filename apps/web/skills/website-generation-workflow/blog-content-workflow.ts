import { HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "../../lib/agent/graph.ts";
import type { BlogPostUpsertInput } from "../../lib/blog-types.ts";

type VisibleLocale = "zh-CN" | "en";
type RuntimeLocale = VisibleLocale | "bilingual";
type WorkflowFile = { path?: string; content?: string; type?: string };
type BlogPreview = {
  required: boolean;
  reason: string;
  navLabel: string;
  posts: BlogPostUpsertInput[];
};

type BlogWorkflowDeps = {
  normalizePath: (value: string) => string;
  htmlToReadableText: (input: string) => string;
  dedupeFiles: (files: any[]) => WorkflowFile[];
  toVisibleLocale: (locale: RuntimeLocale) => VisibleLocale;
  extractMessageContent: (raw: any) => string;
  isHumanLikeMessage: (raw: any) => boolean;
  isDeployConfirmationIntent: (text: string) => boolean;
};

type GeneratedTopic = {
  title: string;
  slug: string;
  category: string;
  tags: string[];
  supportingPassages: string[];
};

function extractMetaContent(html: string, name: string, deps: BlogWorkflowDeps): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    const content = deps.htmlToReadableText(match?.[1] || "");
    if (content) return content;
  }
  return "";
}

function extractMainHtml(html: string): string {
  return String(html || "").match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || String(html || "");
}

function extractOrderedBlogDetailRoutesFromProject(project: any, deps: BlogWorkflowDeps): string[] {
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

function buildMarkdownFromStaticArticleHtml(html: string, title: string, excerpt: string, deps: BlogWorkflowDeps): string {
  const mainHtml = extractMainHtml(html);
  const blocks = Array.from(mainHtml.matchAll(/<(h1|h2|h3|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi))
    .map((match) => ({ tag: String(match[1] || "").toLowerCase(), text: deps.htmlToReadableText(match[2] || "") }))
    .filter((block) => block.text);
  const lines: string[] = [];
  const normalizedTitle = title.trim();
  if (normalizedTitle) lines.push(`# ${normalizedTitle}`, "");
  if (excerpt) lines.push(excerpt, "");
  for (const block of blocks) {
    if (block.tag === "h1" && normalizedTitle && block.text === normalizedTitle) continue;
    if (excerpt && block.text === excerpt) continue;
    if (block.tag === "h2") {
      lines.push(`## ${block.text}`, "");
      continue;
    }
    if (block.tag === "h3") {
      lines.push(`### ${block.text}`, "");
      continue;
    }
    if (block.tag === "li") {
      lines.push(`- ${block.text}`);
      continue;
    }
    if (block.text.length >= 24) {
      lines.push(block.text, "");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractStaticBlogPostsFromProject(params: {
  project: any;
  locale: VisibleLocale;
  fallbackAuthorName: string;
  deps: BlogWorkflowDeps;
}): BlogPostUpsertInput[] {
  const files = Array.isArray(params.project?.staticSite?.files) ? params.project.staticSite.files : [];
  const byPath = new Map<string, string>(
    files.map((file: any) => [params.deps.normalizePath(String(file?.path || "")), String(file?.content || "")] as const),
  );
  const routes = extractOrderedBlogDetailRoutesFromProject(params.project, params.deps);
  const posts: BlogPostUpsertInput[] = [];

  for (const route of routes) {
    const slug = String(route.split("/").filter(Boolean).pop() || "").trim();
    const html = byPath.get(`${route}/index.html`) || "";
    if (!slug || !html) continue;
    const mainHtml = extractMainHtml(html);
    const title =
      params.deps.htmlToReadableText(String(mainHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "")) ||
      params.deps
        .htmlToReadableText(String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
        .replace(/[|–—].*$/, "")
        .trim();
    if (!title) continue;
    const excerpt =
      extractMetaContent(html, "description", params.deps) ||
      params.deps.htmlToReadableText(
        String(mainHtml.match(/<p\b[^>]*class=["'][^"']*(?:section-lead|hero__lede)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || ""),
      ) ||
      params.deps.htmlToReadableText(String(mainHtml.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || ""));
    const metaMatches = Array.from(mainHtml.matchAll(/<div\b[^>]*class=["'][^"']*article-meta[^"']*["'][^>]*>[\s\S]*?<\/div>/gi));
    const spans = metaMatches.flatMap((match) =>
      Array.from(String(match[0] || "").matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi))
        .map((item) => params.deps.htmlToReadableText(String(item[1] || "")))
        .filter(Boolean),
    );
    const category = spans[1] || "";
    const tags = Array.from(new Set([...spans.slice(2), category].filter(Boolean))).slice(0, 6);
    const contentMd = buildMarkdownFromStaticArticleHtml(html, title, excerpt, params.deps);
    if (contentMd.length < 80) continue;
    posts.push({
      slug,
      title,
      excerpt,
      contentMd,
      status: "published",
      authorName: params.fallbackAuthorName,
      category,
      tags,
      seoTitle:
        params.deps.htmlToReadableText(String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "") ||
        `${title} | ${params.fallbackAuthorName}`,
      seoDescription: excerpt,
    });
  }

  return posts;
}

function workflowToRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function stripRequirementFormBlock(text: string) {
  return String(text || "")
    .replace(/\[Requirement Form\][\s\S]*?```[\s\S]*?```/gi, " ")
    .replace(/```json[\s\S]*?```/gi, " ")
    .replace(/```[\s\S]*?```/g, " ");
}

function extractRequirementBusinessDetailText(text: string) {
  const source = String(text || "");
  const match = source.match(
    /(?:业务\/内容补充|Business\/content details)\s*[:：]\s*([\s\S]*?)(?=\n\s*-\s*(?:目标受众|设计主题|页面数与页面结构|功能需求|核心转化目标|网站语言|Logo 策略|Logo source)\b|\n\s*\[Requirement Form\]|$)/i,
  );
  return String(match?.[1] || "").trim();
}

function extractCustomNotesFromRequirementForm(text: string) {
  const jsonMatch = String(text || "").match(/\[Requirement Form\][\s\S]*?```json\s*([\s\S]*?)```/i);
  if (!jsonMatch?.[1]) return "";
  try {
    const parsed = JSON.parse(jsonMatch[1]);
    return String(parsed?.customNotes || "").trim();
  } catch {
    return "";
  }
}

function normalizeWorkflowSourceText(text: string) {
  return stripRequirementFormBlock(String(text || ""))
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isLikelyBlogFactSource(text: string, deps: BlogWorkflowDeps) {
  const normalized = normalizeWorkflowSourceText(text);
  if (!normalized || normalized.length < 24) return false;
  if (deps.isDeployConfirmationIntent(normalized)) return false;
  if (
    /(Requirement Form|Prompt Control Manifest|Canonical Website Generation Prompt|Workflow Skill Contract|Page-Level Intent Contract|Home Hero Layout Safety|Page Repetition Constraints|Design System Inspiration|Default Visual Inclination)/i.test(
      normalized,
    )
  ) {
    return false;
  }
  if (
    /^(?:生成前必填信息已提交|网站类型|内容来源|页面数与页面结构|核心转化目标|网站语言|Logo 策略|Logo source|目标受众|设计主题|Business\/content details|业务\/内容补充)/im.test(
      normalized,
    )
  ) {
    return false;
  }
  return true;
}

function collectPrimaryBlogSourceText(inputState: AgentState, deps: BlogWorkflowDeps) {
  const workflow = workflowToRecord((inputState as any)?.workflow_context);
  const messages = Array.isArray(inputState.messages) ? inputState.messages : [];
  const messageText = messages
    .filter((message: any) => {
      if (!(message instanceof HumanMessage) && !deps.isHumanLikeMessage(message)) return false;
      const content = deps.extractMessageContent(message);
      return content && !deps.isDeployConfirmationIntent(content);
    })
    .map((message: any) => normalizeWorkflowSourceText(deps.extractMessageContent(message)))
    .filter((content) => isLikelyBlogFactSource(content, deps))
    .filter(Boolean)
    .join("\n\n");

  const structuredSourceSegments = [
    extractRequirementBusinessDetailText(String(workflow.sourceRequirement || "")),
    extractCustomNotesFromRequirementForm(String(workflow.sourceRequirement || "")),
    extractRequirementBusinessDetailText(String(workflow.requirementAggregatedText || "")),
    extractCustomNotesFromRequirementForm(String(workflow.requirementAggregatedText || "")),
  ]
    .map((content) => normalizeWorkflowSourceText(content))
    .filter(Boolean);

  return [
    ...structuredSourceSegments,
    messageText,
    normalizeWorkflowSourceText(String(workflow.latestUserText || "")),
    normalizeWorkflowSourceText(String(workflow.requirementAggregatedText || "")),
    normalizeWorkflowSourceText(String(workflow.sourceRequirement || "")),
  ]
    .filter((content) => isLikelyBlogFactSource(content, deps))
    .filter(Boolean)
    .join("\n\n");
}

function collectDeployBlogSourceText(inputState: AgentState, project: any, deps: BlogWorkflowDeps) {
  void project;
  // Do not re-seed blog content from generated site HTML. Only explicit user/source
  // material is allowed to drive generated blog posts.
  return collectPrimaryBlogSourceText(inputState, deps);
}

function resolveProjectBrandName(project: any, deps: BlogWorkflowDeps) {
  const normalizeBrand = (value: string) => {
    const cleaned = String(value || "").replace(/\s+/g, " ").trim();
    if (!cleaned || /^(?:site|website|blog|logo|text[_ -]?mark|wordmark)$/i.test(cleaned)) return "";
    return cleaned;
  };

  const brandingName = normalizeBrand(String(project?.branding?.name || ""));
  if (brandingName) return brandingName;
  const files = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
  for (const file of files) {
    const content = String(file?.content || "");
    const brandText =
      deps.htmlToReadableText(String(content.match(/class=["'][^"']*brand__name[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || "")) ||
      deps.htmlToReadableText(String(content.match(/class=["'][^"']*brand[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] || ""));
    const cleaned = normalizeBrand(brandText);
    if (cleaned) return cleaned;
  }
  return "";
}

function normalizeSourceText(text: string) {
  return String(text || "")
    .replace(/\[Requirement Form\][\s\S]*?```[\s\S]*?```/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[{}[\]"]/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

function normalizeSourceLine(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s>*#\-–—•\d.()（）]+/g, "")
    .replace(/^[“"'`《「『【]+|[”"'`》」』】]+$/g, "")
    .replace(/[;；:：,，]+$/g, "")
    .trim();
}

function isLikelyStructuredRequirementConfigLine(line: string) {
  const value = String(line || "").trim();
  if (!value) return false;
  const configTerms =
    /(siteType|targetAudience|contentSources|designTheme|primaryVisualDirection|secondaryVisualTags|visualStyle|pageStructure|planning|functionalRequirements|primaryGoal|language|brandLogo|customNotes|mode|pages|manual|bilingual|portfolio|new_site|brand_trust|业务\/内容补充|Business\/content details|页面数与页面结构|网站类型|目标受众|网站语言|Logo source|Logo 策略)/i;
  if (/["{}[\]]/.test(value) && configTerms.test(value)) return true;
  return /^(?:siteType|targetAudience|contentSources|designTheme|primaryVisualDirection|secondaryVisualTags|visualStyle|pageStructure|planning|functionalRequirements|primaryGoal|language|brandLogo|customNotes|mode|pages|业务\/内容补充|Business\/content details|页面数与页面结构|网站类型|目标受众|网站语言|Logo source|Logo 策略)\s*[:=]/i.test(
    value,
  );
}

function isBlockedSourceContent(value: string) {
  return /(data-shpitto|Blog API|Cloudflare|runtime|fallback|route-native|native collections?|Specific Replay|marker|wrangler|deploy|requirement_spec|source\s*:|route\s*:|navLabel\s*:|purpose\s*:|pageKind\s*:|workflow_context|promptControlManifest|canonicalPrompt|Requirement Form|Prompt Control Manifest|Canonical Website Generation Prompt|Workflow Skill Contract|Page-Level Intent Contract|Home Hero Layout Safety|Page Repetition Constraints|Design System Inspiration|Default Visual Inclination)/i.test(
    value,
  );
}

function isPromptLikeSourceLine(value: string) {
  return /^(?:url\s*[:：]|https?:\/\/|我要|我想|帮我|生成|创建|做一个|如何|怎么|build\b|create\b|generate\b|please\b|need\b)/i.test(
    String(value || "").trim(),
  );
}

function splitIntoPassages(text: string) {
  const normalized = normalizeSourceText(text);
  const lines = normalized
    .split(/\n+/g)
    .map(normalizeSourceLine)
    .filter(Boolean)
    .filter((line) => !isLikelyStructuredRequirementConfigLine(line))
    .filter((line) => !isBlockedSourceContent(line))
    .filter((line) => !isPromptLikeSourceLine(line))
    .filter((line) => line.length >= 8);
  const passages = lines.flatMap((line) =>
    line
      .split(/(?<=[。！？!?])\s*|(?<=\.)\s+(?=[A-Z0-9])|(?<=;)\s+/g)
      .map(normalizeSourceLine)
      .filter(Boolean),
  );
  const seen = new Set<string>();
  return passages.filter((passage) => {
    if (passage.length < 18 || passage.length > 220) return false;
    if (isPromptLikeSourceLine(passage)) return false;
    const key = passage.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tokenizeKeywords(text: string) {
  const stopwords = new Set([
    "about",
    "article",
    "articles",
    "blog",
    "build",
    "brand",
    "canonical",
    "case",
    "company",
    "content",
    "deploy",
    "detail",
    "english",
    "feature",
    "from",
    "home",
    "index",
    "language",
    "manual",
    "modern",
    "page",
    "pages",
    "platform",
    "portfolio",
    "preview",
    "project",
    "route",
    "runtime",
    "single",
    "source",
    "static",
    "switch",
    "template",
    "website",
    "zh",
    "cn",
  ]);
  const counts = new Map<string, number>();
  for (const match of String(text || "").matchAll(/[\u4e00-\u9fff]{2,8}|[A-Za-z][A-Za-z0-9+-]{2,20}/g)) {
    const token = String(match[0] || "").trim();
    if (!token) continue;
    const normalized = /^[A-Za-z]/.test(token) ? token.toLowerCase() : token;
    if (stopwords.has(normalized)) continue;
    if (isLikelyStructuredRequirementConfigLine(normalized) || isBlockedSourceContent(normalized)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].length - right[0].length)
    .map(([token]) => token);
}

function isLikelyHeadline(line: string) {
  if (!line || line.length < 10 || line.length > 90) return false;
  if (/[。！？!?]/.test(line)) return false;
  if (/^(如何|怎么|why|how|what|when)\b/i.test(line)) return false;
  return /(指南|标准|报告|案例|汇编|观察|实践|架构|系统|手册|研究|清单|白皮书|Guide|Standard|Report|Case|Practice|Architecture|System|Playbook|Checklist|Manual|Research)/i.test(
    line,
  );
}

function collectQuotedHeadlines(text: string) {
  const source = normalizeSourceText(text);
  const candidates = [
    ...Array.from(source.matchAll(/[“"'`《「『【]([^”"'`》」』】\n]{6,90})[”"'`》」』】]/g)).map((match) => match[1] || ""),
    ...source
      .split(/\n+/g)
      .map(normalizeSourceLine)
      .filter((line) => !isLikelyStructuredRequirementConfigLine(line))
      .filter((line) => !isBlockedSourceContent(line))
      .filter((line) => !isPromptLikeSourceLine(line))
      .filter((line) => isLikelyHeadline(line)),
  ];
  const seen = new Set<string>();
  return candidates
    .map(normalizeSourceLine)
    .filter(Boolean)
    .filter((title) => !isPromptLikeSourceLine(title))
    .filter((title) => {
      const key = title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function inferBlogBrand(text: string, locale: VisibleLocale) {
  const explicitHandle = normalizeSourceText(text)
    .split(/\n+/g)
    .map(normalizeSourceLine)
    .find((line) => /^[A-Za-z][A-Za-z0-9_-]{2,24}$/.test(line) && !/^(?:logo|blog|site|website|text[_ -]?mark|wordmark)$/i.test(line));
  if (explicitHandle) return explicitHandle;
  const blocked = new Set(["HTML", "CSS", "PDF", "API", "JSON", "SEO", "CTA", "URL", "HTTP", "HTTPS", "WWW", "D1", "DB", "LOGO", "BLOG"]);
  const candidates = Array.from(String(text || "").matchAll(/\b[A-Z][A-Z0-9-]{2,16}\b/g))
    .map((match) => match[0])
    .filter((value) => !blocked.has(value))
    .filter((value) => !/^(?:text[_ -]?mark|wordmark)$/i.test(value));
  if (candidates.length) {
    const ranked = candidates
      .map((value, index) => ({
        value,
        index,
        count: (String(text || "").match(new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) || []).length,
      }))
      .sort((left, right) => right.count - left.count || left.index - right.index);
    if (ranked[0]?.value && !/^(?:LOGO|BLOG|SITE|WEBSITE)$/i.test(ranked[0].value)) return ranked[0].value;
  }
  const chineseBrand = String(text || "").match(/([\u4e00-\u9fffA-Za-z0-9-]{2,20})(?:官网|网站|平台|研究中心|工作室|实验室)/);
  if (chineseBrand?.[1]) return chineseBrand[1];
  return locale === "zh-CN" ? "作者" : "Author";
  return locale === "zh-CN" ? "站点" : "Site";
}

function slugToken(input: string, fallback: string) {
  const normalized = String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return normalized || fallback;
}

function resolveWorkflowBlogBrand(text: string, locale: VisibleLocale) {
  const explicitHandle = normalizeSourceText(text)
    .split(/\n+/g)
    .map(normalizeSourceLine)
    .find((line) => /^[A-Za-z][A-Za-z0-9_-]{2,24}$/.test(line) && !/^(?:logo|blog|site|website|text[_ -]?mark|wordmark)$/i.test(line));
  if (explicitHandle) return explicitHandle;
  const inferred = inferBlogBrand(text, locale);
  if (inferred && !/^(?:logo|blog|site|website|text[_ -]?mark|wordmark)$/i.test(inferred)) return inferred;
  return locale === "zh-CN" ? "作者" : "Author";
}

function sourceDocumentSlug(title: string, fallback: string, index: number) {
  const base = slugToken(title, fallback);
  return /\d$/.test(base) ? base : `${base}-${index + 1}`;
}

function matchKeywordCoverage(text: string, keywords: string[]) {
  const lower = String(text || "").toLowerCase();
  return keywords.filter((keyword) => lower.includes(String(keyword).toLowerCase())).length;
}

function buildFallbackKeywordSet(sourceText: string, brand: string) {
  const preferred = tokenizeKeywords(sourceText).filter((token) => token.length >= 2 && token.length <= 20);
  const combined = Array.from(new Set([brand, ...preferred].filter(Boolean)));
  return combined.slice(0, 8);
}

function staticBlogPostsNeedSourceAlignedFallback(params: {
  sourceText: string;
  staticPosts: BlogPostUpsertInput[];
}) {
  if (!Array.isArray(params.staticPosts) || params.staticPosts.length === 0) return false;
  const sourceText = String(params.sourceText || "");
  const staticText = params.staticPosts
    .map((post) => [post.title, post.excerpt, post.contentMd, post.category, ...(Array.isArray(post.tags) ? post.tags : [])].join(" "))
    .join("\n");
  const brand = resolveWorkflowBlogBrand(sourceText, /[\u4e00-\u9fff]/.test(sourceText) ? "zh-CN" : "en");
  const keywords = buildFallbackKeywordSet(sourceText, brand);
  const coverage = matchKeywordCoverage(staticText, keywords);
  const minimumCoverage = Math.min(3, Math.max(1, Math.ceil(keywords.length / 3)));
  const driftMarkers = [
    /signal house/i,
    /signal systems/i,
    /tool workspace/i,
    /error monitoring/i,
    /operational context/i,
    /editorial notes/i,
    /monitoring insight/i,
    /turn a noisy signal set into a sharp working view/i,
    /this article summarizes the most relevant material from the provided website brief/i,
    /without inventing unsupported organizations, identifiers, or case details/i,
  ];

  if (coverage < minimumCoverage) return true;
  return driftMarkers.some((pattern) => pattern.test(staticText));
}

function pickSupportingPassages(passages: string[], title: string, keywordPool: string[], used: Set<number>, count: number) {
  const titleKeywords = Array.from(new Set([title, ...keywordPool])).filter(Boolean);
  const ranked = passages
    .map((passage, index) => ({
      passage,
      index,
      score:
        titleKeywords.reduce(
          (total, keyword) => total + (passage.toLowerCase().includes(String(keyword).toLowerCase()) ? String(keyword).length : 0),
          0,
        ) + (used.has(index) ? -1000 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected: string[] = [];
  for (const item of ranked) {
    if (selected.length >= count) break;
    if (used.has(item.index)) continue;
    selected.push(item.passage);
    used.add(item.index);
  }
  if (selected.length < count) {
    for (let index = 0; index < passages.length && selected.length < count; index += 1) {
      if (used.has(index)) continue;
      selected.push(passages[index]);
      used.add(index);
    }
  }
  return selected;
}

function buildTitleFromPassage(passage: string, locale: VisibleLocale, brand: string, index: number) {
  const compact = String(passage || "").replace(/[。！？!?]+$/g, "").trim();
  if (compact.length <= 28) return compact;
  if (locale === "zh-CN") {
    return compact.slice(0, 26).replace(/[，。；：,:;]+$/g, "");
  }
  const words = compact.split(/\s+/g).slice(0, 7).join(" ");
  return words || `${brand} Article ${index + 1}`;
}

function resolveGenericCategory(title: string, locale: VisibleLocale) {
  const zh = locale === "zh-CN";
  if (/(政策|法规|汇编|Policy|Regulation)/i.test(title)) {
    return zh ? "政策法规" : "Policy";
  }
  if (/(指南|标准|手册|清单|Guide|Standard|Manual|Checklist)/i.test(title)) {
    return zh ? "标准文件" : "Guide";
  }
  if (/(研究|报告|观察|趋势|Research|Report|Insight|Trend)/i.test(title)) {
    return zh ? "研究报告" : "Research";
  }
  if (/(案例|实践|架构|系统|转型|Case|Practice|Architecture|System|Transformation)/i.test(title)) {
    return zh ? "实践案例" : "Practice";
  }
  return zh ? "专题文章" : "Article";
}

function buildTagList(title: string, passages: string[], fallbackKeywords: string[]) {
  const titleKeywords = tokenizeKeywords(title).slice(0, 3);
  const bodyKeywords = tokenizeKeywords(passages.join(" ")).slice(0, 6);
  return Array.from(new Set([...titleKeywords, ...bodyKeywords, ...fallbackKeywords]))
    .filter((token) => String(token).length >= 2)
    .slice(0, 4);
}

function buildExcerpt(title: string, passages: string[], locale: VisibleLocale) {
  if (passages[0]) return passages[0];
  return locale === "zh-CN" ? `${title}，整理自当前站点提供的原始资料。` : `${title}, organized from the provided source material.`;
}

function buildContentMarkdown(title: string, passages: string[], tags: string[], locale: VisibleLocale) {
  const intro =
    locale === "zh-CN"
      ? "本文根据当前站点提供的原始资料整理而成，仅重组已有信息，不补造来源中不存在的机构、编号或案例细节。"
      : "This article is assembled from the provided source material only and does not invent unsupported organizations, identifiers, or case details.";
  const guidance =
    locale === "zh-CN"
      ? "如需继续深入，可从当前站点的相关文章、专题分类或资料入口继续阅读。"
      : "Continue with related categories, linked records, or source materials in the current site for deeper reading.";
  return [
    `# ${title}`,
    "",
    intro,
    "",
    "## Key Points",
    ...passages.map((item) => `- ${item}`),
    "",
    "## Related Keywords",
    ...(tags.length ? tags.map((tag) => `- ${tag}`) : ["- Source-aligned article"]),
    "",
    "## Next Step",
    guidance,
  ].join("\n");
}

function buildGeneratedTopics(sourceText: string, locale: VisibleLocale, brand: string): GeneratedTopic[] {
  const passages = splitIntoPassages(sourceText);
  const keywords = buildFallbackKeywordSet(sourceText, brand);
  const headlines = collectQuotedHeadlines(sourceText);
  const used = new Set<number>();

  const topicsFromHeadlines = headlines.slice(0, 3).map((title, index) => {
    const supportingPassages = pickSupportingPassages(passages, title, tokenizeKeywords(title).slice(0, 4), used, 3);
    const category = resolveGenericCategory(title, locale);
    const tags = buildTagList(title, supportingPassages, keywords);
    return {
      title,
      slug: sourceDocumentSlug(title, `post-${index + 1}`, index),
      category,
      tags,
      supportingPassages,
    };
  });

  if (topicsFromHeadlines.length >= 3) return topicsFromHeadlines;

  const topics = [...topicsFromHeadlines];
  const availablePassages = (passages.length ? passages : [sourceText]).filter((passage) => !isPromptLikeSourceLine(passage));
  const rankedPassages = [...availablePassages].sort((left, right) => {
    const leftScore = matchKeywordCoverage(left, keywords) + tokenizeKeywords(left).length;
    const rightScore = matchKeywordCoverage(right, keywords) + tokenizeKeywords(right).length;
    return rightScore - leftScore;
  });

  for (let index = topics.length; index < 3; index += 1) {
    const pivot = rankedPassages[index] || rankedPassages[rankedPassages.length - 1] || `${brand} article ${index + 1}`;
    const title = buildTitleFromPassage(pivot, locale, brand, index);
    const keywordPool = tokenizeKeywords(`${title} ${pivot}`).slice(0, 4);
    const supportingPassages = pickSupportingPassages(availablePassages, title, keywordPool, used, 3);
    const category = resolveGenericCategory(title, locale);
    const tags = buildTagList(title, supportingPassages, keywords);
    topics.push({
      title,
      slug: sourceDocumentSlug(title, `${slugToken(brand, "site")}-post`, index),
      category,
      tags,
      supportingPassages,
    });
  }

  return topics.slice(0, 3);
}

export function buildGeneratedBlogSeedPosts(params: {
  sourceText: string;
  locale: VisibleLocale;
  brandOverride?: string;
  deps: BlogWorkflowDeps;
}): BlogPostUpsertInput[] {
  void params.deps;
  const brand = String(params.brandOverride || "").trim() || resolveWorkflowBlogBrand(params.sourceText, params.locale);
  return buildGeneratedTopics(params.sourceText, params.locale, brand).map((topic) => {
    const excerpt = buildExcerpt(topic.title, topic.supportingPassages, params.locale);
    return {
      slug: topic.slug,
      title: topic.title,
      excerpt,
      contentMd: buildContentMarkdown(topic.title, topic.supportingPassages, topic.tags, params.locale),
      status: "published",
      authorName: brand,
      category: topic.category,
      tags: topic.tags,
      seoTitle: topic.title,
      seoDescription: excerpt,
    };
  });
}

function resolveBlogNavLabelFromProject(project: any, locale: VisibleLocale, deps: BlogWorkflowDeps) {
  const files = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
  const blogFile = files.find((file: any) => /data-shpitto-blog-root/i.test(String(file?.content || "")));
  const content = String(blogFile?.content || "");
  const title = content.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || content.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const cleaned = deps.htmlToReadableText(title).replace(/[|–—].*$/, "").trim();
  return cleaned || (locale === "zh-CN" ? "博客" : "Blog");
}

function resolveBlogWorkflowPosts(params: {
  sourceText: string;
  locale: VisibleLocale;
  project: any;
  fallbackAuthorName: string;
  deps: BlogWorkflowDeps;
}) {
  const sourceText = String(params.sourceText || "").trim();
  const brandOverride = resolveProjectBrandName(params.project, params.deps) || params.fallbackAuthorName;
  const staticPosts = extractStaticBlogPostsFromProject({
    project: params.project,
    locale: params.locale,
    fallbackAuthorName: params.fallbackAuthorName,
    deps: params.deps,
  });
  if (staticPosts.length > 0) {
    if (sourceText.length < 12) return staticPosts;
    if (!staticBlogPostsNeedSourceAlignedFallback({ sourceText, staticPosts })) return staticPosts;
  }
  if (sourceText.length < 12) return [];
  return buildGeneratedBlogSeedPosts({
    sourceText,
    locale: params.locale,
    brandOverride,
    deps: params.deps,
  });
}

export function projectHasGeneratedBlogContentMount(project: any, deps: BlogWorkflowDeps) {
  const files = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
  return files.some((file: any) => {
    const filePath = deps.normalizePath(String(file?.path || ""));
    const content = String(file?.content || "");
    return filePath === "/blog/index.html" || /data-shpitto-blog-root/i.test(content);
  });
}

export function buildBlogContentWorkflowPreview(params: {
  inputState: AgentState;
  project: any;
  locale: RuntimeLocale;
  deps: BlogWorkflowDeps;
}): BlogPreview {
  if (!projectHasGeneratedBlogContentMount(params.project, params.deps)) {
    return { required: false, reason: "no_content_mount", navLabel: "", posts: [] };
  }
  const visibleLocale = params.deps.toVisibleLocale(params.locale);
  const sourceText = collectPrimaryBlogSourceText(params.inputState, params.deps);
  const posts = resolveBlogWorkflowPosts({
    sourceText,
    locale: visibleLocale,
    project: params.project,
    fallbackAuthorName: resolveWorkflowBlogBrand(sourceText, visibleLocale),
    deps: params.deps,
  });
  if (posts.length > 0) {
    return {
      required: true,
      reason: "ready",
      navLabel: resolveBlogNavLabelFromProject(params.project, visibleLocale, params.deps),
      posts: posts.slice(0, 6),
    };
  }
  if (sourceText.trim().length < 12) {
    return {
      required: false,
      reason: "no_source",
      navLabel: resolveBlogNavLabelFromProject(params.project, visibleLocale, params.deps),
      posts: [],
    };
  }
  return {
    required: true,
    reason: "ready",
    navLabel: resolveBlogNavLabelFromProject(params.project, visibleLocale, params.deps),
    posts: buildGeneratedBlogSeedPosts({ sourceText, locale: visibleLocale, deps: params.deps }),
  };
}

export function collectBlogWorkflowSourceText(params: {
  inputState: AgentState;
  project?: any;
  deps: BlogWorkflowDeps;
}) {
  void params.project;
  return collectPrimaryBlogSourceText(params.inputState, params.deps);
}

export function inferBlogBrandForWorkflow(text: string, locale: VisibleLocale) {
  return resolveWorkflowBlogBrand(text, locale);
}

export function resolveBlogNavLabelForWorkflow(project: any, locale: VisibleLocale, deps: BlogWorkflowDeps) {
  return resolveBlogNavLabelFromProject(project, locale, deps);
}

export function buildBlogContentConfirmTimelineMetadataForWorkflow(params: {
  locale: RuntimeLocale;
  navLabel: string;
  posts: BlogPostUpsertInput[];
  deps: Pick<BlogWorkflowDeps, "toVisibleLocale">;
}) {
  const locale = params.deps.toVisibleLocale(params.locale) === "zh-CN" ? "zh" : "en";
  return {
    cardType: "confirm_blog_content_deploy",
    locale,
    title: params.locale === "zh-CN" ? "Blog 文章已生成，确认后再部署上线" : "Blog articles are ready. Confirm before deployment.",
    label: params.locale === "zh-CN" ? "确认 Blog 文章并部署" : "Confirm Blog Articles and Deploy",
    payload: "__SHP_CONFIRM_BLOG_CONTENT_DEPLOY__",
    navLabel: params.navLabel,
    posts: params.posts.map((post) => ({
      slug: String(post.slug || "").trim(),
      title: String(post.title || "").trim(),
      excerpt: String(post.excerpt || "").trim(),
      category: String(post.category || "").trim(),
      tags: Array.isArray(post.tags) ? post.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
    })),
  } as Record<string, unknown>;
}
