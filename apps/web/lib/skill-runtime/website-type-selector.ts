export const WEBSITE_GENERATION_ORCHESTRATOR_SKILL_ID = "website-orchestrator" as const;

export const WEBSITE_GENERATION_TYPE_SKILL_IDS = [
  "corporate-b2b-site",
  "marketing-landing-site",
  "portfolio-blog-site",
] as const;

export type WebsiteGenerationTypeSkillId = (typeof WEBSITE_GENERATION_TYPE_SKILL_IDS)[number];

export type WebsiteTypeSelection = {
  skillId: WebsiteGenerationTypeSkillId;
  siteType: "corporate-b2b" | "marketing-landing" | "portfolio-blog";
  reason: string;
};

function normalizeText(parts: Array<unknown>): string {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function selectWebsiteGenerationTypeSkill(params: {
  requirementText?: string;
  siteType?: string;
  routes?: string[];
  targetAudience?: string[];
  primaryGoal?: string[];
}): WebsiteTypeSelection {
  const normalizedSiteType = String(params.siteType || "").trim().toLowerCase();
  const normalizedRoutes = (params.routes || []).map((route) => String(route || "").trim().toLowerCase());
  const intentText = normalizeText([
    params.requirementText || "",
    normalizedSiteType,
    ...(params.targetAudience || []),
    ...(params.primaryGoal || []),
    ...normalizedRoutes,
  ]);

  const hasCorporateSignal =
    /(company|corporate|official website|enterprise|b2b|manufacturer|factory|supplier|export|exporter|procurement|sourcing|distributor|wholesale|企业官网|公司官网|机构官网|制造商|工厂|供应商|外贸|出口|采购|渠道)/i.test(
      intentText,
    ) ||
    normalizedSiteType === "company" ||
    normalizedRoutes.some((route) =>
      ["/products", "/custom-solutions", "/solutions", "/cases", "/about", "/contact"].includes(route),
    );

  if (hasCorporateSignal) {
    return {
      skillId: "corporate-b2b-site",
      siteType: "corporate-b2b",
      reason: "Matched company/B2B/procurement/manufacturer signals or enterprise route structure.",
    };
  }

  const hasLandingSignal =
    /(landing|campaign|pricing|signup|sign up|demo request|free trial|conversion|saas|product launch|落地页|活动页|定价|注册|试用|转化)/i.test(
      intentText,
    ) || normalizedSiteType === "landing";

  if (hasLandingSignal) {
    return {
      skillId: "marketing-landing-site",
      siteType: "marketing-landing",
      reason: "Matched landing/campaign/pricing/conversion-first product signals.",
    };
  }

  return {
    skillId: "portfolio-blog-site",
    siteType: "portfolio-blog",
    reason: "Defaulted to portfolio/blog because request centers on personal profile, writing, or lacks enterprise/landing signals.",
  };
}
