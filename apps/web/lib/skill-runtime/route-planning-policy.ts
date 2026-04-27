import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ConditionalAutoRoute = {
  route: string;
  insertBefore?: string;
  matchPatterns: string[];
};

export type RoutePlanningPolicy = {
  blockedLabels: string[];
  autoPlanningIntentPatterns: string[];
  defaultAutoRoutes: string[];
  conditionalAutoRoutes: ConditionalAutoRoute[];
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

function loadRoutePlanningPolicy(): RoutePlanningPolicy {
  const config = loadWorkflowSkillConfig();
  const rawPolicy =
    config.routePlanningPolicy && typeof config.routePlanningPolicy === "object"
      ? (config.routePlanningPolicy as Record<string, unknown>)
      : {};

  return {
    blockedLabels: asStringArray(rawPolicy.blockedLabels),
    autoPlanningIntentPatterns: asStringArray(rawPolicy.autoPlanningIntentPatterns),
    defaultAutoRoutes: asStringArray(rawPolicy.defaultAutoRoutes),
    conditionalAutoRoutes: normalizeConditionalAutoRoutes(rawPolicy.conditionalAutoRoutes),
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
