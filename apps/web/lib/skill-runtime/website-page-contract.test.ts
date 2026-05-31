import { describe, expect, it } from "vitest";

import { formatTargetPageContract } from "./website-page-contract.ts";
import type { LocalDecisionPlan } from "./decision-layer.ts";

function buildBlogDecision(): LocalDecisionPlan {
  return {
    requirementText:
      "Build a polished personal technical blog for Bays Wong. Generate Home, Blog, About, and Contact. The Blog route must publish 3 complete article detail pages with stable /blog/{slug}/ URLs.",
    locale: "en",
    routes: ["/", "/blog", "/about", "/contact"],
    navLabels: ["Home", "Blog", "About", "Contact"],
    brandHint: "Bays Wong",
    routeAuthorityMode: "prompt_manifest",
    pageIntents: [
      {
        route: "/",
        navLabel: "Home",
        purpose: "Profile-led homepage.",
        source: "prompt_contract",
        pageKind: "home",
        responsibility: "Homepage",
        contentSkeleton: ["Profile masthead", "Editorial pillars", "Writing spotlight"],
        componentMix: { hero: 20, feature: 20, grid: 20, proof: 15, form: 5, cta: 10 },
        constraints: [],
      },
      {
        route: "/blog",
        navLabel: "Blog",
        purpose: "Technical writing archive.",
        source: "prompt_contract",
        pageKind: "blog-data-index",
        responsibility: "Blog archive",
        contentSkeleton: ["Archive lead", "Article cards", "CTA"],
        componentMix: { hero: 10, feature: 10, grid: 30, proof: 10, form: 0, cta: 10 },
        constraints: [],
      },
      {
        route: "/about",
        navLabel: "About",
        purpose: "Operator background and domains.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "About",
        contentSkeleton: ["Profile", "Experience", "CTA"],
        componentMix: { hero: 10, feature: 15, grid: 10, proof: 10, form: 0, cta: 10 },
        constraints: [],
      },
      {
        route: "/contact",
        navLabel: "Contact",
        purpose: "Collaboration path.",
        source: "prompt_contract",
        pageKind: "intent",
        responsibility: "Contact",
        contentSkeleton: ["Contact", "Channels", "CTA"],
        componentMix: { hero: 5, feature: 10, grid: 10, proof: 5, form: 20, cta: 10 },
        constraints: [],
      },
    ],
    pageBlueprints: [] as any,
  } as LocalDecisionPlan;
}

describe("formatTargetPageContract", () => {
  it("forbids route-guidance footer labels on institutional homepages and content indexes", () => {
    const plan = buildBlogDecision();
    plan.pageBlueprints = plan.pageIntents;

    const homeContract = formatTargetPageContract(plan, "/index.html", plan.requirementText);
    const blogContract = formatTargetPageContract(plan, "/blog/index.html", plan.requirementText);

    expect(homeContract).toContain("Homepage/footer wording gate");
    expect(homeContract).toContain("Site routes, site path, browsing path");
    expect(blogContract).toContain("Blog/content index footer wording gate");
    expect(blogContract).toContain("Research topics, Standards library, Resource sections, Contact, or Support");
  });

  it("requires complete blog detail bodies when publishable detail pages are explicitly requested", () => {
    const plan = buildBlogDecision();
    plan.pageBlueprints = plan.pageIntents;

    const contract = formatTargetPageContract(
      plan,
      "/blog/wechat-real-time-media-architecture/index.html",
      plan.requirementText,
    );

    expect(contract).toContain("this file is an explicitly requested publishable article target");
    expect(contract).toContain("at least four meaningful body paragraphs");
    expect(contract).toContain('do not mark the page with data-shpitto-blog-detail-shell="true"');
    expect(contract).not.toContain("only needs to be a structure-correct article shell");
  });
});
