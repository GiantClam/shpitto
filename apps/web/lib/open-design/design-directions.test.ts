import { describe, expect, it } from "vitest";

import { recommendWebsiteDesignDirections } from "./design-directions";

describe("recommendWebsiteDesignDirections", () => {
  it("recommends industrial directions for manufacturing requirements", () => {
    const results = recommendWebsiteDesignDirections({
      siteType: "company",
      targetAudience: ["enterprise_buyers"],
      primaryGoal: ["lead_generation"],
      contentSources: ["existing_domain"],
      customNotes: "Precision CNC manufacturing website with machine specs and certifications.",
    });

    expect(results[0]?.direction.id).toBe("industrial-b2b");
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it("recommends software-native directions for developer products", () => {
    const results = recommendWebsiteDesignDirections({
      siteType: "landing",
      targetAudience: ["developers"],
      primaryGoal: ["book_demo"],
      customNotes: "AI developer platform with docs, API references, and product screenshots.",
    });

    expect(results.map((item) => item.direction.id)).toContain("modern-minimal");
    expect(results.map((item) => item.direction.id)).toContain("tech-utility");
  });

  it("recommends editorial directions for content-led brands", () => {
    const results = recommendWebsiteDesignDirections({
      siteType: "portfolio",
      targetAudience: ["consumers"],
      primaryGoal: ["brand_trust"],
      contentSources: ["uploaded_files"],
      customNotes: "Editorial journal style storytelling for a content-heavy brand site.",
    });

    expect(results[0]?.direction.id).toBe("editorial-monocle");
  });

  it("suppresses conflicting software-native themes when heritage manufacturing cues are explicit", () => {
    const results = recommendWebsiteDesignDirections({
      siteType: "company",
      targetAudience: ["enterprise_buyers"],
      primaryGoal: ["brand_trust"],
      contentSources: ["existing_domain"],
      customNotes:
        "Heritage craft manufacturing brand with premium materials, timeless quality, and artisan process storytelling.",
    });

    expect(results[0]?.direction.id).toBe("heritage-manufacturing");
    expect(results.slice(0, 2).map((item) => item.direction.id)).not.toContain("modern-minimal");
  });

  it("suppresses warm brand themes when technical utility signals dominate", () => {
    const results = recommendWebsiteDesignDirections({
      siteType: "landing",
      targetAudience: ["developers"],
      primaryGoal: ["book_demo"],
      customNotes: "API docs, infrastructure dashboard, developer tooling, and cloud status workflows.",
    });

    expect(results.slice(0, 2).map((item) => item.direction.id)).toEqual(
      expect.arrayContaining(["tech-utility", "modern-minimal"]),
    );
    expect(results.slice(0, 3).map((item) => item.direction.id)).not.toContain("warm-soft");
  });

  it("returns empty when no meaningful signals are present", () => {
    expect(recommendWebsiteDesignDirections({})).toEqual([]);
  });
});
