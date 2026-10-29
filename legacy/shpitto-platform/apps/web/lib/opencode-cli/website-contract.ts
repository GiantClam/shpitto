import type { AgentState } from "../agent/graph.ts";
import { buildLocalDecisionPlan } from "../skill-runtime/decision-layer.ts";
import { inferWebsiteSurfaceModeFromSkillId } from "../skill-runtime/open-design-adoption.ts";
import {
  getAiImageToolTemplateBlueprint,
  normalizeProductBaselineSelection,
  selectAiImageToolBaselineSelection,
} from "../skill-runtime/product-baseline-contract.ts";
import {
  resolveSkillManifest,
  type ShpittoOpenCodeWorkspacePolicy,
  type ShpittoSkillManifest,
} from "./skill-manifest.ts";

export type OpenCodeTaskClass =
  | "baseline_generation"
  | "scoped_refinement"
  | "feature_expansion"
  | "template_inspection"
  | "template_validation"
  | "template_preview"
  | "template_deployment";

export type OpenCodeContinuationMode = "new" | "continue" | "fork";

export type OpenCodeStructuredInputs = {
  companyName?: string;
  productName?: string;
  industry?: string;
  targetAudience: string[];
  primaryGoal: string[];
  locale: string;
  routes: string[];
  notes?: string;
};

export type OpenCodeTemplateContext = {
  templateId: string;
  siteType: string;
  templateFamily: string;
  defaultRoutes?: string[];
  foundations: string[];
  seeds: string[];
};

export type ShpittoOpenCodeRequest = {
  skillId: string;
  taskClass: OpenCodeTaskClass;
  projectRoot: string;
  userIntentSummary: string;
  structuredInputs: OpenCodeStructuredInputs;
  templateContext: OpenCodeTemplateContext;
  executionScope: string;
  successCriteria: string[];
  skillManifest?: ShpittoSkillManifest;
  workspacePolicy?: ShpittoOpenCodeWorkspacePolicy;
  sessionId?: string;
  parentSessionId?: string;
  continuationMode?: OpenCodeContinuationMode;
  workflowRunId?: string;
  stepId?: string;
};

export type ShpittoTemplateManifest = {
  templateId: string;
  templateVersion: string;
  templateFamily: string;
  siteType: string;
  templateRoutes: string[];
};

export type ShpittoRouteContractDocument = {
  requiredRoutes: string[];
  optionalRoutes: string[];
  sharedShellContract: string[];
  routeOwnershipNotes: Array<{
    route: string;
    navLabel: string;
    pageKind: string;
    routeContract: string[];
  }>;
};

export type ShpittoSelectedFoundationsDocument = {
  designSystemId?: string;
  designSystemName?: string;
  visualDirection?: string;
  stylePreset?: Record<string, unknown>;
};

export type ShpittoSelectedSeedsDocument = {
  selected: Array<{
    id: string;
    source: string;
    reason?: string;
  }>;
};

export type ShpittoDeploymentTargetDocument = {
  target: "vercel" | "railway" | "docker" | "source" | "cloudflare-pages" | "static-export";
  staticFirst: boolean;
  runtime?: "server" | "static";
  framework: "nextjs-app-router";
  buildCommand?: string;
  startCommand?: string;
};

const PRODUCTIZED_BASELINE_SKILLS = [
  "build-ai-image-tool",
  "build-b2b-site",
  "build-marketing-site",
  "build-docs-site",
  "build-content-hub",
] as const;

const PRODUCTIZED_OPERATION_SKILLS = [
  "template-inspect",
  "template-modify",
  "template-validate",
  "template-preview",
  "template-deploy",
] as const;

const TEMPLATE_CONTEXT_MAP: Record<string, OpenCodeTemplateContext> = {
  "build-ai-image-tool": {
    templateId: "ai-image-tool-starter",
    siteType: "ai-image-tool-site",
    templateFamily: "ai-image-tool-platform",
    defaultRoutes: ["/", "/flux-ai", "/flux-schnell", "/krea-alternative", "/pricing", "/flux-prompt-generator", "/blog", "/sign-in", "/signin", "/sign-up", "/app", "/app/generate", "/app/history", "/app/giftcode", "/app/order", "/privacy-policy", "/terms-of-use"],
    foundations: ["ai-tool-product-foundation"],
    seeds: ["fluxkreafree-product-template"],
  },
  "build-b2b-site": {
    templateId: "b2b-lead-gen-site",
    siteType: "corporate-b2b-site",
    templateFamily: "b2b-lead-generation",
    defaultRoutes: ["/", "/products", "/custom-solutions", "/cases", "/about", "/contact"],
    foundations: ["industrial-b2b-foundation"],
    seeds: ["precision-catalog-template"],
  },
  "build-marketing-site": {
    templateId: "marketing-landing-site",
    siteType: "marketing-landing-site",
    templateFamily: "marketing-launch",
    defaultRoutes: ["/", "/pricing", "/about", "/contact"],
    foundations: ["bold-marketing-foundation"],
    seeds: ["cinematic-launch-template"],
  },
  "build-docs-site": {
    templateId: "docs-knowledge-site",
    siteType: "docs-knowledge-site",
    templateFamily: "docs-and-knowledge",
    defaultRoutes: ["/", "/docs", "/guides", "/faq"],
    foundations: ["docs-knowledge-foundation"],
    seeds: ["docs-reference-template"],
  },
  "build-content-hub": {
    templateId: "content-resource-hub",
    siteType: "content-hub-site",
    templateFamily: "content-and-resource-hub",
    defaultRoutes: ["/", "/resources", "/blog", "/about", "/contact"],
    foundations: ["content-hub-foundation"],
    seeds: ["content-resource-template"],
  },
};

function normalizeSkillId(skillId: string): string {
  return String(skillId || "").trim().toLowerCase();
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

function buildAiImageToolSelectedSeedsDocument(): ShpittoSelectedSeedsDocument {
  return {
    selected: [
      {
        id: "fluxkreafree-product-template",
        source: "shpitto",
        reason: "Product baseline template seed locked by ai-image-tool-baseline-v1.",
      },
    ],
  };
}

function resolveOpenCodeTemplateContext(params: {
  skillId: string;
  workflow: Record<string, unknown>;
  productBaselineSelection?: ReturnType<typeof normalizeProductBaselineSelection>;
}): OpenCodeTemplateContext {
  const baseTemplateContext = TEMPLATE_CONTEXT_MAP[params.skillId] || TEMPLATE_CONTEXT_MAP["build-ai-image-tool"];
  const workflowSeedIds = dedupe([
    ...normalizeStringArray(params.workflow.selectedSeedSkillIds),
    ...normalizeStringArray((params.workflow.selectedSeedSkillManifest as any)?.selected?.map?.((item: any) => item?.id)),
  ]);
  const workflowFoundationIds = dedupe([
    ...normalizeStringArray(params.workflow.selectedFoundationIds),
    ...normalizeStringArray((params.workflow.selectedSeedContracts as any)?.foundations),
  ]);

  if (params.skillId === "build-ai-image-tool") {
    const baselineSeedId = "fluxkreafree-product-template";
    const baselineFoundationId = "ai-tool-product-foundation";
    const preservedWorkflowSeeds = workflowSeedIds.filter(
      (item) => item === baselineSeedId || item === "ai-tool-product-foundation",
    );
    const preservedWorkflowFoundations = workflowFoundationIds.filter((item) => item === baselineFoundationId);
    return {
      ...baseTemplateContext,
      defaultRoutes: Array.isArray(baseTemplateContext.defaultRoutes) ? baseTemplateContext.defaultRoutes : ["/"],
      foundations: dedupe([
        baselineFoundationId,
        ...baseTemplateContext.foundations,
        ...preservedWorkflowFoundations,
      ]),
      seeds: dedupe([
        baselineSeedId,
        ...baseTemplateContext.seeds,
        ...preservedWorkflowSeeds,
      ]),
    };
  }

  return {
    ...baseTemplateContext,
    defaultRoutes: Array.isArray(baseTemplateContext.defaultRoutes) ? baseTemplateContext.defaultRoutes : ["/"],
    foundations: dedupe([
      ...baseTemplateContext.foundations,
      ...workflowFoundationIds,
    ]),
    seeds: dedupe([
      ...baseTemplateContext.seeds,
      ...workflowSeedIds,
    ]),
  };
}

function canonicalizeTemplateRoute(route: string, templateFamily: string): string {
  const normalized = String(route || "").trim().toLowerCase();
  if (!normalized) return normalized;
  if (templateFamily === "ai-image-tool-platform") {
    if (normalized === "/workspace" || normalized === "/editor") return "/app";
    if (normalized === "/generate" || normalized === "/generator" || normalized === "/generators") return "/app/generate";
    if (normalized === "/history" || normalized === "/replay" || normalized === "/gallery" || normalized === "/galleries") return "/app/history";
    if (normalized === "/gift" || normalized === "/gift-code" || normalized === "/giftcode") return "/app/giftcode";
    if (normalized === "/billing" || normalized === "/orders" || normalized === "/order") return "/app/order";
    if (normalized === "/flux-ai" || normalized === "/flux1" || normalized === "/flux.1") return "/flux-ai";
    if (normalized === "/flux-schnell" || normalized === "/schnell") return "/flux-schnell";
    if (normalized === "/krea-alternative" || normalized === "/krea" || normalized === "/krea-alt") return "/krea-alternative";
    if (normalized === "/blog" || normalized === "/news" || normalized === "/updates") return "/blog";
    if (normalized === "/faq" || normalized === "/faqs" || normalized === "/faq-route" || normalized === "/faq-routes" || normalized === "/docs" || normalized === "/documentation") {
      return "/flux-prompt-generator";
    }
    if (normalized === "/login" || normalized === "/signin" || normalized === "/sign-in" || normalized === "/auth") {
      return "/sign-in";
    }
    if (normalized === "/sign-up" || normalized === "/signup") return "/sign-up";
    if (normalized === "/account" || normalized === "/settings" || normalized === "/profile") return "/app/order";
    if (normalized === "/privacy" || normalized === "/privacy-policy") return "/privacy-policy";
    if (normalized === "/terms" || normalized === "/legal" || normalized === "/terms-of-use") return "/terms-of-use";
  }
  return normalized;
}

function resolveTemplateRoutes(params: {
  decisionRoutes: string[];
  defaultRoutes: string[];
  templateFamily: string;
  baselineProductRoutes?: string[];
}): string[] {
  const canonicalDecisionRoutes = params.decisionRoutes.map((route) =>
    canonicalizeTemplateRoute(route, params.templateFamily),
  );
  if (params.templateFamily === "ai-image-tool-platform") {
    return dedupe(
      params.baselineProductRoutes && params.baselineProductRoutes.length > 0
        ? params.baselineProductRoutes
        : params.defaultRoutes,
    );
  }
  return dedupe(canonicalDecisionRoutes.length > 0 ? canonicalDecisionRoutes : params.defaultRoutes);
}

function routeToLabel(route: string): string {
  const normalized = String(route || "/").trim() || "/";
  if (normalized === "/") return "Home";
  const segment = normalized.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).join(" ");
  return segment
    .split(/[-_]+/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function routeToAiImageNavLabel(route: string): string {
  const normalized = canonicalizeTemplateRoute(route, "ai-image-tool-platform");
  if (normalized === "/") return "Home";
  if (normalized === "/pricing") return "Pricing";
  if (normalized === "/flux-prompt-generator") return "Prompt Generator";
  if (normalized === "/sign-in") return "Sign In";
  if (normalized === "/app") return "Index";
  if (normalized === "/app/generate") return "Generate";
  if (normalized === "/app/history") return "History";
  if (normalized === "/app/giftcode") return "GiftCode";
  if (normalized === "/app/order") return "ChargeOrder";
  if (normalized === "/privacy-policy") return "Privacy Policy";
  if (normalized === "/terms-of-use") return "Terms of Use";
  return routeToLabel(normalized);
}

function routeToAiImagePageKind(route: string): string {
  const normalized = canonicalizeTemplateRoute(route, "ai-image-tool-platform");
  if (normalized === "/") return "home";
  if (normalized === "/sign-in") return "auth";
  if (normalized === "/app") return "dashboard";
  if (normalized === "/app/generate") return "workspace";
  if (normalized === "/app/history") return "history";
  if (normalized === "/app/giftcode") return "redeem";
  if (normalized === "/app/order") return "billing";
  if (normalized === "/flux-prompt-generator") return "prompt-generator";
  if (normalized === "/pricing") return "pricing";
  if (normalized === "/privacy-policy" || normalized === "/terms-of-use") return "legal";
  return "intent";
}

function clipText(value: string, maxChars: number): string {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function inferCompanyName(requirementSpec: Record<string, unknown>, requirementText: string): string | undefined {
  const explicit = String(
    requirementSpec.companyName ||
      requirementSpec.brandName ||
      requirementSpec.businessName ||
      requirementSpec.projectName ||
      "",
  ).trim();
  if (explicit) return explicit;
  const match = requirementText.match(/\bfor\s+([A-Z][A-Za-z0-9&-]*(?:\s+[A-Za-z0-9&-]+){0,7})/);
  return match?.[1]?.trim();
}

function inferProductName(requirementSpec: Record<string, unknown>, fallbackName?: string): string | undefined {
  return (
    String(requirementSpec.productName || requirementSpec.serviceName || requirementSpec.offeringName || "").trim() ||
    String(fallbackName || "").trim() ||
    undefined
  );
}

function inferIndustry(requirementSpec: Record<string, unknown>, siteType: string): string | undefined {
  const explicit = String(requirementSpec.industry || requirementSpec.category || "").trim();
  if (explicit) return explicit;
  if (siteType === "ai-image-tool-site") return "AI image generation or creative tooling";
  if (siteType === "corporate-b2b-site") return "industrial or B2B services";
  if (siteType === "docs-knowledge-site") return "developer tools or technical documentation";
  if (siteType === "content-hub-site") return "content, research, or resource publishing";
  return "software, services, or product marketing";
}

export function isProductizedBaselineSkillId(skillId: string): boolean {
  return PRODUCTIZED_BASELINE_SKILLS.includes(normalizeSkillId(skillId) as (typeof PRODUCTIZED_BASELINE_SKILLS)[number]);
}

export function isProductizedOperationSkillId(skillId: string): boolean {
  return PRODUCTIZED_OPERATION_SKILLS.includes(normalizeSkillId(skillId) as (typeof PRODUCTIZED_OPERATION_SKILLS)[number]);
}

export function shouldUseOpenCodeForSkill(skillId: string): boolean {
  if (!isProductizedBaselineSkillId(skillId) && !isProductizedOperationSkillId(skillId)) return false;
  const mode = String(process.env.SHPITTO_PRODUCTIZED_WEBSITE_EXECUTION || "opencode").trim().toLowerCase();
  return mode !== "legacy";
}

export function shouldEnforceOpenCodeSuccess(): boolean {
  return String(process.env.SHPITTO_OPENCODE_ENFORCE_SUCCESS || "0").trim() === "1";
}

export function shouldAllowPreparedBaselineFallback(): boolean {
  return String(process.env.SHPITTO_OPENCODE_ALLOW_BASELINE_FALLBACK || "0").trim() === "1";
}

export function buildShpittoOpenCodeBundle(params: {
  skillId: string;
  state: AgentState;
  projectRoot: string;
  taskClass?: OpenCodeTaskClass;
  executionScope?: string;
  templateSkillId?: string;
}): {
  request: ShpittoOpenCodeRequest;
  templateManifest: ShpittoTemplateManifest;
  routeContract: ShpittoRouteContractDocument;
  selectedFoundations: ShpittoSelectedFoundationsDocument;
  selectedSeeds: ShpittoSelectedSeedsDocument;
  deploymentTarget: ShpittoDeploymentTargetDocument;
} {
  const skillId = normalizeSkillId(params.skillId);
  const workflow = ((params.state as any)?.workflow_context || {}) as Record<string, unknown>;
  const contextSkillId =
    isProductizedBaselineSkillId(skillId)
      ? skillId
      : normalizeSkillId(
          params.templateSkillId ||
            String(workflow.templateSkillId || workflow.baseSkillId || workflow.skillId || "build-ai-image-tool"),
        ) || "build-ai-image-tool";
  const requirementSpec = ((workflow.requirementSpec as Record<string, unknown> | undefined) || {}) as Record<string, unknown>;
  const decision = buildLocalDecisionPlan(params.state);
  const productBaselineSelection =
    normalizeProductBaselineSelection(workflow.productBaselineSelection) ||
    (skillId === "build-ai-image-tool" ? selectAiImageToolBaselineSelection() : undefined);
  const requirementText =
    String(workflow.sourceRequirement || workflow.canonicalPrompt || decision.requirementText || "").trim() || decision.requirementText;
  const templateContext = resolveOpenCodeTemplateContext({
    skillId: contextSkillId,
    workflow,
    productBaselineSelection,
  });
  const defaultRoutes = templateContext.defaultRoutes || ["/"];
  const baselineProductRoutes =
    templateContext.templateFamily === "ai-image-tool-platform"
      ? (productBaselineSelection?.contract.immutable.appRoutes || [])
          .map((item) => canonicalizeTemplateRoute(item.route, templateContext.templateFamily))
      : [];
  const routes = resolveTemplateRoutes({
    decisionRoutes: decision.routes.length > 0 ? decision.routes : ["/"],
    defaultRoutes: defaultRoutes.length > 0 ? defaultRoutes : ["/"],
    templateFamily: templateContext.templateFamily,
    baselineProductRoutes,
  });
  const locale =
    String(
      workflow.preferredLocale ||
        workflow.defaultLocale ||
        requirementSpec.locale ||
        requirementSpec.language ||
        "en",
    ).trim() || "en";

  const structuredInputs: OpenCodeStructuredInputs = {
    companyName: inferCompanyName(requirementSpec, requirementText),
    productName: inferProductName(requirementSpec, productBaselineSelection?.contract.mutable.brand?.name),
    industry: inferIndustry(requirementSpec, templateContext.siteType),
    targetAudience: dedupe(
      normalizeStringArray(requirementSpec.targetAudience).length > 0
        ? normalizeStringArray(requirementSpec.targetAudience)
        : ["developers", "operators", "buyers"],
    ),
    primaryGoal: dedupe(
      normalizeStringArray(requirementSpec.primaryGoal).length > 0
        ? normalizeStringArray(requirementSpec.primaryGoal)
        : ["launch-ready website baseline"],
    ),
    locale,
    routes,
    notes: clipText(
      String(requirementSpec.customNotes || requirementSpec.notes || requirementSpec.summary || "").trim(),
      280,
    ) || undefined,
  };

  const request: ShpittoOpenCodeRequest = {
    skillId,
    taskClass: params.taskClass || "baseline_generation",
    projectRoot: params.projectRoot,
    userIntentSummary: clipText(requirementText, 520),
    structuredInputs,
    templateContext: {
      ...templateContext,
      foundations: templateContext.foundations,
      seeds: templateContext.seeds,
    },
    executionScope: params.executionScope || "full-baseline",
    skillManifest: resolveSkillManifest(skillId),
    workspacePolicy: resolveSkillManifest(skillId).workspacePolicy,
    successCriteria: [
      "all required routes exist",
      "shared navigation and footer are preserved across routes",
      "output remains a deployable Next.js App Router project",
      "result includes a complete product baseline, not only a homepage",
    ],
    sessionId: String(workflow.openCodeSessionId || "").trim() || undefined,
    parentSessionId: String(workflow.parentOpenCodeSessionId || "").trim() || undefined,
    continuationMode:
      workflow.openCodeContinuationMode === "fork" || workflow.openCodeContinuationMode === "continue"
        ? workflow.openCodeContinuationMode
        : "new",
    workflowRunId:
      String(workflow.workflowRunId || (workflow.workflowRuntime as any)?.workflowId || "").trim() || undefined,
    stepId: String(workflow.openCodeStepId || workflow.stepId || "").trim() || undefined,
  };

  const templateManifest: ShpittoTemplateManifest = {
    templateId: templateContext.templateId,
    templateVersion: "v1",
    templateFamily: templateContext.templateFamily,
    siteType:
      inferWebsiteSurfaceModeFromSkillId(String(workflow.websiteSurfaceMode || "").trim()) ||
      templateContext.siteType,
    templateRoutes: routes,
  };

  const routeUnitContracts = Array.isArray((workflow.generationContract as any)?.routeUnitContracts)
    ? ((workflow.generationContract as any).routeUnitContracts as Array<Record<string, unknown>>)
    : [];
  const routeContract: ShpittoRouteContractDocument = {
    requiredRoutes: routes,
    optionalRoutes: [],
    sharedShellContract: [
      "Preserve a shared primary navigation across all required routes.",
      "Preserve a shared footer across all required routes.",
      "Do not collapse the project to a single-page demo when multiple routes are required.",
      ...(templateContext.templateFamily === "ai-image-tool-platform"
        ? getAiImageToolTemplateBlueprint().sharedShell.shellRules
        : []),
    ],
    routeOwnershipNotes:
      routeUnitContracts.length > 0
        ? routeUnitContracts.map((item) => {
            const route = String(item.route || "/").trim() || "/";
            const normalizedRoute = canonicalizeTemplateRoute(route, templateContext.templateFamily);
            const navLabel =
              templateContext.templateFamily === "ai-image-tool-platform"
                ? routeToAiImageNavLabel(normalizedRoute)
                : String(item.navLabel || routeToLabel(route)).trim();
            const pageKind =
              templateContext.templateFamily === "ai-image-tool-platform"
                ? routeToAiImagePageKind(normalizedRoute)
                : String(item.pageKind || "intent").trim() || "intent";
            return {
              route: normalizedRoute,
              navLabel,
              pageKind,
              routeContract: normalizeStringArray(item.routeContract).length > 0 ? normalizeStringArray(item.routeContract) : [`route=${normalizedRoute}`, `navLabel=${navLabel}`, `pageKind=${pageKind}`],
            };
          })
        : routes.map((route) => {
            const normalizedRoute = canonicalizeTemplateRoute(route, templateContext.templateFamily);
            const navLabel =
              templateContext.templateFamily === "ai-image-tool-platform"
                ? routeToAiImageNavLabel(normalizedRoute)
                : routeToLabel(normalizedRoute);
            const pageKind =
              templateContext.templateFamily === "ai-image-tool-platform"
                ? routeToAiImagePageKind(normalizedRoute)
                : normalizedRoute === "/"
                  ? "home"
                  : "intent";
            return {
              route: normalizedRoute,
              navLabel,
              pageKind,
              routeContract: [`route=${normalizedRoute}`, `navLabel=${navLabel}`, `pageKind=${pageKind}`],
            };
          }),
  };

  const selectedFoundations: ShpittoSelectedFoundationsDocument = {
    designSystemId: String(workflow.designSystemId || "").trim() || undefined,
    designSystemName: String(workflow.designSystemName || "").trim() || undefined,
    visualDirection: String(workflow.designGuidancePrimaryVisualDirection || "").trim() || undefined,
    stylePreset:
      workflow.stylePreset && typeof workflow.stylePreset === "object" && !Array.isArray(workflow.stylePreset)
        ? (workflow.stylePreset as Record<string, unknown>)
        : undefined,
  };

  const selectedSeeds: ShpittoSelectedSeedsDocument = {
    selected: Array.isArray((workflow.selectedSeedSkillManifest as any)?.selected)
      ? ((workflow.selectedSeedSkillManifest as any).selected as Array<Record<string, unknown>>).map((item) => ({
          id: String(item.id || "").trim(),
          source: String(item.source || "shpitto").trim() || "shpitto",
          reason: String(item.reason || "").trim() || undefined,
        }))
      : [],
  };
  const normalizedSelectedSeeds =
    contextSkillId === "build-ai-image-tool" ? buildAiImageToolSelectedSeedsDocument() : selectedSeeds;

  const requestedDeploymentTarget =
    workflow.deploymentTarget && typeof workflow.deploymentTarget === "object"
      ? (workflow.deploymentTarget as Record<string, unknown>)
      : {};
  const serverRuntime =
    requestedDeploymentTarget.runtime === "server" ||
    (requestedDeploymentTarget.runtime !== "static" && templateContext.templateFamily === "ai-image-tool-platform");
  const deploymentTarget: ShpittoDeploymentTargetDocument = {
    target:
      requestedDeploymentTarget.target === "railway" ||
      requestedDeploymentTarget.target === "docker" ||
      requestedDeploymentTarget.target === "source" ||
      requestedDeploymentTarget.target === "cloudflare-pages" ||
      requestedDeploymentTarget.target === "static-export"
        ? requestedDeploymentTarget.target
        : "vercel",
    staticFirst:
      typeof requestedDeploymentTarget.staticFirst === "boolean"
        ? requestedDeploymentTarget.staticFirst
        : !serverRuntime,
    runtime: serverRuntime ? "server" : "static",
    framework: "nextjs-app-router",
    buildCommand: "pnpm build",
    startCommand: "pnpm start",
  };

  return {
    request,
    templateManifest,
    routeContract,
    selectedFoundations,
    selectedSeeds: normalizedSelectedSeeds,
    deploymentTarget,
  };
}
