import type {
  RuntimeWorkflowFile,
  SkillExecutionAdapter,
  SkillExecutionRoundObjective,
  SkillExecutionRoundPromptParams,
  SkillExecutionValidationResult,
} from "./skill-execution-adapter.ts";
import type { LocalDecisionPlan } from "./decision-layer.ts";
import { isBilingualRequirementText } from "./bilingual-copy-guard.ts";
import { resolveWebsiteChatAction } from "../../skills/website-generation-workflow/routing-policy.ts";
import { sanitizeBlogIndexEditorialScaffoldText } from "../../skills/website-generation-workflow/runtime-site-completions.ts";
import {
  buildWebsiteSkillToolRoundPromptForAdapter,
  formatWebsiteTargetPageContractForAdapter,
  validateWebsiteRequiredFilesWithQaForAdapter,
} from "./skill-tool-executor.ts";

const CORPORATE_FORBIDDEN_DIRECTION_LABEL_PATTERNS = [
  /\bheritage manufacturing\b/i,
  /\bheritage craft\b/i,
  /\bwarm palette\b/i,
];

const CORPORATE_FORBIDDEN_LEGACY_HERO_CLASS_PATTERNS = [
  /\bhero-title\b/i,
  /\bhero-copy\b/i,
  /\bhero-actions\b/i,
  /\bpage-section\b/i,
];

const CORPORATE_FORBIDDEN_META_CAPTION_PATTERNS = [
  /\buse contextual visuals?\b/i,
  /\bthis image supports\b/i,
  /\bproof image\b/i,
  /\bvisual cue\b/i,
  /\bshould show\b/i,
  /\bshould feel\b/i,
  /\babstract blocks?\b/i,
  /\blayout intent\b/i,
];

const CORPORATE_FORBIDDEN_SHELL_COPY_PATTERNS = [
  /\btext wordmark\b/i,
  /\bbrand system\b/i,
  /\bsite experience\b/i,
  /\blanguage strategy\b/i,
  /\benglish-first\b/i,
  /\bi18n\b/i,
  /\blocale\b/i,
];
const CORPORATE_FORBIDDEN_MOJIBAKE_PATTERNS = [/\u95B3/g, /\uFFFD/g, /\u6D93\uE15F\u6783/g];
const CORPORATE_FORBIDDEN_MIXED_SCRIPT_COPY_PATTERNS = [/[A-Za-z][\s\-–—|/:]*[\u4E00-\u9FFF][\s\-–—|/:]*[A-Za-z]/g];
const CORPORATE_MAX_TOOL_ROUNDS = Math.max(2, Number(process.env.SKILL_TOOL_MAX_ROUNDS || 20));
const CORPORATE_MAX_TOOL_QA_REPAIR_ROUNDS = Math.max(1, Number(process.env.SKILL_TOOL_QA_REPAIR_ROUNDS || 4));
const CORPORATE_SHARED_ASSET_TARGETS_PER_ROUND = Math.max(
  1,
  Number(process.env.SKILL_TOOL_SHARED_TARGETS_PER_ROUND || 1),
);
const CORPORATE_INTERIOR_TARGETS_PER_ROUND = Math.max(
  1,
  Number(process.env.SKILL_TOOL_INTERIOR_HTML_TARGETS_PER_ROUND || 1),
);
const CORPORATE_I18N_EN_PATH = "/i18n/messages.en.json";
const CORPORATE_I18N_ZH_PATH = "/i18n/messages.zh-CN.json";
const CORPORATE_REQUIRED_ZH_TRANSLATION_KEYS = [
  "nav.home",
  "nav.products",
  "nav.customSolutions",
  "nav.cases",
  "nav.contact",
  "nav.about",
  "locale.switch.label",
] as const;

function normalizeCorporatePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  if (raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}

function normalizeCorporateRouteFromTargetFile(targetFile: string): string {
  const normalized = `/${String(targetFile || "").trim().replace(/\\/g, "/").replace(/^\/+/, "")}`;
  if (normalized === "/index.html") return "/";
  if (normalized.endsWith("/index.html")) return normalized.slice(0, -"/index.html".length) || "/";
  return normalized;
}

function routeToCorporateHtmlPath(route: string): string {
  return route === "/" ? "/index.html" : `${route.replace(/\/+$/, "")}/index.html`;
}

function hasCorporateHanCharacters(value: string): boolean {
  return /[\u3400-\u9FFF]/.test(String(value || ""));
}

function containsCorporateForbiddenCopyPattern(value: string): boolean {
  const text = String(value || "");
  return (
    CORPORATE_FORBIDDEN_MOJIBAKE_PATTERNS.some((pattern) => pattern.test(text)) ||
    CORPORATE_FORBIDDEN_MIXED_SCRIPT_COPY_PATTERNS.some((pattern) => pattern.test(text))
  );
}

function parseCorporateJsonRecord(filePath: string, raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(raw || ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON root must be an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown JSON parse error");
    throw new Error(`skill_tool_invalid_required_file: ${filePath} must be valid JSON (${message})`);
  }
}

function normalizeCorporateCountToken(token: string): number | undefined {
  const raw = String(token || "").trim();
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  return undefined;
}

function briefExplicitlyRequestsHeritageStory(requirementText = ""): boolean {
  const text = String(requirementText || "");
  return /\b(heritage|history|legacy|founding story|company story|brand story|craft tradition)\b/i.test(text);
}

function htmlUsesLegacyHeroClass(html: string): RegExp | undefined {
  const classMatches = String(html || "").match(/class=(["'])([^"']+)\1/gi) || [];
  for (const attribute of classMatches) {
    for (const pattern of CORPORATE_FORBIDDEN_LEGACY_HERO_CLASS_PATTERNS) {
      if (pattern.test(attribute)) return pattern;
    }
  }
  return undefined;
}

function requestedCorporatePublishableContentCount(requirementText = ""): number | undefined {
  const text = String(requirementText || "");
  const asciiPatterns = [
    /\b(?:create|write|generate|publish|seed|add|produce)\s+([0-9]+)\s+(?:complete\s+|generated\s+)?(?:articles?|posts?|blog\s+posts?|reports?|guides?|case\s+studies?)(?:\s+(?:entries|items))?\b/i,
    /\b([0-9]+)\s+(?:complete\s+|generated\s+)?(?:articles?|posts?|blog\s+posts?|reports?|guides?|case\s+studies?)(?:\s+(?:entries|items))?\b/i,
  ];
  for (const pattern of asciiPatterns) {
    const match = text.match(pattern);
    const value = normalizeCorporateCountToken(match?.[1] || "");
    if (value) return Math.min(value, 12);
  }
  return undefined;
}

function normalizeCorporateCountTokenSafe(token: string): number | undefined {
  return normalizeCorporateCountToken(token);
}

function requestedCorporatePublishableContentCountSafe(requirementText = ""): number | undefined {
  return requestedCorporatePublishableContentCount(requirementText);
}

function sanitizeCorporateSkillHtmlOutput(filePath: string, html: string, requirementText: string): string {
  const normalizedPath = normalizeCorporatePath(filePath);
  let next = String(html || "");
  if (!next) return next;
  if (normalizedPath === "/blog/index.html" && requestedCorporatePublishableContentCountSafe(requirementText)) {
    next = sanitizeBlogIndexEditorialScaffoldText(next);
  }
  return next;
}

function normalizeCorporateValidatedFiles(
  files: RuntimeWorkflowFile[],
  requirementText = "",
): RuntimeWorkflowFile[] {
  return files.map((file) => {
    const normalizedPath = normalizeCorporatePath(file.path);
    if (!normalizedPath.endsWith(".html")) return file;
    const sanitized = sanitizeCorporateSkillHtmlOutput(normalizedPath, String(file.content || ""), requirementText);
    if (sanitized === String(file.content || "")) return file;
    return {
      ...file,
      path: normalizedPath,
      content: sanitized,
    };
  });
}

function hasTagBlock(html: string, tagName: string): boolean {
  return new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "i").test(String(html || ""));
}

function buildCorporateSharedShellContract(): string {
  return [
    "Corporate B2B execution contract:",
    "- Keep one shared theme system across the whole site: the same color tokens, type scale, spacing rhythm, and shell density must carry across all routes.",
    "- Keep one authoritative primary navigation and one authoritative footer contract across all pages.",
    "- Navigation destinations, labels, order, and CTA wording must stay identical across all generated pages unless the confirmed manifest explicitly removes a route.",
    "- Footer destinations, support copy, and contact/trust areas must stay identical across all generated pages unless the confirmed manifest explicitly removes a route.",
    "- Page differentiation belongs in the main content topology, evidence modules, and conversion emphasis, not in ad-hoc shell redesigns.",
  ].join("\n");
}

function buildCorporateSharedShellQaContract(): string[] {
  return [
    "- Shared-shell QA contract: treat nav/footer drift as a failed generation result, not as acceptable page variation.",
    "- Shared-shell QA contract: route order, labels, and business CTA wording in nav/footer must remain identical across all primary routes unless the confirmed manifest changes.",
    "- Shared-shell QA contract: locale controls may appear only once in a dedicated utility wrapper adjacent to nav, never duplicated inside nav links, footer links, or body sections.",
    "- Shared-shell QA contract: utility, documentation, and i18n mechanics must not replace buyer-facing shell copy.",
  ];
}

function appendCorporateContract(base: string, extra: string[]): string {
  const appendix = [buildCorporateSharedShellContract(), ...buildCorporateSharedShellQaContract(), ...extra]
    .filter(Boolean)
    .join("\n");
  return [String(base || "").trim(), appendix].filter(Boolean).join("\n\n");
}

function buildCorporateRouteMediaContractAppendix(route: string): string[] {
  const text = String(route || "/").toLowerCase();
  if (route === "/") {
    return [
      "- Media contract: use business-proof imagery that quickly communicates offer, production confidence, or buyer fit without drifting into editorial mood-board visuals.",
    ];
  }
  if (/^\/products?$/.test(text)) {
    return [
      "- Media contract: prefer product-family, material, texture, folded-pack, or specification-context imagery that helps enterprise buyers compare assortments.",
      "- Media contract: imagery should clarify assortment and sourcing fit, not act as decorative abstraction.",
    ];
  }
  if (/^\/(custom-)?solutions?$/.test(text)) {
    return [
      "- Media contract: prefer environment/process imagery that explains customization flow, delivery context, or operational fit.",
      "- Media contract: visuals should reinforce process clarity and buyer scenario relevance.",
    ];
  }
  if (/^\/cases?$/.test(text)) {
    return [
      "- Media contract: prefer application/result imagery that supports scenario -> intervention -> outcome proof.",
      "- Media contract: visuals should feel evidence-led rather than campaign-like or editorial-soft.",
    ];
  }
  if (/^\/about$/.test(text)) {
    return [
      "- Media contract: prefer company, production, or quality-discipline imagery that reinforces operational trust.",
      "- Media contract: avoid founder-portrait, diary, or artisanal storytelling visual framing.",
    ];
  }
  if (/^\/contact$/.test(text)) {
    return [
      "- Media contract: use restrained support/context imagery only when it reduces inquiry friction or clarifies buyer contact context.",
      "- Media contract: do not turn the contact page into a gallery or decorative brand wall.",
    ];
  }
  return [
    "- Media contract: choose contextual business-proof imagery that belongs to a named module and supports buyer understanding.",
  ];
}

function buildCorporateRouteContractAppendix(route: string): string[] {
  const text = String(route || "/").toLowerCase();
  if (route === "/") {
    return [
      "- Homepage-specific contract: lead with the company offer, procurement fit, proof, and one clear contact path.",
      "- Homepage-specific contract: the opening should anchor the site-wide theme and shell contract that every interior route inherits.",
    ];
  }
  if (/^\/products?$/.test(text)) {
    return [
      "- Products contract: organize the main body around product families, material/specification logic, and buyer comparison clarity.",
      "- Products contract: use proof modules to explain assortment, materials, sizing, or sourcing fit rather than reusing a generic marketing hero shell.",
      "- Products opening contract: start with a compact catalog lead, assortment navigator, shortlist/comparison frame, or specification-led intro. Do not reuse the same hero composition used by solutions, cases, about, or contact.",
    ];
  }
  if (/^\/(custom-)?solutions?$/.test(text)) {
    return [
      "- Solutions contract: structure the page around buyer scenarios, customization flow, delivery/process clarity, and decision-stage reassurance.",
      "- Solutions contract: make the page read like a solution process for enterprise buyers, not a generic feature list.",
      "- Solutions opening contract: start process-first, scenario-fit first, or collaboration-model first. Do not reuse a catalog hero or the same opening shell used by products, cases, about, or contact.",
    ];
  }
  if (/^\/cases?$/.test(text)) {
    return [
      "- Cases contract: center the body on scenario -> intervention -> result proof, with evidence-led case framing and restrained narrative.",
      "- Cases contract: highlight application context, buyer problem, and measurable or visible outcomes instead of soft brand storytelling.",
      "- Cases opening contract: start evidence-first, outcome-first, or case-ledger first. Do not reuse the same opening hero shell used by products, solutions, about, or contact.",
    ];
  }
  if (/^\/about$/.test(text)) {
    return [
      "- About contract: emphasize company identity, operating model, quality/production discipline, and trust signals for buyers.",
      "- About contract: avoid founder-journal tone; this page should reinforce business credibility and operational maturity.",
      "- About opening contract: start with a company masthead, operating profile slab, or trust/process proof. Do not reuse the same opening hero shell used by products, solutions, cases, or contact.",
    ];
  }
  if (/^\/contact$/.test(text)) {
    return [
      "- Contact contract: prioritize inquiry channels, response expectations, and buyer-readiness signals over decorative or narrative sections.",
      "- Contact contract: the main content should reduce friction for enterprise inquiries and make the next step unambiguous.",
      "- Contact opening contract: start form-first, channel-first, or response-expectation-first. Do not reuse the same opening hero shell used by products, solutions, cases, or about.",
    ];
  }
  return [
    "- Interior-route contract: preserve the shared corporate shell while making the body topology clearly route-owned and buyer-facing.",
  ];
}

function buildCorporateTargetPageContract(
  plan: LocalDecisionPlan,
  targetFile: string,
  requirementText = "",
): string {
  const route = normalizeCorporateRouteFromTargetFile(targetFile);
  return appendCorporateContract(formatWebsiteTargetPageContractForAdapter(plan, targetFile, requirementText), [
    "- Route-specific body sections may change, but header/footer shell structure, route order, and primary shell tone must remain consistent with sibling pages.",
    "- Do not redesign the navigation or footer per page. Keep the same business-facing shell and vary only the route-owned content bands.",
    "- When a page needs different emphasis, change its content hierarchy, proof modules, and CTA framing instead of inventing a different site shell.",
    ...buildCorporateRouteContractAppendix(route),
    ...buildCorporateRouteMediaContractAppendix(route),
  ]);
}

function buildCorporateRoundPrompt(params: SkillExecutionRoundPromptParams): string {
  return appendCorporateContract(buildWebsiteSkillToolRoundPromptForAdapter(params), [
    "- Treat the current round as part of one corporate site system, not as isolated one-off pages.",
    "- Before emitting any HTML route file, verify that its nav and footer match the authoritative shell already established for sibling routes.",
    "- If this round emits multiple route files, preserve the same shell contract across all of them while still varying their main-content topology by route role.",
    "- Before emitting any route with imagery, verify that each visual belongs to a named business-proof module and supports buyer understanding rather than decorative drift.",
  ]);
}

function isCorporateI18nPath(filePath: string): boolean {
  const normalized = normalizeCorporatePath(filePath);
  return normalized === CORPORATE_I18N_EN_PATH || normalized === CORPORATE_I18N_ZH_PATH;
}

function buildCorporateRequiredFileChecklist(
  decision: LocalDecisionPlan,
  params: { files?: RuntimeWorkflowFile[]; requirementText?: string } = {},
): string[] {
  const files = ["/styles.css", "/script.js", ...decision.routes.map((route) => routeToCorporateHtmlPath(route))];
  if (isBilingualRequirementText(String(params.requirementText || ""))) {
    files.push(CORPORATE_I18N_EN_PATH, CORPORATE_I18N_ZH_PATH);
  }
  return Array.from(new Set(files.map((item) => normalizeCorporatePath(item))));
}

function assertCorporateRequiredFilesPresent(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[],
  requirementText = "",
): void {
  const available = new Set(files.map((file) => normalizeCorporatePath(file.path)));
  const required = buildCorporateRequiredFileChecklist(decision, { files, requirementText });
  const missing = required.filter((path) => !available.has(path));
  if (missing.length > 0) {
    throw new Error(`skill_tool_missing_required_files: ${missing.join(", ")}`);
  }
}

function resolveCorporateMaxToolRounds(decision: LocalDecisionPlan, requirementText = ""): number {
  const sharedAssetRounds = Math.ceil(2 / CORPORATE_SHARED_ASSET_TARGETS_PER_ROUND);
  const i18nRounds = isBilingualRequirementText(requirementText) ? 1 : 0;
  const hasHome = decision.routes.some((route) => normalizeCorporatePath(route) === "/");
  const nonHomeCount = decision.routes.filter((route) => normalizeCorporatePath(route) !== "/").length;
  const routeRounds = (hasHome ? 1 : 0) + Math.ceil(nonHomeCount / CORPORATE_INTERIOR_TARGETS_PER_ROUND);
  return Math.min(
    CORPORATE_MAX_TOOL_ROUNDS,
    Math.max(4, sharedAssetRounds + i18nRounds + routeRounds + 2) + CORPORATE_MAX_TOOL_QA_REPAIR_ROUNDS,
  );
}

function describeCorporateObjectiveTarget(target: string): string {
  if (target === "/styles.css") return "/styles.css shared corporate theme, shell, and route module styles";
  if (target === "/script.js") return "/script.js shared navigation, locale, and lightweight interaction behavior";
  if (target === CORPORATE_I18N_EN_PATH) return `${CORPORATE_I18N_EN_PATH} English translation dictionary`;
  if (target === CORPORATE_I18N_ZH_PATH) return `${CORPORATE_I18N_ZH_PATH} zh-CN translation dictionary`;
  if (target === "/index.html") return "/index.html homepage HTML with the authoritative corporate shell";
  if (target.endsWith("/index.html")) return `${target} route-specific HTML preserving the shared corporate shell`;
  return `${target} required site asset`;
}

function planCorporateRoundObjective(round: number, missingFiles: string[]): SkillExecutionRoundObjective {
  const missing = Array.from(new Set(missingFiles.map((item) => normalizeCorporatePath(item)).filter(Boolean)));
  const sharedTargets = missing.filter((item) => item === "/styles.css" || item === "/script.js");
  if (sharedTargets.length > 0) {
    const targetFiles = sharedTargets.slice(0, CORPORATE_SHARED_ASSET_TARGETS_PER_ROUND);
    return {
      targetFiles,
      instruction: `Emit the shared corporate foundation first: ${targetFiles.map(describeCorporateObjectiveTarget).join("; ")}.`,
      strictSingleTarget: targetFiles.length === 1,
    };
  }

  const i18nTargets = missing.filter((item) => isCorporateI18nPath(item));
  if (i18nTargets.length > 0) {
    return {
      targetFiles: i18nTargets.slice(0, CORPORATE_SHARED_ASSET_TARGETS_PER_ROUND),
      instruction: `Emit the bilingual resource dictionaries: ${i18nTargets.map(describeCorporateObjectiveTarget).join("; ")}.`,
      strictSingleTarget: i18nTargets.length === 1,
    };
  }

  if (missing.includes("/index.html")) {
    return {
      targetFiles: ["/index.html"],
      instruction:
        "Emit the homepage first so it establishes the authoritative corporate nav, footer, visual rhythm, and primary proof/capability structure for the rest of the site.",
      strictSingleTarget: true,
    };
  }

  const routeTargets = missing.filter((item) => item.endsWith("/index.html") && item !== "/index.html");
  if (routeTargets.length > 0) {
    const batch = routeTargets.slice(0, CORPORATE_INTERIOR_TARGETS_PER_ROUND);
    return {
      targetFiles: batch,
      instruction: `Emit these corporate route pages while preserving the homepage shell: ${batch.map(describeCorporateObjectiveTarget).join("; ")}.`,
      strictSingleTarget: batch.length === 1,
    };
  }

  const remaining = missing.slice(0, 2);
  return {
    targetFiles: remaining,
    instruction: `Emit the remaining corporate site assets: ${remaining.map(describeCorporateObjectiveTarget).join("; ")}.`,
    strictSingleTarget: remaining.length === 1,
  };
}

function extractTagBlock(html: string, tagName: string): string {
  const match = String(html || "").match(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "i"));
  return String(match?.[0] || "");
}

function extractVisibleText(html: string): string {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countLocaleControls(html: string): number {
  return Array.from(String(html || "").matchAll(/\bdata-locale-toggle\b/gi)).length;
}

function countLocaleUtilityWrappers(html: string): number {
  return Array.from(
    String(html || "").matchAll(
      /<(?:div|aside|section)\b[^>]*class\s*=\s*["'][^"']*\b(?:header-utility|locale-utility|site-header__utility)\b[^"']*["'][^>]*>/gi,
    ),
  ).length;
}

function hasLocaleControlsInsideNav(navHtml: string): boolean {
  return /\bdata-locale-toggle\b/i.test(String(navHtml || ""));
}

function hasEmptyLocaleUtilityWrapper(headerHtml: string): boolean {
  return /<(?:div|aside|section)\b[^>]*class\s*=\s*["'][^"']*\b(?:header-utility|locale-utility)\b[^"']*["'][^>]*>\s*<\/(?:div|aside|section)>/i.test(
    String(headerHtml || ""),
  );
}

function extractCorporateLocaleToggleLabels(headerHtml: string): string[] {
  return Array.from(
    String(headerHtml || "").matchAll(/<button\b[^>]*data-locale-toggle[^>]*>([\s\S]*?)<\/button>/gi),
    (match) => extractVisibleText(match[1] || ""),
  )
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function extractCorporateMainVisibleText(html: string): string {
  const mainMatch = String(html || "").match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const source = String(mainMatch?.[1] || html || "");
  return extractVisibleText(source).toLowerCase();
}

function extractCorporateMainHtml(html: string): string {
  const mainMatch = String(html || "").match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  return String(mainMatch?.[1] || html || "");
}

function extractCorporateSectionBlocks(html: string): string[] {
  return Array.from(extractCorporateMainHtml(html).matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi), (match) =>
    String(match[0] || ""),
  ).filter(Boolean);
}

function extractCorporateFigureCaptions(html: string): string[] {
  return Array.from(String(html || "").matchAll(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi), (match) =>
    extractVisibleText(String(match[1] || "")),
  ).filter(Boolean);
}

function extractCorporateFirstSectionClassName(html: string): string {
  const mainHtml = extractCorporateMainHtml(html);
  const sectionMatch = mainHtml.match(/<section\b[^>]*class\s*=\s*["']([^"']+)["'][^>]*>/i);
  return String(sectionMatch?.[1] || "")
    .trim()
    .toLowerCase();
}

function extractCorporateOpeningClassCandidate(html: string, tokens: string[]): string {
  const mainHtml = extractCorporateMainHtml(html);
  const firstSectionMatch = mainHtml.match(/<section\b[^>]*>[\s\S]*?<\/section>/i);
  const firstSectionHtml = String(firstSectionMatch?.[0] || "");
  if (!firstSectionHtml) return "";
  const normalizedTokens = tokens.map((token) => String(token || "").trim().toLowerCase()).filter(Boolean);
  if (normalizedTokens.length === 0) return extractCorporateFirstSectionClassName(html);

  const classMatches = Array.from(
    firstSectionHtml.matchAll(/<(?:section|div|article|header)\b[^>]*class\s*=\s*["']([^"']+)["'][^>]*>/gi),
  );
  for (const match of classMatches) {
    const className = String(match[1] || "").trim().toLowerCase();
    if (!className) continue;
    if (normalizedTokens.some((token) => className.includes(token))) {
      return className;
    }
  }

  return extractCorporateFirstSectionClassName(html);
}

function hasCorporateSignal(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasOpeningClassSignal(className: string, tokens: string[]): boolean {
  const normalized = String(className || "").trim().toLowerCase();
  if (!normalized) return false;
  return tokens.some((token) => normalized.includes(token));
}

function isGenericCorporateOpeningClass(className: string): boolean {
  const normalized = String(className || "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized === "stack-lg" ||
    normalized === "grid grid--2" ||
    normalized === "section stack-lg" ||
    normalized === "section grid grid--2" ||
    normalized === "stack" ||
    normalized === "grid"
  );
}

function sectionContainsCorporateRealMedia(sectionHtml: string): boolean {
  const html = String(sectionHtml || "");
  if (!/<(img|picture)\b/i.test(html)) return false;
  return !/data:image\/svg\+xml/i.test(html);
}

function assertCorporateRouteAssetRefs(decision: LocalDecisionPlan, files: RuntimeWorkflowFile[]): void {
  const byPath = new Map(files.map((file) => [normalizeCorporatePath(file.path), file]));
  for (const route of decision.routes) {
    const pagePath = routeToCorporateHtmlPath(route);
    const html = String(byPath.get(pagePath)?.content || "");
    if (!html) continue;
    if (!/href\s*=\s*["'][^"']*\/styles\.css["']/i.test(html)) {
      throw new Error(`skill_tool_invalid_required_file: ${pagePath} must reference /styles.css`);
    }
    if (!/src\s*=\s*["'][^"']*\/script\.js["']/i.test(html)) {
      throw new Error(`skill_tool_invalid_required_file: ${pagePath} must reference /script.js`);
    }
  }
}

function assertCorporateRouteRoleValidation(decision: LocalDecisionPlan, files: RuntimeWorkflowFile[]): void {
  const byPath = new Map(files.map((file) => [normalizeCorporatePath(file.path), file]));
  for (const route of decision.routes.map((item) => normalizeCorporatePath(item))) {
    if (route === "/") continue;
    const pagePath = routeToCorporateHtmlPath(route);
    const html = String(byPath.get(pagePath)?.content || "");
    if (!html) continue;
    const mainText = extractCorporateMainVisibleText(html);

    if (/^\/products?$/.test(route)) {
      const ok = hasCorporateSignal(mainText, [
        /\bproduct\b/i,
        /\bcollection\b/i,
        /\bcatalog\b/i,
        /\bassortment\b/i,
        /\bmaterial\b/i,
        /\bspec(?:ification)?s?\b/i,
        /\bsize(?:s|ing)?\b/i,
      ]);
      if (!ok) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must read like a products page with product-family, material, specification, or assortment signals`,
        );
      }
      continue;
    }

    if (/^\/(custom-)?solutions?$/.test(route)) {
      const ok = hasCorporateSignal(mainText, [
        /\bcustom\b/i,
        /\bsolution\b/i,
        /\bprocess\b/i,
        /\bworkflow\b/i,
        /\bdelivery\b/i,
        /\bprogram\b/i,
      ]);
      if (!ok) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must read like a solutions/process page with customization, process, or delivery signals`,
        );
      }
      continue;
    }

    if (/^\/cases?$/.test(route)) {
      const ok = hasCorporateSignal(mainText, [
        /\bcase\b/i,
        /\bresult\b/i,
        /\boutcome\b/i,
        /\bapplication\b/i,
        /\bproject\b/i,
        /\bproof\b/i,
      ]);
      if (!ok) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must read like a cases/proof page with scenario, result, or outcome signals`,
        );
      }
      continue;
    }

    if (/^\/about$/.test(route)) {
      const ok = hasCorporateSignal(mainText, [
        /\bcompany\b/i,
        /\bquality\b/i,
        /\bproduction\b/i,
        /\bfactory\b/i,
        /\bteam\b/i,
        /\btrust\b/i,
        /\bmanufacturing\b/i,
      ]);
      if (!ok) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must read like an about/company page with company, quality, production, or trust signals`,
        );
      }
      continue;
    }

    if (/^\/contact$/.test(route)) {
      const hasContactChannel =
        /<form\b/i.test(html) ||
        /(?:mailto:|tel:)/i.test(html) ||
        hasCorporateSignal(mainText, [/\bcontact\b/i, /\binquiry\b/i, /\bquote\b/i, /\bresponse\b/i]);
      if (!hasContactChannel) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must read like a contact page with a form, direct contact channel, or inquiry/response signals`,
        );
      }
    }
  }
}

function assertCorporateRouteOpeningValidation(decision: LocalDecisionPlan, files: RuntimeWorkflowFile[]): void {
  const byPath = new Map(files.map((file) => [normalizeCorporatePath(file.path), file]));
  for (const route of decision.routes.map((item) => normalizeCorporatePath(item))) {
    if (route === "/") continue;
    const pagePath = routeToCorporateHtmlPath(route);
    const html = String(byPath.get(pagePath)?.content || "");
    if (!html) continue;

    if (/^\/products?$/.test(route)) {
      const openingClassName = extractCorporateOpeningClassCandidate(html, [
        "catalog-lead",
        "assortment-lead",
        "product-comparison-lead",
      ]);
      if (!openingClassName) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must begin main content with a route-owned opening section, not an implicit generic shell`,
        );
      }
      const ok = hasOpeningClassSignal(openingClassName, [
        "catalog-lead",
        "assortment-lead",
        "product-comparison-lead",
      ]);
      if (!ok) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must start with a route-owned products opening class such as catalog-lead, assortment-lead, or product-comparison-lead; received "${openingClassName}"`,
        );
      }
      continue;
    }

    if (/^\/(custom-)?solutions?$/.test(route)) {
      const openingClassName = extractCorporateOpeningClassCandidate(html, [
        "process-intro",
        "solutions-process-intro",
        "scenario-fit-lead",
        "solution-lead",
      ]);
      if (!openingClassName) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must begin main content with a route-owned opening section, not an implicit generic shell`,
        );
      }
      const ok = hasOpeningClassSignal(openingClassName, [
        "process-intro",
        "solutions-process-intro",
        "scenario-fit-lead",
        "solution-lead",
      ]);
      if (!ok) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must start with a route-owned solutions opening class such as process-intro, solutions-process-intro, or scenario-fit-lead; received "${openingClassName}"`,
        );
      }
      continue;
    }

    if (/^\/cases?$/.test(route)) {
      const openingClassName = extractCorporateOpeningClassCandidate(html, [
        "evidence-header",
        "case-ledger-intro",
        "outcome-frame",
        "case-lead",
      ]);
      if (!openingClassName) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must begin main content with a route-owned opening section, not an implicit generic shell`,
        );
      }
      const ok = hasOpeningClassSignal(openingClassName, [
        "evidence-header",
        "case-ledger-intro",
        "outcome-frame",
        "case-lead",
      ]);
      if (!ok) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must start with a route-owned cases opening class such as evidence-header, case-ledger-intro, or outcome-frame; received "${openingClassName}"`,
        );
      }
      continue;
    }

    if (/^\/about$/.test(route)) {
      const openingClassName = extractCorporateOpeningClassCandidate(html, [
        "company-masthead",
        "operating-profile",
        "trust-masthead",
        "about-lead",
      ]);
      if (!openingClassName) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must begin main content with a route-owned opening section, not an implicit generic shell`,
        );
      }
      const ok = hasOpeningClassSignal(openingClassName, [
        "company-masthead",
        "operating-profile",
        "trust-masthead",
        "about-lead",
      ]);
      if (!ok) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must start with a route-owned about opening class such as company-masthead, operating-profile, or trust-masthead; received "${openingClassName}"`,
        );
      }
      continue;
    }

    if (/^\/contact$/.test(route)) {
      const openingClassName = extractCorporateOpeningClassCandidate(html, [
        "contact-conversion",
        "contact-channels",
        "response-expectation",
      ]);
      if (!openingClassName) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must begin main content with a route-owned opening section, not an implicit generic shell`,
        );
      }
      const ok = hasOpeningClassSignal(openingClassName, [
        "contact-conversion",
        "contact-channels",
        "response-expectation",
      ]);
      if (!ok) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must start with a route-owned contact opening class such as contact-conversion, contact-channels, or response-expectation; received "${openingClassName}"`,
        );
      }
      continue;
    }

    const openingClassName = extractCorporateFirstSectionClassName(html);
    if (!openingClassName) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} must begin main content with a route-owned opening section, not an implicit generic shell`,
      );
    }
    if (isGenericCorporateOpeningClass(openingClassName)) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} must not reuse a generic interior opening shell (${openingClassName})`,
      );
    }
  }
}

function normalizeCorporateHrefRoute(href: string): string {
  const raw = String(href || "").trim();
  if (!raw || raw.startsWith("#") || /^mailto:|^tel:|^javascript:/i.test(raw)) return "";
  let value = raw;
  try {
    if (/^https?:\/\//i.test(value)) {
      value = new URL(value).pathname;
    }
  } catch {
    return "";
  }
  value = value.split("#")[0]?.split("?")[0] || "";
  value = value.replace(/\/index\.html$/i, "/").replace(/\.html$/i, "");
  return normalizeCorporatePath(value || "/");
}

function extractCorporatePlannedRoutesFromHtmlBlock(html: string, allowedRoutes: Set<string>): string[] {
  const routes = Array.from(String(html || "").matchAll(/href\s*=\s*["']([^"']+)["']/gi))
    .map((match) => normalizeCorporateHrefRoute(match[1] || ""))
    .filter((route) => !!route && allowedRoutes.has(route));
  return Array.from(new Set(routes));
}

function assertCorporateSharedShellStructure(decision: LocalDecisionPlan, files: RuntimeWorkflowFile[]): void {
  const byPath = new Map(files.map((file) => [normalizeCorporatePath(file.path), file]));
  for (const route of decision.routes) {
    const pagePath = routeToCorporateHtmlPath(route);
    const html = String(byPath.get(pagePath)?.content || "");
    if (!html) continue;
    if (!hasTagBlock(html, "nav")) {
      throw new Error(`skill_tool_invalid_required_file: ${pagePath} must include the shared corporate navigation shell`);
    }
    if (!hasTagBlock(html, "footer")) {
      throw new Error(`skill_tool_invalid_required_file: ${pagePath} must include the shared corporate footer shell`);
    }
  }
}

function assertCorporateSharedShellRouteConsistency(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[],
): void {
  const plannedRoutes = new Set(decision.routes.map((route) => normalizeCorporatePath(route)));
  const byPath = new Map(files.map((file) => [normalizeCorporatePath(file.path), file]));
  const homeHtml = String(byPath.get("/index.html")?.content || "");
  if (!homeHtml) return;

  const canonicalNavBlock = extractTagBlock(homeHtml, "nav");
  const canonicalFooterBlock = extractTagBlock(homeHtml, "footer");
  const canonicalNavRoutes = extractCorporatePlannedRoutesFromHtmlBlock(canonicalNavBlock, plannedRoutes);
  const canonicalFooterRoutes = extractCorporatePlannedRoutesFromHtmlBlock(canonicalFooterBlock, plannedRoutes);

  for (const route of decision.routes.map((item) => normalizeCorporatePath(item)).filter((item) => item !== "/")) {
    const pagePath = routeToCorporateHtmlPath(route);
    const html = String(byPath.get(pagePath)?.content || "");
    if (!html) continue;

    if (canonicalNavBlock) {
      const pageNavBlock = extractTagBlock(html, "nav");
      const pageNavRoutes = extractCorporatePlannedRoutesFromHtmlBlock(pageNavBlock, plannedRoutes);
      const missingNavRoutes = canonicalNavRoutes.filter((item) => !pageNavRoutes.includes(item));
      if (missingNavRoutes.length > 0) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must preserve the shared corporate navigation destinations from /index.html; missing ${missingNavRoutes.join(", ")}`,
        );
      }
    }

    if (canonicalFooterBlock) {
      const pageFooterBlock = extractTagBlock(html, "footer");
      const pageFooterRoutes = extractCorporatePlannedRoutesFromHtmlBlock(pageFooterBlock, plannedRoutes);
      const missingFooterRoutes = canonicalFooterRoutes.filter((item) => !pageFooterRoutes.includes(item));
      if (missingFooterRoutes.length > 0) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must preserve the shared corporate footer destinations from /index.html; missing ${missingFooterRoutes.join(", ")}`,
        );
      }
    }
  }
}

function assertCorporateSharedShellValidation(decision: LocalDecisionPlan, files: RuntimeWorkflowFile[]): void {
  const byPath = new Map(files.map((file) => [String(file.path || "").trim(), file]));
  for (const route of decision.routes) {
    const pagePath = routeToCorporateHtmlPath(route);
    const html = String(byPath.get(pagePath)?.content || "");
    if (!html) continue;

    const headerBlock = extractTagBlock(html, "header");
    const navBlock = extractTagBlock(html, "nav");
    const footerBlock = extractTagBlock(html, "footer");
    const shellHtml = `${navBlock}\n${footerBlock}`;
    const shellText = extractVisibleText(shellHtml);

    for (const pattern of CORPORATE_FORBIDDEN_SHELL_COPY_PATTERNS) {
      if (pattern.test(shellText)) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} exposes implementation/i18n shell copy (${pattern}) instead of buyer-facing corporate shell text`,
        );
      }
    }

    const localeToggleCount = countLocaleControls(headerBlock);
    const localeUtilityWrapperCount = countLocaleUtilityWrappers(headerBlock);

    if (localeToggleCount > 0 && localeUtilityWrapperCount !== 1) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} must render locale controls inside exactly one dedicated adjacent utility wrapper in the header`,
      );
    }

    if (hasLocaleControlsInsideNav(navBlock)) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} nests locale controls inside the primary nav; keep the locale switch in one dedicated adjacent utility wrapper instead`,
      );
    }

    if (hasEmptyLocaleUtilityWrapper(headerBlock)) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} emits an empty locale/header utility wrapper; do not leave a placeholder shell beside the nav`,
      );
    }

    const localeLabels = extractCorporateLocaleToggleLabels(headerBlock);
    if (localeLabels.length > 0 && localeLabels.some((label) => !/^(?:EN|ZH)$/i.test(label))) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} must keep locale button labels literal EN/ZH only; move full language names into shared i18n dictionaries instead of the header switch`,
      );
    }
  }
}

function assertCorporateI18nResourceQuality(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[],
  requirementText = "",
): void {
  const bilingualRequested =
    isBilingualRequirementText(requirementText) ||
    files.some((file) => normalizeCorporatePath(file.path) === CORPORATE_I18N_ZH_PATH);
  if (!bilingualRequested) return;

  const byPath = new Map(files.map((file) => [normalizeCorporatePath(file.path), file]));
  const enRaw = String(byPath.get(CORPORATE_I18N_EN_PATH)?.content || "");
  const zhRaw = String(byPath.get(CORPORATE_I18N_ZH_PATH)?.content || "");
  if (!enRaw || !zhRaw) return;

  if (containsCorporateForbiddenCopyPattern(enRaw)) {
    throw new Error(
      `skill_tool_invalid_required_file: ${CORPORATE_I18N_EN_PATH} contains mojibake or mixed-script corruption; keep corporate i18n dictionaries ASCII-clean for English copy`,
    );
  }
  if (containsCorporateForbiddenCopyPattern(zhRaw)) {
    throw new Error(
      `skill_tool_invalid_required_file: ${CORPORATE_I18N_ZH_PATH} contains mojibake or mixed-script corruption; keep Chinese locale resources clean and human-readable`,
    );
  }

  const enMessages = parseCorporateJsonRecord(CORPORATE_I18N_EN_PATH, enRaw);
  const zhMessages = parseCorporateJsonRecord(CORPORATE_I18N_ZH_PATH, zhRaw);

  if (String(zhMessages["locale.en"] || "").trim() !== "EN" || String(zhMessages["locale.zh"] || "").trim() !== "ZH") {
    throw new Error(
      `skill_tool_invalid_required_file: ${CORPORATE_I18N_ZH_PATH} must keep locale.en=EN and locale.zh=ZH; do not localize the header locale button labels`,
    );
  }

  for (const key of CORPORATE_REQUIRED_ZH_TRANSLATION_KEYS) {
    const zhValue = String(zhMessages[key] || "").trim();
    const enValue = String(enMessages[key] || "").trim();
    if (!zhValue) {
      throw new Error(
        `skill_tool_invalid_required_file: ${CORPORATE_I18N_ZH_PATH} is missing a populated Chinese translation for ${key}`,
      );
    }
    if (!hasCorporateHanCharacters(zhValue)) {
      throw new Error(
        `skill_tool_invalid_required_file: ${CORPORATE_I18N_ZH_PATH} must translate ${key} into real Chinese copy instead of reusing English-only text`,
      );
    }
    if (enValue && zhValue === enValue) {
      throw new Error(
        `skill_tool_invalid_required_file: ${CORPORATE_I18N_ZH_PATH} must not mirror English text for ${key}; provide Chinese buyer-facing copy`,
      );
    }
  }

  const homepageKicker = String(zhMessages["home.hero.kicker"] || "").trim();
  if (homepageKicker && containsCorporateForbiddenCopyPattern(homepageKicker)) {
    throw new Error(
      `skill_tool_invalid_required_file: ${CORPORATE_I18N_ZH_PATH} contains corrupted homepage kicker copy (${homepageKicker}); keep bilingual hero labels natural and human-readable`,
    );
  }

}

function assertCorporateSourceQuality(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[],
  requirementText = "",
): void {
  const byPath = new Map(files.map((file) => [String(file.path || "").trim(), file]));
  for (const route of decision.routes) {
    const pagePath = routeToCorporateHtmlPath(route);
    const html = String(byPath.get(pagePath)?.content || "");
    if (!html) continue;
    const normalizedRoute = normalizeCorporatePath(route);

    const mediaInlineStyleMatches = Array.from(
      html.matchAll(/<(img|picture|figure)\b[^>]*\sstyle\s*=/gi),
      (match) => String(match[1] || "").toLowerCase(),
    );
    if (mediaInlineStyleMatches.length > 0) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} uses inline style attributes on media elements (${Array.from(new Set(mediaInlineStyleMatches)).join(
          ", ",
        )}); corporate-b2b pages must style visible media through shared CSS classes instead`,
      );
    }

    const layoutInlineStyleMatches = Array.from(
      html.matchAll(
        /<(section|div|article|aside|header|footer|nav|ul|ol|li)\b[^>]*class=(["'])[^"']+\2[^>]*\sstyle\s*=/gi,
      ),
      (match) => String(match[1] || "").toLowerCase(),
    );
    if (layoutInlineStyleMatches.length > 0) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} uses inline style attributes on visible layout blocks (${Array.from(
          new Set(layoutInlineStyleMatches),
        ).join(", ")}); move corporate layout presentation into shared CSS classes instead`,
      );
    }

    for (const pattern of CORPORATE_FORBIDDEN_MOJIBAKE_PATTERNS) {
      if (pattern.test(html)) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} contains mojibake/encoding-corrupted visible copy; replace corrupted punctuation or replacement characters with clean final text`,
        );
      }
    }

    if (normalizedRoute === "/") {
      const mainText = extractCorporateMainVisibleText(html);
      for (const pattern of CORPORATE_FORBIDDEN_DIRECTION_LABEL_PATTERNS) {
        if (pattern.test(mainText)) {
          throw new Error(
            `skill_tool_invalid_required_file: ${pagePath} exposes internal art-direction labels in visitor-facing homepage copy; remove phrases such as heritage manufacturing from the hero, proof row, or footer`,
          );
        }
      }

      if (!briefExplicitlyRequestsHeritageStory(requirementText) && /\bheritage\b/i.test(mainText)) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} uses heritage/legacy wording in visitor-facing homepage copy without an explicit heritage-story brief; use buyer-facing claims about sourcing clarity, quality control, responsiveness, or production discipline instead`,
        );
      }
    }

    const legacyHeroClass = htmlUsesLegacyHeroClass(html);
    if (legacyHeroClass) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} still uses legacy generic hero utility classes (${legacyHeroClass}) instead of route-owned corporate classes`,
      );
    }

    if (/<(?:div|section|header)\b[^>]*class=(["'])[^"']*\bsection__head\b[^"']*\1[^>]*\sstyle\s*=/i.test(html)) {
      throw new Error(
        `skill_tool_invalid_required_file: ${pagePath} uses inline style on a section__head block; section headers must use shared CSS classes without one-off inline spacing fixes`,
      );
    }

    if (/^\/products?$/.test(normalizedRoute) || /^\/(custom-)?solutions?$/.test(normalizedRoute) || /^\/cases?$/.test(normalizedRoute)) {
      const firstVisibleSections = extractCorporateSectionBlocks(html).slice(0, 2);
      const hasEarlyMedia = firstVisibleSections.some((sectionHtml) => sectionContainsCorporateRealMedia(sectionHtml));
      if (!hasEarlyMedia) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} must include a real route-owned image in the opening band or first opening-adjacent proof band; do not delay the first meaningful image until later support sections`,
        );
      }

      const captionTexts = extractCorporateFigureCaptions(firstVisibleSections.join("\n"));
      const forbiddenCaption = captionTexts.find((caption) =>
        CORPORATE_FORBIDDEN_META_CAPTION_PATTERNS.some((pattern) => pattern.test(caption)),
      );
      if (forbiddenCaption) {
        throw new Error(
          `skill_tool_invalid_required_file: ${pagePath} uses a meta-design image caption (${forbiddenCaption}); route-opening captions must be buyer-facing product, process, or sourcing context instead`,
        );
      }
    }
  }
}

export function assertCorporateSharedShellValidationForTesting(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[],
): void {
  assertCorporateSharedShellValidation(decision, files);
}

export function assertCorporateSourceQualityForTesting(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[],
  requirementText = "",
): void {
  assertCorporateSourceQuality(decision, files, requirementText);
}

export function assertCorporateI18nResourceQualityForTesting(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[],
  requirementText = "",
): void {
  assertCorporateI18nResourceQuality(decision, files, requirementText);
}

export function assertCorporateRequiredFilesPresentForTesting(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[],
  requirementText = "",
): void {
  assertCorporateRequiredFilesPresent(decision, files, requirementText);
}

export function assertCorporateSharedShellStructureForTesting(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[],
): void {
  assertCorporateSharedShellStructure(decision, files);
}

export function assertCorporateSharedShellRouteConsistencyForTesting(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[],
): void {
  assertCorporateSharedShellRouteConsistency(decision, files);
}

export function assertCorporateRouteAssetRefsForTesting(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[],
): void {
  assertCorporateRouteAssetRefs(decision, files);
}

export function assertCorporateRouteRoleValidationForTesting(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[],
): void {
  assertCorporateRouteRoleValidation(decision, files);
}

export function assertCorporateRouteOpeningValidationForTesting(
  decision: LocalDecisionPlan,
  files: RuntimeWorkflowFile[],
): void {
  assertCorporateRouteOpeningValidation(decision, files);
}

function validateCorporateRequiredFilesWithQa(params: {
  decision: LocalDecisionPlan;
  files: RuntimeWorkflowFile[];
  requirementText?: string;
}): SkillExecutionValidationResult {
  const requirementText = String(params.requirementText || "");
  assertCorporateRequiredFilesPresent(params.decision, params.files, requirementText);
  const sharedResult = validateWebsiteRequiredFilesWithQaForAdapter(params);
  const normalizedFiles = normalizeCorporateValidatedFiles(sharedResult.files, requirementText);
  assertCorporateRouteAssetRefs(params.decision, normalizedFiles);
  assertCorporateRouteRoleValidation(params.decision, normalizedFiles);
  assertCorporateRouteOpeningValidation(params.decision, normalizedFiles);
  assertCorporateSharedShellStructure(params.decision, normalizedFiles);
  assertCorporateSharedShellRouteConsistency(params.decision, normalizedFiles);
  assertCorporateSharedShellValidation(params.decision, normalizedFiles);
  assertCorporateI18nResourceQuality(params.decision, normalizedFiles, params.requirementText);
  assertCorporateSourceQuality(params.decision, normalizedFiles, params.requirementText);
  return {
    ...sharedResult,
    files: normalizedFiles,
  };
}

export function validateCorporateRequiredFilesWithQaForTesting(params: {
  decision: LocalDecisionPlan;
  files: RuntimeWorkflowFile[];
  requirementText?: string;
}): SkillExecutionValidationResult {
  return validateCorporateRequiredFilesWithQa(params);
}

export function normalizeCorporateValidatedFilesForTesting(
  files: RuntimeWorkflowFile[],
  requirementText = "",
): RuntimeWorkflowFile[] {
  return normalizeCorporateValidatedFiles(files, requirementText);
}

const CORPORATE_B2B_SKILL_ADAPTER: SkillExecutionAdapter = {
  skillId: "corporate-b2b-site",
  resolveChatAction(params) {
    return resolveWebsiteChatAction(params);
  },
  buildRequiredFileChecklist(
    decision: LocalDecisionPlan,
    params: { files?: RuntimeWorkflowFile[]; requirementText?: string } = {},
  ): string[] {
    return buildCorporateRequiredFileChecklist(decision, params);
  },
  resolveMaxToolRounds(decision: LocalDecisionPlan, requirementText = ""): number {
    return resolveCorporateMaxToolRounds(decision, requirementText);
  },
  sanitizeEmittedHtml(filePath: string, html: string, requirementText: string): string {
    return sanitizeCorporateSkillHtmlOutput(filePath, html, requirementText);
  },
  planRoundObjective(round: number, missingFiles: string[]): SkillExecutionRoundObjective {
    return planCorporateRoundObjective(round, missingFiles);
  },
  formatTargetPageContract(plan: LocalDecisionPlan, targetFile: string, requirementText = ""): string {
    return buildCorporateTargetPageContract(plan, targetFile, requirementText);
  },
  buildToolRoundPrompt(params: SkillExecutionRoundPromptParams): string {
    return buildCorporateRoundPrompt(params);
  },
  validateAndNormalizeRequiredFilesWithQa(params: {
    decision: LocalDecisionPlan;
    files: RuntimeWorkflowFile[];
    requirementText?: string;
  }): SkillExecutionValidationResult {
    return validateCorporateRequiredFilesWithQa(params);
  },
};

export function getCorporateB2bSkillAdapter(): SkillExecutionAdapter {
  return CORPORATE_B2B_SKILL_ADAPTER;
}

