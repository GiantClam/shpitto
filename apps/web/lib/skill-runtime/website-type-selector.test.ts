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

  it("selects corporate-b2b for Chinese official company website signals", () => {
    const result = selectWebsiteGenerationTypeSkill({
      requirementText:
        "做一个制造商企业官网，面向海外采购团队和渠道客户，展示产品、工厂能力、案例和联系方式。",
      routes: ["/", "/products", "/cases", "/contact"],
    });

    expect(result.skillId).toBe("corporate-b2b-site");
    expect(result.siteType).toBe("corporate-b2b");
    expect(result.surfaceMode).toBe("corporate-b2b-site");
  });

  it("selects marketing-landing for Chinese landing page and conversion signals", () => {
    const result = selectWebsiteGenerationTypeSkill({
      requirementText: "生成一个 SaaS 活动落地页，突出定价、注册、试用和转化 CTA。",
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

  it("still selects portfolio-blog when the default brief only asks for a blog index and profile routes", () => {
    const result = selectWebsiteGenerationTypeSkill({
      siteType: "portfolio",
      requirementText:
        "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact. The first pass only needs a strong blog index and profile-led homepage.",
      routes: ["/", "/blog", "/about", "/contact"],
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

  it("prefers content-hub over docs-knowledge when institutional and documentation signals overlap", () => {
    const result = selectWebsiteGenerationTypeSkill({
      requirementText:
        "Generate the official CASUX multi-page website for standards, advocacy, research center, and information platform access. Treat the information platform as a public resource directory, not a generic docs shell.",
      routes: [
        "/",
        "/casux-creation",
        "/casux-construction",
        "/casux-certification",
        "/casux-advocacy",
        "/casux-research-center",
        "/casux-information-platform",
      ],
    });

    expect(result.skillId).toBe("content-hub-site");
    expect(result.siteType).toBe("content-hub");
    expect(result.surfaceMode).toBe("content-hub-site");
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
