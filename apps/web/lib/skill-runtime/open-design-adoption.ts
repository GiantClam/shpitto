import { websiteArtifactGeneratorEnablesImportedSkills } from "./website-artifact-generator.ts";

export type WebsiteSurfaceMode =
  | "corporate-b2b-site"
  | "marketing-landing-site"
  | "portfolio-blog-site"
  | "docs-knowledge-site"
  | "content-hub-site";

export type WebsiteDiscoveryBrief = {
  surfaceMode: WebsiteSurfaceMode;
  audience: string[];
  primaryGoal: string;
  routes: string[];
  sourcePriority: "user" | "uploaded_files" | "same_domain" | "web_research" | "mixed";
  localeMode: "en" | "zh-CN" | "bilingual" | "multilingual";
  supportedLocales?: string[];
  defaultLocale?: string;
  visualDirectionId: string;
  designSystemId?: string;
  designSystemName?: string;
  immutableConstraints: string[];
  confirmationStatus?: "confirmed" | "inferred" | "needs_confirmation";
  missingFields?: string[];
  assumptions?: string[];
  confirmedAt?: string;
};

export type ImportedWebsiteSkillActivationMode = "default" | "primary" | "sidecar" | "opt_in";
export type ImportedWebsiteSkillRolloutStatus = "active" | "staged" | "disabled";
export type ImportedWebsiteSkillSurfaceScope = "brand-only" | "website-only" | "product-ui-safe";

export type OpenDesignAdoptionFlags = {
  surfaceMode: boolean;
  discoveryBrief: boolean;
  importedSkills: boolean;
  routeUnits: boolean;
};

const DEFAULT_IMPORTED_SKILL_FIRST_SURFACES: WebsiteSurfaceMode[] = [
  "corporate-b2b-site",
  "marketing-landing-site",
  "portfolio-blog-site",
  "docs-knowledge-site",
  "content-hub-site",
];

function isEnabled(raw: string | undefined, defaultValue = false): boolean {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return defaultValue;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function getOpenDesignAdoptionFlags(): OpenDesignAdoptionFlags {
  return {
    surfaceMode: isEnabled(process.env.SHPITTO_OD_SURFACE_MODE, false),
    discoveryBrief: isEnabled(process.env.SHPITTO_OD_DISCOVERY_BRIEF, false),
    importedSkills: isEnabled(process.env.SHPITTO_OD_IMPORTED_SKILLS, false) || websiteArtifactGeneratorEnablesImportedSkills(),
    routeUnits: isEnabled(process.env.SHPITTO_OD_ROUTE_UNITS, false),
  };
}

export function inferWebsiteSurfaceModeFromSkillId(skillId: string): WebsiteSurfaceMode | undefined {
  const normalized = String(skillId || "").trim();
  if (!normalized) return undefined;
  if (
    normalized === "corporate-b2b-site" ||
    normalized === "marketing-landing-site" ||
    normalized === "portfolio-blog-site" ||
    normalized === "docs-knowledge-site" ||
    normalized === "content-hub-site"
  ) {
    return normalized;
  }
  return undefined;
}

export function getImportedSkillFirstSurfaceModes(): WebsiteSurfaceMode[] {
  const configured = String(process.env.SHPITTO_OD_IMPORTED_SKILL_FIRST_SURFACES || "")
    .split(",")
    .map((item) => inferWebsiteSurfaceModeFromSkillId(item))
    .filter((item): item is WebsiteSurfaceMode => Boolean(item));
  if (configured.length > 0) return Array.from(new Set(configured));
  return [...DEFAULT_IMPORTED_SKILL_FIRST_SURFACES];
}

export function isImportedSkillFirstSurfaceMode(surfaceMode?: WebsiteSurfaceMode): boolean {
  if (!surfaceMode) return false;
  return getImportedSkillFirstSurfaceModes().includes(surfaceMode);
}

export function shouldSelectImportedWebsiteSkill(params: {
  activationMode?: ImportedWebsiteSkillActivationMode;
  rolloutStatus?: ImportedWebsiteSkillRolloutStatus;
  surfaceMode?: WebsiteSurfaceMode;
}): boolean {
  const rolloutStatus = params.rolloutStatus || "active";
  if (rolloutStatus === "disabled") return false;
  if (params.activationMode === "primary") return true;
  if (rolloutStatus === "staged") {
    if (isImportedSkillFirstSurfaceMode(params.surfaceMode)) return true;
    return getOpenDesignAdoptionFlags().importedSkills;
  }
  if (params.activationMode === "sidecar" || params.activationMode === "opt_in") {
    if (params.activationMode === "sidecar" && isImportedSkillFirstSurfaceMode(params.surfaceMode)) return true;
    return getOpenDesignAdoptionFlags().importedSkills;
  }
  return true;
}

export function assessWebsiteDiscoveryBrief(
  brief: Omit<WebsiteDiscoveryBrief, "confirmationStatus" | "missingFields" | "assumptions">,
): Pick<WebsiteDiscoveryBrief, "confirmationStatus" | "missingFields" | "assumptions"> {
  const missingFields: string[] = [];
  const assumptions: string[] = [];

  if (!brief.audience.length) {
    missingFields.push("audience");
    assumptions.push("Audience inferred from surface mode and route intent.");
  }
  if (!String(brief.primaryGoal || "").trim()) {
    missingFields.push("primaryGoal");
    assumptions.push("Primary goal inferred from site type and first-route purpose.");
  }
  if (!brief.routes.length) {
    missingFields.push("routes");
    assumptions.push("Route list inferred from prompt/default planning.");
  }
  if (!String(brief.visualDirectionId || "").trim() || brief.visualDirectionId === "prompt-adaptive") {
    missingFields.push("visualDirectionId");
    assumptions.push("Visual direction remains prompt-adaptive until explicitly locked.");
  }
  if (!String(brief.designSystemId || "").trim()) {
    assumptions.push("Design system remains unlocked until a registry-backed or prompt-defined system is selected.");
  }
  if ((brief.supportedLocales || []).length === 0 && brief.localeMode === "bilingual") {
    assumptions.push("Locale list remains inferred until supported locales are explicitly confirmed.");
  }

  return {
    confirmationStatus: brief.confirmedAt ? "confirmed" : missingFields.length > 0 ? "needs_confirmation" : "inferred",
    missingFields,
    assumptions,
  };
}
