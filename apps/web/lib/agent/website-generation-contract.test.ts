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
      routeUnitContracts,
    });
    const second = buildWebsiteGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: { routes: ["/", "/research"] },
      discoveryBrief: { surfaceMode: "content-hub-site", routes: ["/", "/research"] },
      selectedSeedSkillManifest,
      routeUnitContracts,
    });

    expect(first.contractHash).toBe(second.contractHash);
    expect(first.routeUnitContracts).toHaveLength(2);
    expect(first.selectedSeedSkillManifest.selected).toEqual([
      expect.objectContaining({ id: "content-hub-site", source: "shpitto" }),
      expect.objectContaining({ id: "imported-open-design-content-hub", source: "imported-open-design" }),
    ]);
  });

  it("maps imported skill ids to their contract sources", () => {
    expect(inferSeedSkillSource("imported-open-design-foo")).toBe("imported-open-design");
    expect(inferSeedSkillSource("imported-html-anything-foo")).toBe("imported-html-anything");
    expect(inferSeedSkillSource("content-hub-site")).toBe("shpitto");
  });

  it("enriches manifest-derived content collection routes with opening topology and anti-split-hero hints", () => {
    const selectedSeedSkillManifest = buildSelectedSeedSkillManifest(
      ["content-hub-site"],
      "selected for content hub generation",
    );
    const routeUnitContracts = buildPromptManifestRouteUnits(
      {
        websiteSurfaceMode: "content-hub-site",
        pageIntents: [
          { route: "/", navLabel: "Home", source: "casux_fullflow_live_smoke", purpose: "Official homepage." },
          {
            route: "/casux-information-platform",
            navLabel: "Information",
            source: "casux_fullflow_live_smoke",
            purpose: "Act as the public information library and resource index for standards, research, institutional updates, and public-facing materials.",
          },
        ],
      },
      selectedSeedSkillManifest,
    );

    expect(routeUnitContracts[1]).toEqual(
      expect.objectContaining({
        route: "/casux-information-platform",
        pageKind: "content-collection-index",
        openingFamily: "collection",
      }),
    );
    expect(routeUnitContracts[1]?.openingTopology).toContain("information-platform lead");
    expect(routeUnitContracts[1]?.routeContract.join("\n")).toContain("routeOwnedOpening=information-platform-lead");
    expect(routeUnitContracts[1]?.routeContract.join("\n")).toContain("openingRootClass=first visible <section> root must include information-platform-lead");
    expect(routeUnitContracts[1]?.routeContract.join("\n")).toContain("openingMarkup=no <aside> inside the opening band");
  });
});
