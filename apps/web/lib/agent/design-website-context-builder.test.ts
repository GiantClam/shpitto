import { describe, expect, it } from "vitest";

import { buildContextForPageN, buildPageContext, formatContextForPrompt } from "../../skills/design-website-generator/tools/context-builder";

function makePageContext(pageName: string, pageOrder: number) {
  return buildPageContext(
    pageName,
    pageOrder,
    {
      headings: [
        { text: `${pageName} Heading`, level: 1, usedTerms: [pageName, "platform"] },
        { text: `${pageName} Subheading`, level: 2, usedTerms: ["platform"] },
      ],
      keyTerms: [
        { term: `${pageName}-term`, definition: `${pageName} definition`, usageCount: 2 },
        { term: "shared-term", definition: "shared definition", usageCount: 1 },
      ],
      featureList: ["fast", "secure"],
      toneAndManner: "professional",
    },
    {
      colorsUsed: [{ token: "Primary", value: "#123456", usage: `${pageName} CTA` }],
      typographyUsed: [{ role: "Heading", font: "Space Grotesk", size: "48px", usage: `${pageName} hero` }],
      componentsUsed: ["Hero", "CTA"],
    },
    {
      sections: ["hero", "features", "cta"],
      links: [{ target: "/contact", anchor: "Contact", type: "internal" }],
      navigationItems: ["Home", "Features", "Contact"],
    },
  );
}

describe("design-website context-builder", () => {
  it("builds bounded context summaries under the configured budget", () => {
    const contexts = [
      makePageContext("Page1", 1),
      makePageContext("Page2", 2),
      makePageContext("Page3", 3),
      makePageContext("Page4", 4),
      makePageContext("Page5", 5),
    ];

    const summary = buildContextForPageN(6, contexts, {
      maxChars: 900,
      maxPages: 2,
      maxTerms: 5,
    });

    expect(summary.length).toBeLessThanOrEqual(900);
    expect(summary).toContain("Page5");
    expect(summary).toContain("Page4");
    expect(summary).not.toContain("Page1 (#1)");
  });

  it("formats rich page context including term definitions and design usage", () => {
    const context = makePageContext("Pricing", 3);
    const text = formatContextForPrompt(context);

    expect(text).toContain("Pricing Heading");
    expect(text).toContain("Pricing definition");
    expect(text).toContain("Primary (#123456)");
    expect(text).toContain("Space Grotesk");
  });
});
