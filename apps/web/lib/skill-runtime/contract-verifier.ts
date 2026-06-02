import type { ImmutableGenerationContract } from "./generation-contract.ts";
import {
  buildContractViolationRecord,
  type ContractVerificationResult,
  type ContractViolationCode,
  type RouteUnitVerificationRecord,
} from "./contract-violation.ts";
import { inferOwnerLayerFromViolationCode } from "./owner-layer.ts";

type RuntimeFile = {
  path?: string;
  content?: string;
  type?: string;
};

function normalizePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  const normalized = (raw.startsWith("/") ? raw : `/${raw}`).replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  return normalized === "/" ? "/" : normalized.replace(/\/+$/g, "") || "/";
}

function extractVisibleText(html: string): string {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugTerms(route: string): string[] {
  const normalized = normalizePath(route).replace(/^\/+|\/+$/g, "");
  if (!normalized) return [];
  return normalized
    .split(/[\/_-]+/g)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length >= 4 && !["index", "page", "home"].includes(item));
}

function navTerms(navLabel: string): string[] {
  return String(navLabel || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
}

function detectPlaceholderIssue(text: string): string | null {
  const normalized = String(text || "").toLowerCase();
  if (
    /\blorem ipsum\b|\bplaceholder\b|\btodo\b|\bcontent gap\b|\bcoming soon\b|\bdedicated page for\b|\bderive its content depth\b/.test(
      normalized,
    )
  ) {
    return "Generated visitor copy still contains placeholder or workflow leakage terms.";
  }
  return null;
}

function detectHomepageSemanticIssue(text: string): string | null {
  const normalized = String(text || "").toLowerCase();
  if (/\bgateway\b|\bentry point\b|\broute map\b|\bsite map\b|\bhow the site is organized\b/.test(normalized)) {
    return "Homepage reads like a gateway/site-map explanation instead of an institutional overview.";
  }
  return null;
}

function detectHomepageTopologyIssue(params: {
  route: string;
  openingFamily?: string;
  openingTopology?: string;
  routeContract?: string[];
  html: string;
}): string | null {
  if (params.route !== "/") return null;
  const topologySignals = [
    String(params.openingFamily || ""),
    String(params.openingTopology || ""),
    ...(Array.isArray(params.routeContract) ? params.routeContract : []),
  ]
    .join(" ")
    .toLowerCase();
  if (!topologySignals.trim()) return null;

  const html = String(params.html || "");
  const genericSplitHeroPattern =
    /\b(hero-grid|hero__grid|hero-panel|hero-copy|hero__copy|hero__body|hero-aside|media-frame|visual-note)\b/i;
  const hasGenericSplitHero = genericSplitHeroPattern.test(html);

  if (
    /(brand-led institutional masthead|institutional masthead|institution-led|official homepage|umbrella institutional|enterprise hero|docs workspace)/.test(
      topologySignals,
    ) &&
    hasGenericSplitHero
  ) {
    return "Homepage opening falls back to generic split-hero geometry instead of the contracted route-owned topology.";
  }

  if (/image-backed enterprise hero|enterprise hero/.test(topologySignals) && !/\benterprise-hero\b/i.test(html) && hasGenericSplitHero) {
    return "Enterprise homepage opening does not expose its contracted enterprise hero shell.";
  }

  if (/docs workspace|search\/index rail|reference matrix/.test(topologySignals) && hasGenericSplitHero) {
    return "Docs homepage opening reuses generic hero geometry instead of a docs workspace opening.";
  }

  return null;
}

function extractFirstBlock(source: string, tagName: string): string {
  const match = String(source || "").match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return String(match?.[1] || "");
}

function extractHeaderBlock(source: string): string {
  return extractFirstBlock(source, "header");
}

function extractNavBlock(source: string): string {
  return extractFirstBlock(source, "nav");
}

function extractFooterBlock(source: string): string {
  return extractFirstBlock(source, "footer");
}

function extractNavRoutes(source: string): string[] {
  const nav = extractNavBlock(source);
  const matches = Array.from(nav.matchAll(/href=["'](\/[^"'?#]*)(?:[?#][^"']*)?["']/gi));
  return Array.from(new Set(matches.map((match) => normalizePath(String(match[1] || ""))).filter(Boolean))).sort();
}

function extractLocaleToggleSet(source: string): string[] {
  const matches = Array.from(String(source || "").matchAll(/data-locale-toggle[^>]*data-locale=["']([^"']+)["']/gi));
  return Array.from(new Set(matches.map((match) => String(match[1] || "").trim()).filter(Boolean))).sort();
}

function resolveLocaleMode(contract: ImmutableGenerationContract): string {
  return String(
    (contract.discoveryBrief as any)?.localeMode ||
      (contract.discoveryBrief as any)?.preferredLocale ||
      (contract.promptControlManifest as any)?.localeMode ||
      "",
  )
    .trim()
    .toLowerCase();
}

function missingSharedFile(filesByPath: Map<string, RuntimeFile>) {
  if (!filesByPath.has("/styles.css")) return "/styles.css";
  if (!filesByPath.has("/script.js")) return "/script.js";
  return null;
}

function buildIssueResult(params: {
  route: string;
  htmlPath: string;
  checkedFiles: string[];
  violationCode: ContractViolationCode;
  issues: string[];
  violatedFields: string[];
  evidence: string[];
  status: "artifact_failure" | "contract_violation";
}): RouteUnitVerificationRecord {
  return buildContractViolationRecord({
    route: params.route,
    htmlPath: params.htmlPath,
    checkedFiles: params.checkedFiles,
    violationCode: params.violationCode,
    issues: params.issues,
    violatedFields: params.violatedFields,
    evidence: params.evidence,
    status: params.status,
    ownerLayer: inferOwnerLayerFromViolationCode(params.violationCode),
  });
}

export function verifyRouteUnitArtifacts(params: {
  contract: ImmutableGenerationContract;
  files: RuntimeFile[];
  baselineFiles?: RuntimeFile[];
}): ContractVerificationResult {
  const filesByPath = new Map<string, RuntimeFile>();
  for (const file of params.files || []) {
    const normalizedPath = normalizePath(String(file?.path || ""));
    if (!normalizedPath || normalizedPath === "/") continue;
    filesByPath.set(normalizedPath, {
      path: normalizedPath,
      content: String(file?.content || ""),
      type: String(file?.type || ""),
    });
  }
  const baselineFilesByPath = new Map<string, RuntimeFile>();
  for (const file of params.baselineFiles || []) {
    const normalizedPath = normalizePath(String(file?.path || ""));
    if (!normalizedPath || normalizedPath === "/") continue;
    baselineFilesByPath.set(normalizedPath, {
      path: normalizedPath,
      content: String(file?.content || ""),
      type: String(file?.type || ""),
    });
  }

  if (filesByPath.size === 0) {
    return {
      status: "artifact_failure",
      scope: "shared",
      issues: ["No generated static files were produced for verification."],
      routeResults: [],
      violationCode: "invalid_project_artifact",
      ownerLayer: inferOwnerLayerFromViolationCode("invalid_project_artifact"),
      violatedFields: ["site_artifacts.staticSite.files"],
      evidence: ["Generated project artifact contained zero verifiable files."],
    };
  }

  const missingShared = missingSharedFile(filesByPath);
  if (missingShared) {
    return {
      status: "artifact_failure",
      scope: "shared",
      issues: [`Required shared asset ${missingShared} is missing from the generated site artifact.`],
      routeResults: [],
      violationCode: "missing_shared_asset",
      ownerLayer: inferOwnerLayerFromViolationCode("missing_shared_asset"),
      violatedFields: ["shared_assets"],
      evidence: [`Missing shared asset: ${missingShared}`],
    };
  }

  const expectedRoutes = params.contract.routeUnitContracts.map((item) => item.route).sort();
  const localeMode = resolveLocaleMode(params.contract);
  const htmlPages = params.contract.routeUnitContracts
    .map((item) => ({
      route: item.route,
      htmlPath: item.htmlPath,
      file: filesByPath.get(item.htmlPath),
    }))
    .filter((item) => item.file);
  const baselinePage = htmlPages[0];
  if (baselinePage?.file) {
    const baselineHeader = extractHeaderBlock(String(baselinePage.file.content || ""));
    const baselineFooter = extractFooterBlock(String(baselinePage.file.content || ""));
    const baselineNavRoutes = extractNavRoutes(String(baselinePage.file.content || ""));
    if (!baselineHeader || !baselineFooter || baselineNavRoutes.length === 0) {
      return {
        status: "contract_violation",
        scope: "shared",
        issues: ["Shared shell is missing a complete header, nav, or footer on the baseline route."],
        routeResults: [],
        violationCode: "shared_shell_drift",
        ownerLayer: inferOwnerLayerFromViolationCode("shared_shell_drift"),
        violatedFields: ["shared_shell"],
        evidence: [baselinePage.htmlPath],
      };
    }
    if (expectedRoutes.some((route) => !baselineNavRoutes.includes(route))) {
      return {
        status: "contract_violation",
        scope: "shared",
        issues: ["Shared navigation does not cover all confirmed routes."],
        routeResults: [],
        violationCode: "shared_shell_drift",
        ownerLayer: inferOwnerLayerFromViolationCode("shared_shell_drift"),
        violatedFields: ["shared_shell.nav_routes"],
        evidence: [`expected=${expectedRoutes.join(",")}`, `nav=${baselineNavRoutes.join(",")}`],
      };
    }

    for (const page of htmlPages.slice(1)) {
      const html = String(page.file?.content || "");
      const header = extractHeaderBlock(html);
      const footer = extractFooterBlock(html);
      const navRoutes = extractNavRoutes(html);
      if (!header || !footer || navRoutes.length === 0) {
        return {
          status: "contract_violation",
          scope: "route",
          route: page.route,
          issues: [`Route ${page.route} is missing a complete shared shell.`],
          routeResults: [],
          violationCode: "shared_shell_drift",
          ownerLayer: inferOwnerLayerFromViolationCode("shared_shell_drift"),
          violatedFields: ["shared_shell"],
          evidence: [page.htmlPath],
        };
      }
      if (JSON.stringify(navRoutes) !== JSON.stringify(baselineNavRoutes)) {
        return {
          status: "contract_violation",
          scope: "route",
          route: page.route,
          issues: [`Route ${page.route} diverges from the baseline shared navigation.`],
          routeResults: [],
          violationCode: "shared_shell_drift",
          ownerLayer: inferOwnerLayerFromViolationCode("shared_shell_drift"),
          violatedFields: ["shared_shell.nav_routes"],
          evidence: [`baseline=${baselineNavRoutes.join(",")}`, `route=${navRoutes.join(",")}`],
        };
      }

      const baselineHistoricalFile = baselineFilesByPath.get(page.htmlPath);
      if (baselineHistoricalFile) {
        const priorNavRoutes = extractNavRoutes(String(baselineHistoricalFile.content || ""));
        if (priorNavRoutes.length > 0 && JSON.stringify(navRoutes) !== JSON.stringify(priorNavRoutes)) {
          return {
            status: "contract_violation",
            scope: "route",
            route: page.route,
            issues: [`Route ${page.route} changed its shared navigation contract relative to the prior verified baseline.`],
            routeResults: [],
            violationCode: "shared_shell_drift",
            ownerLayer: inferOwnerLayerFromViolationCode("shared_shell_drift"),
            violatedFields: ["shared_shell.nav_routes"],
            evidence: [`baseline=${priorNavRoutes.join(",")}`, `route=${navRoutes.join(",")}`],
          };
        }
      }
    }

    if (localeMode === "bilingual") {
      if (!filesByPath.has("/i18n/messages.en.json") || !filesByPath.has("/i18n/messages.zh-CN.json")) {
        return {
          status: "contract_violation",
          scope: "shared",
          issues: ["Bilingual shell is missing required locale message catalogs."],
          routeResults: [],
          violationCode: "locale_shell_mismatch",
          ownerLayer: inferOwnerLayerFromViolationCode("locale_shell_mismatch"),
          violatedFields: ["locale_shell.catalogs"],
          evidence: ["/i18n/messages.en.json", "/i18n/messages.zh-CN.json"],
        };
      }
      for (const page of htmlPages) {
        const html = String(page.file?.content || "");
        const toggleSet = extractLocaleToggleSet(html);
        if (!(toggleSet.includes("zh-CN") && toggleSet.includes("en"))) {
          return {
            status: "contract_violation",
            scope: "route",
            route: page.route,
            issues: [`Route ${page.route} is missing the required bilingual locale switch.`],
            routeResults: [],
            violationCode: "locale_shell_mismatch",
            ownerLayer: inferOwnerLayerFromViolationCode("locale_shell_mismatch"),
            violatedFields: ["locale_shell.toggle"],
            evidence: [page.htmlPath],
          };
        }
        const baselineHistoricalFile = baselineFilesByPath.get(page.htmlPath);
        if (baselineHistoricalFile) {
          const priorToggleSet = extractLocaleToggleSet(String(baselineHistoricalFile.content || ""));
          if (
            priorToggleSet.length > 0 &&
            JSON.stringify(toggleSet) !== JSON.stringify(priorToggleSet)
          ) {
            return {
              status: "contract_violation",
              scope: "route",
              route: page.route,
              issues: [`Route ${page.route} changed its locale shell contract relative to the prior verified baseline.`],
              routeResults: [],
              violationCode: "locale_shell_mismatch",
              ownerLayer: inferOwnerLayerFromViolationCode("locale_shell_mismatch"),
              violatedFields: ["locale_shell.toggle"],
              evidence: [`baseline=${priorToggleSet.join(",")}`, `route=${toggleSet.join(",")}`],
            };
          }
        }
        const navBlock = extractNavBlock(html);
        if (/data-locale-toggle/i.test(navBlock)) {
          return {
            status: "contract_violation",
            scope: "route",
            route: page.route,
            issues: [`Route ${page.route} nests locale controls inside the primary nav.`],
            routeResults: [],
            violationCode: "locale_shell_mismatch",
            ownerLayer: inferOwnerLayerFromViolationCode("locale_shell_mismatch"),
            violatedFields: ["locale_shell.nav_boundary"],
            evidence: [page.htmlPath],
          };
        }
        if (!/data-i18n(?:\s|=|>)/i.test(html)) {
          return {
            status: "contract_violation",
            scope: "route",
            route: page.route,
            issues: [`Route ${page.route} does not expose stable bilingual i18n markers.`],
            routeResults: [],
            violationCode: "locale_shell_mismatch",
            ownerLayer: inferOwnerLayerFromViolationCode("locale_shell_mismatch"),
            violatedFields: ["locale_shell.i18n_markers"],
            evidence: [page.htmlPath],
          };
        }
      }
    }
  }

  const routeResults: RouteUnitVerificationRecord[] = [];
  for (const routeUnit of params.contract.routeUnitContracts) {
    const htmlPath = routeUnit.htmlPath;
    const htmlFile = filesByPath.get(htmlPath);
    if (!htmlFile) {
      const issue = buildIssueResult({
        route: routeUnit.route,
        htmlPath,
        checkedFiles: [htmlPath, "/styles.css", "/script.js"],
        violationCode: "missing_route_html",
        issues: [`Expected route HTML ${htmlPath} is missing.`],
        violatedFields: ["route_html"],
        evidence: [`Missing HTML file for route ${routeUnit.route}.`],
        status: "artifact_failure",
      });
      return {
        status: "artifact_failure",
        scope: "route",
        route: routeUnit.route,
        issues: issue.issues,
        routeResults: [...routeResults, issue],
        violationCode: issue.violationCode!,
        ownerLayer: issue.ownerLayer!,
        violatedFields: issue.violatedFields || [],
        evidence: issue.evidence || [],
      };
    }

    const visibleText = extractVisibleText(String(htmlFile.content || ""));
    const checkedFiles = [htmlPath, "/styles.css", "/script.js"];
    const placeholderIssue = detectPlaceholderIssue(visibleText);
    if (placeholderIssue) {
      const issue = buildIssueResult({
        route: routeUnit.route,
        htmlPath,
        checkedFiles,
        violationCode: "placeholder_copy",
        issues: [placeholderIssue],
        violatedFields: ["visible_copy"],
        evidence: [visibleText.slice(0, 240)],
        status: "contract_violation",
      });
      return {
        status: "contract_violation",
        scope: "route",
        route: routeUnit.route,
        issues: issue.issues,
        routeResults: [...routeResults, issue],
        violationCode: issue.violationCode!,
        ownerLayer: issue.ownerLayer!,
        violatedFields: issue.violatedFields || [],
        evidence: issue.evidence || [],
      };
    }

    if (routeUnit.route === "/") {
      const homepageIssue = detectHomepageSemanticIssue(visibleText);
      if (homepageIssue) {
        const issue = buildIssueResult({
          route: routeUnit.route,
          htmlPath,
          checkedFiles,
          violationCode: "homepage_semantic_mismatch",
          issues: [homepageIssue],
          violatedFields: ["homepage_opening_contract"],
          evidence: [visibleText.slice(0, 240)],
          status: "contract_violation",
        });
        return {
          status: "contract_violation",
          scope: "route",
          route: routeUnit.route,
          issues: issue.issues,
          routeResults: [...routeResults, issue],
          violationCode: issue.violationCode!,
          ownerLayer: issue.ownerLayer!,
          violatedFields: issue.violatedFields || [],
          evidence: issue.evidence || [],
        };
      }
      const homepageTopologyIssue = detectHomepageTopologyIssue({
        route: routeUnit.route,
        openingFamily: (routeUnit as any).openingFamily,
        openingTopology: (routeUnit as any).openingTopology,
        routeContract: (routeUnit as any).routeContract,
        html: String(htmlFile.content || ""),
      });
      if (homepageTopologyIssue) {
        const issue = buildIssueResult({
          route: routeUnit.route,
          htmlPath,
          checkedFiles,
          violationCode: "homepage_topology_mismatch",
          issues: [homepageTopologyIssue],
          violatedFields: ["homepage_opening_topology"],
          evidence: [
            String((routeUnit as any).openingTopology || "").slice(0, 240),
            String(htmlFile.content || "").slice(0, 240),
          ],
          status: "contract_violation",
        });
        return {
          status: "contract_violation",
          scope: "route",
          route: routeUnit.route,
          issues: issue.issues,
          routeResults: [...routeResults, issue],
          violationCode: issue.violationCode!,
          ownerLayer: issue.ownerLayer!,
          violatedFields: issue.violatedFields || [],
          evidence: issue.evidence || [],
        };
      }
    } else {
      if (visibleText.length < 90) {
        const issue = buildIssueResult({
          route: routeUnit.route,
          htmlPath,
          checkedFiles,
          violationCode: "thin_content",
          issues: [`Route ${routeUnit.route} produced unusually thin visible content.`],
          violatedFields: ["visible_copy"],
          evidence: [`Visible text length=${visibleText.length}`],
          status: "contract_violation",
        });
        return {
          status: "contract_violation",
          scope: "route",
          route: routeUnit.route,
          issues: issue.issues,
          routeResults: [...routeResults, issue],
          violationCode: issue.violationCode!,
          ownerLayer: issue.ownerLayer!,
          violatedFields: issue.violatedFields || [],
          evidence: issue.evidence || [],
        };
      }
      const lower = visibleText.toLowerCase();
      const expectedTerms = Array.from(new Set([...navTerms(routeUnit.navLabel), ...slugTerms(routeUnit.route)]));
      if (expectedTerms.length > 0 && !expectedTerms.some((term) => lower.includes(term))) {
        const issue = buildIssueResult({
          route: routeUnit.route,
          htmlPath,
          checkedFiles,
          violationCode: "route_identity_mismatch",
          issues: [`Route ${routeUnit.route} does not visibly express its route identity or nav label.`],
          violatedFields: ["route_identity"],
          evidence: [`Expected one of: ${expectedTerms.join(", ")}`, visibleText.slice(0, 240)],
          status: "contract_violation",
        });
        return {
          status: "contract_violation",
          scope: "route",
          route: routeUnit.route,
          issues: issue.issues,
          routeResults: [...routeResults, issue],
          violationCode: issue.violationCode!,
          ownerLayer: issue.ownerLayer!,
          violatedFields: issue.violatedFields || [],
          evidence: issue.evidence || [],
        };
      }
    }

    if (routeUnit.route === "/" && visibleText.length < 180) {
      const issue = buildIssueResult({
        route: routeUnit.route,
        htmlPath,
        checkedFiles,
        violationCode: "thin_content",
        issues: [`Route ${routeUnit.route} produced unusually thin visible content.`],
        violatedFields: ["visible_copy"],
        evidence: [`Visible text length=${visibleText.length}`],
        status: "contract_violation",
      });
      return {
        status: "contract_violation",
        scope: "route",
        route: routeUnit.route,
        issues: issue.issues,
        routeResults: [...routeResults, issue],
        violationCode: issue.violationCode!,
        ownerLayer: issue.ownerLayer!,
        violatedFields: issue.violatedFields || [],
        evidence: issue.evidence || [],
      };
    }

    routeResults.push({
      route: routeUnit.route,
      htmlPath,
      status: "passed",
      checkedFiles,
      issues: [],
      violatedFields: [],
      evidence: [],
    });
  }

  return {
    status: "passed",
    checkedRoutes: params.contract.routeUnitContracts.map((item) => item.route),
    routeResults,
  };
}
