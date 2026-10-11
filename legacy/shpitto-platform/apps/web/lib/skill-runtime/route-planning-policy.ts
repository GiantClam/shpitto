import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ConditionalAutoRoute = {
  route: string;
  insertBefore?: string;
  matchPatterns: string[];
};

export type RouteAlias = {
  route: string;
  keys: string[];
};

export type BlogSemanticSignal = {
  patterns: string[];
  score: number;
  reason?: string;
};

export type BlogSemanticRoutePolicy = {
  fallbackRoute: string;
  confidenceThreshold: number;
  signals: BlogSemanticSignal[];
  negativeSignals: BlogSemanticSignal[];
};

export type RoutePlanningPolicy = {
  routeAliases: RouteAlias[];
  blockedLabels: string[];
  autoPlanningIntentPatterns: string[];
  defaultAutoRoutes: string[];
  conditionalAutoRoutes: ConditionalAutoRoute[];
  blogSemanticRoutePolicy: BlogSemanticRoutePolicy;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function normalizeConditionalAutoRoutes(value: unknown): ConditionalAutoRoute[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        route: String(raw.route || "").trim(),
        insertBefore: String(raw.insertBefore || "").trim() || undefined,
        matchPatterns: asStringArray(raw.matchPatterns),
      };
    })
    .filter((item) => item.route && item.matchPatterns.length > 0);
}

function normalizeRouteAliases(value: unknown): RouteAlias[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        route: String(raw.route || "").trim(),
        keys: asStringArray(raw.keys),
      };
    })
    .filter((item) => item.route && item.keys.length > 0);
}

function normalizeBlogSemanticSignals(value: unknown): BlogSemanticSignal[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        patterns: asStringArray(raw.patterns),
        score: Number(raw.score || 0),
        reason: String(raw.reason || "").trim() || undefined,
      };
    })
    .filter((item) => item.patterns.length > 0 && Number.isFinite(item.score) && item.score > 0);
}

function normalizeBlogSemanticRoutePolicy(value: unknown): BlogSemanticRoutePolicy {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const confidenceThreshold = Number(raw.confidenceThreshold || 70);
  return {
    fallbackRoute: String(raw.fallbackRoute || "/blog").trim() || "/blog",
    confidenceThreshold: Number.isFinite(confidenceThreshold) ? Math.max(1, Math.min(100, confidenceThreshold)) : 70,
    signals: normalizeBlogSemanticSignals(raw.signals),
    negativeSignals: normalizeBlogSemanticSignals(raw.negativeSignals),
  };
}

function loadRoutePlanningPolicy(): RoutePlanningPolicy {
  const config = loadWorkflowSkillConfig();
  const rawPolicy =
    config.routePlanningPolicy && typeof config.routePlanningPolicy === "object"
      ? (config.routePlanningPolicy as Record<string, unknown>)
      : {};
  const rawBlogPolicy =
    config.blogIntegrationPolicy && typeof config.blogIntegrationPolicy === "object"
      ? ((config.blogIntegrationPolicy as Record<string, unknown>).semanticRoutePolicy as unknown)
      : undefined;

  return {
    routeAliases: normalizeRouteAliases(rawPolicy.routeAliases),
    blockedLabels: asStringArray(rawPolicy.blockedLabels),
    autoPlanningIntentPatterns: asStringArray(rawPolicy.autoPlanningIntentPatterns),
    defaultAutoRoutes: asStringArray(rawPolicy.defaultAutoRoutes),
    conditionalAutoRoutes: normalizeConditionalAutoRoutes(rawPolicy.conditionalAutoRoutes),
    blogSemanticRoutePolicy: normalizeBlogSemanticRoutePolicy(rawBlogPolicy),
  };
}

function loadWorkflowSkillConfig(): Record<string, unknown> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const configPath = path.resolve(moduleDir, "../../skills/website-generation-workflow/skill.json");
  if (!existsSync(configPath)) return {};

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const routePlanningPolicy = loadRoutePlanningPolicy();
