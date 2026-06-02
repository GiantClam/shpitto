import { describe, expect, it } from "vitest";

import { buildImmutableGenerationContract } from "./generation-contract.ts";
import { verifyRouteUnitArtifacts } from "./contract-verifier.ts";

function buildContract(routes: string[]) {
  return buildImmutableGenerationContract({
    generationLane: "website-generation-mvp",
    websiteSurfaceMode: "content-hub-site",
    promptControlManifest: {
      routes,
      pageIntents: routes.map((route, index) => ({
        route,
        navLabel: route === "/" ? "Home" : index === 1 ? "Research Center" : "Route",
        pageKind: route === "/" ? "home" : "content-collection-index",
        purpose: route === "/" ? "Institutional homepage." : "Research library.",
      })),
    },
    discoveryBrief: {
      surfaceMode: "content-hub-site",
      routes,
    },
    selectedSeedSkillManifest: {
      selected: [{ id: "content-hub-site", source: "shpitto" }],
    },
  });
}

describe("contract verifier", () => {
  it("passes a site that satisfies route-unit contracts", () => {
    const contract = buildContract(["/", "/research-center"]);
    const result = verifyRouteUnitArtifacts({
      contract,
      files: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, and concrete collaboration pathways.</p></main><footer>Footer</footer></body></html>",
        },
        {
          path: "/research-center/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>Research Center</h1><p>The research center curates studies, standards resources, and evidence-backed materials for policy, implementation, and training teams.</p></main><footer>Footer</footer></body></html>",
        },
        { path: "/styles.css", content: "body{font-family:system-ui}" },
        { path: "/script.js", content: "console.log('ready')" },
      ],
    });

    expect(result.status).toBe("passed");
    expect(result.routeResults).toHaveLength(2);
  });

  it("reports artifact failure when a route html file is missing", () => {
    const contract = buildContract(["/", "/research-center"]);
    const result = verifyRouteUnitArtifacts({
      contract,
      files: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, collaboration pathways, and public-interest implementation support across every major initiative.</p></main><footer>Footer</footer></body></html>",
        },
        { path: "/styles.css", content: "body{font-family:system-ui}" },
        { path: "/script.js", content: "console.log('ready')" },
      ],
    });

    expect(result.status).toBe("artifact_failure");
    if (result.status !== "artifact_failure") throw new Error("expected artifact_failure");
    expect(result.route).toBe("/research-center");
    expect(result.violationCode).toBe("missing_route_html");
  });

  it("reports a contract violation when homepage semantics degrade into gateway language", () => {
    const contract = buildContract(["/"]);
    const result = verifyRouteUnitArtifacts({
      contract,
      files: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><h1>CASUX</h1><p>This gateway is the entry point and route map for understanding how the site is organized across every section and destination.</p></main><footer>Footer</footer></body></html>",
        },
        { path: "/styles.css", content: "body{font-family:system-ui}" },
        { path: "/script.js", content: "console.log('ready')" },
      ],
    });

    expect(result.status).toBe("contract_violation");
    if (result.status !== "contract_violation") throw new Error("expected contract_violation");
    expect(result.violationCode).toBe("homepage_semantic_mismatch");
    expect(result.ownerLayer).toBe("orchestrator/policy");
  });

  it("reports shared shell drift when interior nav diverges from the baseline route set", () => {
    const contract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: {
        routes: ["/", "/research-center"],
        pageIntents: [
          { route: "/", navLabel: "Home", pageKind: "home", purpose: "Institutional homepage." },
          { route: "/research-center", navLabel: "Research Center", pageKind: "content-collection-index", purpose: "Research library." },
        ],
      },
      discoveryBrief: {
        surfaceMode: "content-hub-site",
        routes: ["/", "/research-center"],
      },
      selectedSeedSkillManifest: {
        selected: [{ id: "content-hub-site", source: "shpitto" }],
      },
    });

    const result = verifyRouteUnitArtifacts({
      contract,
      files: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center/\">Research Center</a></nav></header><main><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, collaboration pathways, and public-interest implementation support across every major initiative.</p></main><footer>Footer</footer></body></html>",
        },
        {
          path: "/research-center/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><h1>Research Center</h1><p>The research center curates studies, standards resources, and evidence-backed materials for policy, implementation, and training teams.</p></main><footer>Footer</footer></body></html>",
        },
        { path: "/styles.css", content: "body{font-family:system-ui}" },
        { path: "/script.js", content: "console.log('ready')" },
      ],
    });

    expect(result.status).toBe("contract_violation");
    if (result.status !== "contract_violation") throw new Error("expected contract_violation");
    expect(result.violationCode).toBe("shared_shell_drift");
    expect(result.route).toBe("/research-center");
  });

  it("reports locale shell mismatch when bilingual pages miss the shared locale switch protocol", () => {
    const contract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: {
        routes: ["/"],
        pageIntents: [{ route: "/", navLabel: "Home", pageKind: "home", purpose: "Institutional homepage." }],
      },
      discoveryBrief: {
        surfaceMode: "content-hub-site",
        routes: ["/"],
        localeMode: "bilingual",
      },
      selectedSeedSkillManifest: {
        selected: [{ id: "content-hub-site", source: "shpitto" }],
      },
    });

    const result = verifyRouteUnitArtifacts({
      contract,
      files: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, collaboration pathways, and public-interest implementation support across every major initiative.</p></main><footer>Footer</footer></body></html>",
        },
        { path: "/styles.css", content: "body{font-family:system-ui}" },
        { path: "/script.js", content: "console.log('ready')" },
        { path: "/i18n/messages.en.json", content: "{\"nav.home\":\"Home\"}" },
        { path: "/i18n/messages.zh-CN.json", content: "{\"nav.home\":\"首页\"}" },
      ],
    });

    expect(result.status).toBe("contract_violation");
    if (result.status !== "contract_violation") throw new Error("expected contract_violation");
    expect(result.violationCode).toBe("locale_shell_mismatch");
  });

  it("reports homepage topology mismatch when an institutional homepage falls back to generic split-hero geometry", () => {
    const contract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: {
        routes: ["/"],
        pageIntents: [{ route: "/", navLabel: "Home", pageKind: "home", purpose: "Institutional homepage." }],
      },
      discoveryBrief: {
        surfaceMode: "content-hub-site",
        routes: ["/"],
      },
      selectedSeedSkillManifest: {
        selected: [{ id: "content-hub-site", source: "shpitto" }],
      },
      routeUnitContracts: [
        {
          route: "/",
          navLabel: "Home",
          pageKind: "home",
          routeContract: ["route=/", "homepage_mode=institution_led_content_hub_homepage"],
          inheritedTerminology: ["casux"],
          inheritedTokens: ["#0f172a"],
          inheritedSeedSkillIds: ["content-hub-site"],
          openingFamily: "homepage",
          openingTopology:
            "brand-led institutional masthead -> capability overview shelves -> standards/research proof band -> consultation or route CTA",
          mediaPlan: [],
          mediaResources: [],
        } as any,
      ],
    });

    const result = verifyRouteUnitArtifacts({
      contract,
      files: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><section class=\"hero-grid\"><div class=\"hero-copy\"><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, collaboration pathways, and public-interest implementation support across every major initiative.</p></div><aside class=\"hero-panel\">Context</aside></section></main><footer>Footer</footer></body></html>",
        },
        { path: "/styles.css", content: "body{font-family:system-ui}" },
        { path: "/script.js", content: "console.log('ready')" },
      ],
    });

    expect(result.status).toBe("contract_violation");
    if (result.status !== "contract_violation") throw new Error("expected contract_violation");
    expect(result.violationCode).toBe("homepage_topology_mismatch");
    expect(result.ownerLayer).toBe("orchestrator/policy");
  });

  it("reports shared shell drift when a refined route changes nav routes relative to the prior verified baseline", () => {
    const contract = buildContract(["/", "/research-center"]);
    const result = verifyRouteUnitArtifacts({
      contract,
      baselineFiles: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>CASUX</h1><p>Baseline content with stable institutional copy and a route-complete shared shell.</p></main><footer>Footer</footer></body></html>",
        },
        {
          path: "/research-center/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>Research Center</h1><p>Baseline research content with stable institutional copy and a route-complete shared shell.</p></main><footer>Footer</footer></body></html>",
        },
      ],
      files: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, collaboration pathways, and public-interest implementation support across every major initiative.</p></main><footer>Footer</footer></body></html>",
        },
        {
          path: "/research-center/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><h1>Research Center</h1><p>The research center curates studies, standards resources, and evidence-backed materials for policy, implementation, and training teams.</p></main><footer>Footer</footer></body></html>",
        },
        { path: "/styles.css", content: "body{font-family:system-ui}" },
        { path: "/script.js", content: "console.log('ready')" },
      ],
    });

    expect(result.status).toBe("contract_violation");
    if (result.status !== "contract_violation") throw new Error("expected contract_violation");
    expect(result.violationCode).toBe("shared_shell_drift");
    expect(result.route).toBe("/research-center");
  });
});
