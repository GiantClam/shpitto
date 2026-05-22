import { describe, expect, it } from "vitest";

import { selectWebsiteGenerationTypeSkill } from "./website-type-selector";

describe("website-type-selector", () => {
  it("selects corporate-b2b for company/procurement/manufacturer signals", () => {
    const result = selectWebsiteGenerationTypeSkill({
      siteType: "company",
      requirementText:
        "Build an official bilingual company website for an export textile manufacturer serving procurement teams and distributors.",
      routes: ["/", "/products", "/custom-solutions", "/cases", "/about", "/contact"],
    });

    expect(result.skillId).toBe("corporate-b2b-site");
    expect(result.siteType).toBe("corporate-b2b");
  });

  it("selects marketing-landing for campaign and conversion-first signals", () => {
    const result = selectWebsiteGenerationTypeSkill({
      siteType: "landing",
      requirementText:
        "Create a SaaS landing page with pricing, signup CTA, demo request, and free-trial conversion focus.",
      routes: ["/", "/pricing"],
    });

    expect(result.skillId).toBe("marketing-landing-site");
    expect(result.siteType).toBe("marketing-landing");
  });

  it("falls back to portfolio-blog for personal profile and writing-led requests", () => {
    const result = selectWebsiteGenerationTypeSkill({
      siteType: "portfolio",
      requirementText: "Build a personal portfolio and blog for an AI consultant with articles and resume highlights.",
      routes: ["/", "/blog"],
    });

    expect(result.skillId).toBe("portfolio-blog-site");
    expect(result.siteType).toBe("portfolio-blog");
  });
});
