import type { WebsiteSurfaceMode } from "./open-design-adoption.ts";

export const WEBSITE_GENERATION_ORCHESTRATOR_SKILL_ID = "website-orchestrator" as const;

export const WEBSITE_GENERATION_TYPE_SKILL_IDS = [
  "corporate-b2b-site",
  "marketing-landing-site",
  "portfolio-blog-site",
  "docs-knowledge-site",
  "content-hub-site",
] as const;

export type WebsiteGenerationTypeSkillId = (typeof WEBSITE_GENERATION_TYPE_SKILL_IDS)[number];

export type WebsiteTypeSelection = {
  skillId: WebsiteGenerationTypeSkillId;
  siteType: "corporate-b2b" | "marketing-landing" | "portfolio-blog" | "docs-knowledge" | "content-hub";
  surfaceMode: WebsiteSurfaceMode;
  reason: string;
};

function normalizeText(parts: Array<unknown>): string {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function hasInstitutionalKnowledgeSignals(normalizedSiteType: string, normalizedRoutes: string[], intentText: string): boolean {
  if (normalizedSiteType === "institution") return true;
  if (
    normalizedRoutes.some((route) =>
      /(?:research|standards?|certification|advocacy|information-platform|knowledge|resource|downloads?|library|directory|repository)/i.test(
        route,
      ),
    )
  ) {
    return true;
  }

  return /(?:institution|institutional|association|alliance|foundation|consortium|committee|standards?\s+system|research\s+center|research\s+hub|resource\s+center|information\s+platform|knowledge\s+platform|knowledge\s+base|documentation\s+portal|policy\s+library|public-interest|public service|advocacy|certification|repository|directory|download\s+center|downloads?\s+hub|research|标准体系|研究中心|信息平台|知识平台|资源中心|认证|倡议|资料库|下载中心)/i.test(
    intentText,
  );
}

function hasDocsKnowledgeSignals(normalizedSiteType: string, normalizedRoutes: string[], intentText: string): boolean {
  if (normalizedSiteType === "docs" || normalizedSiteType === "documentation" || normalizedSiteType === "knowledge") {
    return true;
  }
  if (
    normalizedRoutes.some((route) =>
      /(?:^|\/)(?:docs?|documentation|knowledge-base|kb|guides?|guide|manual|reference|references|api|developer|developers|handbook|playbook|faq|tutorials?)(?:\/|$)/i.test(
        route,
      ),
    )
  ) {
    return true;
  }
  return /(?:documentation|docs?\s+portal|knowledge\s+base|developer\s+portal|api\s+reference|handbook|playbook|implementation\s+guide|guides?|manual|tutorials?|faq|help\s+center)/i.test(
    intentText,
  );
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

  const hasInstitutionalKnowledgeSignal = hasInstitutionalKnowledgeSignals(
    normalizedSiteType,
    normalizedRoutes,
    intentText,
  );
  const hasDocsKnowledgeSignal = hasDocsKnowledgeSignals(normalizedSiteType, normalizedRoutes, intentText);

  const hasCorporateSignal =
    /(company|corporate|official website|enterprise|b2b|manufacturer|factory|supplier|export|exporter|procurement|sourcing|distributor|wholesale|浼佷笟瀹樼綉|鍏徃瀹樼綉|鏈烘瀯瀹樼綉|鍒堕€犲晢|宸ュ巶|渚涘簲鍟唡澶栬锤|鍑哄彛|閲囪喘|娓犻亾)/i.test(
      intentText,
    ) ||
    normalizedSiteType === "company" ||
    normalizedRoutes.some((route) =>
      ["/products", "/custom-solutions", "/solutions", "/cases", "/about", "/contact"].includes(route),
    );

  if (hasDocsKnowledgeSignal) {
    return {
      skillId: "docs-knowledge-site",
      siteType: "docs-knowledge",
      surfaceMode: "docs-knowledge-site",
      reason: "Matched documentation, knowledge-base, guide, reference, or developer-portal signals.",
    };
  }

  if (hasInstitutionalKnowledgeSignal) {
    return {
      skillId: "content-hub-site",
      siteType: "content-hub",
      surfaceMode: "content-hub-site",
      reason:
        "Matched institutional or content-hub signals such as research, standards, certification, advocacy, or information-library routes, so the request should avoid both the corporate-b2b enterprise grammar and explicit blog/archive assumptions.",
    };
  }

  if (hasCorporateSignal) {
    return {
      skillId: "corporate-b2b-site",
      siteType: "corporate-b2b",
      surfaceMode: "corporate-b2b-site",
      reason: "Matched company/B2B/procurement/manufacturer signals or enterprise route structure.",
    };
  }

  const hasLandingSignal =
    /(landing|campaign|pricing|signup|sign up|demo request|free trial|conversion|saas|product launch|钀藉湴椤祙娲诲姩椤祙瀹氫环|娉ㄥ唽|璇曠敤|杞寲)/i.test(
      intentText,
    ) || normalizedSiteType === "landing";

  if (hasLandingSignal) {
    return {
      skillId: "marketing-landing-site",
      siteType: "marketing-landing",
      surfaceMode: "marketing-landing-site",
      reason: "Matched landing/campaign/pricing/conversion-first product signals.",
    };
  }

  return {
    skillId: "portfolio-blog-site",
    siteType: "portfolio-blog",
    surfaceMode: "portfolio-blog-site",
    reason: "Defaulted to portfolio/blog because request centers on personal profile, writing, or lacks enterprise/landing signals.",
  };
}
