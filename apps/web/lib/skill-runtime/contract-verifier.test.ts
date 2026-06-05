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

  it("accepts a shared bilingual shell that uses a route-preserving single-switch control", () => {
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
            "<!doctype html><html lang='zh-CN' data-locale='zh-CN'><body><header><a href='/' class='brand'>CASUX</a><nav><a href='/' data-i18n='nav.home'>首页</a></nav><button class='locale-switch' type='button' data-locale-switch aria-label='切换至英文'>EN</button></header><main><h1 data-i18n='hero.title'>CASUX bilingual institutional shell</h1><p data-i18n='hero.lead'>CASUX keeps route-preserving bilingual copy in a shared shell with stable translation keys, institution-grade overview text, and enough visible depth to satisfy the verifier.</p><p data-i18n='hero.support'>The page preserves one active locale at a time while the shared shell, proof copy, and footer summary all remain translatable through the paired message catalogs.</p></main><footer><p data-i18n='footer.summary'>Footer summary for institutional visitors and partners.</p></footer></body></html>",
        },
        {
          path: "/styles.css",
          content: ".locale-switch{display:inline-flex}",
        },
        {
          path: "/script.js",
          content:
            "const localeFiles={'zh-CN':'/i18n/messages.zh-CN.json',en:'/i18n/messages.en.json'};document.querySelector('[data-locale-switch]');",
        },
        { path: "/i18n/messages.en.json", content: "{\"nav.home\":\"Home\",\"hero.title\":\"CASUX bilingual institutional shell\",\"hero.lead\":\"CASUX keeps route-preserving bilingual copy in a shared shell with stable translation keys, institution-grade overview text, and enough visible depth to satisfy the verifier.\",\"hero.support\":\"The page preserves one active locale at a time while the shared shell, proof copy, and footer summary all remain translatable through the paired message catalogs.\",\"footer.summary\":\"Footer summary for institutional visitors and partners.\"}" },
        { path: "/i18n/messages.zh-CN.json", content: "{\"nav.home\":\"首页\",\"hero.title\":\"CASUX 双语机构共享壳\",\"hero.lead\":\"CASUX 通过稳定的翻译键与共享壳层保持路由不变的双语内容，并提供足够完整的机构概览正文。\",\"hero.support\":\"页面一次只显示一种语言，但共享壳、证明性文案与页脚摘要都可以通过成对的消息目录完成切换。\",\"footer.summary\":\"面向机构访客与合作伙伴的页脚摘要。\"}" },
      ],
    });

    expect(result.status).toBe("passed");
  });

  it("reports locale shell drift when a bilingual interior route changes switch protocol relative to the verified baseline", () => {
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
        localeMode: "bilingual",
      },
      selectedSeedSkillManifest: {
        selected: [{ id: "content-hub-site", source: "shpitto" }],
      },
    });

    const result = verifyRouteUnitArtifacts({
      contract,
      baselineFiles: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html lang='zh-CN' data-locale='zh-CN'><body><header><nav><a href='/' data-i18n='nav.home'>首页</a><a href='/research-center' data-i18n='nav.research'>研究</a></nav><button type='button' data-locale-switch aria-label='切换至英文'>EN</button></header><main><h1 data-i18n='hero.title'>CASUX 双语机构共享壳</h1><p data-i18n='hero.lead'>Baseline shell keeps one route-preserving switch protocol with enough text for verification.</p><p data-i18n='hero.support'>Additional baseline support copy keeps the fixture above the thin-content threshold.</p></main><footer><p data-i18n='footer.summary'>Footer summary.</p></footer></body></html>",
        },
        {
          path: "/research-center/index.html",
          content:
            "<!doctype html><html lang='zh-CN' data-locale='zh-CN'><body><header><nav><a href='/' data-i18n='nav.home'>首页</a><a href='/research-center' data-i18n='nav.research'>研究</a></nav><button type='button' data-locale-switch aria-label='切换至英文'>EN</button></header><main><h1 data-i18n='hero.title'>研究中心</h1><p data-i18n='hero.lead'>Baseline shell keeps one route-preserving switch protocol with enough text for verification.</p><p data-i18n='hero.support'>Additional baseline support copy keeps the fixture above the thin-content threshold.</p></main><footer><p data-i18n='footer.summary'>Footer summary.</p></footer></body></html>",
        },
      ],
      files: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html lang='zh-CN' data-locale='zh-CN'><body><header><nav><a href='/' data-i18n='nav.home'>首页</a><a href='/research-center' data-i18n='nav.research'>研究</a></nav><button type='button' data-locale-switch aria-label='切换至英文'>EN</button></header><main><h1 data-i18n='hero.title'>CASUX 双语机构共享壳</h1><p data-i18n='hero.lead'>Baseline shell keeps one route-preserving switch protocol with enough text for verification.</p><p data-i18n='hero.support'>Additional baseline support copy keeps the fixture above the thin-content threshold.</p></main><footer><p data-i18n='footer.summary'>Footer summary.</p></footer></body></html>",
        },
        {
          path: "/research-center/index.html",
          content:
            "<!doctype html><html lang='zh-CN' data-locale='zh-CN'><body><header><nav><a href='/' data-i18n='nav.home'>首页</a><a href='/research-center' data-i18n='nav.research'>研究</a></nav><div class='locale-switch'><button type='button' data-locale-toggle data-locale='zh-CN'>ZH</button><button type='button' data-locale-toggle data-locale='en'>EN</button></div></header><main><h1 data-i18n='hero.title'>研究中心</h1><p data-i18n='hero.lead'>The interior route switched protocol even though the locale set stayed the same.</p><p data-i18n='hero.support'>Additional support copy keeps this focused on shell drift rather than thin content.</p></main><footer><p data-i18n='footer.summary'>Footer summary.</p></footer></body></html>",
        },
        { path: "/styles.css", content: ".locale-switch{display:inline-flex}" },
        { path: "/script.js", content: "console.log('ready')" },
        { path: "/i18n/messages.en.json", content: "{\"nav.home\":\"Home\",\"nav.research\":\"Research\"}" },
        { path: "/i18n/messages.zh-CN.json", content: "{\"nav.home\":\"首页\",\"nav.research\":\"研究\"}" },
      ],
    });

    expect(result.status).toBe("contract_violation");
    if (result.status !== "contract_violation") throw new Error("expected contract_violation");
    expect(result.violationCode).toBe("locale_shell_mismatch");
    expect(result.evidence).toEqual(expect.arrayContaining(["baseline=single-switch:en,zh-CN", "route=explicit-buttons:en,zh-CN"]));
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
