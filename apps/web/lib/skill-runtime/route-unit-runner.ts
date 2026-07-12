import type { AgentState } from "../agent/graph.ts";
import type { SkillRuntimeExecutionSummary, SkillRuntimeStepSnapshot } from "./executor.ts";
import {
  GenerationContractViolationError,
  type ContractVerificationResult,
  type RouteUnitVerificationRecord,
} from "./contract-violation.ts";
import { verifyRouteUnitArtifacts } from "./contract-verifier.ts";
import type { ImmutableGenerationContract } from "./generation-contract.ts";
import { normalizeWebsiteGenerationContract } from "./generation-contract.ts";
import {
  buildGenerationUnitInputFromRouteContract,
  type GenerationWorkerAdapter,
  type GenerationRuntimeWorker,
  type GenerationUnitInput,
} from "./generation-worker-adapter.ts";
import type { WebsiteSurfaceMode } from "./open-design-adoption.ts";
import { resolveRouteUnitExecutionTimeoutMs } from "./route-unit-timeouts.ts";
import { getLocaleMessagePath, normalizeLocaleCode } from "./locale-plan.ts";
import {
  readAllRouteUnitVerificationCheckpoints,
  readGeneratedProjectCheckpoint,
  readGenerationContractCheckpoint,
  readGenerationExecutionCheckpoint,
  readGenerationVerificationCheckpoint,
  recoverGeneratedProjectCheckpoint,
  writeGeneratedProjectCheckpoint,
  writeGenerationContractCheckpoint,
  writeGenerationExecutionCheckpoint,
  writeGenerationVerificationCheckpoint,
  writeRouteUnitInputCheckpoint,
  writeRouteUnitVerificationCheckpoint,
} from "./route-unit-checkpoint.ts";

export type V2RouteUnitRuntimeParams = {
  state: AgentState;
  timeoutMs: number;
  checkpointDir: string;
  contract: ImmutableGenerationContract;
  unitWorker?: GenerationWorkerAdapter;
  worker?: GenerationRuntimeWorker;
  generate?: (params: {
    state: AgentState;
    timeoutMs: number;
    onStep?: (snapshot: SkillRuntimeStepSnapshot) => Promise<void> | void;
  }) => Promise<SkillRuntimeExecutionSummary>;
  onStep?: (snapshot: SkillRuntimeStepSnapshot) => Promise<void> | void;
  resumeFromCheckpoint?: boolean;
  baselineProject?: any;
};

export type V2RouteUnitRuntimeResult = {
  contract: ImmutableGenerationContract;
  routeInputs: GenerationUnitInput[];
  execution: SkillRuntimeExecutionSummary;
  verification: ContractVerificationResult;
  project: any;
};

function normalizeWebsiteSurfaceMode(value: unknown): WebsiteSurfaceMode | undefined {
  const normalized = String(value || "").trim();
  return normalized ? (normalized as WebsiteSurfaceMode) : undefined;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function normalizePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  const normalized = (raw.startsWith("/") ? raw : `/${raw}`).replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  return normalized === "/" ? "/" : normalized.replace(/\/+$/g, "") || "/";
}

function clampTimeout(taskTimeoutMs: number, candidateMs: number, minMs: number) {
  const safeCandidate = Number.isFinite(candidateMs) && candidateMs > 0 ? Math.max(minMs, candidateMs) : minMs;
  const safeTask = Number.isFinite(taskTimeoutMs) && taskTimeoutMs > 0 ? Math.max(minMs, taskTimeoutMs) : safeCandidate;
  return Math.min(safeCandidate, safeTask);
}

async function runRouteUnitWithTimeout<T>(params: {
  unitId: string;
  route: string;
  timeoutMs: number;
  run: () => Promise<T>;
}): Promise<T> {
  const timeoutText = `Route unit ${params.unitId} (${params.route || "/"}) timed out after ${params.timeoutMs}ms.`;
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutText)), params.timeoutMs);
    params.run()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function extractFirstBlock(source: string, tagName: string): string {
  const match = String(source || "").match(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "i"));
  return String(match?.[0] || "").trim();
}

function inspectLocaleProtocol(html: string): "explicit-buttons" | "single-switch" | "" {
  const source = String(html || "");
  if (/data-locale-toggle[^>]*data-locale=["']zh-CN["']/i.test(source) && /data-locale-toggle[^>]*data-locale=["']en["']/i.test(source)) {
    return "explicit-buttons";
  }
  if (/\bdata-locale-switch\b/i.test(source)) return "single-switch";
  return "";
}

function buildSharedShellSnapshot(project: any): Record<string, unknown> | undefined {
  const homepage = Array.isArray(project?.pages)
    ? project.pages.find((page: any) => normalizePath(String(page?.path || "")) === "/")
    : null;
  const homepageHtml = String(homepage?.html || "");
  if (!homepageHtml.trim()) return undefined;
  const headerHtml = extractFirstBlock(homepageHtml, "header");
  const footerHtml = extractFirstBlock(homepageHtml, "footer");
  if (!headerHtml || !footerHtml) return undefined;
  return {
    sourceRoute: "/",
    headerHtml,
    footerHtml,
    localeProtocol: inspectLocaleProtocol(homepageHtml),
  };
}

function attachSharedShellSnapshot(input: GenerationUnitInput, project: any): GenerationUnitInput {
  if (normalizePath(String(input.route || "/")) === "/") return input;
  const sharedShellSnapshot = buildSharedShellSnapshot(project);
  if (!sharedShellSnapshot) return input;
  return {
    ...input,
    context: {
      ...(input.context || {}),
      sharedShellSnapshot,
    },
  };
}

function resolveGeneratedProject(execution: SkillRuntimeExecutionSummary) {
  return (execution.state as any)?.site_artifacts || null;
}

function resolveGeneratedFiles(project: any): Array<{ path?: string; content?: string; type?: string }> {
  return Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
}

function mergeSavedRouteArtifacts(params: {
  contract: ImmutableGenerationContract;
  currentProject: any;
  savedProject?: any;
  savedRouteVerifications: Array<{ route?: string; htmlPath?: string; status?: string }>;
}) {
  if (!params.savedProject || params.savedRouteVerifications.length === 0) return params.currentProject;
  const nextProject = cloneJson(
    params.currentProject || {
      projectId: "recovered-partial-site",
      pages: [],
      staticSite: { mode: "skill-direct", files: [] },
    },
  );
  const currentFiles = Array.isArray(nextProject?.staticSite?.files) ? nextProject.staticSite.files : [];
  const savedFiles = Array.isArray(params.savedProject?.staticSite?.files) ? params.savedProject.staticSite.files : [];
  const currentByPath = new Map<string, any>(
    currentFiles.map((file: any) => [normalizePath(String(file?.path || "")), file]),
  );
  const savedByPath = new Map<string, any>(
    savedFiles.map((file: any) => [normalizePath(String(file?.path || "")), file]),
  );

  for (const sharedPath of ["/styles.css", "/script.js", "/i18n/messages.en.json", "/i18n/messages.zh-CN.json"]) {
    if (!currentByPath.has(sharedPath) && savedByPath.has(sharedPath)) {
      currentByPath.set(sharedPath, cloneJson(savedByPath.get(sharedPath)));
    }
  }

  const recoverableRoutes = new Set(
    params.savedRouteVerifications
      .filter((entry) => entry.status === "passed")
      .map((entry) => String(entry.route || "").trim())
      .filter(Boolean),
  );
  for (const routeUnit of params.contract.routeUnitContracts) {
    if (!recoverableRoutes.has(routeUnit.route)) continue;
    if (currentByPath.has(routeUnit.htmlPath)) continue;
    const savedHtml = savedByPath.get(routeUnit.htmlPath);
    if (savedHtml) {
      currentByPath.set(routeUnit.htmlPath, cloneJson(savedHtml));
    }
  }

  nextProject.staticSite = {
    ...(nextProject.staticSite || {}),
    mode: String(nextProject?.staticSite?.mode || params.savedProject?.staticSite?.mode || "skill-direct"),
    files: Array.from(currentByPath.values()),
  };

  const currentPages = Array.isArray(nextProject?.pages) ? nextProject.pages : [];
  const savedPages = Array.isArray(params.savedProject?.pages) ? params.savedProject.pages : [];
  const currentPagesByPath = new Map<string, any>(currentPages.map((page: any) => [normalizePath(String(page?.path || "")), page]));
  const savedPagesByPath = new Map<string, any>(savedPages.map((page: any) => [normalizePath(String(page?.path || "")), page]));
  for (const routeUnit of params.contract.routeUnitContracts) {
    if (!recoverableRoutes.has(routeUnit.route)) continue;
    if (currentPagesByPath.has(routeUnit.route)) continue;
    const savedPage = savedPagesByPath.get(routeUnit.route);
    if (savedPage) currentPagesByPath.set(routeUnit.route, cloneJson(savedPage));
  }
  nextProject.pages = Array.from(currentPagesByPath.values());
  return nextProject;
}

function createEmptyGeneratedProject() {
  return {
    projectId: "v2-route-unit-site",
    pages: [],
    staticSite: {
      mode: "route-unit-v2",
      files: [],
    },
  };
}

function normalizeLocaleToggleMarkup(content: string) {
  return String(content || "").replace(
    /<(button|a)(?![^>]*\bdata-locale-toggle\b)([^>]*\bdata-locale=["'][^"']+["'][^>]*)>/gi,
    (_match, tagName, attrs) => `<${tagName} data-locale-toggle${attrs}>`,
  );
}

function normalizeGeneratedFileContent(params: {
  path: string;
  content: string;
  contract?: ImmutableGenerationContract;
}) {
  const normalizedPath = normalizePath(params.path);
  let content = String(params.content || "");
  const localeMode = String(
    (params.contract?.discoveryBrief as any)?.localeMode ||
      (params.contract?.promptControlManifest as any)?.localeMode ||
      "",
  )
    .trim()
    .toLowerCase();
  if (normalizedPath.endsWith(".html") && (localeMode === "bilingual" || localeMode === "multilingual")) {
    content = normalizeLocaleToggleMarkup(content);
  }
  return content;
}

function resolveContractDefaultLocale(contract?: ImmutableGenerationContract): string | null {
  const promptLocaleConfig = (contract?.promptControlManifest as any)?.localeConfig || {};
  const candidates = [
    promptLocaleConfig.defaultLocale,
    (contract?.promptControlManifest as any)?.defaultLocale,
    (contract?.discoveryBrief as any)?.defaultLocale,
    (contract?.discoveryBrief as any)?.preferredLocale,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeLocaleCode(String(candidate || ""));
    if (normalized) return normalized;
  }
  return null;
}

function parseJsonStringMap(content: string): Record<string, string> {
  try {
    const parsed = JSON.parse(String(content || ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [String(key || "").trim(), typeof value === "string" ? value : ""] as const)
        .filter(([key, value]) => Boolean(key) && Boolean(value)),
    );
  } catch {
    return {};
  }
}

function escapeHtmlText(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(text: string): string {
  return escapeHtmlText(text).replace(/"/g, "&quot;");
}

function applyDefaultLocaleToTranslatedAttributes(
  html: string,
  locale: string,
  messages: Record<string, string>,
): string {
  const rewriteTagByAttrs = (match: string, tagName: string, attrs: string, key?: string) => {
    const attrSpec =
      String(attrs || "").match(/\sdata-i18n-attr=(["'])([^"']+)\1/i)?.[2] ||
      String(attrs || "").match(/\sdata-i18n-attr=([^\s>]+)/i)?.[1] ||
      "";
    const assignments = String(attrSpec || "")
      .split(/[;,]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
    if (assignments.length === 0) return match;

    const resolved = String(messages[String(key || "").trim()] || "").trim();
    let nextAttrs = String(attrs || "");
    for (const assignment of assignments) {
      const [rawAttrName, rawSource] = assignment.split(":").map((item) => item.trim());
      const attrName = String(rawAttrName || "").trim();
      if (!attrName) continue;
      const sourceKey = String(rawSource || key || "").trim();
      const attrValue = String(messages[sourceKey] || resolved).trim();
      if (!attrValue) continue;
      const attrPattern = new RegExp(`\\s${attrName}=(["']).*?\\1`, "i");
      if (attrPattern.test(nextAttrs)) {
        nextAttrs = nextAttrs.replace(attrPattern, ` ${attrName}="${escapeHtmlAttribute(attrValue)}"`);
      } else {
        nextAttrs = `${nextAttrs} ${attrName}="${escapeHtmlAttribute(attrValue)}"`;
      }
    }
    return `<${tagName}${nextAttrs}>`;
  };

  const withBlockTags = String(html || "").replace(
    /<([a-zA-Z][\w:-]*)([^>]*)\sdata-i18n=(["'])([^"']+)\3([^>]*)>/g,
    (match, tagName: string, leftAttrs: string, _quote: string, key: string, rightAttrs: string) =>
      rewriteTagByAttrs(match, tagName, `${String(leftAttrs || "")} data-i18n="${String(key || "").trim()}"${String(rightAttrs || "")}`, key),
  );

  return withBlockTags.replace(
    /<([a-zA-Z][\w:-]*)([^>]*)\sdata-i18n=(["'])([^"']+)\3([^>]*?)\/?>/g,
    (match, tagName: string, leftAttrs: string, _quote: string, key: string, rightAttrs: string) =>
      rewriteTagByAttrs(match, tagName, `${String(leftAttrs || "")} data-i18n="${String(key || "").trim()}"${String(rightAttrs || "")}`, key),
  ).replace(
    /<([a-zA-Z][\w:-]*)([^>]*\sdata-i18n-attr=(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*)>/g,
    (match, tagName: string, attrs: string) => rewriteTagByAttrs(match, tagName, attrs),
  );
}

function applyDefaultVisibleLocaleToHtml(
  html: string,
  locale: string,
  messages: Record<string, string>,
): string {
  let next = String(html || "");
  if (!next.trim() || Object.keys(messages).length === 0 || !/\sdata-i18n(?:=|\s|>)/i.test(next)) return next;

  next = next.replace(/<html\b([^>]*)>/i, (_match, attrs: string) => {
    let nextAttrs = String(attrs || "");
    if (/\slang=/i.test(nextAttrs)) {
      nextAttrs = nextAttrs.replace(/\slang=(["']).*?\1/i, ` lang="${locale}"`);
    } else {
      nextAttrs = `${nextAttrs} lang="${locale}"`;
    }
    if (/\sdata-lang=/i.test(nextAttrs)) {
      nextAttrs = nextAttrs.replace(/\sdata-lang=(["']).*?\1/i, ` data-lang="${locale}"`);
    } else {
      nextAttrs = `${nextAttrs} data-lang="${locale}"`;
    }
    return `<html${nextAttrs}>`;
  });

  next = next.replace(
    /<button\b([^>]*)data-locale-toggle([^>]*)aria-pressed=(["']).*?\3([^>]*)>/gi,
    (_match, before: string, middle: string, _quote: string, after: string) => {
      const attrs = `${String(before || "")}${String(middle || "")}${String(after || "")}`;
      const targetLocale = normalizeLocaleCode(
        attrs.match(/\sdata-locale=(["'])([^"']+)\1/i)?.[2] || attrs.match(/\sdata-locale=([^\s>]+)/i)?.[1] || "",
      );
      const pressed = targetLocale === locale ? "true" : "false";
      return `<button${before || ""}data-locale-toggle${middle || ""}aria-pressed="${pressed}"${after || ""}>`;
    },
  );

  next = next.replace(
    /<option\b([^>]*)value=(["'])([^"']+)\2([^>]*)>/gi,
    (match, before: string, quote: string, value: string, after: string) => {
      const normalizedValue = normalizeLocaleCode(String(value || ""));
      const selected = normalizedValue === locale;
      let attrs = `${String(before || "")}value=${quote}${value}${quote}${String(after || "")}`;
      attrs = attrs.replace(/\sselected(?:=(["']).*?\1)?/gi, "");
      if (selected) attrs = `${attrs} selected`;
      return `<option${attrs}>`;
    },
  );

  next = applyDefaultLocaleToTranslatedAttributes(next, locale, messages);
  next = next.replace(
    /<([a-zA-Z][\w:-]*)([^>]*)\sdata-i18n=(["'])([^"']+)\3([^>]*)>([\s\S]*?)<\/\1>/g,
    (match, tagName: string, leftAttrs: string, _quote: string, key: string, rightAttrs: string, inner: string) => {
      const resolved = String(messages[String(key || "").trim()] || "").trim();
      if (!resolved) return match;
      if (/<[a-zA-Z][\w:-]*\b/.test(String(inner || ""))) return match;
      return `<${tagName}${String(leftAttrs || "")} data-i18n="${String(key || "").trim()}"${String(rightAttrs || "")}>${escapeHtmlText(resolved)}</${tagName}>`;
    },
  );
  return next;
}

function applyDefaultVisibleLocaleProjection(
  filesByPath: Map<string, any>,
  contract?: ImmutableGenerationContract,
): void {
  const localeMode = String(
    (contract?.discoveryBrief as any)?.localeMode ||
      (contract?.promptControlManifest as any)?.localeMode ||
      "",
  )
    .trim()
    .toLowerCase();
  if (localeMode !== "bilingual" && localeMode !== "multilingual") return;

  const defaultLocale = resolveContractDefaultLocale(contract);
  if (!defaultLocale) return;

  const messagePath = getLocaleMessagePath(defaultLocale);
  const messages = parseJsonStringMap(String(filesByPath.get(messagePath)?.content || ""));
  if (Object.keys(messages).length === 0) return;

  for (const [filePath, file] of filesByPath.entries()) {
    if (!String(filePath || "").toLowerCase().endsWith(".html")) continue;
    const normalized = applyDefaultVisibleLocaleToHtml(String(file?.content || ""), defaultLocale, messages);
    filesByPath.set(filePath, {
      ...file,
      content: normalized,
    });
  }
}

function ensureStructuredFooterBandClass(html: string, stylesCss = ""): string {
  const source = String(html || "");
  const styles = String(stylesCss || "");
  if (!source || !styles || !/\.footer-band\b/i.test(styles)) return source;
  const footerBlockMatch = source.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/i);
  const footerBlock = String(footerBlockMatch?.[0] || "");
  const looksStructured =
    /\b(?:footer-inner|site-footer__inner|footer-brand|footer-links|footer-nav|footer-meta|footer-actions)\b/i.test(
      footerBlock,
    );
  if (!looksStructured) return source;
  return source.replace(/<footer\b([^>]*)>/i, (full, attrs) => {
    const attrText = String(attrs || "");
    const classMatch = attrText.match(/\bclass=(["'])([^"']*)\1/i);
    if (!classMatch) return `<footer${attrText} class="footer-band">`;
    const quote = classMatch[1];
    const classValue = classMatch[2];
    if (/\bfooter-band\b/i.test(classValue)) return full;
    const nextClassValue = `${classValue} footer-band`.trim().replace(/\s+/g, " ");
    return `<footer${attrText.replace(classMatch[0], `class=${quote}${nextClassValue}${quote}`)}>`;
  });
}

function applyStructuredFooterShellProjection(filesByPath: Map<string, any>): void {
  const stylesCss = String(filesByPath.get("/styles.css")?.content || "");
  if (!stylesCss) return;
  for (const [filePath, file] of filesByPath.entries()) {
    if (!String(filePath || "").toLowerCase().endsWith(".html")) continue;
    const normalized = ensureStructuredFooterBandClass(String(file?.content || ""), stylesCss);
    filesByPath.set(filePath, {
      ...file,
      content: normalized,
    });
  }
}

function parseJsonObjectContent(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(String(content || ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function deepMergeJsonObjects(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    const prior = next[key];
    if (
      prior &&
      value &&
      typeof prior === "object" &&
      typeof value === "object" &&
      !Array.isArray(prior) &&
      !Array.isArray(value)
    ) {
      next[key] = deepMergeJsonObjects(prior as Record<string, unknown>, value as Record<string, unknown>);
      continue;
    }
    next[key] = value;
  }
  return next;
}

function mergeRouteScopedJsonCatalog(existingContent: string, incomingContent: string): string {
  const existing = parseJsonObjectContent(existingContent);
  const incoming = parseJsonObjectContent(incomingContent);
  if (!existing || !incoming) return incomingContent;
  return JSON.stringify(deepMergeJsonObjects(existing, incoming), null, 2);
}

function mergeGeneratedFilesIntoProject(params: {
  project: any;
  files: Array<{ path?: string; content?: string; type?: string }>;
  contract?: ImmutableGenerationContract;
}) {
  const nextProject = cloneJson(params.project || createEmptyGeneratedProject());
  const currentFiles = Array.isArray(nextProject?.staticSite?.files) ? nextProject.staticSite.files : [];
  const filesByPath = new Map<string, any>(currentFiles.map((file: any) => [normalizePath(String(file?.path || "")), file]));
  for (const file of params.files || []) {
    const normalizedPath = normalizePath(String(file?.path || ""));
    if (!normalizedPath || normalizedPath === "/") continue;
    const normalizedContent = normalizeGeneratedFileContent({
      path: normalizedPath,
      content: String(file?.content || ""),
      contract: params.contract,
    });
    const existing = filesByPath.get(normalizedPath);
    const mergedContent =
      normalizedPath === "/i18n/messages.en.json" || normalizedPath === "/i18n/messages.zh-CN.json"
        ? mergeRouteScopedJsonCatalog(String(existing?.content || ""), normalizedContent)
        : normalizedContent;
    filesByPath.set(normalizedPath, {
      path: normalizedPath,
      content: mergedContent,
      type: String(file?.type || ""),
    });
  }
  applyDefaultVisibleLocaleProjection(filesByPath, params.contract);
  applyStructuredFooterShellProjection(filesByPath);
  nextProject.staticSite = {
    ...(nextProject.staticSite || {}),
    mode: String(nextProject?.staticSite?.mode || "route-unit-v2"),
    files: Array.from(filesByPath.values()),
  };

  const currentPages = Array.isArray(nextProject?.pages) ? nextProject.pages : [];
  const pagesByPath = new Map<string, any>(currentPages.map((page: any) => [normalizePath(String(page?.path || "")), page]));
  for (const [normalizedPath, file] of filesByPath.entries()) {
    if (!normalizedPath.endsWith(".html")) continue;
    const route =
      normalizedPath === "/index.html"
        ? "/"
        : normalizedPath.replace(/\/index\.html$/i, "") || "/";
    pagesByPath.set(route, {
      path: route,
      html: String(file?.content || ""),
    });
  }
  nextProject.pages = Array.from(pagesByPath.values());
  return nextProject;
}

function resolveRouteScopedTargetFiles(contract: ImmutableGenerationContract, route: string, htmlPath: string): string[] {
  const normalizedRoute = normalizePath(route);
  const sharedTargets: string[] = [];
  const localeMode = String(
    (contract.discoveryBrief as any)?.localeMode ||
      (contract.discoveryBrief as any)?.preferredLocale ||
      (contract.promptControlManifest as any)?.localeMode ||
      "",
  )
    .trim()
    .toLowerCase();
  if (localeMode === "bilingual") {
    sharedTargets.push("/i18n/messages.en.json", "/i18n/messages.zh-CN.json");
  }
  return [htmlPath, ...sharedTargets];
}

function buildSharedFoundationInput(contract: ImmutableGenerationContract): GenerationUnitInput {
  return {
    unitId: "route-shared-foundation",
    route: "/__shared__",
    targetFiles: ["/styles.css", "/script.js"],
    prompt: [
      "Generate the shared static foundation for the website.",
      "Emit only /styles.css and /script.js.",
      "CSS must define the shared shell, navigation, footer, responsive layout, and locale-switch presentation.",
      "JS must stay lightweight and only cover shared shell behaviors such as navigation and locale switching when required.",
    ].join("\n"),
    context: {
      contractHash: contract.contractHash,
      websiteSurfaceMode: contract.websiteSurfaceMode,
      generationLane: contract.generationLane,
      sharedFoundation: true,
    },
  };
}

function hasSharedFoundationFiles(project: any): boolean {
  const files = resolveGeneratedFiles(project);
  const filePaths = new Set(files.map((file) => normalizePath(String(file?.path || ""))));
  return filePaths.has("/styles.css") && filePaths.has("/script.js");
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function buildRepairHints(record: { violationCode?: string; evidence?: string[]; route?: string }) {
  const hints: string[] = [];
  if (record.violationCode === "homepage_topology_mismatch") {
    hints.push("Remove generic split-hero geometry from the homepage opening.");
    hints.push("Do not use hero-grid, equal-column copy/media shell, right-side visual rail, or proof image figure inside the masthead.");
    hints.push("Use a route-owned stacked or asymmetrical institutional masthead before the capability overview shelves.");
    hints.push("Lead with brand overview copy, then capability shelves, then standards/research proof, then consultation or route CTA.");
  }
  if (record.violationCode === "homepage_semantic_mismatch") {
    hints.push("Do not describe the homepage as a gateway, entry point, route map, or site organization explainer.");
    hints.push("Rewrite the first screen as an official institutional overview with concrete public value.");
  }
  if (record.violationCode === "shared_shell_drift") {
    hints.push("Preserve the shared shell exactly: header, nav route set, and footer must match the baseline route.");
  }
  if (record.violationCode === "locale_shell_mismatch") {
    hints.push("Preserve the locale shell exactly and emit the required locale controls/catalogs.");
    hints.push("Keep exactly one visible language at a time; remove visible Chinese/English twin spans, duplicated bilingual paragraphs, and `.t-zh` / `.t-en` node pairs.");
    hints.push("Rewrite visible shell copy to use stable `data-i18n` keys backed by `/i18n/messages.en.json` and `/i18n/messages.zh-CN.json` instead of `data-alt-zh`, `data-alt-en`, `data-zh`, or `data-en` attributes.");
    hints.push("Use `data-i18n-attr` for translated attributes such as `alt`, `title`, `placeholder`, `content`, or `aria-label`.");
  }
  for (const evidence of normalizeStringList(record.evidence).slice(0, 2)) {
    hints.push(`Verifier evidence: ${evidence}`);
  }
  if (record.route) {
    hints.push(`Repair only route ${record.route}; do not widen scope to other routes.`);
  }
  return Array.from(new Set(hints));
}

function buildRepairInput(input: GenerationUnitInput, record: { violationCode?: string; evidence?: string[]; route?: string }) {
  const repairHints = buildRepairHints(record);
  return {
    ...input,
    prompt: [
      String(input.prompt || "").trim(),
      "Repair this route unit to satisfy the verifier.",
      ...repairHints.map((hint) => `- ${hint}`),
    ]
      .filter(Boolean)
      .join("\n"),
    context: {
      ...(input.context || {}),
      repairAttempt: true,
      repairViolationCode: String(record.violationCode || "").trim() || undefined,
      repairHints,
    },
  } satisfies GenerationUnitInput;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sortRouteInputsForExecution(inputs: GenerationUnitInput[]) {
  return [...inputs].sort((left, right) => {
    const leftRoute = normalizePath(String(left.route || "/"));
    const rightRoute = normalizePath(String(right.route || "/"));
    if (leftRoute === "/" && rightRoute !== "/") return -1;
    if (rightRoute === "/" && leftRoute !== "/") return 1;
    return 0;
  });
}

function splitExecutionChunks(inputs: GenerationUnitInput[], concurrency: number): GenerationUnitInput[][] {
  if (inputs.length === 0) return [];
  const normalizedInputs = sortRouteInputsForExecution(inputs);
  const firstRoute = normalizePath(String(normalizedInputs[0]?.route || "/"));
  const remaining = [...normalizedInputs];
  const chunks: GenerationUnitInput[][] = [];
  if (firstRoute === "/") {
    chunks.push([remaining.shift() as GenerationUnitInput]);
  }
  return [...chunks, ...chunkArray(remaining, concurrency)];
}

function buildProvisionalPassedRouteRecord(input: GenerationUnitInput): RouteUnitVerificationRecord {
  const route = String(input.route || "/").trim() || "/";
  const htmlPath = normalizePath(String((input.context || {}).htmlPath || (route === "/" ? "/index.html" : `${route}/index.html`)));
  return {
    route,
    htmlPath,
    status: "passed",
    checkedFiles: input.targetFiles.map((target) => normalizePath(target)),
    issues: [],
    violatedFields: [],
    evidence: [],
  };
}

function buildSingleRouteContract(contract: ImmutableGenerationContract, route: string): ImmutableGenerationContract {
  const normalizedRoute = String(route || "/").trim() || "/";
  return {
    ...cloneJson(contract),
    routeUnitContracts: contract.routeUnitContracts.filter((item) => item.route === normalizedRoute),
  };
}

function buildFailedRouteRecord(input: GenerationUnitInput, message: string): RouteUnitVerificationRecord {
  const route = String(input.route || "/").trim() || "/";
  const htmlPath = normalizePath(String((input.context || {}).htmlPath || (route === "/" ? "/index.html" : `${route}/index.html`)));
  return {
    route,
    htmlPath,
    status: "artifact_failure",
    checkedFiles: input.targetFiles.map((target) => normalizePath(target)),
    issues: [message],
    violatedFields: ["route_unit_generation"],
    evidence: [message],
  };
}

export async function runV2RouteUnitRuntime(params: V2RouteUnitRuntimeParams): Promise<V2RouteUnitRuntimeResult> {
  const contract = normalizeWebsiteGenerationContract(params.contract);
  const routeInputs = contract.routeUnitContracts.map((summary) =>
    buildGenerationUnitInputFromRouteContract({
      summary,
      targetFiles: resolveRouteScopedTargetFiles(contract, summary.route, summary.htmlPath),
      context: {
        contractHash: contract.contractHash,
        websiteSurfaceMode: contract.websiteSurfaceMode,
        generationLane: contract.generationLane,
      },
    }),
  );

  const [savedContract, savedVerification, savedExecution, savedProjectFromCheckpoint, recoveredProjectFromSnapshots] = await Promise.all([
    readGenerationContractCheckpoint(params.checkpointDir),
    readGenerationVerificationCheckpoint(params.checkpointDir),
    readGenerationExecutionCheckpoint(params.checkpointDir),
    readGeneratedProjectCheckpoint(params.checkpointDir),
    recoverGeneratedProjectCheckpoint(params.checkpointDir),
  ]);
  const savedProject: any =
    Array.isArray((savedProjectFromCheckpoint as any)?.staticSite?.files) &&
    ((savedProjectFromCheckpoint as any).staticSite.files as any[]).length > 0
      ? savedProjectFromCheckpoint
      : recoveredProjectFromSnapshots;
  const savedRouteVerifications = await readAllRouteUnitVerificationCheckpoints(
    params.checkpointDir,
    contract.routeUnitContracts.map((item) => item.route),
  );

  if (params.resumeFromCheckpoint !== false) {
    if (
      savedContract?.contractHash === contract.contractHash &&
      savedVerification?.status === "passed" &&
      savedRouteVerifications.length === contract.routeUnitContracts.length &&
      savedExecution &&
      savedProject
    ) {
      return {
        contract,
        routeInputs,
        execution: savedExecution,
        verification: savedVerification,
        project: savedProject,
      };
    }
  }

  await writeGenerationContractCheckpoint(params.checkpointDir, contract);
  for (const input of routeInputs) {
    await writeRouteUnitInputCheckpoint(params.checkpointDir, input.route || input.unitId, input);
  }

  if (params.unitWorker) {
    const matchingSavedContract = savedContract?.contractHash === contract.contractHash;
    const savedProjectFiles = Array.isArray(savedProject?.staticSite?.files) ? savedProject.staticSite.files : [];
    const savedProjectPaths = new Set(
      savedProjectFiles.map((file: any) => normalizePath(String(file?.path || ""))).filter(Boolean),
    );
    const recoverableRoutes = new Set(
      (matchingSavedContract ? savedRouteVerifications : [])
        .filter(
          (entry) =>
            entry.status === "passed" &&
            savedProjectPaths.has(normalizePath(String(entry.htmlPath || ""))),
        )
        .map((entry) => String(entry.route || "").trim())
        .filter(Boolean),
    );
    const pendingInputs = routeInputs.filter((input) => !recoverableRoutes.has(String(input.route || "").trim()));
    let project: any = mergeSavedRouteArtifacts({
      contract,
      currentProject: createEmptyGeneratedProject(),
      savedProject: matchingSavedContract ? savedProject : undefined,
      savedRouteVerifications: matchingSavedContract ? savedRouteVerifications : [],
    });
    const sharedFoundationInput = buildSharedFoundationInput(contract);
    const checkpointRouteResults = new Map<string, RouteUnitVerificationRecord>(
      (matchingSavedContract ? savedRouteVerifications : [])
        .map(
          (record) =>
            [String(record.route || "").trim(), cloneJson(record) as RouteUnitVerificationRecord] as [
              string,
              RouteUnitVerificationRecord,
            ],
        )
        .filter(([route]) => Boolean(route)),
    );
    if (!hasSharedFoundationFiles(project)) {
      await writeRouteUnitInputCheckpoint(params.checkpointDir, sharedFoundationInput.route || sharedFoundationInput.unitId, sharedFoundationInput);
      const foundationResult = await params.unitWorker.runUnit(sharedFoundationInput);
      if (foundationResult.status !== "passed") {
        const message =
          foundationResult.issues?.join("; ") ||
          foundationResult.summary ||
          "Shared foundation generation failed.";
        const execution: SkillRuntimeExecutionSummary = {
          state: {
            ...(params.state as any),
            phase: "end",
            site_artifacts: project,
            project_json: project,
          } as any,
          assistantText: `Shared foundation generation failed.\n${message}`.trim(),
          actions: [],
          pageCount: Array.isArray(project?.pages) ? project.pages.length : 0,
          fileCount: resolveGeneratedFiles(project).length,
          generatedFiles: resolveGeneratedFiles(project).map((file) => String(file?.path || "")),
          phase: "end",
          completedPhases: [],
        };
        await writeGenerationExecutionCheckpoint(params.checkpointDir, execution);
        throw new Error(`route-shared-foundation: ${message}`);
      }
      project = mergeGeneratedFilesIntoProject({
        project,
        files: foundationResult.files,
        contract,
      });
      await writeGeneratedProjectCheckpoint(params.checkpointDir, project);
      await params.onStep?.({
        stepKey: sharedFoundationInput.unitId,
        stepIndex: 0,
        totalSteps: Math.max(1, pendingInputs.length + 1),
        status: "generated",
        files: Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [],
        workflowArtifacts: [],
        pages: Array.isArray(project?.pages) ? project.pages : [],
        preferredLocale:
          String(((params.state.workflow_context || {}) as any)?.preferredLocale || "").trim().toLowerCase() === "zh-cn"
            ? "zh-CN"
            : "en",
      });
    }
    let completedUnits = 0;
    const concurrency = Math.max(1, Number(process.env.SHPITTO_ROUTE_UNIT_CONCURRENCY || 3));
    for (const inputChunk of splitExecutionChunks(pendingInputs, concurrency)) {
      const contextualizedChunk = inputChunk.map((input) => attachSharedShellSnapshot(input, project));
      const results = await Promise.all(
        contextualizedChunk.map(async (input, chunkIndex) => {
          const unitTimeoutMs = resolveRouteUnitExecutionTimeoutMs({
            taskTimeoutMs: params.timeoutMs,
            targetFileCount: input.targetFiles.length,
          });
          await params.onStep?.({
            stepKey: String(input.route || input.unitId),
            stepIndex: completedUnits + chunkIndex + 1,
            totalSteps: Math.max(1, pendingInputs.length),
            status: `generating:route-unit-start:${String(input.route || input.unitId)}`,
            files: Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [],
            workflowArtifacts: [],
            pages: Array.isArray(project?.pages) ? project.pages : [],
            preferredLocale:
              String(((params.state.workflow_context || {}) as any)?.preferredLocale || "").trim().toLowerCase() === "zh-cn"
                ? "zh-CN"
                : "en",
            websiteSurfaceMode: normalizeWebsiteSurfaceMode(contract.websiteSurfaceMode),
          });
          try {
            return {
              input,
              result: await runRouteUnitWithTimeout({
                unitId: String(input.unitId || input.route || "route-unit"),
                route: String(input.route || "/"),
                timeoutMs: unitTimeoutMs,
                run: async () => await params.unitWorker!.runUnit(input),
              }),
            };
          } catch (error) {
            return {
              input,
              error,
            };
          }
        }),
      );
      const failedMessages: string[] = [];
      for (const entry of results) {
        const input = entry.input;
        const result = (entry as { result?: Awaited<ReturnType<GenerationWorkerAdapter["runUnit"]>> }).result;
        const executionError = (entry as { error?: unknown }).error;
        const failedResult = result?.status === "failed" ? result : null;
        if (executionError || failedResult) {
          const message =
            executionError instanceof Error
              ? executionError.message
              : failedResult?.issues?.join("; ") || failedResult?.summary || `Route unit ${input.unitId} failed.`;
          checkpointRouteResults.set(String(input.route || "").trim(), buildFailedRouteRecord(input, message));
          failedMessages.push(`${input.unitId}: ${message}`);
          continue;
        }
        if (!result) {
          const message = `Route unit ${input.unitId} returned no result.`;
          checkpointRouteResults.set(String(input.route || "").trim(), buildFailedRouteRecord(input, message));
          failedMessages.push(`${input.unitId}: ${message}`);
          continue;
        }
        if (result.status !== "passed") {
          const message = result.issues?.join("; ") || result.summary || `Route unit ${input.unitId} failed.`;
          checkpointRouteResults.set(String(input.route || "").trim(), buildFailedRouteRecord(input, message));
          failedMessages.push(`${input.unitId}: ${message}`);
          continue;
        }
        project = mergeGeneratedFilesIntoProject({
          project,
          files: result.files,
          contract,
        });
        const singleRouteVerification = verifyRouteUnitArtifacts({
          contract: buildSingleRouteContract(contract, String(input.route || "/")),
          files: resolveGeneratedFiles(project),
          baselineFiles: resolveGeneratedFiles(params.baselineProject),
        });
        const routeRecord =
          singleRouteVerification.status === "passed"
            ? buildProvisionalPassedRouteRecord(input)
            : Array.isArray(singleRouteVerification.routeResults) && singleRouteVerification.routeResults.length > 0
              ? singleRouteVerification.routeResults[singleRouteVerification.routeResults.length - 1]
              : buildFailedRouteRecord(
                  input,
                  singleRouteVerification.issues?.join("; ") || singleRouteVerification.violationCode || "Route verification failed.",
                );
        checkpointRouteResults.set(routeRecord.route, routeRecord);
        await writeRouteUnitVerificationCheckpoint(params.checkpointDir, routeRecord);
        await params.onStep?.({
          stepKey: String(input.route || input.unitId),
          stepIndex: completedUnits + 1,
          totalSteps: Math.max(1, pendingInputs.length),
          status: "generated",
          files: Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [],
          workflowArtifacts: [],
          pages: Array.isArray(project?.pages) ? project.pages : [],
          preferredLocale:
            String(((params.state.workflow_context || {}) as any)?.preferredLocale || "").trim().toLowerCase() === "zh-cn"
              ? "zh-CN"
              : "en",
          websiteSurfaceMode: normalizeWebsiteSurfaceMode(contract.websiteSurfaceMode),
        });
        if (routeRecord.status === "passed") {
          completedUnits += 1;
        }
      }
      await writeGeneratedProjectCheckpoint(params.checkpointDir, project);
      if (failedMessages.length > 0) {
        const generatedFiles = resolveGeneratedFiles(project).map((file) => String(file?.path || ""));
        const execution: SkillRuntimeExecutionSummary = {
          state: {
            ...(params.state as any),
            phase: "end",
            site_artifacts: project,
            project_json: project,
          } as any,
          assistantText: `Partially generated route units before failure.\n${failedMessages.join("\n")}`.trim(),
          actions: [],
          pageCount: Array.isArray(project?.pages) ? project.pages.length : 0,
          fileCount: generatedFiles.length,
          generatedFiles,
          phase: "end",
          completedPhases: [],
        };
        await writeGenerationExecutionCheckpoint(params.checkpointDir, execution);
        throw new Error(failedMessages.join("; "));
      }
    }

    const generatedFiles = resolveGeneratedFiles(project).map((file) => String(file?.path || ""));
    const execution: SkillRuntimeExecutionSummary = {
      state: {
        ...(params.state as any),
        phase: "end",
        site_artifacts: project,
        project_json: project,
      } as any,
      assistantText:
        pendingInputs.length === 0
          ? "Reused verified route-unit artifacts from checkpoint."
          : `Generated ${pendingInputs.length} route units and merged them into the V2 site artifact.`,
      actions: [],
      pageCount: Array.isArray(project?.pages) ? project.pages.length : 0,
      fileCount: generatedFiles.length,
      generatedFiles,
      phase: "end",
      completedPhases: [],
    };
    await writeGenerationExecutionCheckpoint(params.checkpointDir, execution);
    await writeGeneratedProjectCheckpoint(params.checkpointDir, project);
    let verification = verifyRouteUnitArtifacts({
      contract,
      files: resolveGeneratedFiles(project),
      baselineFiles: resolveGeneratedFiles(params.baselineProject),
    });
    if (verification.status !== "passed") {
      const routeLevelRecords = Array.isArray(verification.routeResults) ? verification.routeResults : [];
      const topLevelRouteRecord =
        verification.scope === "route" && String(verification.route || "").trim()
          ? [verification as ContractVerificationResult & { route: string }]
          : [];
      const retryableCandidates: Array<{ status?: string; route?: string; violationCode?: string; evidence?: string[] }> = [
        ...routeLevelRecords,
        ...topLevelRouteRecord,
      ];
      const retryableRecords = Array.from(
        new Map(
          retryableCandidates
            .filter(
              (record) =>
                record.status === "contract_violation" &&
                ["homepage_topology_mismatch", "homepage_semantic_mismatch", "shared_shell_drift", "locale_shell_mismatch"].includes(
                  String(record.violationCode || ""),
                ),
            )
            .map((record) => [`${String(record.route || "").trim()}::${String(record.violationCode || "").trim()}`, record]),
        ).values(),
      );
      if (retryableRecords.length > 0) {
        const inputByRoute = new Map(routeInputs.map((input) => [String(input.route || "").trim(), input]));
        let repairedProject = project;
        let repairedAnyRoute = false;
        for (const record of retryableRecords) {
          const route = String(record.route || "").trim();
          const baseInput = inputByRoute.get(route);
          if (!baseInput) continue;
          const repairResult = await params.unitWorker.runUnit(buildRepairInput(baseInput, record));
          if (repairResult.status !== "passed") continue;
          repairedProject = mergeGeneratedFilesIntoProject({
            project: repairedProject,
            files: repairResult.files,
            contract,
          });
          repairedAnyRoute = true;
        }
        if (repairedAnyRoute) {
          project = repairedProject;
          execution.state = {
            ...(execution.state as any),
            site_artifacts: project,
            project_json: project,
          } as any;
          execution.generatedFiles = resolveGeneratedFiles(project).map((file) => String(file?.path || ""));
          execution.fileCount = execution.generatedFiles.length;
          execution.assistantText = `${String(execution.assistantText || "").trim()}\nApplied targeted route-unit repair after verifier feedback.`
            .trim();
          await writeGenerationExecutionCheckpoint(params.checkpointDir, execution);
          await writeGeneratedProjectCheckpoint(params.checkpointDir, project);
          verification = verifyRouteUnitArtifacts({
            contract,
            files: resolveGeneratedFiles(project),
            baselineFiles: resolveGeneratedFiles(params.baselineProject),
          });
        }
      }
    }
    await writeGenerationVerificationCheckpoint(params.checkpointDir, verification);
    for (const record of verification.routeResults || []) {
      checkpointRouteResults.set(String(record.route || "").trim(), record);
      await writeRouteUnitVerificationCheckpoint(params.checkpointDir, record);
    }
    if (verification.status !== "passed") {
      throw new GenerationContractViolationError(verification);
    }
    return {
      contract,
      routeInputs,
      execution,
      verification,
      project,
    };
  }

  const generationWorker = params.worker;
  const generateFn =
    generationWorker?.runGeneration ||
    params.generate ||
    null;
  if (!generateFn) {
    throw new Error("runV2RouteUnitRuntime requires either a generation worker or a generate function.");
  }

  const execution = await generateFn({
    state: params.state,
    timeoutMs: params.timeoutMs,
    onStep: params.onStep,
  });
  await writeGenerationExecutionCheckpoint(params.checkpointDir, execution);
  const project = mergeSavedRouteArtifacts({
    contract,
    currentProject: resolveGeneratedProject(execution),
    savedProject: savedContract?.contractHash === contract.contractHash ? savedProject : undefined,
    savedRouteVerifications: savedContract?.contractHash === contract.contractHash ? savedRouteVerifications : [],
  });
  await writeGeneratedProjectCheckpoint(params.checkpointDir, project);
  const files = resolveGeneratedFiles(project);
  const verification = verifyRouteUnitArtifacts({
    contract,
    files,
    baselineFiles: resolveGeneratedFiles(params.baselineProject),
  });

  await writeGenerationVerificationCheckpoint(params.checkpointDir, verification);
  for (const record of verification.routeResults || []) {
    await writeRouteUnitVerificationCheckpoint(params.checkpointDir, record);
  }

  if (verification.status !== "passed") {
    throw new GenerationContractViolationError(verification);
  }

  return {
    contract,
    routeInputs,
    execution,
    verification,
    project,
  };
}
