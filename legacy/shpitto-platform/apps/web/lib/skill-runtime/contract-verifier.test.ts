import { describe, expect, it } from "vitest";

import { buildImmutableGenerationContract } from "./generation-contract.ts";
import { verifyRouteUnitArtifacts } from "./contract-verifier.ts";
import { selectAiImageToolBaselineSelection } from "./product-baseline-contract.ts";

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

  it("accepts CJK nav labels as valid route identity evidence", () => {
    const contract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: {
        routes: ["/", "/blog"],
        pageIntents: [
          { route: "/", navLabel: "Home", pageKind: "home", purpose: "Institutional homepage." },
          { route: "/blog", navLabel: "博客", pageKind: "content-collection-index", purpose: "Blog archive." },
        ],
      },
      discoveryBrief: {
        surfaceMode: "content-hub-site",
        routes: ["/", "/blog"],
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
            "<!doctype html><html lang='zh-CN' data-locale='zh-CN'><body><header><nav><a href='/' data-i18n='nav.home'>首页</a><a href='/blog' data-i18n='nav.blog'>博客</a></nav><button type='button' data-locale-switch aria-label='切换至英文'>EN</button></header><main><h1 data-i18n='home.title'>Shpitto</h1><p data-i18n='home.lead'>AI practice notes, updates, and institutional knowledge organization for ongoing publishing work.</p><p data-i18n='home.support'>This homepage introduces the archive, reading themes, and the broader editorial purpose for visitors who want to browse updates or follow methods over time.</p></main><footer><a href='/blog' data-i18n='nav.blog'>博客</a></footer><script src='/script.js'></script></body></html>",
        },
        {
          path: "/blog/index.html",
          content:
            "<!doctype html><html lang='zh-CN' data-locale='zh-CN'><head><link rel='stylesheet' href='/styles.css'></head><body><header><nav><a href='/' data-i18n='nav.home'>首页</a><a href='/blog' aria-current='page' data-i18n='nav.blog'>博客</a></nav><button type='button' data-locale-switch aria-label='切换至英文'>EN</button></header><main><h1 data-i18n='blog.title'>博客</h1><p data-i18n='blog.lead'>这里整理 AI 实践、方法更新与知识沉淀，帮助读者按主题持续追踪内容。</p><p data-i18n='blog.support'>页面明确作为博客归档入口，聚合最新更新、精选条目与可复用的工作方法说明。</p><p data-i18n='blog.depth'>博客归档需要让访客快速识别这里是持续发布 AI 观察、工作流复盘、方法整理与阶段更新的内容入口，而不是泛化的信息平台或站点说明页。</p></main><footer><a href='/blog' data-i18n='nav.blog'>博客</a></footer><script src='/script.js'></script></body></html>",
        },
        { path: "/styles.css", content: "body{font-family:system-ui}" },
        { path: "/script.js", content: "const localeFiles={'zh-CN':'/i18n/messages.zh-CN.json',en:'/i18n/messages.en.json'};document.querySelector('[data-locale-switch]');" },
        { path: "/i18n/messages.en.json", content: "{\"nav.home\":\"Home\",\"nav.blog\":\"Blog\",\"home.title\":\"Shpitto\",\"home.lead\":\"AI practice notes, updates, and institutional knowledge organization for ongoing publishing work.\",\"home.support\":\"This homepage introduces the archive, reading themes, and the broader editorial purpose for visitors who want to browse updates or follow methods over time.\",\"blog.title\":\"Blog\",\"blog.lead\":\"A running archive of AI practice notes, methods, and publishable updates.\",\"blog.support\":\"The page clearly serves as the blog archive entry for recent updates and reusable working methods.\",\"blog.depth\":\"The archive should make it obvious that visitors are entering a continuously updated stream of AI observations, workflow retrospectives, and durable publishing notes rather than a generic information hub.\"}" },
        { path: "/i18n/messages.zh-CN.json", content: "{\"nav.home\":\"首页\",\"nav.blog\":\"博客\",\"home.title\":\"Shpitto\",\"home.lead\":\"AI practice notes, updates, and institutional knowledge organization for ongoing publishing work.\",\"home.support\":\"This homepage introduces the archive, reading themes, and the broader editorial purpose for visitors who want to browse updates or follow methods over time.\",\"blog.title\":\"博客\",\"blog.lead\":\"这里整理 AI 实践、方法更新与知识沉淀，帮助读者按主题持续追踪内容。\",\"blog.support\":\"页面明确作为博客归档入口，聚合最新更新、精选条目与可复用的工作方法说明。\",\"blog.depth\":\"博客归档需要让访客快速识别这里是持续发布 AI 观察、工作流复盘、方法整理与阶段更新的内容入口，而不是泛化的信息平台或站点说明页。\"}" },
      ],
    });

    expect(result.status).toBe("passed");
  });

  it("accepts bilingual route identity when visible copy follows the locale catalog instead of the english nav label", () => {
    const contract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "portfolio-blog-site",
      promptControlManifest: {
        routes: ["/", "/blog"],
        pageIntents: [
          { route: "/", navLabel: "Home", pageKind: "home", purpose: "Homepage." },
          { route: "/blog", navLabel: "Blog", pageKind: "content-collection-index", purpose: "Blog archive." },
        ],
      },
      discoveryBrief: {
        surfaceMode: "portfolio-blog-site",
        routes: ["/", "/blog"],
        localeMode: "bilingual",
        defaultLocale: "zh-CN",
      },
      selectedSeedSkillManifest: {
        selected: [{ id: "portfolio-blog-site", source: "shpitto" }],
      },
    });

    const result = verifyRouteUnitArtifacts({
      contract,
      files: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html lang='zh-CN' data-locale='zh-CN'><body><header><nav><a href='/' data-i18n='nav.home'>首页</a><a href='/blog' data-i18n='nav.blog'>博客</a></nav><button type='button' data-locale-switch aria-label='切换至英文'>EN</button></header><main><h1 data-i18n='home.title'>首页</h1><p data-i18n='home.lead'>A bilingual homepage for AI notes and editorial methods, designed for readers who want a clear overview before entering the archive.</p><p data-i18n='home.support'>The homepage explains the publication scope, reading promise, and why the archive matters, while also showing how recurring research notes, workflow retrospectives, and practical writeups connect into one coherent long-term publication.</p></main><footer><a href='/blog' data-i18n='nav.blog'>博客</a></footer><script src='/script.js'></script></body></html>",
        },
        {
          path: "/blog/index.html",
          content:
            "<!doctype html><html lang='zh-CN' data-locale='zh-CN'><body><header><nav><a href='/' data-i18n='nav.home'>首页</a><a href='/blog' aria-current='page' data-i18n='nav.blog'>博客</a></nav><button type='button' data-locale-switch aria-label='切换至英文'>EN</button></header><main><h1 data-i18n='blog.title'>博客：AI 实践、研究与更新</h1><p data-i18n='blog.lead'>这里汇集关于 AI 实践、研究观察与阶段更新的文章，帮助读者按主题持续跟进内容。</p><p data-i18n='blog.support'>页面明确作为双语博客归档入口，聚合最新更新、精选条目与可复用的方法说明。</p><p data-i18n='blog.depth'>默认可见语言保持中文，但同一条内容仍通过共享目录支持英文切换，因此归档身份应由当前可见词项和目录键共同判断。</p></main><footer><a href='/blog' data-i18n='nav.blog'>博客</a></footer><script src='/script.js'></script></body></html>",
        },
        { path: "/styles.css", content: "body{font-family:system-ui}" },
        { path: "/script.js", content: "const localeFiles={'zh-CN':'/i18n/messages.zh-CN.json',en:'/i18n/messages.en.json'};" },
        { path: "/i18n/messages.en.json", content: "{\"nav.home\":\"Home\",\"nav.blog\":\"Blog\",\"blog.title\":\"Blog: AI Practice, Research, and Updates\"}" },
        { path: "/i18n/messages.zh-CN.json", content: "{\"nav.home\":\"首页\",\"nav.blog\":\"博客\",\"blog.title\":\"博客：AI 实践、研究与更新\"}" },
      ],
    });

    expect(result.status).toBe("passed");
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

  it("accepts localized visible route identity for /blog when the page uses the nav label in Chinese", () => {
    const contract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "portfolio-blog-site",
      promptControlManifest: {
        routes: ["/", "/blog"],
        pageIntents: [
          { route: "/", navLabel: "Home", pageKind: "home", purpose: "Homepage." },
          { route: "/blog", navLabel: "Blog", pageKind: "content-collection-index", purpose: "Blog archive." },
        ],
      },
      discoveryBrief: {
        surfaceMode: "portfolio-blog-site",
        routes: ["/", "/blog"],
      },
      routeUnitContracts: [
        {
          route: "/",
          navLabel: "Home",
          pageKind: "home",
          routeContract: ["route=/", "navLabel=Home", "pageKind=home", "purpose=Homepage."],
          inheritedSeedSkillIds: [],
          openingFamily: "homepage",
          openingTopology: "profile masthead -> proof band -> CTA",
        } as any,
        {
          route: "/blog",
          navLabel: "Blog",
          pageKind: "content-collection-index",
          routeContract: [
            "route=/blog",
            "navLabel=Blog",
            "pageKind=content-collection-index",
            "purpose=Blog archive.",
            'contentDataRoot=include <section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"> inside the route-owned collection/list module',
            "contentDataList=inside that section, include a data-shpitto-blog-list container with polished fallback cards that match the route taxonomy and visual system",
          ],
          inheritedSeedSkillIds: [],
          openingFamily: "collection",
          openingTopology: "knowledge-hub lead -> collection navigator -> archive cards",
        } as any,
      ],
    });

    const result = verifyRouteUnitArtifacts({
      contract,
      files: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\" aria-current=\"page\">首页</a><a href=\"/blog\">博客</a></nav></header><main><h1>首页</h1><p>这是一段足够完整的首页介绍文本，用来说明站点围绕 AI 实践、方法整理与知识写作展开，并为读者提供清晰、稳定、可持续回访的内容入口。</p><p>Additional support copy keeps the fixture above the thin-content threshold and confirms that the homepage remains a real route rather than a skeletal shell.</p><p>The homepage also reinforces trust, route purpose, and archive context before visitors move into the blog collection.</p></main><footer>Footer</footer></body></html>",
        },
        {
          path: "/blog/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">首页</a><a href=\"/blog\" aria-current=\"page\">博客</a></nav></header><main><section><h1>博客</h1><p>这里收录 AI 实践、方法整理与研究观察文章，帮助读者快速找到值得保存和继续阅读的内容。</p></section><section data-shpitto-blog-root data-shpitto-blog-api=\"/api/blog/posts\"><div data-shpitto-blog-list><article class=\"blog-card\"><h2>最近更新</h2><p>每条内容都围绕真实实践展开，并保持清晰的阅读路径。</p></article></div></section><section><h2>专题方向</h2><p>读者可以从写作工作流、提示设计和研究摘录等方向继续浏览。</p></section></main><footer>Footer</footer></body></html>",
        },
        { path: "/styles.css", content: ".blog-card{padding:16px;border:1px solid #e2e8f0}" },
        { path: "/script.js", content: "console.log('ready')" },
      ],
    });

    expect(result.status).toBe("passed");
  });

  it("reports product route drift when a product-owned workspace is rewritten into brand-page copy", () => {
    const baseline = selectAiImageToolBaselineSelection();
    const contract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "marketing-landing-site",
      productBaselineSelection: baseline,
      routeUnitContracts: [
        {
          route: "/app",
          navLabel: "App",
          pageKind: "intent",
          routeContract: ["route=/app", "routeOwner=product", "productBaseline=ai-image-tool-baseline-v1"],
          owner: "product",
        } as any,
      ],
    });

    const result = verifyRouteUnitArtifacts({
      contract,
      files: [
        {
          path: "/app/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href='/'>Home</a><a href='/app'>App</a></nav></header><main><h1>Customer stories</h1><p>Explore pricing plans, case studies, and contact sales to learn more about the brand promise.</p><p>This page focuses on market positioning instead of a working image workflow.</p></main><footer>Footer</footer></body></html>",
        },
        { path: "/styles.css", content: "body{font-family:system-ui}" },
        { path: "/script.js", content: "console.log('ready')" },
      ],
    });

    expect(result.status).toBe("contract_violation");
    if (result.status !== "contract_violation") throw new Error("expected contract_violation");
    expect(result.violationCode).toBe("product_route_drift");
    expect(result.ownerLayer).toBe("orchestrator/policy");
  });
});
