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
  localeMode: "en" | "zh-CN" | "bilingual";
  visualDirectionId: string;
  designSystemId?: string;
  immutableConstraints: string[];
  confirmationStatus?: "confirmed" | "inferred" | "needs_confirmation";
  missingFields?: string[];
  assumptions?: string[];
  confirmedAt?: string;
};

export type ImportedWebsiteSkillActivationMode = "default" | "sidecar" | "opt_in";
export type ImportedWebsiteSkillRolloutStatus = "active" | "staged" | "disabled";

export type OpenDesignAdoptionFlags = {
  surfaceMode: boolean;
  discoveryBrief: boolean;
  importedSkills: boolean;
  routeUnits: boolean;
};

function isEnabled(raw: string | undefined, defaultValue = false): boolean {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return defaultValue;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function getOpenDesignAdoptionFlags(): OpenDesignAdoptionFlags {
  return {
    surfaceMode: isEnabled(process.env.SHPITTO_OD_SURFACE_MODE, false),
    discoveryBrief: isEnabled(process.env.SHPITTO_OD_DISCOVERY_BRIEF, false),
    importedSkills: isEnabled(process.env.SHPITTO_OD_IMPORTED_SKILLS, false),
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

export function shouldSelectImportedWebsiteSkill(params: {
  activationMode?: ImportedWebsiteSkillActivationMode;
  rolloutStatus?: ImportedWebsiteSkillRolloutStatus;
}): boolean {
  const rolloutStatus = params.rolloutStatus || "active";
  if (rolloutStatus === "disabled") return false;
  if (rolloutStatus === "staged") return getOpenDesignAdoptionFlags().importedSkills;
  if (params.activationMode === "sidecar" || params.activationMode === "opt_in") {
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

  return {
    confirmationStatus: brief.confirmedAt ? "confirmed" : missingFields.length > 0 ? "needs_confirmation" : "inferred",
    missingFields,
    assumptions,
  };
}
