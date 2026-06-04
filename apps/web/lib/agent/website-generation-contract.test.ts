import { describe, expect, it } from "vitest";
import {
  buildPromptManifestRouteUnits,
  buildSelectedSeedSkillManifest,
  buildWebsiteGenerationContract,
  inferSeedSkillSource,
} from "./website-generation-contract";

describe("website generation contract", () => {
  it("derives deterministic contract hashes from the same inputs", () => {
    const selectedSeedSkillManifest = buildSelectedSeedSkillManifest(
      ["content-hub-site", "imported-open-design-content-hub"],
      "selected for content hub generation",
    );
    const selectedSeedContracts = [
      {
        id: "imported-open-design-content-hub",
        source: "imported-open-design" as const,
        reason: "selected for content hub generation",
        contract: {
          openingFamily: "editorial signal band",
          visualBoldness: "high",
        },
      },
    ];
    const routeUnitContracts = buildPromptManifestRouteUnits(
      {
        websiteSurfaceMode: "content-hub-site",
        pageIntents: [
          { route: "/", navLabel: "Home", pageKind: "home", purpose: "Official homepage." },
          { route: "/research", navLabel: "Research", pageKind: "content-collection-index", purpose: "Research library." },
        ],
      },
      selectedSeedSkillManifest,
    );

    const first = buildWebsiteGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: { routes: ["/", "/research"] },
      discoveryBrief: { surfaceMode: "content-hub-site", routes: ["/", "/research"] },
      selectedSeedSkillManifest,
      selectedSeedContracts,
      routeUnitContracts,
    });
    const second = buildWebsiteGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: { routes: ["/", "/research"] },
      discoveryBrief: { surfaceMode: "content-hub-site", routes: ["/", "/research"] },
      selectedSeedSkillManifest,
      selectedSeedContracts,
      routeUnitContracts,
    });

    expect(first.contractHash).toBe(second.contractHash);
    expect(first.routeUnitContracts).toHaveLength(2);
    expect(first.selectedSeedSkillManifest.selected).toEqual([
      expect.objectContaining({ id: "content-hub-site", source: "shpitto" }),
      expect.objectContaining({ id: "imported-open-design-content-hub", source: "imported-open-design" }),
    ]);
    expect(first.selectedSeedContracts).toEqual([
      expect.objectContaining({
        id: "imported-open-design-content-hub",
        source: "imported-open-design",
        contract: expect.objectContaining({
          openingFamily: "editorial signal band",
          visualBoldness: "high",
        }),
      }),
    ]);
  });

  it("maps imported skill ids to their contract sources", () => {
    expect(inferSeedSkillSource("imported-open-design-foo")).toBe("imported-open-design");
    expect(inferSeedSkillSource("imported-html-anything-foo")).toBe("imported-html-anything");
    expect(inferSeedSkillSource("content-hub-site")).toBe("shpitto");
  });

  it("can derive the seed skill manifest from first-class selected seed contracts", () => {
    const contract = buildWebsiteGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "marketing-landing-site",
      selectedSeedContracts: [
        {
          id: "imported-open-design-bold-marketing-landing",
          source: "imported-open-design",
          contract: {
            openingFamily: "cinematic promise stack",
          },
        },
      ],
    });

    expect(contract.selectedSeedSkillManifest.selected).toEqual([
      expect.objectContaining({
        id: "imported-open-design-bold-marketing-landing",
        source: "imported-open-design",
      }),
    ]);
  });
});
