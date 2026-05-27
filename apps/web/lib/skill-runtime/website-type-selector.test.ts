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
    expect(result.surfaceMode).toBe("corporate-b2b-site");
  });

  it("does not treat negative blog/archive wording as a portfolio-blog signal", () => {
    const result = selectWebsiteGenerationTypeSkill({
      requirementText:
        "Build a polished multi-page B2B corporate website for AsterFlow Industrial AI. Audience: enterprise operations leaders evaluating automation partners. Generate Home, Solutions, Cases, About, and Contact. Use procurement-ready capabilities and customer evidence. Do not generate blog, archive, docs, or download routes.",
      routes: ["/", "/solutions", "/cases", "/about", "/contact"],
    });

    expect(result.skillId).toBe("corporate-b2b-site");
    expect(result.siteType).toBe("corporate-b2b");
    expect(result.surfaceMode).toBe("corporate-b2b-site");
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
    expect(result.surfaceMode).toBe("marketing-landing-site");
  });

  it("falls back to portfolio-blog for personal profile and writing-led requests", () => {
    const result = selectWebsiteGenerationTypeSkill({
      siteType: "portfolio",
      requirementText: "Build a personal portfolio and blog for an AI consultant with articles and resume highlights.",
      routes: ["/", "/blog"],
    });

    expect(result.skillId).toBe("portfolio-blog-site");
    expect(result.siteType).toBe("portfolio-blog");
    expect(result.surfaceMode).toBe("portfolio-blog-site");
  });

  it("keeps personal technical blogs out of corporate-b2b even with About and Contact routes", () => {
    const result = selectWebsiteGenerationTypeSkill({
      requirementText:
        "Build a polished personal technical blog for Bays Wong with Home, Blog, About, and Contact. Publish 3 complete article detail pages.",
      routes: ["/", "/blog", "/about", "/contact"],
    });

    expect(result.skillId).toBe("portfolio-blog-site");
    expect(result.siteType).toBe("portfolio-blog");
    expect(result.surfaceMode).toBe("portfolio-blog-site");
  });

  it("routes institutional knowledge-platform company sites to content-hub instead of corporate-b2b", () => {
    const result = selectWebsiteGenerationTypeSkill({
      siteType: "company",
      requirementText:
        "Build an official company website for CASUX with routes for CASUX Creation, CASUX Certification, CASUX Advocacy, CASUX Research Center, CASUX Information Platform, and a standards system.",
      routes: [
        "/",
        "/casux-creation",
        "/casux-certification",
        "/casux-advocacy",
        "/casux-research-center",
        "/casux-information-platform",
        "/standards-system",
      ],
    });

    expect(result.skillId).toBe("content-hub-site");
    expect(result.siteType).toBe("content-hub");
    expect(result.surfaceMode).toBe("content-hub-site");
    expect(result.reason).toContain("content-hub");
  });

  it("selects docs-knowledge for documentation and reference surfaces", () => {
    const result = selectWebsiteGenerationTypeSkill({
      siteType: "documentation",
      requirementText:
        "Build a developer portal with guides, API reference, onboarding handbook, and implementation tutorials.",
      routes: ["/", "/guides", "/reference", "/tutorials"],
    });

    expect(result.skillId).toBe("docs-knowledge-site");
    expect(result.siteType).toBe("docs-knowledge");
    expect(result.surfaceMode).toBe("docs-knowledge-site");
  });
});
