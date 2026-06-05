import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { describe, expect, it, vi } from "vitest";
import { CloudflareClient } from "../cloudflare";
import { configureUndiciProxyFromEnv } from "./network";
import { getChatTask, getLatestChatTaskForChat, listChatTimelineMessages } from "./chat-task-store";
import {
  fileContent,
  hasHrefToRoute,
  htmlToVisibleText,
  loadGeneratedProject,
  normalizePagesUrl,
  normalizeRoute,
  routeToHtmlPath,
} from "./chat-replay-live-test-helpers";
import {
  collectSharedDistinctLocaleKeys,
  extractHtmlLang,
  hasBlogNavLink,
  hasConsultationForm,
  hasDistinctTranslatedLocaleResources,
  hasDuplicateFooterLinkGroups,
} from "./institutional-live-quality";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "scripts/.env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });
configureUndiciProxyFromEnv();

process.env.CLOUDFLARE_REQUIRE_REAL = "1";
process.env.CLOUDFLARE_DEPLOY_STRATEGY ||= "wrangler";
process.env.SHPITTO_DEPLOY_BLOG_RUNTIME ||= "1";
process.env.CHAT_WORKER_CLAIM_MODES ||= "generate,deploy";

const shouldRun =
  String(process.env.RUN_CASUX_FULLFLOW_LIVE || "").trim() === "1" ||
  String(process.env.npm_lifecycle_event || "").trim() === "smoke:casux-fullflow:live";

const CASUX_SOURCE_URL = "https://example.test/CASUX_.md.pdf";
const CASUX_SOURCE_EXCERPT = [
  "CASUX website full-page generation prompt",
  "Main navigation: Home | CASUX Creation | CASUX Construction | CASUX Certification | CASUX Advocacy | CASUX Research Center | CASUX Information Platform | Downloads",
  "Website positioning: a professional standards institution, research center, and information platform in one system.",
  "Default visible language: Chinese. Provide a real EN/ZH language switch backed by translated locale resources; do not mix English and Chinese in the same visible block.",
  "Visual style: use ecological green #2E8B57 and white as the primary palette, with warm orange accents for CTA moments.",
  "Homepage priorities: introduce CASUX as the umbrella standards system for child-friendly space creation, construction, certification, advocacy, research, and public information access. Keep the first screen institutional, not a docs shell or route directory.",
  "Creation route source notes: cover child-friendly-space principles, stakeholder alignment, spatial assessment baseline, and concept workshop outputs.",
  "Construction route source notes: cover delivery checklist, material safety review, supervision cadence, implementation milestones, and site handover readiness.",
  "Certification route source notes: cover five-dimension scoring model, total score thresholds, assessor packet, quality-mark workflow, and certification badge criteria.",
  "Advocacy route source notes: cover alliance partners, public education campaign topics, outreach toolkit, and policy-facing communication materials.",
  "Research center route source notes: cover child behavior observation studies, pilot evaluations, annual reports, and evidence synthesis for institutional partners.",
  "Information platform route source notes: present a standards/resource directory with standards document cards showing standard title, standard ID, issuing body, release date, and download button. Include consultation intake for institutions that need document clarification.",
  "Consultation form requirement: include a real form with name, organization, email, topic, and message fields on the homepage or information platform route.",
  "Do not create blog or archive routes. Do not enable a generic blog runtime for this site.",
  "Generate a standards document card component: left PDF icon, middle standard title, standard ID, issuing body, release date, and a right-aligned download button.",
  "Generate a CASUX child-friendly-space scoring visualization component: total score, circular progress chart, five-dimension radar chart, and certification badge.",
].join("\n");

const expectedCoreRoutes = [
  "/",
  "/casux-creation",
  "/casux-construction",
  "/casux-certification",
  "/casux-advocacy",
  "/casux-research-center",
  "/casux-information-platform",
];

function buildCasuxRequirementPayload() {
  return [
    "Generate the official CASUX multi-page website based on the attached planning document.",
    "Keep the site bilingual, institutionally credible, and content-rich.",
    "The homepage must act as the official CASUX homepage and institutional overview, not as a certification, downloads, login, or search landing page.",
    "",
    "[Requirement Form]",
    "```json",
    JSON.stringify(
      {
        siteType: "corporate",
        targetAudience: ["education_operators", "research_partners", "institutional_buyers"],
        contentSources: ["uploaded_files"],
        secondaryVisualTags: ["institutional", "warm", "child-friendly"],
        pageStructure: {
          mode: "multi",
          planning: "manual",
          pages: ["home", "casux-creation", "casux-construction", "casux-certification", "casux-advocacy", "casux-research-center", "casux-information-platform"],
        },
        functionalRequirements: ["multilingual_switch", "resource_index", "content_hub", "contact_form"],
        primaryGoal: ["institutional_trust", "resource_discovery", "program_introduction"],
        language: "bilingual",
        brandLogo: {
          mode: "text_mark",
          assetKey: "",
          assetName: "",
          referenceText: "",
          altText: "CASUX",
        },
        customNotes:
          "Treat CASUX Information Platform as a route-owned standards/resource directory, not as a generic blog surface. Keep research, standards, advocacy, scoring, and certification language specific to CASUX instead of generic corporate defaults. Route / must present CASUX as the umbrella institution and official homepage overview. The ecological green #2E8B57 plus white palette with warm orange CTA accents is authoritative for this site; do not substitute blue-grey, brown, factory, or heritage-manufacturing palettes. Do not put certification, downloads, login, register, or search-directory wording into the homepage title, meta description, H1, or first lead paragraph. Do not use route-choreography wording such as from-to path, next step, where to start, or start from home anywhere visible on route /. On /casux-information-platform, do not describe the page as an entry point, route guidance page, reading entry, contact entry, or site entry label; present it as a public information library, resource index, or institutional materials directory instead. Each primary route must use a visibly distinct opening structure aligned to its role; do not repeat the same kicker + title + lead + CTA opening stack across creation, construction, certification, advocacy, research, and information pages. Every primary route must include a real contextual image in the opening band or the first proof band; do not ship text-only openings on interior routes. Keep the desktop navigation on a single compact row; do not allow wrapped nav links before tightening labels, spacing, or utility placement. Only route / or /casux-information-platform may host the real consultation form with name, organization, email, topic, and message fields; other routes should link back to that host instead of duplicating the form. Footer groups must not duplicate the same links under both Routes and Resources. Bilingual means locale-switchable content with Chinese as the default visible language for this Chinese-source site, not simultaneous Chinese and English visible in the same headline, lead, button row, nav row, or footer block. The EN/ZH switch must translate all visible route copy, including headings, section intros, CTA labels, form labels, nav, and footer copy on every route. Do not create blog or archive routes and do not enable a generic blog runtime.",
      },
      null,
      2,
    ),
    "```",
    "",
    "[Referenced Assets]",
    `- Asset "CASUX_.md.pdf" URL: ${CASUX_SOURCE_URL}`,
  ].join("\n");
}

function isContentDeployConfirmCardType(value: string) {
  return value === "confirm_blog_content_deploy" || value === "confirm_content_preview_deploy";
}

function expectedContentDeployPayload(cardType: string) {
  return cardType === "confirm_content_preview_deploy"
    ? "__SHP_CONFIRM_CONTENT_DEPLOY__"
    : "__SHP_CONFIRM_BLOG_CONTENT_DEPLOY__";
}

function appendCasuxHomepageGate(prompt: string) {
  const normalized = String(prompt || "").trim();
  if (!normalized) return normalized;
  const contract = [
    "## CASUX Homepage Contract",
    "- Route / must be the official CASUX homepage and institutional overview.",
    "- The title, meta description, H1, and first lead paragraph must describe CASUX as the umbrella standards system, research center, and information platform.",
    "- Do not use certification, download, login, register, or search-directory wording in the title, meta description, H1, or first lead paragraph for route /.",
    "- Do not enumerate Creation, Construction, Certification, Advocacy, Research Center, or Information Platform in the title, meta description, H1, or first lead paragraph for route /.",
    "- Do not use route-choreography wording such as from-to path, next step, where to start, start from home, or site browsing path anywhere visible on route /.",
    "- Homepage copy target: the title/H1/lead should read like an official institutional home, for example 'CASUX official institutional home' or 'CASUX official overview for child-friendly space standards and research'.",
    "- Present Creation, Construction, Certification, Advocacy, Research Center, and Information Platform as sibling pathways only in secondary navigation, cards, or later sections.",
  ].join("\n");
  return normalized.includes("## CASUX Homepage Contract") ? normalized : `${normalized}\n\n${contract}`;
}

function rewriteCasuxPromptForFullFlow(prompt: string) {
  let rewritten = appendCasuxHomepageGate(prompt)
    .replace(/"websiteSurfaceMode"\s*:\s*"docs-knowledge-site"/g, '"websiteSurfaceMode": "content-hub-site"')
    .replace(/"surfaceMode"\s*:\s*"docs-knowledge-site"/g, '"surfaceMode": "content-hub-site"');

  rewritten = rewritten.replace(
    /"primaryGoal"\s*:\s*"institutional_trust,\s*resource_discovery,\s*program_introduction,\s*download"/g,
    '"primaryGoal": "institutional_trust, resource_discovery, program_introduction"',
  );

  rewritten = rewritten.replace(
    /"purpose"\s*:\s*"Build the Home page from the uploaded source document, preserving its source-defined role and content modules\."/,
    '"purpose": "Build the Home page as the official CASUX homepage and institutional overview. Establish CASUX as the umbrella standards system, research center, and information platform before routing visitors into sibling pathways."',
  );

  const override = [
    "## CASUX Surface Override",
    "- Use a brand-led institutional homepage and content-hub shell for route /.",
    "- Do not render route / as a docs workspace, download directory, certification portal, or search-first index page.",
    "- The homepage title, H1, and first lead paragraph must stay at the umbrella-institution level and must not list the downstream route names or route-family nouns.",
    "- Prefer parallel capability phrasing over from-to route wording. Do not write visible copy like 'from creation to construction', 'from certification to advocacy', or any phrase that reads like a browsing path.",
    "- Present Creation, Construction, Certification, Advocacy, Research Center, and Information Platform as sibling destinations after the institutional overview.",
  ].join("\n");

  if (!rewritten.includes("## CASUX Surface Override")) {
    rewritten = `${rewritten}\n\n${override}`;
  }
  return rewritten;
}

function buildCasuxConfirmedCanonicalPrompt() {
  return [
    "# Canonical Website Generation Prompt",
    "",
    "## 0. Confirmed Generation Parameters",
    "- Website type: institutional standards and research website",
    "- Target audience: education operators, research partners, institutional buyers",
    "- Primary visual direction: institutional, warm, child-friendly, and credible",
    "- Site structure: Multi-page website",
    "- Functional requirements: Chinese-first bilingual support, resource discovery, a clear contact path, and a consultation form",
    "- Primary goal: institutional trust, standards guidance, research discovery, and program introduction",
    "- Language: Chinese-first bilingual Chinese and English",
    "- Content sources: uploaded planning materials already summarized into this prompt",
    "",
    "## 1. Site Mission",
    "Generate the official CASUX website for child-friendly space standards, implementation guidance, research support, and information access.",
    "Route / must be the official CASUX homepage and institutional overview.",
    "The title, meta description, H1, and first lead paragraph on route / must describe CASUX as the umbrella standards system, research center, and information platform.",
    "Do not use certification, download, login, register, search-directory, next-step, where-to-start, or from-to browsing wording in those homepage fields.",
    "Do not enumerate Creation, Construction, Certification, Advocacy, Research Center, or Information Platform inside the homepage title, meta description, H1, or first lead paragraph.",
    "Bilingual output must be locale-switchable. Do not render simultaneous Chinese and English visible copy inside the same headline, lead, nav row, CTA group, support card, or footer block.",
    "",
    "## 2. Homepage Contract",
    "- Use a brand-led institutional masthead with a real image-backed visual and a concise trust-building overview.",
    "- Introduce CASUX mission, audience, collaboration value, and proof signals before routing into interior pages.",
    "- Present Creation, Construction, Certification, Advocacy, Research Center, and Information Platform as sibling pathways only in secondary navigation, cards, or later sections.",
    "- Avoid docs-workspace chrome, search-first openings, and route-choreography copy as the first impression.",
    "- Keep one locale visible at a time. Chinese is the default visible language for the first render on every route. If bilingual support is implemented with data attributes or resource files, do not duplicate both languages visibly in the same section.",
    "- The homepage or information platform must include a real consultation form with fields for name, organization, email, topic, and message.",
    "- Only route / or /casux-information-platform may host the real consultation form. Other routes should use CTA links back to those hosts instead of duplicating the form.",
    "- The ecological green #2E8B57 plus white palette with warm orange CTA accents is authoritative. Do not substitute blue-grey, brown, or heritage-manufacturing palette systems.",
    "- Each primary route must use a visibly distinct opening structure aligned to its route role. Do not repeat one generic lead-band hero stack across creation, construction, certification, advocacy, research, and information pages.",
    "- Every primary route must include a real contextual image in the opening band or first proof band; do not ship text-only interior openings.",
    "- Keep the desktop navigation on a single compact row; do not allow wrapped nav links before reducing label length, gap spacing, or utility width.",
    "- The EN/ZH switch must translate all visible route copy, including hero text, section headings, CTA labels, form labels, nav, and footer copy on every route.",
    "",
    "## 3. Route Contracts",
    "1. /casux-creation",
    "   - Explain concept framing, space strategy, and creation methodology.",
    "2. /casux-construction",
    "   - Explain implementation, delivery governance, and project execution guidance.",
    "3. /casux-certification",
    "   - Explain certification scope, review logic, and preparation guidance.",
    "4. /casux-advocacy",
    "   - Explain public-interest positioning, advocacy topics, and collaboration narratives.",
    "5. /casux-research-center",
    "   - Explain research methods, evidence building, and study outputs.",
    "6. /casux-information-platform",
    "   - Act as the public information library and resource index for standards, research, and institutional updates.",
    "   - If rendered as a static directory, keep it as a rich route-owned information index.",
    "   - If rendered with runtime-backed content collection behavior, keep it route-owned and do not create undeclared /blog or /archive routes.",
    "   - Do not describe the route as an entry point, reading entry, contact entry, route guidance page, or site entry label in visible copy.",
    "",
    "## 4. Quality Constraints",
    "- Each route must have distinct structure and route-owned copy; do not reuse one generic shell with only text swaps.",
    "- Visitor-facing copy must talk about institutional value, standards, research, implementation, or collaboration. Do not explain how to browse the site.",
    "- Do not invent generic corporate defaults such as products, cases, pricing, or contact-route-only homepages.",
    "- Keep the result polished, responsive, and consistent with a serious institutional website rather than a generic SaaS dashboard or blog template.",
    "- On /casux-information-platform, ban visible phrases such as point of entry, entry point, entry label, route guidance, reading entry, contact entry, site entry, or next-step routing language.",
    "- Never render obvious simultaneous bilingual visible copy. One node, one visible locale.",
    "- Footer groups must be meaningfully distinct. Do not repeat the same route list under both Routes and Resources.",
    "- Do not create /blog or /archive routes and do not rely on a generic blog runtime for this site.",
    "",
    "### Prompt Control Manifest (Machine Readable)",
    "```json",
    JSON.stringify(
      {
        schemaVersion: 1,
        promptKind: "canonical_website_prompt",
        routeSource: "uploaded_source_page_plan",
        websiteSurfaceMode: "content-hub-site",
        visualDirectionId: "institutional-child-friendly",
        routes: expectedCoreRoutes,
        navLabels: ["Home", "Creation", "Construction", "Certification", "Advocacy", "Research", "Information"],
        files: [
          "/styles.css",
          "/script.js",
          "/i18n/messages.en.json",
          "/i18n/messages.zh-CN.json",
          "/index.html",
          ...expectedCoreRoutes.filter((route) => route !== "/").map((route) => routeToHtmlPath(route)),
        ],
        discoveryBrief: {
          surfaceMode: "content-hub-site",
          audience: ["education_operators", "research_partners", "institutional_buyers"],
          primaryGoal: "institutional_trust, resource_discovery, program_introduction",
          routes: expectedCoreRoutes,
          sourcePriority: "uploaded_files",
          localeMode: "bilingual",
          visualDirectionId: "institutional-child-friendly",
          immutableConstraints: ["brand:CASUX", "locale:bilingual"],
          confirmationStatus: "confirmed",
          missingFields: [],
          assumptions: [],
        },
        pageIntents: [
          {
            route: "/",
            navLabel: "Home",
            purpose:
              "Build the Home page as the official CASUX homepage and institutional overview. Establish CASUX as the umbrella standards system, research center, and information platform before routing visitors into sibling pathways.",
            source: "casux_fullflow_live_smoke",
          },
          {
            route: "/casux-creation",
            navLabel: "Creation",
            purpose: "Explain concept framing, space strategy, and creation methodology.",
            source: "casux_fullflow_live_smoke",
          },
          {
            route: "/casux-construction",
            navLabel: "Construction",
            purpose: "Explain implementation, delivery governance, and project execution guidance.",
            source: "casux_fullflow_live_smoke",
          },
          {
            route: "/casux-certification",
            navLabel: "Certification",
            purpose: "Explain certification scope, review logic, and preparation guidance.",
            source: "casux_fullflow_live_smoke",
          },
          {
            route: "/casux-advocacy",
            navLabel: "Advocacy",
            purpose: "Explain public-interest positioning, advocacy topics, and collaboration narratives.",
            source: "casux_fullflow_live_smoke",
          },
          {
            route: "/casux-research-center",
            navLabel: "Research",
            purpose: "Explain research methods, evidence building, and study outputs.",
            source: "casux_fullflow_live_smoke",
          },
          {
            route: "/casux-information-platform",
            navLabel: "Information",
            purpose:
              "Act as the public information library and resource index for standards, research, institutional updates, and public-facing materials. Do not frame the page as an entry point or route-guidance surface.",
            source: "casux_fullflow_live_smoke",
          },
        ],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

function inferContentCollectionSurface(files: Array<{ path?: string; content?: string }>) {
  const mountedFile = files.find(
    (file) =>
      String(file.path || "").toLowerCase().endsWith(".html") &&
      /data-shpitto-blog-root/i.test(String(file.content || "")),
  );
  const mountedPath = String(mountedFile?.path || "");
  const mountedRoute = normalizeRoute(mountedPath.replace(/\/index\.html$/i, "") || "/");
  return {
    mountedPath,
    mountedRoute,
    mountedHtml: String(mountedFile?.content || ""),
  };
}

async function waitForTerminalTask(taskId: string, runWorkerOnce: () => Promise<boolean>) {
  const deadline = Date.now() + 24 * 60 * 1000;
  let lastStatus = "";
  let lastStage = "";

  while (Date.now() < deadline) {
    const task = await getChatTask(taskId);
    lastStatus = String(task?.status || "");
    lastStage = String(task?.result?.progress?.stage || "");

    if (task?.status === "succeeded") return task;
    if (task?.status === "failed") {
      throw new Error(
        `Task ${taskId} failed: ${String(task.result?.assistantText || (task.result as any)?.error || lastStage)}`,
      );
    }

    if (task?.status === "queued") {
      await runWorkerOnce();
      const refreshedTask = await getChatTask(taskId);
      lastStatus = String(refreshedTask?.status || lastStatus);
      lastStage = String(refreshedTask?.result?.progress?.stage || lastStage);
      if (refreshedTask?.status === "succeeded") return refreshedTask;
      if (refreshedTask?.status === "failed") {
        throw new Error(
          `Task ${taskId} failed: ${String(refreshedTask.result?.assistantText || (refreshedTask.result as any)?.error || lastStage)}`,
        );
      }
      continue;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  const finalTask = await getChatTask(taskId);
  if (finalTask?.status === "succeeded") return finalTask;
  if (finalTask?.status === "failed") {
    throw new Error(
      `Task ${taskId} failed: ${String(finalTask.result?.assistantText || (finalTask.result as any)?.error || lastStage)}`,
    );
  }
  throw new Error(`Timed out waiting for task ${taskId}; lastStatus=${lastStatus}, lastStage=${lastStage}`);
}

async function fetchTextFromAnyWithRetry(
  urls: string[],
  pathSuffix: string,
  predicate: (text: string, status: number, contentType: string) => boolean,
  options: { maxAttempts?: number; retryDelayMs?: number; retryDelayCapMs?: number } = {},
) {
  const candidates = Array.from(new Set(urls.map(normalizePagesUrl).filter(Boolean)));
  let lastError = "";
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 24));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs || 1500));
  const retryDelayCapMs = Math.max(retryDelayMs, Number(options.retryDelayCapMs || 12_000));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    for (const baseUrl of candidates) {
      const url = `${baseUrl}${pathSuffix}`;
      try {
        const res = await fetch(url, { headers: { "user-agent": "shpitto-casux-fullflow/1.0" } });
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
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(retryDelayCapMs, retryDelayMs * attempt)));
    }
  }
  throw new Error(`Timed out fetching ${pathSuffix} from ${candidates.join(", ")}. Last result: ${lastError}`);
}

async function getCloudflareDeploymentEvidence(projectName: string) {
  const project = await new CloudflareClient().getPagesProject(projectName);
  const latestDeployment = project?.latestDeployment || null;
  return {
    projectName,
    latestDeploymentUrl: String(latestDeployment?.url || "").trim(),
    latestDeploymentStage: String(latestDeployment?.latestStage?.status || "").trim().toLowerCase(),
    confirmed: String(latestDeployment?.latestStage?.status || "").trim().toLowerCase() === "success",
  };
}

async function resolveLocalDeploymentBundleDir(taskId: string, projectName: string) {
  const root = path.resolve(process.cwd(), ".tmp", "deployments");
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const taskPrefix = `${String(taskId || "").trim()}-`;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith(taskPrefix)) continue;
    const candidate = path.join(root, entry.name, projectName);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // Ignore missing deployment output directories.
    }
  }
  return "";
}

function deploymentBundleRelativePath(pathSuffix: string) {
  const normalized = String(pathSuffix || "").replace(/^\//, "");
  if (!normalized) return "index.html";
  if (normalized.endsWith("/")) return path.join(normalized, "index.html");
  return normalized;
}

function deploymentBundleContentType(pathSuffix: string) {
  const normalized = String(pathSuffix || "").toLowerCase();
  if (normalized.endsWith(".json")) return "application/json; charset=utf-8";
  if (normalized.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (normalized.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (normalized.endsWith(".css")) return "text/css; charset=utf-8";
  return "text/html; charset=utf-8";
}

async function fetchDeployedTextWithFallback(params: {
  urls: string[];
  pathSuffix: string;
  predicate: (text: string, status: number, contentType: string) => boolean;
  deployTaskId: string;
  projectName: string;
}) {
  try {
    const live = await fetchTextFromAnyWithRetry(params.urls, params.pathSuffix, params.predicate, {
      maxAttempts: 2,
      retryDelayMs: 1000,
      retryDelayCapMs: 2000,
    });
    return { ...live, verificationMode: "live-fetch", deploymentEvidence: null, bundleDir: null };
  } catch (liveError) {
    const deploymentEvidence = await getCloudflareDeploymentEvidence(params.projectName).catch(() => null);
    if (!deploymentEvidence?.confirmed) throw liveError;

    const bundleDir = await resolveLocalDeploymentBundleDir(params.deployTaskId, params.projectName);
    if (!bundleDir) throw liveError;

    const relativePath = deploymentBundleRelativePath(params.pathSuffix);
    const localPath = path.join(bundleDir, relativePath);
    const text = await fs.readFile(localPath, "utf8").catch(() => "");
    const contentType = deploymentBundleContentType(params.pathSuffix);
    if (!text || !params.predicate(text, 200, contentType)) throw liveError;

    return {
      status: 200,
      text,
      contentType,
      url: `local-deploy://${params.projectName}/${relativePath.replace(/\\/g, "/")}`,
      verificationMode: "cloudflare-api-plus-local-bundle",
      deploymentEvidence,
      bundleDir,
    };
  }
}

async function cleanupGeneratedProjectData(projectId: string) {
  if (!projectId) return;
  const { getD1Client } = await import("../d1");
  const d1 = getD1Client();
  const project = await d1.queryOne<{ account_id?: string; owner_user_id?: string }>(
    "SELECT account_id, owner_user_id FROM shpitto_projects WHERE id = ? LIMIT 1;",
    [projectId],
  );
  const accountId = String(project?.account_id || "").trim();
  const userId = String(project?.owner_user_id || "").trim();

  await d1.execute("DELETE FROM shpitto_blog_post_revisions WHERE project_id = ?;", [projectId]).catch(() => null);
  await d1.execute("DELETE FROM shpitto_blog_assets WHERE project_id = ?;", [projectId]).catch(() => null);
  await d1.execute("DELETE FROM shpitto_blog_posts WHERE project_id = ?;", [projectId]).catch(() => null);
  await d1.execute("DELETE FROM shpitto_blog_settings WHERE project_id = ?;", [projectId]).catch(() => null);
  await d1.execute("DELETE FROM shpitto_projects WHERE id = ?;", [projectId]).catch(() => null);
  if (userId) {
    await d1.execute("DELETE FROM shpitto_users WHERE id = ?;", [userId]).catch(() => null);
  }
  if (accountId) {
    await d1.execute("DELETE FROM shpitto_accounts WHERE id = ?;", [accountId]).catch(() => null);
  }
}

describe.skipIf(!shouldRun)("CASUX full flow live smoke", () => {
  it(
    "runs prompt draft, generation, and deploy for a CASUX full-site flow",
    async () => {
      const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
      const prevSupabaseProxy = process.env.SUPABASE_TASK_PROXY_URL;
      const prevAsyncTaskTimeoutMs = process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
      const prevStageBudgetPerFileMs = process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS;
      const prevRoundAbsoluteTimeoutMs = process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS;
      const prevRoundIdleTimeoutMs = process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS;
      const prevProvider = process.env.LLM_PROVIDER;
      const prevProviderOrder = process.env.LLM_PROVIDER_ORDER;
      const prevCrossProviderFallback = process.env.LLM_CROSS_PROVIDER_FALLBACK;
      const prevNodeUseEnvProxy = process.env.NODE_USE_ENV_PROXY;
      const prevPptokenModel = process.env.LLM_MODEL_PPTOKEN;
      const prevPptokenFallbackModel = process.env.LLM_MODEL_FALLBACK_PPTOKEN;
      const prevAibermModel = process.env.LLM_MODEL_AIBERM;
      const prevCrazyrouteModel = process.env.LLM_MODEL_CRAZYROUTE;
      const prevDraftWebSearch = process.env.CHAT_DRAFT_WEB_SEARCH_ENABLED;
      const prevDraftLlm = process.env.CHAT_DRAFT_LLM_ENABLED;
      const originalFetch = globalThis.fetch;
      const chatId = `chat-casux-fullflow-${Date.now().toString(36)}`;
      const reportPath = path.resolve(process.cwd(), ".tmp", "casux-fullflow-live", `${chatId}.json`);

      try {
        process.env.CHAT_TASKS_USE_SUPABASE = "0";
        process.env.SUPABASE_TASK_PROXY_URL = "direct";
        process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = "1800000";
        process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = "420000";
        process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS = "420000";
        process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = "480000";
        process.env.NODE_USE_ENV_PROXY = "1";
        process.env.LLM_PROVIDER = "pptoken";
        process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm,crazyrouter";
        process.env.LLM_CROSS_PROVIDER_FALLBACK = "all";
        process.env.LLM_MODEL_PPTOKEN = "gpt-5.4-mini";
        process.env.LLM_MODEL_FALLBACK_PPTOKEN = "gpt-5.4-mini";
        process.env.LLM_MODEL_AIBERM = "gpt-5.4-mini";
        process.env.LLM_MODEL_CRAZYROUTE = "gpt-5.4-mini";
        process.env.CHAT_DRAFT_WEB_SEARCH_ENABLED = "0";
        process.env.CHAT_DRAFT_LLM_ENABLED = "0";

        expect(Boolean(process.env.CLOUDFLARE_ACCOUNT_ID)).toBe(true);
        expect(Boolean(process.env.CLOUDFLARE_API_TOKEN)).toBe(true);
        expect(Boolean(process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.CLOUDFLARE_D1_DB_ID || process.env.D1_DATABASE_ID)).toBe(true);

        const interceptedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          if (url === CASUX_SOURCE_URL) {
            return new Response(CASUX_SOURCE_EXCERPT, {
              headers: { "content-type": "text/plain; charset=utf-8" },
            });
          }
          return originalFetch(input as any, init as any);
        });
        vi.stubGlobal("fetch", interceptedFetch as typeof fetch);

        (globalThis as any).__shpittoChatTaskStore = undefined;
        const { POST } = await import("../../app/api/chat/route");
        const { GET: getTaskStatus } = await import("../../app/api/chat/tasks/[taskId]/route");
        const { GET: getPreviewRoot } = await import("../../app/api/chat/tasks/[taskId]/preview/route");
        const { GET: getPreviewFile } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
        const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");

        const draftRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: chatId,
              messages: [{ role: "user", parts: [{ type: "text", text: buildCasuxRequirementPayload() }] }],
            }),
          }),
        );
        const draftBody = await draftRes.clone().text();
        expect(draftRes.status, draftBody).toBe(200);
        expect(await getLatestChatTaskForChat(chatId)).toBeUndefined();
        expect(interceptedFetch).toHaveBeenCalled();

        const draftTimeline = await listChatTimelineMessages(chatId, 100);
        const promptDraftCard = [...draftTimeline]
          .reverse()
          .find((message) => String(message.metadata?.cardType || "") === "prompt_draft");
        const confirmCard = [...draftTimeline]
          .reverse()
          .find((message) => String(message.metadata?.cardType || "") === "confirm_generate");
        expect(promptDraftCard).toBeTruthy();
        expect(confirmCard).toBeTruthy();

        const draftMetadata = (promptDraftCard?.metadata || {}) as Record<string, any>;
        const canonicalPrompt = String(draftMetadata.canonicalPrompt || "");
        const promptManifest = draftMetadata.promptControlManifest as { routes?: string[]; files?: string[]; routeSource?: string } | undefined;
        const manifestRoutes = Array.isArray(promptManifest?.routes)
          ? promptManifest!.routes.map((route) => normalizeRoute(String(route || "")))
          : [];
        expect(promptManifest?.routeSource).toBe("uploaded_source_page_plan");
        expect(manifestRoutes).toEqual(expect.arrayContaining(expectedCoreRoutes));
        expect(canonicalPrompt).toContain("CASUX");
        expect(canonicalPrompt).toContain("/casux-information-platform");
        expect(canonicalPrompt).toContain("Source Material Appendix");
        expect(canonicalPrompt).not.toContain("/custom-solutions/index.html");

        const confirmPayload = `__SHP_CONFIRM_GENERATE__\n${buildCasuxConfirmedCanonicalPrompt()}`.trim();
        expect(confirmPayload.startsWith("__SHP_CONFIRM_GENERATE__")).toBe(true);

        const generateRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: chatId,
              messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload }] }],
            }),
          }),
        );
        const generateBody = await generateRes.clone().text();
        expect(generateRes.status, generateBody).toBe(202);

        const queuedGenerateTask = await getLatestChatTaskForChat(chatId);
        expect(queuedGenerateTask?.id).toBeTruthy();
        expect((queuedGenerateTask?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("generate");

        const generatedTask = await waitForTerminalTask(String(queuedGenerateTask?.id || ""), runChatTaskWorkerOnce);
        expect(generatedTask.status).toBe("succeeded");
        expect(generatedTask.result?.progress?.stage).toBe("done");

        const generateStatusRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: queuedGenerateTask!.id }),
        });
        const generateStatusJson = await generateStatusRes.json();
        expect(generateStatusRes.status).toBe(200);
        expect(generateStatusJson?.task?.status).toBe("succeeded");

        const generatedProject = await loadGeneratedProject(generatedTask);
        const checkpointProjectPath = String(generatedProject.checkpointProjectPath || "");
        const projectJson = generatedProject.project;
        const files = (projectJson?.staticSite?.files || []) as Array<{ path?: string; content?: string; type?: string }>;
        const paths = files.map((file) => String(file.path || ""));
        const surface = inferContentCollectionSurface(files);
        const hasRuntimeContentRoute = Boolean(surface.mountedPath);
        const fallbackMountedRoute = paths.includes("/casux-information-platform/index.html")
          ? "/casux-information-platform"
          : "/casux-research-center";
        const mountedRoute = surface.mountedRoute || fallbackMountedRoute;
        const mountedHtml = surface.mountedHtml || fileContent(files, routeToHtmlPath(mountedRoute));
        const indexHtml = fileContent(files, "/index.html");
        const stylesCss = fileContent(files, "/styles.css");
        const creationHtml = fileContent(files, "/casux-creation/index.html");
        const constructionHtml = fileContent(files, "/casux-construction/index.html");
        const certificationHtml = fileContent(files, "/casux-certification/index.html");
        const advocacyHtml = fileContent(files, "/casux-advocacy/index.html");
        const researchHtml = fileContent(files, "/casux-research-center/index.html");
        const infoHtml = fileContent(files, "/casux-information-platform/index.html");
        const enMessages = fileContent(files, "/i18n/messages.en.json");
        const zhMessages = fileContent(files, "/i18n/messages.zh-CN.json");
        const distinctLocaleKeys = collectSharedDistinctLocaleKeys(enMessages, zhMessages);
        const combinedVisibleText = htmlToVisibleText([indexHtml, mountedHtml].join("\n"));

        expect(projectJson?.staticSite?.mode).toBe("skill-direct");
        expect(paths).toEqual(expect.arrayContaining(["/index.html", "/styles.css", "/script.js"]));
        expect(paths).not.toEqual(expect.arrayContaining(["/blog/index.html", "/archive/index.html"]));
        expect(paths).toEqual(expect.arrayContaining(expectedCoreRoutes.map((route) => routeToHtmlPath(route))));
        expect(stylesCss).toContain("#2E8B57");
        expect(stylesCss).toContain("#F59E0B");
        expect(stylesCss).not.toMatch(/#3F5D7D|#A47A3A|#7A3524/i);
        expect(mountedRoute).toBeTruthy();
        expect(mountedRoute).not.toBe("/blog");
        expect(manifestRoutes).toContain(mountedRoute);
        expect(indexHtml).toContain("/styles.css");
        expect(hasHrefToRoute(indexHtml, mountedRoute)).toBe(true);
        expect(extractHtmlLang(indexHtml)).toBe("zh-CN");
        expect(extractHtmlLang(infoHtml)).toBe("zh-CN");
        expect(hasDistinctTranslatedLocaleResources(enMessages, zhMessages)).toBe(true);
        expect(distinctLocaleKeys.length).toBeGreaterThan(0);
        expect(hasDuplicateFooterLinkGroups(indexHtml)).toBe(false);
        expect(hasDuplicateFooterLinkGroups(infoHtml)).toBe(false);
        expect(hasConsultationForm(indexHtml) || hasConsultationForm(infoHtml)).toBe(true);
        if (hasRuntimeContentRoute) {
          expect(mountedHtml).toContain('data-shpitto-blog-api="/api/blog/posts"');
        } else {
          expect(mountedHtml.toLowerCase()).toContain("<!doctype html");
          expect(mountedHtml).not.toContain('data-shpitto-blog-root');
        }
        expect(htmlToVisibleText(indexHtml)).toMatch(/CASUX/i);
        expect(htmlToVisibleText(indexHtml)).toMatch(/child-friendly|儿童友好|标准|standards/i);
        expect(htmlToVisibleText(infoHtml)).toMatch(/标准|standards|resource|资源|download|下载|standard id|issuing body/i);
        expect(htmlToVisibleText(certificationHtml)).toMatch(/score|评分|badge|优标|criteria|评审/i);
        expect(combinedVisibleText).toMatch(/CASUX|Information Platform|Research Center|Standards System|Case Studies/i);
        expect(combinedVisibleText).not.toMatch(/Custom Solutions|Open scheduling|Cal\.com|lorem ipsum/i);
        expect(indexHtml).toContain("<form");
        expect(infoHtml).toContain("<form");
        expect(creationHtml).not.toContain("<form");
        expect(constructionHtml).not.toContain("<form");
        expect(advocacyHtml).not.toContain("<form");
        expect(researchHtml).not.toContain("<form");
        expect(creationHtml).toContain("<img");
        expect(constructionHtml).toContain("<img");
        expect(advocacyHtml).toContain("<img");
        expect(researchHtml).toContain("<img");

        const previewRootRes = await getPreviewRoot(new Request("http://localhost/api/chat/tasks/x/preview"), {
          params: Promise.resolve({ taskId: queuedGenerateTask!.id }),
        });
        expect(previewRootRes.status).toBe(307);
        expect(String(previewRootRes.headers.get("location") || "")).toContain(
          `/api/chat/tasks/${encodeURIComponent(queuedGenerateTask!.id)}/preview/__default__`,
        );

        const previewIndexRes = await getPreviewFile(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: queuedGenerateTask!.id, path: ["index.html"] }),
        });
        expect(previewIndexRes.status).toBe(200);
        const previewIndexHtml = await previewIndexRes.text();
        expect(previewIndexHtml.toLowerCase()).toContain("<!doctype html");

        const previewMountedRes = await getPreviewFile(new Request("http://localhost"), {
          params: Promise.resolve({
            taskId: queuedGenerateTask!.id,
            path: [...mountedRoute.replace(/^\/+/, "").split("/").filter(Boolean), "index.html"],
          }),
        });
        expect(previewMountedRes.status).toBe(200);
        const previewMountedHtml = await previewMountedRes.text();
        if (hasRuntimeContentRoute) {
          expect(previewMountedHtml).toContain('data-shpitto-blog-api="/api/blog/posts"');
        } else {
          expect(previewMountedHtml.toLowerCase()).toContain("<!doctype html");
        }

        const deployQueueRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: chatId,
              messages: [{ role: "user", parts: [{ type: "text", text: "deploy to cloudflare" }] }],
            }),
          }),
        );
        const deployQueueBody = await deployQueueRes.clone().text();
        const deployGateTimeline = await listChatTimelineMessages(chatId, 500);
        const deployConfirm = [...deployGateTimeline]
          .reverse()
          .find((message) => isContentDeployConfirmCardType(String(message.metadata?.cardType || "")));
        let queuedDeployTask;
        if (deployQueueRes.status === 200) {
          expect(deployConfirm).toBeTruthy();
          const deployConfirmCardType = String(deployConfirm?.metadata?.cardType || "");
          expect(String(deployConfirm?.metadata?.payload || "")).toBe(expectedContentDeployPayload(deployConfirmCardType));
          expect(Array.isArray((deployConfirm?.metadata as any)?.posts)).toBe(true);
          expect((((deployConfirm?.metadata as any)?.posts || []) as unknown[]).length).toBe(3);

          const confirmDeployRes = await POST(
            new Request("http://localhost/api/chat", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                id: chatId,
                messages: [{ role: "user", parts: [{ type: "text", text: expectedContentDeployPayload(deployConfirmCardType) }] }],
              }),
            }),
          );
          const confirmDeployBody = await confirmDeployRes.clone().text();
          expect(confirmDeployRes.status, confirmDeployBody).toBe(202);
          queuedDeployTask = await getLatestChatTaskForChat(chatId);
        } else {
          expect(deployQueueRes.status, deployQueueBody).toBe(202);
          queuedDeployTask = await getLatestChatTaskForChat(chatId);
        }

        expect(queuedDeployTask?.id).toBeTruthy();
        expect(queuedDeployTask?.id).not.toBe(queuedGenerateTask?.id);
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.executionMode).toBe("deploy");
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.deploySourceTaskId).toBe(
          queuedGenerateTask?.id,
        );
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.deploySourceProjectPath).toBe(
          checkpointProjectPath,
        );
        if (deployQueueRes.status === 200) {
          expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.contentPreviewConfirmed).toBe(true);
          expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.blogContentConfirmed).toBe(true);
        }

        const deployedTask = await waitForTerminalTask(String(queuedDeployTask?.id || ""), runChatTaskWorkerOnce);
        expect(deployedTask.status).toBe("succeeded");
        expect(deployedTask.result?.progress?.stage).toBe("deployed");

        const deployedUrl = normalizePagesUrl(String(deployedTask.result?.deployedUrl || ""));
        const progress = (deployedTask.result?.progress || {}) as Record<string, any>;
        const deployInternal = (deployedTask.result?.internal || {}) as Record<string, any>;
        const wranglerDeploymentUrl = normalizePagesUrl(String(deployInternal.wranglerDeploymentUrl || progress.wranglerDeploymentUrl || ""));
        const productionUrl = normalizePagesUrl(String(deployInternal.productionUrl || progress.productionUrl || deployedUrl));
        const deployedUrlCandidates = Array.from(new Set([productionUrl, wranglerDeploymentUrl, deployedUrl].filter(Boolean)));
        const pagesProjectName = (() => {
          try {
            return new URL(productionUrl).hostname.replace(/\.pages\.dev$/i, "");
          } catch {
            return "";
          }
        })();

        expect(deployedUrl).toContain(".pages.dev");
        expect(pagesProjectName).toBeTruthy();
        expect(progress.deploymentStrategy).toBe("wrangler");
        expect(String(progress.generatedBlogContentStatus?.status || "")).toMatch(/^skipped/);
        expect(String(progress.blogRuntimeStatus || "")).not.toMatch(/^active:/);
        const runtimeBackedDeploy = Boolean(progress.generatedBlogContentStatus?.status === "seeded");
        if (runtimeBackedDeploy) {
          expect(progress.blogRuntimeStatus).toMatch(/^active:/);
          expect(progress.generatedBlogContentStatus?.postCount).toBe(3);
          expect(String(progress.smoke?.blogRuntime?.status || "")).toMatch(/^(passed|skipped)$/);
        }

        let generatedRuntimePost: { slug: string; title: string } | null = null;
        let generatedBlogRows: Array<{
          slug?: string;
          title?: string;
          excerpt?: string;
          category?: string;
          contentMd?: string;
        }> = [];
        if (runtimeBackedDeploy) {
          const { getD1Client } = await import("../d1");
          generatedBlogRows = await getD1Client().query<{
            slug?: string;
            title?: string;
            excerpt?: string;
            category?: string;
            contentMd?: string;
          }>(
            `
            SELECT slug, title, excerpt, category, content_md AS contentMd
            FROM shpitto_blog_posts
            WHERE project_id = ?
              AND id LIKE 'generated-content-post-%'
              AND status = 'published'
            ORDER BY id ASC;
            `,
            [chatId],
          );
          expect(generatedBlogRows).toHaveLength(3);
          generatedRuntimePost = {
            slug: String(generatedBlogRows[0]?.slug || ""),
            title: String(generatedBlogRows[0]?.title || ""),
          };
          const generatedBlogText = generatedBlogRows
            .map((row) => `${row.title || ""} ${row.excerpt || ""} ${row.category || ""} ${row.contentMd || ""}`)
            .join("\n");
          expect(generatedRuntimePost.slug).toBeTruthy();
          expect(generatedRuntimePost.title).toBeTruthy();
          expect(generatedBlogText.length).toBeGreaterThan(300);
          expect(generatedBlogText).not.toMatch(/lorem ipsum|template news|Specific Replay/i);
        }

        const home = await fetchDeployedTextWithFallback({
          urls: deployedUrlCandidates,
          pathSuffix: "",
          predicate: (text, status, contentType) =>
            status === 200 &&
            contentType.includes("html") &&
            /<!doctype html/i.test(text) &&
            hasHrefToRoute(text, mountedRoute),
          deployTaskId: String(queuedDeployTask?.id || ""),
          projectName: pagesProjectName,
        });
        const liveHomeDistinctLocaleKeys = await fetchTextFromAnyWithRetry(
          deployedUrlCandidates,
          "/i18n/messages.en.json",
          (text, status, contentType) => status === 200 && contentType.includes("json") && text.includes("{"),
        ).then(async (enResponse) => {
          const zhResponse = await fetchTextFromAnyWithRetry(
            deployedUrlCandidates,
            "/i18n/messages.zh-CN.json",
            (text, status, contentType) => status === 200 && contentType.includes("json") && text.includes("{"),
          );
          return collectSharedDistinctLocaleKeys(enResponse.text, zhResponse.text);
        });
        let runtimeJson:
          | {
              status: number;
              text: string;
              contentType: string;
              url: string;
              verificationMode?: string;
              deploymentEvidence?: { latestDeploymentUrl?: string | null } | null;
              bundleDir?: string | null;
            }
          | null = null;
        let postsJson: { status: number; text: string; contentType: string; url: string } | null = null;
        if (runtimeBackedDeploy && generatedRuntimePost) {
          runtimeJson = await fetchDeployedTextWithFallback({
            urls: deployedUrlCandidates,
            pathSuffix: "/shpitto-blog-runtime.json",
            predicate: (text, status, contentType) =>
              status === 200 && contentType.includes("json") && text.includes('"mode": "deployment-d1-runtime"'),
            deployTaskId: String(queuedDeployTask?.id || ""),
            projectName: pagesProjectName,
          });
          postsJson = await fetchTextFromAnyWithRetry(
            deployedUrlCandidates,
            "/api/blog/posts",
            (text, status, contentType) =>
              status === 200 &&
              contentType.includes("json") &&
              text.includes(generatedRuntimePost.slug) &&
              text.includes(generatedRuntimePost.title),
          );
        }
        const mountedHref = mountedRoute === "/" ? "/" : `${mountedRoute}/`;
        const mountedLive = await fetchDeployedTextWithFallback({
          urls: deployedUrlCandidates,
          pathSuffix: mountedHref,
          predicate: (text, status, contentType) =>
            status === 200 &&
            contentType.includes("html") &&
            /<!doctype html/i.test(text) &&
            text.includes("/styles.css") &&
            (!runtimeBackedDeploy || text.includes("/api/blog/posts")) &&
            !/Blog data source|Blog backend|Blog API|content API|route-native|native collections?|runtime|static fallback|fallback card|hydration|no-JS|deployment refresh/i.test(
              text,
            ) &&
            !/\u535a\u5ba2\u6570\u636e\u6e90|\u535a\u5ba2\u540e\u7aef|\u535a\u5ba2\s*API|\u5185\u5bb9\s*API|\u8fd0\u884c\u65f6|\u9759\u6001\u56de\u9000|\u56de\u9000\u5361\u7247|\u6c34\u5408|\u90e8\u7f72\u5237\u65b0/.test(
              text,
            ),
          deployTaskId: String(queuedDeployTask?.id || ""),
          projectName: pagesProjectName,
        });

        if (String(progress.generatedBlogContentStatus?.status || "") === "skipped:no_content_mount") {
          expect(hasBlogNavLink(home.text)).toBe(false);
          expect(hasBlogNavLink(mountedLive.text)).toBe(false);
        }
        expect(liveHomeDistinctLocaleKeys.length).toBeGreaterThan(0);

        const report = {
          chatId,
          generatedTaskId: queuedGenerateTask?.id,
          deployTaskId: queuedDeployTask?.id,
          checkpointProjectPath,
          generatedProjectSource: generatedProject.source,
          promptManifestRouteSource: promptManifest?.routeSource,
          manifestRoutes,
          generatedFiles: paths,
          hasRuntimeContentRoute,
          mountedPath: surface.mountedPath || null,
          mountedRoute,
          deployedUrl,
          productionUrl,
          wranglerDeploymentUrl,
          deployedUrlCandidates,
          deploymentStrategy: progress.deploymentStrategy,
          blogRuntimeStatus: progress.blogRuntimeStatus || null,
          generatedBlogContentStatus: progress.generatedBlogContentStatus || null,
          generatedBlogPostTitles: generatedBlogRows.map((row) => String(row.title || "")),
          generatedRuntimePost,
          deploymentVerification: {
            home: home.verificationMode,
            runtimeJson: runtimeJson?.verificationMode || null,
            mountedLive: mountedLive.verificationMode,
            liveDistinctLocaleKeyCount: liveHomeDistinctLocaleKeys.length,
            cloudflareLatestDeploymentUrl:
              home.deploymentEvidence?.latestDeploymentUrl ||
              runtimeJson?.deploymentEvidence?.latestDeploymentUrl ||
              mountedLive.deploymentEvidence?.latestDeploymentUrl ||
              null,
            localBundleDir: home.bundleDir || runtimeJson?.bundleDir || mountedLive.bundleDir || null,
          },
          checks: {
            draftFetchCalls: interceptedFetch.mock.calls.length,
            previewRoot: previewRootRes.status,
            previewIndex: previewIndexRes.status,
            previewMounted: previewMountedRes.status,
            home: home.status,
            runtimeJson: runtimeJson?.status || null,
            postsJson: postsJson?.status || null,
            mountedLive: mountedLive.status,
          },
          checkUrls: {
            home: home.url,
            runtimeJson: runtimeJson?.url || null,
            postsJson: postsJson?.url || null,
            mountedLive: mountedLive.url,
          },
        };

        await fs.mkdir(path.dirname(reportPath), { recursive: true });
        await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
        console.log(JSON.stringify({ CASUX_FULLFLOW_RESULT: report }, null, 2));
      } finally {
        vi.unstubAllGlobals();
        await cleanupGeneratedProjectData(chatId).catch(() => null);
        if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
        else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
        if (prevSupabaseProxy === undefined) delete process.env.SUPABASE_TASK_PROXY_URL;
        else process.env.SUPABASE_TASK_PROXY_URL = prevSupabaseProxy;
        if (prevAsyncTaskTimeoutMs === undefined) delete process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
        else process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = prevAsyncTaskTimeoutMs;
        if (prevStageBudgetPerFileMs === undefined) delete process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS;
        else process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = prevStageBudgetPerFileMs;
        if (prevRoundAbsoluteTimeoutMs === undefined) delete process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS;
        else process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = prevRoundAbsoluteTimeoutMs;
        if (prevRoundIdleTimeoutMs === undefined) delete process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS;
        else process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS = prevRoundIdleTimeoutMs;
        if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
        else process.env.LLM_PROVIDER = prevProvider;
        if (prevProviderOrder === undefined) delete process.env.LLM_PROVIDER_ORDER;
        else process.env.LLM_PROVIDER_ORDER = prevProviderOrder;
        if (prevCrossProviderFallback === undefined) delete process.env.LLM_CROSS_PROVIDER_FALLBACK;
        else process.env.LLM_CROSS_PROVIDER_FALLBACK = prevCrossProviderFallback;
        if (prevNodeUseEnvProxy === undefined) delete process.env.NODE_USE_ENV_PROXY;
        else process.env.NODE_USE_ENV_PROXY = prevNodeUseEnvProxy;
        if (prevPptokenModel === undefined) delete process.env.LLM_MODEL_PPTOKEN;
        else process.env.LLM_MODEL_PPTOKEN = prevPptokenModel;
        if (prevPptokenFallbackModel === undefined) delete process.env.LLM_MODEL_FALLBACK_PPTOKEN;
        else process.env.LLM_MODEL_FALLBACK_PPTOKEN = prevPptokenFallbackModel;
        if (prevAibermModel === undefined) delete process.env.LLM_MODEL_AIBERM;
        else process.env.LLM_MODEL_AIBERM = prevAibermModel;
        if (prevCrazyrouteModel === undefined) delete process.env.LLM_MODEL_CRAZYROUTE;
        else process.env.LLM_MODEL_CRAZYROUTE = prevCrazyrouteModel;
        if (prevDraftWebSearch === undefined) delete process.env.CHAT_DRAFT_WEB_SEARCH_ENABLED;
        else process.env.CHAT_DRAFT_WEB_SEARCH_ENABLED = prevDraftWebSearch;
        if (prevDraftLlm === undefined) delete process.env.CHAT_DRAFT_LLM_ENABLED;
        else process.env.CHAT_DRAFT_LLM_ENABLED = prevDraftLlm;
      }
    },
    1_800_000,
  );
});
