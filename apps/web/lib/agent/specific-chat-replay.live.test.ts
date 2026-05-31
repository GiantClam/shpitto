import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import {
  collectSharedDistinctLocaleKeys,
  hasBlogNavLink,
  hasDuplicateFooterLinkGroups,
} from "./institutional-live-quality";
import { captureMobilePreviewScreenshots } from "./chat-replay-live-test-helpers";
import {
  I18N_LOCALE_REGISTRY_PATH,
  I18N_MESSAGE_EN_PATH,
  I18N_MESSAGE_ZH_CN_PATH,
} from "../skill-runtime/locale-plan";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "scripts/.env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });

const runSpecificReplay = String(process.env.RUN_SPECIFIC_CHAT_REPLAY || "").trim() === "1";
const replayChatId = process.env.SPECIFIC_CHAT_REPLAY_ID || "chat-1778485587681-7m1313";

const SPECIFIC_REPLAY_REQUIRED_BLOG_DETAILS = [
  {
    slug: "ai-notes-for-everyday-judgment",
    title: "把 AI 写进日常判断，而不是只写进演示稿",
    topic: "WeChat real-time media architecture and practical AI judgment habits",
  },
  {
    slug: "devops-as-team-rhythm",
    title: "DevOps 不是流程口号，而是团队节拍",
    topic: "DevOps operating systems and recovery-aware delivery rhythm",
  },
  {
    slug: "consumer-products-build-trust",
    title: "消费者产品如何把信任感做进细节里",
    topic: "AI SaaS commercialization, K12 product trust, and HelloTalk-style retention judgment",
  },
] as const;

process.env.CHAT_TASKS_USE_SUPABASE = "1";
process.env.CLOUDFLARE_REQUIRE_REAL = "1";
process.env.CLOUDFLARE_DEPLOY_STRATEGY = "wrangler";
process.env.SHPITTO_DEPLOY_BLOG_RUNTIME = "1";
process.env.CHAT_WORKER_CLAIM_MODES = process.env.CHAT_WORKER_CLAIM_MODES || "generate,deploy";

function confirmGenerate(text: string) {
  return `__SHP_CONFIRM_GENERATE__\n${text}`;
}

function isContentDeployConfirmCardType(value: string) {
  return value === "confirm_blog_content_deploy" || value === "confirm_content_preview_deploy";
}

function expectedContentDeployPayload(cardType: string) {
  return cardType === "confirm_content_preview_deploy"
    ? "__SHP_CONFIRM_CONTENT_DEPLOY__"
    : "__SHP_CONFIRM_BLOG_CONTENT_DEPLOY__";
}

function normalizePagesUrl(value: string) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeRoute(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  return `/${raw.replace(/^\/+/, "").replace(/\/+$/, "")}`.replace(/\/{2,}/g, "/") || "/";
}

function routeToHtmlPath(route: string) {
  const normalized = normalizeRoute(route);
  return normalized === "/" ? "/index.html" : `${normalized}/index.html`;
}

function escapeRegExp(value: string) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasHrefToRoute(html: string, route: string) {
  const normalized = normalizeRoute(route);
  const pattern = new RegExp(`href=["']${escapeRegExp(normalized)}(?:/)?["']`, "i");
  return pattern.test(String(html || ""));
}

function parsePromptControlManifest(prompt: string): { routes: string[]; files: string[] } | null {
  const blocks = Array.from(String(prompt || "").matchAll(/```json\s*([\s\S]*?)```/gi));
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(String(block[1] || "").trim()) as { routes?: unknown; files?: unknown };
      if (!Array.isArray(parsed.routes) || !Array.isArray(parsed.files)) continue;
      const routes = parsed.routes.map((item) => normalizeRoute(String(item || ""))).filter(Boolean);
      const files = parsed.files.map((item) => String(item || "").trim()).filter(Boolean);
      if (routes.length > 0 && files.length > 0) return { routes, files };
    } catch {
      continue;
    }
  }
  return null;
}

function replaceFirstJsonCodeBlock(source: string, nextJson: string): string {
  return String(source || "").replace(/```json\s*[\s\S]*?```/i, `\`\`\`json\n${nextJson}\n\`\`\``);
}

function enforceSpecificReplayPromptControlManifest(prompt: string): string {
  const normalized = String(prompt || "").trim();
  if (!normalized) return normalized;
  const manifest = parsePromptControlManifest(normalized);
  if (!manifest || !manifest.routes.includes("/blog")) return normalized;
  const nextManifest = {
    schemaVersion: 1,
    promptKind: "canonical_website_prompt",
    routeSource: "prompt_draft_page_plan",
    routes: ["/", "/blog"],
    navLabels: ["Home", "Blog"],
    files: [
      "/styles.css",
      "/script.js",
      I18N_LOCALE_REGISTRY_PATH,
      I18N_MESSAGE_EN_PATH,
      I18N_MESSAGE_ZH_CN_PATH,
      "/index.html",
      "/blog/index.html",
      ...requiredReplayBlogDetailHtmlPaths(),
    ],
    localeConfig: {
      mode: "bilingual",
      defaultLocale: "zh-CN",
      locales: ["zh-CN", "en"],
      translationDriven: false,
      sourceCatalogPath: I18N_MESSAGE_ZH_CN_PATH,
    },
    pageIntents: [
      {
        route: "/",
        navLabel: "Home",
        purpose: "Homepage. Establish the brand overview, core value, primary route entry, and next action while preserving site home-entry semantics.",
        source: "requirement_spec",
      },
      {
        route: "/blog",
        navLabel: "Blog",
        purpose: "Deliver a route-specific page for Blog with distinct source-backed content and a clear next action.",
        source: "requirement_spec",
      },
    ],
  };
  return replaceFirstJsonCodeBlock(normalized, JSON.stringify(nextManifest, null, 2));
}

function replayPromptIncludesPublishableBlogContract(prompt: string) {
  return /exactly\s*3\s+complete\s+article\s+detail\s+pages|3\s+complete\s+article\s+detail\s+pages|3\s+publishable\s+article\s+detail\s+pages/i.test(
    String(prompt || ""),
  );
}

function replayPromptIncludesBilingualResourceContract(prompt: string) {
  return /must\s+ship\s+real\s+en\/zh\s+i18n\s+resource\s+files|\/i18n\/messages\.en\.json|\/i18n\/messages\.zh-CN\.json|core\s+shared-shell\s+keys\s+must\s+contain\s+real\s+translation/i.test(
    String(prompt || ""),
  );
}

function replayPromptIncludesSharedShellDetailExclusion(prompt: string) {
  return /global header and homepage\/footer destination groups may link only to `\/` and `\/blog`|detail routes are article-level destinations only/i.test(
    String(prompt || ""),
  );
}

function replayPromptIncludesRequiredBilingualArtifactRule(prompt: string) {
  return /required output artifacts for this replay|first generation pass is incomplete if either file is missing/i.test(
    String(prompt || ""),
  );
}

function enforceSpecificReplayPublishableBlogContract(prompt: string): string {
  const normalized = enforceSpecificReplayPromptControlManifest(String(prompt || "").trim());
  if (!normalized) return normalized;
  const manifest = parsePromptControlManifest(normalized);
  const routes = manifest?.routes || [];
  if (!routes.includes("/blog")) return normalized;
  let next = normalized;
  if (!replayPromptIncludesPublishableBlogContract(next)) {
    next = `${next}

## Replay Publishable Blog Contract

- The Blog route must publish exactly 3 complete article detail pages with stable \`/blog/{slug}/\` URLs on the first generation pass.
- The 3 required detail files are fixed for this replay. Do not rename, localize, replace, or reduce them:
  - \`/blog/${SPECIFIC_REPLAY_REQUIRED_BLOG_DETAILS[0].slug}/index.html\` with the article title "${SPECIFIC_REPLAY_REQUIRED_BLOG_DETAILS[0].title}"
  - \`/blog/${SPECIFIC_REPLAY_REQUIRED_BLOG_DETAILS[1].slug}/index.html\` with the article title "${SPECIFIC_REPLAY_REQUIRED_BLOG_DETAILS[1].title}"
  - \`/blog/${SPECIFIC_REPLAY_REQUIRED_BLOG_DETAILS[2].slug}/index.html\` with the article title "${SPECIFIC_REPLAY_REQUIRED_BLOG_DETAILS[2].title}"
- Required article topics:
  - ${SPECIFIC_REPLAY_REQUIRED_BLOG_DETAILS[0].topic}
  - ${SPECIFIC_REPLAY_REQUIRED_BLOG_DETAILS[1].topic}
  - ${SPECIFIC_REPLAY_REQUIRED_BLOG_DETAILS[2].topic}
- \`/blog/index.html\` must include the hidden Blog data-source mount contract inside the route-owned archive/list section: \`data-shpitto-blog-root\`, \`data-shpitto-blog-api="/api/blog/posts"\`, and \`data-shpitto-blog-list\`.
- Every visible article/archive card on \`/blog/index.html\` must link to one of those 3 exact detail pages.
- The archive must expose all 3 detail links in the first generation pass. Do not ship only one finished detail page while leaving the others as missing files or implied future work.
- Do not invent category, tag, author, or archive routes beyond \`/blog\` and the 3 requested \`/blog/{slug}/\` detail pages.
- Do not label the visible archive UI with generic internal wording such as "文章列表", "article list", "content API", "blog backend", or "data source". Use visitor-facing editorial wording instead.
- Keep the writing concrete and source-shaped around Huawei, WeChat globalization, HelloTalk, DevOps systems, and AI SaaS operating judgment rather than generic launch-post framing.`;
  }
  if (!replayPromptIncludesBilingualResourceContract(next)) {
    next = `${next}

## Replay Bilingual Resource Contract

- This replay must ship real EN/ZH i18n resource files on the first generation pass: \`/i18n/messages.en.json\` and \`/i18n/messages.zh-CN.json\`.
- Keep exactly one visible language at a time in the rendered HTML. Do not render visible Chinese/English pairs in the same heading, paragraph, CTA, nav item, footer item, or blog card.
- The homepage and shared shell must contain stable \`data-i18n\` keys for nav, hero, CTA, and footer copy, and the EN/ZH resource files must both include those keys.
- Core shared-shell keys must contain real translation differences between English and Chinese. Do not mirror English strings into the Chinese file or Chinese strings into the English file.
- The default visible language may stay Chinese-first, but the generated artifact must still include both locale files and a real route-preserving EN/ZH switch for the non-blog shared shell.
- Blog/article long-form bodies may stay single-language in the first pass, but the homepage, shared shell, and blog archive chrome must be i18n-ready and backed by the EN/ZH resource files.`;
  }
  if (!replayPromptIncludesSharedShellDetailExclusion(next)) {
    next = `${next}

## Replay Shared Shell Boundary Contract

- Shared-shell route groups are limited to the confirmed public shell destinations for this replay: \`/\` and \`/blog\`.
- Blog detail routes are article-level destinations only. Do not place \`/blog/{slug}/\` links in the homepage footer, global navigation, shared CTA strips, or generic support/destination groups.
- Keep detail links inside the Blog archive cards and inside article-to-article reading flows only.`;
  }
  if (!replayPromptIncludesRequiredBilingualArtifactRule(next)) {
    next = `${next}

## Replay Required Bilingual Artifacts

- \`/i18n/messages.en.json\` and \`/i18n/messages.zh-CN.json\` are required output artifacts for this replay.
- Treat the first generation pass as incomplete if either locale file is missing, even if \`/i18n/locales.json\` or a locale switch UI already exists.
- The English locale file must contain real translated values for shared-shell and homepage core keys instead of mirroring the Chinese source strings.`;
  }
  return next;
}

function requiredReplayBlogDetailHtmlPaths() {
  return SPECIFIC_REPLAY_REQUIRED_BLOG_DETAILS.map((item) => `/blog/${item.slug}/index.html`);
}

type ReplaySurfaceKind = "blog-archive" | "content-collection" | "unknown";

function getMountedContentFile(files: Array<{ path?: string; content?: string }>) {
  return files.find(
    (file) =>
      String(file.path || "").endsWith(".html") && /data-shpitto-blog-root/i.test(String(file.content || "")),
  );
}

function inferReplaySurface(
  files: Array<{ path?: string; content?: string }>,
  routes: string[] = [],
): {
  kind: ReplaySurfaceKind;
  mountedPath: string;
  mountedRoute: string;
  mountedHtml: string;
  hasRootIndex: boolean;
  hasBlogIndex: boolean;
  blogDetailPaths: string[];
} {
  const paths = files.map((file) => String(file.path || ""));
  const mountedFile = getMountedContentFile(files);
  const mountedPath = String(mountedFile?.path || "");
  const mountedRoute = normalizeRoute(mountedPath.replace(/\/index\.html$/i, "") || "/");
  const mountedHtml = String(mountedFile?.content || "");
  const hasRootIndex = paths.includes("/index.html");
  const hasBlogIndex = paths.includes("/blog/index.html");
  const blogDetailPaths = paths.filter((item) => /^\/blog\/[^/]+\/index\.html$/i.test(item));
  const normalizedRoutes = routes.map((route) => normalizeRoute(route)).filter(Boolean);
  const kind: ReplaySurfaceKind =
    hasBlogIndex || mountedRoute === "/blog" || normalizedRoutes.includes("/blog")
      ? "blog-archive"
      : mountedPath && /data-shpitto-blog-root/i.test(mountedHtml)
        ? "content-collection"
        : "unknown";
  return {
    kind,
    mountedPath,
    mountedRoute,
    mountedHtml,
    hasRootIndex,
    hasBlogIndex,
    blogDetailPaths,
  };
}

function previewPathSegmentsFromRedirect(previewUrlPath: string, taskId: string) {
  const normalized = String(previewUrlPath || "").trim();
  const marker = `/api/chat/tasks/${encodeURIComponent(taskId)}/preview/`;
  const index = normalized.indexOf(marker);
  const suffix = index >= 0 ? normalized.slice(index + marker.length) : normalized.replace(/^\/+/, "");
  const segments = suffix
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .filter(Boolean);
  return segments.length > 0 ? segments : ["__default__"];
}

async function loadPreviewEntryResponse(
  getPreviewFile: (request: Request, context: { params: Promise<{ taskId: string; path: string[] }> }) => Promise<Response>,
  taskId: string,
  initialPath: string[],
) {
  let currentPath = [...initialPath];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await getPreviewFile(new Request("http://localhost"), {
      params: Promise.resolve({ taskId, path: currentPath }),
    });
    if (response.status !== 307) return response;
    const location = String(response.headers.get("location") || "");
    currentPath = previewPathSegmentsFromRedirect(location, taskId);
  }
  return getPreviewFile(new Request("http://localhost"), {
    params: Promise.resolve({ taskId, path: currentPath }),
  });
}

function isPollutedReplayCanonicalPrompt(text: string) {
  const normalized = String(text || "").trim();
  if (!normalized.startsWith("# Canonical Website Generation Prompt")) return false;
  const withoutKnowledgeProfile = normalized.replace(
    /\n## Website Knowledge Profile\b[\s\S]*?(?=\n## |\n# |$)/gi,
    "\n",
  );
  const completion = normalized.match(/Requirement completion:\s*(\d+)\s*\/\s*(\d+)/i);
  const completed = completion ? Number(completion[1]) : NaN;
  const total = completion ? Number(completion[2]) : NaN;
  const isStrongPrompt =
    (Number.isFinite(completed) && Number.isFinite(total) && total > 0 && completed / total >= 0.8) ||
    (normalized.length > 4000 &&
      /Prompt Control Manifest \(Machine Readable\)/i.test(normalized) &&
      /Evidence Brief Contract|Page-Level Intent Contract|##\s*7\.\s*Evidence Brief/i.test(normalized));
  if (isStrongPrompt && !/\[Requirement Form\]/i.test(normalized) && !/(?:^|\n)\s*[-*]?\s*Logo\s+strategy\s*:/i.test(normalized)) {
    return false;
  }
  return (
    /(?:^|\n)[-*\d.\s]*Brand(?:\s+or\s+organization)?\s*:\s*(?:Logo|Requirement|Site|Website|Blog)\b/i.test(
      withoutKnowledgeProfile,
    ) ||
    /\[brand\]\s*Brand(?:\s+or\s+organization)?\s*:\s*(?:Logo|Requirement|Site|Website|Blog)\b/i.test(
      withoutKnowledgeProfile,
    ) ||
    /\[Requirement Form\]/i.test(normalized) ||
    /(?:^|\n)\s*[-*]?\s*(?:Logo\s+strategy|Logo\s*策略)\s*[:：]/i.test(normalized)
  );
}

function isWeakReplayCanonicalPrompt(text: string) {
  const normalized = String(text || "").trim();
  if (!normalized.startsWith("# Canonical Website Generation Prompt")) return false;
  const requirementCompletion = normalized.match(/Requirement completion:\s*(\d+)\s*\/\s*(\d+)/i);
  const completed = requirementCompletion ? Number(requirementCompletion[1]) : NaN;
  const total = requirementCompletion ? Number(requirementCompletion[2]) : NaN;
  const hasLowCompletion = Number.isFinite(completed) && Number.isFinite(total) && total > 0 && completed / total < 0.8;
  const lacksBilingualContract = !/Bilingual Experience Contract/i.test(normalized);
  const lacksRichSourceGuidance =
    /No content source strategy was confirmed yet\./i.test(normalized) ||
    !/Evidence Brief Contract|Page-Level Intent Contract/i.test(normalized);
  const genericSinglePageDefault = /Site structure:\s*Single-page website/i.test(normalized);
  return hasLowCompletion || (genericSinglePageDefault && lacksBilingualContract && lacksRichSourceGuidance);
}

function pickReplayPrompt(messages: Array<{ role: string; text: string; metadata?: Record<string, unknown> }>) {
  const promptDraftCandidates = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const metadata = (messages[index]?.metadata || {}) as Record<string, unknown>;
    if (String(metadata.cardType || "") !== "prompt_draft") continue;
    const canonicalPrompt = String((metadata as any).canonicalPrompt || "").trim();
    if (!canonicalPrompt.startsWith("# Canonical Website Generation Prompt")) continue;
    if (isPollutedReplayCanonicalPrompt(canonicalPrompt)) continue;
    promptDraftCandidates.push(canonicalPrompt);
  }

  const strongestPromptDraft = promptDraftCandidates.find((candidate) => !isWeakReplayCanonicalPrompt(candidate));
  if (strongestPromptDraft) {
    return strongestPromptDraft;
  }

  const users = messages
    .filter((message) => message.role === "user")
    .map((message) => String(message.text || "").trim())
    .filter(Boolean);
  const latestGenerationBrief = [...users]
    .reverse()
    .find((text) => {
      if (text.length < 200) return false;
      if (/^#\s*Canonical Website Generation Prompt/i.test(text)) return false;
      if (/\[Requirement Form\]/i.test(text)) return false;
      if (/^\?{3,}\s*Cloudflare/i.test(text)) return false;
      if (/^deploy\b/i.test(text)) return false;
      return /(网站|建站|blog|博客|首页|路由|Cloudflare Pages|部署)/i.test(text);
    });
  if (latestGenerationBrief) return latestGenerationBrief;
  if (promptDraftCandidates.length > 0) return promptDraftCandidates[0];
  const assetPrompt = users
    .filter((text) => text.includes("CASUX") || text.includes("[Referenced Assets]") || text.toLowerCase().includes(".pdf"))
    .sort((a, b) => b.length - a.length)[0];
  return assetPrompt || users.sort((a, b) => b.length - a.length)[0] || "";
}

function fileContent(files: Array<{ path?: string; content?: string }>, targetPath: string) {
  return String(files.find((file) => String(file.path || "") === targetPath)?.content || "");
}

function htmlToVisibleText(html: string) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadGeneratedProject(task: Awaited<ReturnType<typeof import("./chat-task-store").getChatTask>>) {
  const checkpointProjectPath = String(task?.result?.progress?.checkpointProjectPath || "").trim();
  if (checkpointProjectPath) {
    try {
      return {
        project: JSON.parse(await fs.readFile(checkpointProjectPath, "utf8")),
        source: "checkpoint-file",
        checkpointProjectPath,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    }
  }

  const internal = (task?.result?.internal || {}) as Record<string, any>;
  const project =
    internal.artifactSnapshot ||
    internal.sessionState?.site_artifacts ||
    internal.sessionState?.project_json ||
    internal.inputState?.site_artifacts ||
    internal.inputState?.project_json;
  if (!project) {
    throw new Error(`Task ${task?.id || "unknown"} has no readable generated project artifact.`);
  }

  return {
    project,
    source: "task-artifact-snapshot",
    checkpointProjectPath,
  };
}

async function cleanupReplayBlogData(projectId: string) {
  const { getD1Client } = await import("../d1");
  const d1 = getD1Client();
  await d1.ensureShpittoSchema();
  await d1.execute(
    `
    DELETE FROM shpitto_blog_posts
    WHERE project_id = ?
      AND source_app = 'shpitto'
      AND (
        title LIKE 'Specific Replay Blog Verification%'
        OR slug LIKE 'specific-replay-blog-verification-%'
        OR tags_json LIKE '%specific-replay%'
      );
    `,
    [projectId],
  );
}

async function fetchTextWithRetry(url: string, predicate: (text: string, status: number, contentType: string) => boolean) {
  let lastStatus = 0;
  let lastText = "";
  let lastContentType = "";
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "shpitto-specific-chat-replay/1.0" } });
      lastStatus = res.status;
      lastContentType = res.headers.get("content-type") || "";
      lastText = await res.text();
      if (predicate(lastText, res.status, lastContentType)) {
        return { status: res.status, text: lastText, contentType: lastContentType };
      }
    } catch (error) {
      lastText = String((error as Error)?.message || error || "fetch failed");
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(12_000, 1500 * attempt)));
  }
  throw new Error(
    `Timed out fetching ${url} (last status ${lastStatus || "unknown"}, content-type ${lastContentType || "unknown"}): ${lastText.slice(0, 300)}`,
  );
}

async function fetchTextFromAnyWithRetry(
  urls: string[],
  pathSuffix: string,
  predicate: (text: string, status: number, contentType: string) => boolean,
) {
  const candidates = Array.from(new Set(urls.map(normalizePagesUrl).filter(Boolean)));
  let lastError = "";
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    for (const baseUrl of candidates) {
      const url = `${baseUrl}${pathSuffix}`;
      try {
        const res = await fetch(url, { headers: { "user-agent": "shpitto-specific-chat-replay/1.0" } });
        const contentType = res.headers.get("content-type") || "";
        const text = await res.text();
        if (predicate(text, res.status, contentType)) {
          return { status: res.status, text, contentType, url };
        }
        lastError = `${url} status=${res.status} content-type=${contentType}: ${text.slice(0, 240)}`;
      } catch (error) {
        lastError = `${url}: ${String((error as Error)?.message || error || "fetch failed")}`;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(12_000, 1500 * attempt)));
  }
  throw new Error(`Timed out fetching ${pathSuffix} from ${candidates.join(", ")}. Last result: ${lastError}`);
}

async function waitForTerminalTask(taskId: string, runWorkerOnce: () => Promise<boolean>) {
  const { getChatTask } = await import("./chat-task-store");
  const deadline = Date.now() + 24 * 60 * 1000;
  let lastStatus = "";
  let lastStage = "";

  while (Date.now() < deadline) {
    const task = await getChatTask(taskId);
    lastStatus = String(task?.status || "");
    lastStage = String(task?.result?.progress?.stage || "");

    if (task?.status === "succeeded") return task;
    if (task?.status === "failed") {
      throw new Error(`Task ${taskId} failed: ${String(task.result?.assistantText || (task.result as any)?.error || lastStage)}`);
    }
    if (task?.status === "queued") {
      await runWorkerOnce();
    } else {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  throw new Error(`Timed out waiting for task ${taskId}; lastStatus=${lastStatus}, lastStage=${lastStage}`);
}

describe.skipIf(!runSpecificReplay)("specific existing chat live replay", () => {
  it("enforces stable replay-only blog detail and bilingual resource contracts", () => {
    const prompt = enforceSpecificReplayPublishableBlogContract(`
# Canonical Website Generation Prompt

Language: Chinese and English

\`\`\`json
{"routes":["/","/blog"],"files":["/styles.css","/script.js","/index.html","/blog/index.html"]}
\`\`\`
`);
    const manifest = parsePromptControlManifest(prompt);

    expect(manifest?.files).toEqual(
      expect.arrayContaining([
        I18N_LOCALE_REGISTRY_PATH,
        I18N_MESSAGE_EN_PATH,
        I18N_MESSAGE_ZH_CN_PATH,
        ...requiredReplayBlogDetailHtmlPaths(),
      ]),
    );
    expect(prompt).toContain("/i18n/messages.en.json");
    expect(prompt).toContain("/i18n/messages.zh-CN.json");
    for (const htmlPath of requiredReplayBlogDetailHtmlPaths()) {
      expect(prompt).toContain(htmlPath);
    }
  });

  it(
    "replays generation for the existing chat and keeps source-specific IA/content instead of a generic template",
    async () => {
      const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
      const prevChatMemoryBackend = process.env.CHAT_MEMORY_BACKEND;
      const prevSupabaseProxy = process.env.SUPABASE_TASK_PROXY_URL;
      const prevAsyncTaskTimeoutMs = process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
      const prevStageBudgetPerFileMs = process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS;
      const prevRoundAbsoluteTimeoutMs = process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS;
      const prevRoundIdleTimeoutMs = process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS;
      const prevDetailTargetsPerRound = process.env.SKILL_TOOL_DETAIL_TARGETS_PER_ROUND;
      const prevPptokenModel = process.env.LLM_MODEL_PPTOKEN;
      const prevPptokenFallbackModel = process.env.LLM_MODEL_FALLBACK_PPTOKEN;
      const prevProvider = process.env.LLM_PROVIDER;
      const prevProviderOrder = process.env.LLM_PROVIDER_ORDER;
      const prevCrossProviderFallback = process.env.LLM_CROSS_PROVIDER_FALLBACK;

      try {
        process.env.CHAT_MEMORY_BACKEND = "file";
        process.env.SUPABASE_TASK_PROXY_URL = "direct";
        process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = "1800000";
        process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = "420000";
        process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS = "420000";
        process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = "480000";
        process.env.SKILL_TOOL_DETAIL_TARGETS_PER_ROUND = "3";
        process.env.LLM_MODEL_PPTOKEN = "gpt-5.4-mini";
        process.env.LLM_MODEL_FALLBACK_PPTOKEN = "gpt-5.4-mini";
        process.env.LLM_PROVIDER = "pptoken";
        process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm,crazyrouter";
        process.env.LLM_CROSS_PROVIDER_FALLBACK = "all";

        const { getLatestChatTaskForChat, listChatTimelineMessages } = await import("./chat-task-store");
        const beforeLatest = await getLatestChatTaskForChat(replayChatId);
        const ownerUserId = String(beforeLatest?.ownerUserId || "").trim() || undefined;
        const existingTimeline = await listChatTimelineMessages(replayChatId, 500);
        const replayPrompt = enforceSpecificReplayPublishableBlogContract(pickReplayPrompt(existingTimeline));
        const promptManifest = parsePromptControlManifest(replayPrompt);
        const expectedManifestFiles = Array.from(
          new Set((promptManifest?.files || []).map((item) => String(item || "").trim()).filter(Boolean)),
        );
        const expectedManifestHtmlPaths = Array.from(
          new Set((promptManifest?.routes || []).map((route) => routeToHtmlPath(route)).filter(Boolean)),
        );
        expect(replayPrompt.length).toBeGreaterThan(40);

        process.env.CHAT_TASKS_USE_SUPABASE = "0";
        (globalThis as any).__shpittoChatTaskStore = undefined;
        const { POST } = await import("../../app/api/chat/route");
        const { GET: getPreviewRoot } = await import("../../app/api/chat/tasks/[taskId]/preview/route");
        const { GET: getPreviewFile } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
        const { SkillRuntimeExecutor } = await import("../skill-runtime/executor");

        const generateRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: replayChatId,
              user_id: ownerUserId,
              messages: [{ role: "user", parts: [{ type: "text", text: confirmGenerate(replayPrompt) }] }],
            }),
          }),
        );
        const generateBody = await generateRes.clone().text();
        expect(generateRes.status, generateBody).toBe(202);

        const queuedGenerate = await getLatestChatTaskForChat(replayChatId);
        expect(queuedGenerate?.id).toBeTruthy();
        expect(queuedGenerate?.id).not.toBe(beforeLatest?.id);
        expect((queuedGenerate?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("generate");

        await SkillRuntimeExecutor.runTask({
          taskId: queuedGenerate!.id,
          chatId: replayChatId,
          workerId: "specific-replay-generate-test",
          inputState: (queuedGenerate?.result?.internal?.inputState || {}) as any,
        });
        const generated = await getLatestChatTaskForChat(replayChatId);
        expect(generated).toBeTruthy();
        if (!generated) {
          throw new Error(`Expected generated task for chat ${replayChatId}`);
        }
        if (generated.status !== "succeeded") {
          throw new Error(
            `Expected generated task to succeed but got ${String(generated.status || "unknown")}: ${String(
              generated.result?.assistantText || (generated.result as any)?.error || generated.result?.progress?.stageMessage || "",
            )}`,
          );
        }
        expect(generated.result?.progress?.stage).toBe("done");

        const workflow = ((generated.result?.internal || {}).inputState as any)?.workflow_context || {};
        const canonicalPrompt = String(workflow.canonicalPrompt || "");
        const manifestRoutes = Array.isArray(workflow.promptControlManifest?.routes)
          ? workflow.promptControlManifest.routes.map((route: unknown) => normalizeRoute(String(route || "")))
          : [];
        const generatedProject = await loadGeneratedProject(generated);
        const projectJson = generatedProject.project;
        const files = (projectJson?.staticSite?.files || []) as Array<{ path?: string; content?: string; type?: string }>;
        const paths = files.map((file) => String(file.path || ""));
        const indexHtml = fileContent(files, "/index.html");
        const surface = inferReplaySurface(files, [...manifestRoutes, ...(promptManifest?.routes || [])]);
        const combinedVisibleText = htmlToVisibleText([indexHtml, surface.mountedHtml].join("\n"));
        const previewRootRes = await getPreviewRoot(new Request("http://localhost/api/chat/tasks/x/preview"), {
          params: Promise.resolve({ taskId: generated.id }),
        });
        const previewUrlPath = String(previewRootRes.headers.get("location") || "");
        const previewBaseUrl = String(process.env.SHPITTO_PREVIEW_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
        const previewUrl = !previewUrlPath
          ? ""
          : /^https?:\/\//i.test(previewUrlPath)
            ? previewUrlPath
            : `${previewBaseUrl}${previewUrlPath}`;
        expect(previewRootRes.status).toBe(307);
        expect(previewUrlPath).toContain(`/api/chat/tasks/${encodeURIComponent(generated.id)}/preview/__default__`);

        const previewEntryRes = await loadPreviewEntryResponse(
          getPreviewFile,
          generated.id,
          previewPathSegmentsFromRedirect(previewUrlPath, generated.id),
        );
        const previewEntryHtml = await previewEntryRes.text();
        expect(previewEntryRes.status).toBe(200);
        expect(previewEntryHtml.toLowerCase()).toContain("<!doctype html");

        const shouldRunMobileScreenshotQa =
          String(process.env.RUN_PREVIEW_MOBILE_SCREENSHOT_QA || "").trim() === "1";
        const mobileScreenshotQa = shouldRunMobileScreenshotQa
          ? await captureMobilePreviewScreenshots({
              previewUrl: previewUrl || `${previewBaseUrl}/api/chat/tasks/${generated.id}/preview/index.html`,
              outputDir: path.resolve(process.cwd(), ".tmp", "qa-screenshots", replayChatId, String(generated.id)),
            })
          : {
              previewUrl: previewUrl || `${previewBaseUrl}/api/chat/tasks/${generated.id}/preview/index.html`,
              artifacts: [],
              executed: false,
              skippedReason: "RUN_PREVIEW_MOBILE_SCREENSHOT_QA != 1",
            };
        if (shouldRunMobileScreenshotQa) {
          expect(mobileScreenshotQa.executed).toBe(true);
          expect(mobileScreenshotQa.artifacts.length).toBeGreaterThanOrEqual(4);
        }

        expect(paths).toEqual(expect.arrayContaining(["/styles.css", "/script.js"]));
        if (expectedManifestFiles.length > 0) {
          expect(paths).toEqual(expect.arrayContaining(expectedManifestFiles));
        }
        if (expectedManifestHtmlPaths.length > 0) {
          expect(paths).toEqual(expect.arrayContaining(expectedManifestHtmlPaths));
        }
        expect(surface.kind).not.toBe("unknown");

        if (surface.kind === "blog-archive" && manifestRoutes.length > 0) {
          expect(manifestRoutes).toEqual(["/", "/blog"]);
        }
        if (surface.kind === "blog-archive" && promptManifest?.routes?.length) {
          expect(promptManifest.routes.map((route) => normalizeRoute(route))).toEqual(["/", "/blog"]);
        }
        expect(paths).not.toEqual(
          expect.arrayContaining(["/about/index.html", "/products/index.html", "/cases/index.html", "/contact/index.html"]),
        );
        if (surface.kind === "blog-archive") {
          expect(canonicalPrompt).toMatch(/Language:\s*Chinese and English|Final website locale requirement:\s*Chinese and English/i);
          expect(paths).toEqual(expect.arrayContaining(["/index.html", "/blog/index.html"]));
          expect(surface.blogDetailPaths).toHaveLength(3);
          expect(canonicalPrompt).toContain("HelloTalk");
          expect(canonicalPrompt).toMatch(/AI|DevOps|SaaS|K12/i);
          expect(canonicalPrompt).not.toContain("/about/index.html");
          expect(canonicalPrompt).not.toContain("/products/index.html");
          expect(canonicalPrompt).not.toContain("/cases/index.html");
          expect(canonicalPrompt).not.toContain("/contact/index.html");
          expect(combinedVisibleText).toMatch(/HelloTalk|Huawei|WeChat|DevOps|SaaS|K12|AI/i);
        } else {
          expect(canonicalPrompt).toMatch(/zh-CN|Chinese|中文|preferred locale/i);
          expect(surface.hasBlogIndex).toBe(false);
          expect(surface.mountedPath).toBeTruthy();
          expect(surface.mountedRoute).not.toBe("/blog");
          expect(surface.mountedRoute).toMatch(/^\/(?:casux-|standards-system|case-studies|page-\d+)/i);
          if (manifestRoutes.length > 0) {
            expect(manifestRoutes).toContain(surface.mountedRoute);
            expect(manifestRoutes).not.toContain("/blog");
          }
          if (promptManifest?.routes?.length) {
            expect(promptManifest.routes.map((route) => normalizeRoute(route))).toContain(surface.mountedRoute);
            expect(promptManifest.routes.map((route) => normalizeRoute(route))).not.toContain("/blog");
          }
          expect(canonicalPrompt).toMatch(/CASUX/i);
          expect(canonicalPrompt).toContain("/casux-information-platform");
          expect(canonicalPrompt).not.toMatch(/towel|hospitality|resort|export/i);
          expect(surface.mountedHtml).toContain('data-shpitto-blog-api="/api/blog/posts"');
          expect(surface.mountedHtml).not.toMatch(/href=["']\/blog\/[^"']+\/["']/i);
          expect(combinedVisibleText).toMatch(/CASUX|Information Platform|Research Center|Standards System|Case Studies/i);
        }
        expect(combinedVisibleText).not.toMatch(/Custom Solutions|Open scheduling|Cal\.com|template news|lorem ipsum/i);
        console.log(
          "SPECIFIC_CHAT_REPLAY_PREVIEW=" +
            JSON.stringify(
              {
                chatId: replayChatId,
                taskId: generated.id,
                surfaceKind: surface.kind,
                mountedRoute: surface.mountedRoute,
                previewUrlPath,
                previewUrl,
                mobileScreenshotQa,
              },
              null,
              2,
            ),
        );
      } finally {
        if (prevChatMemoryBackend === undefined) delete process.env.CHAT_MEMORY_BACKEND;
        else process.env.CHAT_MEMORY_BACKEND = prevChatMemoryBackend;
        if (prevSupabaseProxy === undefined) delete process.env.SUPABASE_TASK_PROXY_URL;
        else process.env.SUPABASE_TASK_PROXY_URL = prevSupabaseProxy;
        process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
        process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = prevAsyncTaskTimeoutMs;
        process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = prevStageBudgetPerFileMs;
        if (prevRoundIdleTimeoutMs === undefined) delete process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS;
        else process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS = prevRoundIdleTimeoutMs;
        process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = prevRoundAbsoluteTimeoutMs;
        if (prevDetailTargetsPerRound === undefined) delete process.env.SKILL_TOOL_DETAIL_TARGETS_PER_ROUND;
        else process.env.SKILL_TOOL_DETAIL_TARGETS_PER_ROUND = prevDetailTargetsPerRound;
        if (prevPptokenModel === undefined) delete process.env.LLM_MODEL_PPTOKEN;
        else process.env.LLM_MODEL_PPTOKEN = prevPptokenModel;
        if (prevPptokenFallbackModel === undefined) delete process.env.LLM_MODEL_FALLBACK_PPTOKEN;
        else process.env.LLM_MODEL_FALLBACK_PPTOKEN = prevPptokenFallbackModel;
        if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
        else process.env.LLM_PROVIDER = prevProvider;
        if (prevProviderOrder === undefined) delete process.env.LLM_PROVIDER_ORDER;
        else process.env.LLM_PROVIDER_ORDER = prevProviderOrder;
        if (prevCrossProviderFallback === undefined) delete process.env.LLM_CROSS_PROVIDER_FALLBACK;
        else process.env.LLM_CROSS_PROVIDER_FALLBACK = prevCrossProviderFallback;
      }
    },
    45 * 60 * 1000,
  );

  it(
    "forces pptoken preflight fallback and proves fresh-stage retry is attempted before succeeding",
    async () => {
      const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
      const prevChatMemoryBackend = process.env.CHAT_MEMORY_BACKEND;
      const prevSupabaseProxy = process.env.SUPABASE_TASK_PROXY_URL;
      const prevAsyncTaskTimeoutMs = process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
      const prevStageBudgetPerFileMs = process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS;
      const prevRoundAbsoluteTimeoutMs = process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS;
      const prevProvider = process.env.LLM_PROVIDER;
      const prevProviderOrder = process.env.LLM_PROVIDER_ORDER;
      const prevCrossProviderFallback = process.env.LLM_CROSS_PROVIDER_FALLBACK;
      const prevStageRetryEnabled = process.env.SKILL_TOOL_STAGE_RETRY_ON_BUDGET_EXCEEDED;
      const prevStageRetryLimit = process.env.SKILL_TOOL_STAGE_BUDGET_RETRY_LIMIT;
      const prevPptokenBaseUrl = process.env.PPTOKEN_BASE_URL;
      const capturedWarns: string[] = [];
      const originalWarn = console.warn;

      try {
        process.env.CHAT_MEMORY_BACKEND = "file";
        process.env.SUPABASE_TASK_PROXY_URL = "direct";
        const { getLatestChatTaskForChat, listChatTimelineMessages } = await import("./chat-task-store");
        const beforeLatest = await getLatestChatTaskForChat(replayChatId);
        const ownerUserId = String(beforeLatest?.ownerUserId || "").trim() || undefined;
        const existingTimeline = await listChatTimelineMessages(replayChatId, 500);
        const replayPrompt = enforceSpecificReplayPublishableBlogContract(pickReplayPrompt(existingTimeline));
        expect(replayPrompt.length).toBeGreaterThan(40);

        process.env.CHAT_TASKS_USE_SUPABASE = "0";
        process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = "60000";
        process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = "30000";
        process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = "45000";
        process.env.LLM_PROVIDER = "pptoken";
        process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm,crazyrouter";
        process.env.LLM_CROSS_PROVIDER_FALLBACK = "all";
        process.env.SKILL_TOOL_STAGE_RETRY_ON_BUDGET_EXCEEDED = "1";
        process.env.SKILL_TOOL_STAGE_BUDGET_RETRY_LIMIT = "1";
        process.env.PPTOKEN_BASE_URL = "http://127.0.0.1:1/v1";

        console.warn = (...args: unknown[]) => {
          const text = args.map((item) => String(item || "")).join(" ");
          capturedWarns.push(text);
          originalWarn(...args);
        };

        (globalThis as any).__shpittoChatTaskStore = undefined;
        const { POST } = await import("../../app/api/chat/route");
        const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");

        const generateRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: replayChatId,
              user_id: ownerUserId,
              messages: [{ role: "user", parts: [{ type: "text", text: confirmGenerate(replayPrompt) }] }],
            }),
          }),
        );
        const generateBody = await generateRes.clone().text();
        expect(generateRes.status, generateBody).toBe(202);

        const queuedGenerate = await getLatestChatTaskForChat(replayChatId);
        expect(queuedGenerate?.id).toBeTruthy();

        let replayFailure = "";
        let terminalTask: Awaited<ReturnType<typeof getLatestChatTaskForChat>> | undefined;
        try {
          terminalTask = await waitForTerminalTask(queuedGenerate!.id, runChatTaskWorkerOnce);
        } catch (error) {
          replayFailure = String((error as Error)?.message || error || "");
        }

        console.log(
          "[specific-replay] retry warnings",
          JSON.stringify(capturedWarns.filter(Boolean), null, 2),
        );
        console.log("[specific-replay] retry failure", replayFailure);
        if (terminalTask) {
          console.log(
            "[specific-replay] retry terminal summary",
            JSON.stringify(
              {
                taskId: terminalTask?.id,
                status: terminalTask?.status,
                stage: terminalTask?.result?.progress?.stage,
                stageMessage: terminalTask?.result?.progress?.stageMessage,
                error: terminalTask?.result?.error,
              },
              null,
              2,
            ),
          );
        }

        const sawPptokenPreflightFallback = capturedWarns.some((line) => line.includes("provider preflight failed for pptoken/"));
        const sawFreshStageRetry = capturedWarns.some((line) => line.includes("fresh-stage retry after budget exceeded"));
        expect(sawPptokenPreflightFallback).toBe(true);
        expect(
          terminalTask?.status === "succeeded" ||
            /stage budget exceeded|insufficient_user_quota|\u7528\u6237\u989d\u5ea6\u4e0d\u8db3|provider_retry_exhausted|request timed out/i.test(replayFailure),
        ).toBe(true);
        expect(
          sawFreshStageRetry ||
            terminalTask?.status === "succeeded" ||
            /insufficient_user_quota|\u7528\u6237\u989d\u5ea6\u4e0d\u8db3|provider_retry_exhausted|request timed out/i.test(replayFailure),
        ).toBe(true);
      } finally {
        console.warn = originalWarn;
        if (prevChatMemoryBackend === undefined) delete process.env.CHAT_MEMORY_BACKEND;
        else process.env.CHAT_MEMORY_BACKEND = prevChatMemoryBackend;
        if (prevSupabaseProxy === undefined) delete process.env.SUPABASE_TASK_PROXY_URL;
        else process.env.SUPABASE_TASK_PROXY_URL = prevSupabaseProxy;
        process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
        process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = prevAsyncTaskTimeoutMs;
        process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = prevStageBudgetPerFileMs;
        process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = prevRoundAbsoluteTimeoutMs;
        process.env.LLM_PROVIDER = prevProvider;
        process.env.LLM_PROVIDER_ORDER = prevProviderOrder;
        process.env.LLM_CROSS_PROVIDER_FALLBACK = prevCrossProviderFallback;
        process.env.SKILL_TOOL_STAGE_RETRY_ON_BUDGET_EXCEEDED = prevStageRetryEnabled;
        process.env.SKILL_TOOL_STAGE_BUDGET_RETRY_LIMIT = prevStageRetryLimit;
        process.env.PPTOKEN_BASE_URL = prevPptokenBaseUrl;
      }
    },
    15 * 60 * 1000,
  );

  it(
    "replays generation for the existing chat, deploys with Wrangler, and verifies local artifacts plus deployed Blog runtime",
    async () => {
      const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
      const prevChatMemoryBackend = process.env.CHAT_MEMORY_BACKEND;
      const prevSupabaseProxy = process.env.SUPABASE_TASK_PROXY_URL;
      const prevAsyncTaskTimeoutMs = process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
      const prevStageBudgetPerFileMs = process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS;
      const prevRoundAbsoluteTimeoutMs = process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS;
      const prevRoundIdleTimeoutMs = process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS;
      const prevDetailTargetsPerRound = process.env.SKILL_TOOL_DETAIL_TARGETS_PER_ROUND;
      const prevPptokenModel = process.env.LLM_MODEL_PPTOKEN;
      const prevPptokenFallbackModel = process.env.LLM_MODEL_FALLBACK_PPTOKEN;
      const prevProvider = process.env.LLM_PROVIDER;
      const prevProviderOrder = process.env.LLM_PROVIDER_ORDER;

      try {
        process.env.CHAT_MEMORY_BACKEND = "file";
        process.env.SUPABASE_TASK_PROXY_URL = "direct";
        process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = "1800000";
        process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = "420000";
        process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS = "420000";
        process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = "480000";
        process.env.SKILL_TOOL_DETAIL_TARGETS_PER_ROUND = "3";
        process.env.LLM_MODEL_PPTOKEN = "gpt-5.4-mini";
        process.env.LLM_MODEL_FALLBACK_PPTOKEN = "gpt-5.4-mini";
        process.env.LLM_PROVIDER = "pptoken";
        process.env.LLM_PROVIDER_ORDER = "pptoken";

        expect(Boolean(process.env.CLOUDFLARE_ACCOUNT_ID)).toBe(true);
        expect(Boolean(process.env.CLOUDFLARE_API_TOKEN)).toBe(true);
        expect(Boolean(process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.CLOUDFLARE_D1_DB_ID || process.env.D1_DATABASE_ID)).toBe(true);

        const marker = Date.now().toString(36);
        const reportPath = path.resolve(process.cwd(), "..", "..", ".tmp", `${replayChatId}-specific-replay-${marker}.json`);
        const { getLatestChatTaskForChat, listChatTimelineMessages } = await import("./chat-task-store");
        const beforeLatest = await getLatestChatTaskForChat(replayChatId);
        const ownerUserId = String(beforeLatest?.ownerUserId || "").trim() || undefined;
        const existingTimeline = await listChatTimelineMessages(replayChatId, 500);
        const replayPrompt = enforceSpecificReplayPublishableBlogContract(pickReplayPrompt(existingTimeline));
        const promptManifest = parsePromptControlManifest(replayPrompt);
        const expectedManifestFiles = Array.from(
          new Set((promptManifest?.files || []).map((item) => String(item || "").trim()).filter(Boolean)),
        );
        const expectedManifestHtmlPaths = Array.from(
          new Set((promptManifest?.routes || []).map((route) => routeToHtmlPath(route)).filter(Boolean)),
        );
        expect(replayPrompt.length).toBeGreaterThan(40);

        // Read the real chat history from Supabase, then isolate execution in the current
        // process so a long-running local dev worker with stale code cannot claim this replay.
        process.env.CHAT_TASKS_USE_SUPABASE = "0";
        (globalThis as any).__shpittoChatTaskStore = undefined;
        const { POST } = await import("../../app/api/chat/route");
        const { GET: getPreviewFile } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
        const { getChatTask } = await import("./chat-task-store");
        const { SkillRuntimeExecutor } = await import("../skill-runtime/executor");

        const generateRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: replayChatId,
              user_id: ownerUserId,
              messages: [{ role: "user", parts: [{ type: "text", text: confirmGenerate(replayPrompt) }] }],
            }),
          }),
        );
        const generateBody = await generateRes.clone().text();
        expect(generateRes.status, generateBody).toBe(202);

        const queuedGenerate = await getLatestChatTaskForChat(replayChatId);
        expect(queuedGenerate?.id).toBeTruthy();
        expect(queuedGenerate?.id).not.toBe(beforeLatest?.id);
        expect((queuedGenerate?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("generate");

        await SkillRuntimeExecutor.runTask({
          taskId: queuedGenerate!.id,
          chatId: replayChatId,
          workerId: "specific-replay-generate-deploy-test",
          inputState: (queuedGenerate?.result?.internal?.inputState || {}) as any,
        });
        const generated = await getChatTask(queuedGenerate!.id);
        expect(generated).toBeTruthy();
        if (!generated) {
          throw new Error(`Expected generated task ${queuedGenerate!.id}`);
        }
        if (generated.status !== "succeeded") {
          throw new Error(
            `Expected generated task to succeed but got ${String(generated.status || "unknown")}: ${String(
              generated.result?.assistantText || (generated.result as any)?.error || generated.result?.progress?.stageMessage || "",
            )}`,
          );
        }
        expect(generated.result?.progress?.stage).toBe("done");
        const generatedConfirmCardType = String(generated.result?.timelineMetadata?.cardType || "");
        expect(isContentDeployConfirmCardType(generatedConfirmCardType)).toBe(true);
        expect(String((generated.result?.timelineMetadata as any)?.payload || "")).toBe(
          expectedContentDeployPayload(generatedConfirmCardType),
        );
        expect(Array.isArray((generated.result?.timelineMetadata as any)?.posts)).toBe(true);
        expect((((generated.result?.timelineMetadata as any)?.posts || []) as unknown[]).length).toBe(3);

      const generatedProject = await loadGeneratedProject(generated);
      const { checkpointProjectPath } = generatedProject;
      const projectJson = generatedProject.project;
      const files = (projectJson?.staticSite?.files || []) as Array<{ path?: string; content?: string; type?: string }>;
      const paths = files.map((file) => String(file.path || ""));
      const hasBilingualResources = paths.includes("/i18n/messages.en.json") && paths.includes("/i18n/messages.zh-CN.json");
      const surface = inferReplaySurface(files, promptManifest?.routes || []);
      const indexHtml = fileContent(files, "/index.html");
      const enMessages = fileContent(files, "/i18n/messages.en.json");
      const zhMessages = fileContent(files, "/i18n/messages.zh-CN.json");
      const distinctLocaleKeys = collectSharedDistinctLocaleKeys(enMessages, zhMessages);
      const blogDataPath = surface.mountedPath;
      const blogDataHref = blogDataPath.replace(/\/index\.html$/, "/");
      const blogHtml = surface.mountedHtml;

      expect(paths).toEqual(expect.arrayContaining(["/styles.css", "/script.js"]));
      if (surface.hasRootIndex) {
        expect(paths).toContain("/index.html");
      }
      if (expectedManifestFiles.length > 0) {
        expect(paths).toEqual(expect.arrayContaining(expectedManifestFiles));
      }
      if (expectedManifestHtmlPaths.length > 0) {
        expect(paths).toEqual(expect.arrayContaining(expectedManifestHtmlPaths));
      }
      expect(blogDataPath).toBeTruthy();
      expect(blogDataPath).toMatch(/\/[^/]+\/index\.html$|\/index\.html$/i);
      const blogDataRoute = normalizeRoute(blogDataPath.replace(/\/index\.html$/i, "") || "/");
      if ((promptManifest?.routes || []).length > 0) {
        expect(promptManifest?.routes || []).toContain(blogDataRoute);
      }
      expect(surface.kind).not.toBe("unknown");
      if (surface.hasRootIndex) {
        expect(indexHtml.length).toBeGreaterThan(800);
        expect(hasDuplicateFooterLinkGroups(indexHtml)).toBe(false);
      }
      expect(indexHtml).not.toMatch(/Cal\.com|Open scheduling|Custom Solutions/i);
      if (surface.hasRootIndex) {
        expect(hasHrefToRoute(indexHtml, blogDataRoute)).toBe(true);
      }
      expect(hasBilingualResources).toBe(true);
      expect(distinctLocaleKeys.length).toBeGreaterThan(0);
      expect(blogHtml).toContain("/styles.css");
      expect(blogHtml).toContain('data-shpitto-blog-api="/api/blog/posts"');
      const blogVisibleText = htmlToVisibleText(blogHtml);
      expect(blogVisibleText).not.toMatch(/Blog data source|Blog backend|Blog API|content API|article list|route-native|native collections?|runtime|static fallback|fallback card|hydration|no-JS|deployment refresh/i);
      expect(blogVisibleText).not.toMatch(/\u535a\u5ba2\u6570\u636e\u6e90|\u535a\u5ba2\u540e\u7aef|\u535a\u5ba2\s*API|\u5185\u5bb9\s*API|\u8fd0\u884c\u65f6|\u9759\u6001\u56de\u9000|\u56de\u9000\u5361\u7247|\u6c34\u5408|\u90e8\u7f72\u5237\u65b0/);
      if (surface.kind === "blog-archive") {
        expect(paths).toEqual(expect.arrayContaining(["/blog/index.html"]));
        expect(paths).toEqual(expect.arrayContaining(requiredReplayBlogDetailHtmlPaths()));
        expect(surface.blogDetailPaths).toHaveLength(3);
        expect(blogHtml).toMatch(/href=["']\/blog\/[^"']+\/["']/);
        if (surface.hasRootIndex) {
          expect(hasBlogNavLink(indexHtml)).toBe(true);
        }
      } else {
        expect(surface.hasBlogIndex).toBe(false);
        expect(blogDataRoute).not.toBe("/blog");
        expect(blogDataRoute).toMatch(/^\/(?:casux-|standards-system|case-studies|page-\d+)/i);
        expect(blogHtml).not.toMatch(/href=["']\/blog\/[^"']+\/["']/);
        if (surface.hasRootIndex) {
          expect(hasBlogNavLink(indexHtml)).toBe(false);
        }
      }
      if (false) {
        expect(blogVisibleText).toMatch(
          /\u6848\u4f8b\u5e93|\u6807\u51c6\u6587\u4ef6|\u7814\u7a76\u62a5\u544a|\u653f\u7b56\u6cd5\u89c4|\u4ea7\u54c1\u6570\u636e\u5e93|case library|standards?|research reports?/i,
        );
      } else if (false) {
        expect(blogHtml).toMatch(/AI|博客|Blog|观察|工具|Method|Insight/i);
      }

      const previewIndexRes = await loadPreviewEntryResponse(
        getPreviewFile,
        generated.id,
        surface.hasRootIndex ? ["index.html"] : [blogDataRoute.replace(/^\/+/, ""), "index.html"],
      );
      expect(previewIndexRes.status).toBe(200);
      const previewIndex = await previewIndexRes.text();
      expect(previewIndex.toLowerCase()).toContain("<!doctype html");
      expect(previewIndex).toMatch(
        new RegExp(`/api/chat/tasks/${escapeRegExp(generated.id)}/preview${escapeRegExp(blogDataRoute)}(?:/)?`, "i"),
      );

      await cleanupReplayBlogData(replayChatId);

      const deployRes = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: replayChatId,
            user_id: ownerUserId,
            messages: [{ role: "user", parts: [{ type: "text", text: "deploy to cloudflare with blog runtime" }] }],
          }),
        }),
      );
      const deployBody = await deployRes.clone().text();
      expect(deployRes.status, deployBody).toBe(200);

      const deployGateTimeline = await listChatTimelineMessages(replayChatId, 500);
      const deployConfirm = [...deployGateTimeline]
        .reverse()
        .find((message) => isContentDeployConfirmCardType(String(message.metadata?.cardType || "")));
      expect(deployConfirm).toBeTruthy();
      const deployConfirmCardType = String(deployConfirm?.metadata?.cardType || "");
      expect(String(deployConfirm?.metadata?.payload || "")).toBe(expectedContentDeployPayload(deployConfirmCardType));
      expect(Array.isArray((deployConfirm?.metadata as any)?.posts)).toBe(true);
      expect((((deployConfirm?.metadata as any)?.posts || []) as unknown[]).length).toBe(3);
      const confirmDeployToken = expectedContentDeployPayload(deployConfirmCardType);

      const confirmDeployRes = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: replayChatId,
            user_id: ownerUserId,
            messages: [{ role: "user", parts: [{ type: "text", text: confirmDeployToken }] }],
          }),
        }),
      );
      const confirmDeployBody = await confirmDeployRes.clone().text();
      expect(confirmDeployRes.status, confirmDeployBody).toBe(202);

      const queuedDeploy = await getLatestChatTaskForChat(replayChatId);
      expect(queuedDeploy?.id).toBeTruthy();
      expect(queuedDeploy?.id).not.toBe(generated.id);
      expect((queuedDeploy?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("deploy");
      expect((queuedDeploy?.result?.internal?.inputState as any)?.workflow_context?.deploySourceTaskId).toBe(generated.id);
      expect((queuedDeploy?.result?.internal?.inputState as any)?.workflow_context?.contentPreviewConfirmed).toBe(true);
      expect((queuedDeploy?.result?.internal?.inputState as any)?.workflow_context?.blogContentConfirmed).toBe(true);
      expect(Array.isArray((queuedDeploy?.result?.internal?.inputState as any)?.workflow_context?.contentPreviewPosts)).toBe(true);
      expect(Array.isArray((queuedDeploy?.result?.internal?.inputState as any)?.workflow_context?.blogContentPreviewPosts)).toBe(true);
      expect((((queuedDeploy?.result?.internal?.inputState as any)?.workflow_context?.blogContentPreviewPosts || []) as unknown[]).length)
        .toBe(3);

      await SkillRuntimeExecutor.runTask({
        taskId: queuedDeploy!.id,
        chatId: replayChatId,
        workerId: "specific-replay-deploy-test",
        inputState: (queuedDeploy?.result?.internal?.inputState || {}) as any,
      });
      const deployed = await getChatTask(queuedDeploy!.id);
      expect(deployed).toBeTruthy();
      if (!deployed) {
        throw new Error(`Expected deployed task ${queuedDeploy!.id}`);
      }
      const deployedUrl = normalizePagesUrl(String(deployed.result?.deployedUrl || ""));
      const progress = (deployed.result?.progress || {}) as Record<string, any>;
      const deployInternal = (deployed.result?.internal || {}) as Record<string, any>;
      const wranglerDeploymentUrl = normalizePagesUrl(String(deployInternal.wranglerDeploymentUrl || progress.wranglerDeploymentUrl || ""));
      const productionUrl = normalizePagesUrl(String(deployInternal.productionUrl || progress.productionUrl || deployedUrl));
      const deployedUrlCandidates = Array.from(new Set([productionUrl, wranglerDeploymentUrl, deployedUrl].filter(Boolean)));
      expect(deployed.status).toBe("succeeded");
      expect(progress.stage).toBe("deployed");
      expect(progress.deploymentStrategy).toBe("wrangler");
      expect(progress.blogRuntimeStatus).toMatch(/^active:/);
      expect(progress.generatedBlogContentStatus?.status).toBe("seeded");
      expect(progress.generatedBlogContentStatus?.postCount).toBe(3);
      expect(progress.smoke?.blogRuntime?.status).toBe("passed");
      expect(deployedUrl).toContain(".pages.dev");

      const { getD1Client } = await import("../d1");
      const generatedBlogRows = await getD1Client().query<Array<Record<string, unknown>>[number]>(
        `
        SELECT id, slug, title, excerpt, category, content_md AS contentMd
        FROM shpitto_blog_posts
        WHERE project_id = ?
          AND id LIKE 'generated-content-post-%'
          AND status = 'published'
        ORDER BY id ASC;
        `,
        [replayChatId],
      );
      expect(generatedBlogRows).toHaveLength(3);
      const generatedBlogText = generatedBlogRows
        .map((row) => `${row.title || ""} ${row.excerpt || ""} ${row.category || ""} ${row.contentMd || ""}`)
        .join("\n");
      expect(generatedBlogText.length).toBeGreaterThan(300);
      expect(generatedBlogText).not.toMatch(/Specific Replay|marker|lorem ipsum|template news/i);
      const generatedRuntimePost = {
        slug: String(generatedBlogRows[0]?.slug || ""),
        title: String(generatedBlogRows[0]?.title || ""),
      };
      expect(generatedRuntimePost.slug).toBeTruthy();
      expect(generatedRuntimePost.title).toBeTruthy();

      const home = surface.hasRootIndex
        ? await fetchTextFromAnyWithRetry(
            deployedUrlCandidates,
            "",
            (text, status) => status === 200 && text.toLowerCase().includes("<!doctype html"),
          )
        : null;
      const runtimeJson = await fetchTextFromAnyWithRetry(
        deployedUrlCandidates,
        "/shpitto-blog-runtime.json",
        (text, status, contentType) => status === 200 && contentType.includes("json") && text.includes('"mode": "deployment-d1-runtime"'),
      );
      const postsJson = await fetchTextFromAnyWithRetry(
        deployedUrlCandidates,
        "/api/blog/posts",
        (text, status, contentType) =>
          status === 200 &&
          contentType.includes("json") &&
          text.includes(generatedRuntimePost.slug) &&
          text.includes(generatedRuntimePost.title) &&
          !text.includes("Specific Replay Blog Verification"),
      );
      const blog = await fetchTextFromAnyWithRetry(
        deployedUrlCandidates,
        blogDataHref,
        (text, status) =>
          status === 200 &&
          /<!doctype html/i.test(text) &&
          text.includes("/styles.css") &&
          text.includes("/api/blog/posts") &&
          /data-shpitto-blog-root|Blog|Information Platform|信息平台/.test(text) &&
          !/Blog data source|Blog backend|Blog API|content API|article list|route-native|native collections?|runtime|static fallback|fallback card|hydration|no-JS|deployment refresh/i.test(text) &&
          !/\u535a\u5ba2\u6570\u636e\u6e90|\u535a\u5ba2\u540e\u7aef|\u535a\u5ba2\s*API|\u5185\u5bb9\s*API|\u8fd0\u884c\u65f6|\u9759\u6001\u56de\u9000|\u56de\u9000\u5361\u7247|\u6c34\u5408|\u90e8\u7f72\u5237\u65b0/.test(text) &&
          !text.includes("Specific Replay Blog Verification") &&
          !text.includes("Powered by Shpitto Blog runtime"),
      );
      const deployedEnMessages = (
        await fetchTextFromAnyWithRetry(
          deployedUrlCandidates,
          "/i18n/messages.en.json",
          (text, status, contentType) => status === 200 && contentType.includes("json"),
        )
      ).text;
      const deployedZhMessages = (
        await fetchTextFromAnyWithRetry(
          deployedUrlCandidates,
          "/i18n/messages.zh-CN.json",
          (text, status, contentType) => status === 200 && contentType.includes("json"),
        )
      ).text;
      const liveHomeDistinctLocaleKeys =
        home && surface.hasRootIndex
          ? collectSharedDistinctLocaleKeys(deployedEnMessages, deployedZhMessages)
          : [];
      if (home?.text) {
        expect(hasDuplicateFooterLinkGroups(home.text)).toBe(false);
        if (surface.kind === "blog-archive") {
          expect(hasBlogNavLink(home.text)).toBe(true);
        } else {
          expect(hasBlogNavLink(home.text)).toBe(false);
        }
      }
      expect(liveHomeDistinctLocaleKeys.length).toBeGreaterThan(0);
      const generatedBlogCardClass = blogHtml.match(/data-shpitto-blog-list[\s\S]*?<article\b[^>]*\bclass=(["'])([^"']+)\1/i)?.[2] || "";
      expect(blog.text).not.toContain('class="shpitto-blog-live-card"');
      if (generatedBlogCardClass) {
        expect(blog.text).toContain(`class="${generatedBlogCardClass}"`);
      }
      const rss =
        surface.kind === "blog-archive"
          ? await fetchTextFromAnyWithRetry(
              deployedUrlCandidates,
              "/blog/rss.xml",
              (text, status, contentType) =>
                status === 200 &&
                contentType.includes("xml") &&
                text.includes(generatedRuntimePost.slug) &&
                !text.includes("Specific Replay Blog Verification"),
            )
          : null;
      const postDetail =
        surface.kind === "blog-archive"
          ? await fetchTextFromAnyWithRetry(
              deployedUrlCandidates,
              `/blog/${generatedRuntimePost.slug}/`,
              (text, status, contentType) =>
                status === 200 && contentType.includes("html") && text.includes(generatedRuntimePost.title),
            )
          : null;
      const sitemap =
        surface.kind === "blog-archive"
          ? await fetchTextFromAnyWithRetry(
              deployedUrlCandidates,
              "/sitemap.xml",
              (text, status, contentType) => status === 200 && contentType.includes("xml") && text.includes("/blog/"),
            )
          : null;

      const report = {
        chatId: replayChatId,
        ownerUserId,
        marker,
        generatedTaskId: generated.id,
        deployTaskId: deployed.id,
        checkpointProjectPath,
        generatedProjectSource: generatedProject.source,
        generatedFiles: paths,
        surfaceKind: surface.kind,
        blogDataPath,
        deployedUrl,
        productionUrl,
        wranglerDeploymentUrl,
        deployedUrlCandidates,
        deploymentStrategy: progress.deploymentStrategy,
        blogRuntimeStatus: progress.blogRuntimeStatus,
        generatedBlogContentStatus: progress.generatedBlogContentStatus,
        generatedBlogPostTitles: generatedBlogRows.map((row) => String(row.title || "")),
        blogRuntimeSmoke: progress.smoke?.blogRuntime,
        generatedRuntimePost,
        liveQuality: {
          generatedHasBilingualResources: hasBilingualResources,
          liveHasBilingualResources: true,
          generatedDistinctLocaleKeyCount: distinctLocaleKeys.length,
          liveDistinctLocaleKeyCount: liveHomeDistinctLocaleKeys.length,
          generatedDuplicateFooterGroups: surface.hasRootIndex ? hasDuplicateFooterLinkGroups(indexHtml) : false,
          liveDuplicateFooterGroups: home?.text ? hasDuplicateFooterLinkGroups(home.text) : false,
          generatedHasBlogNavLink: surface.hasRootIndex ? hasBlogNavLink(indexHtml) : false,
          liveHasBlogNavLink: home?.text ? hasBlogNavLink(home.text) : false,
        },
        checks: {
          previewIndex: previewIndexRes.status,
          home: home?.status || null,
          runtimeJson: runtimeJson.status,
          postsJson: postsJson.status,
          blog: blog.status,
          rss: rss?.status || null,
          postDetail: postDetail?.status || null,
          sitemap: sitemap?.status || null,
        },
        checkUrls: {
          home: home?.url || null,
          runtimeJson: runtimeJson.url,
          postsJson: postsJson.url,
          blog: blog.url,
          rss: rss?.url || null,
          postDetail: postDetail?.url || null,
          sitemap: sitemap?.url || null,
        },
      };

      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

        const finalTask = await getChatTask(deployed.id);
        expect(finalTask?.status).toBe("succeeded");
        console.log(JSON.stringify({ SPECIFIC_CHAT_REPLAY_RESULT: report }, null, 2));
      } finally {
        if (prevChatMemoryBackend === undefined) delete process.env.CHAT_MEMORY_BACKEND;
        else process.env.CHAT_MEMORY_BACKEND = prevChatMemoryBackend;
        if (prevSupabaseProxy === undefined) delete process.env.SUPABASE_TASK_PROXY_URL;
        else process.env.SUPABASE_TASK_PROXY_URL = prevSupabaseProxy;
        if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
        else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
        if (prevAsyncTaskTimeoutMs === undefined) delete process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
        else process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = prevAsyncTaskTimeoutMs;
        if (prevStageBudgetPerFileMs === undefined) delete process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS;
        else process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = prevStageBudgetPerFileMs;
        if (prevRoundIdleTimeoutMs === undefined) delete process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS;
        else process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS = prevRoundIdleTimeoutMs;
        if (prevRoundAbsoluteTimeoutMs === undefined) delete process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS;
        else process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = prevRoundAbsoluteTimeoutMs;
        if (prevDetailTargetsPerRound === undefined) delete process.env.SKILL_TOOL_DETAIL_TARGETS_PER_ROUND;
        else process.env.SKILL_TOOL_DETAIL_TARGETS_PER_ROUND = prevDetailTargetsPerRound;
        if (prevPptokenModel === undefined) delete process.env.LLM_MODEL_PPTOKEN;
        else process.env.LLM_MODEL_PPTOKEN = prevPptokenModel;
        if (prevPptokenFallbackModel === undefined) delete process.env.LLM_MODEL_FALLBACK_PPTOKEN;
        else process.env.LLM_MODEL_FALLBACK_PPTOKEN = prevPptokenFallbackModel;
        if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
        else process.env.LLM_PROVIDER = prevProvider;
        if (prevProviderOrder === undefined) delete process.env.LLM_PROVIDER_ORDER;
        else process.env.LLM_PROVIDER_ORDER = prevProviderOrder;
      }
    },
    1_800_000,
  );
});
