import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

import {
  createSkillToolRouteUnitGenerationWorker,
  resolveDirectRouteUnitProviderConfigForTesting,
  resolveRouteUnitProviderTimeoutMsForTesting,
} from "./v2-route-generation-worker.ts";

const envSnapshot = {
  PPTOKEN_API_KEY: process.env.PPTOKEN_API_KEY,
  AIBERM_API_KEY: process.env.AIBERM_API_KEY,
  LLM_PROVIDER_ORDER: process.env.LLM_PROVIDER_ORDER,
  SHPITTO_PROVIDER_HEALTH_PATH: process.env.SHPITTO_PROVIDER_HEALTH_PATH,
};
const mockProviderToken = "mock-provider-token";

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("v2 route generation worker", () => {
  it("scopes generation to the requested route-unit target files via direct model JSON output", async () => {
    const worker = createSkillToolRouteUnitGenerationWorker({
      baseState: {
        workflow_context: {
          canonicalPrompt: "# Canonical Website Generation Prompt\nInstitutional homepage for CASUX.",
          websiteSurfaceMode: "content-hub-site",
          promptControlManifest: { routes: ["/", "/about"] },
        },
      } as any,
      timeoutMs: 10_000,
      invokeRouteModel: async ({ input, messages }) => {
        expect(input.route).toBe("/");
        expect(messages).toHaveLength(2);
        return JSON.stringify({
          summary: "Generated homepage route unit.",
          files: [
            { path: "/index.html", content: "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/about\">About</a></nav></header><main><h1>CASUX</h1><p>Institutional overview.</p></main><footer>Footer</footer></body></html>", type: "text/html" },
            { path: "/styles.css", content: "body{font-family:system-ui}", type: "text/css" },
            { path: "/script.js", content: "console.log('ready')", type: "application/javascript" },
            { path: "/about/index.html", content: "<html>Ignore me</html>", type: "text/html" },
          ],
        });
      },
    });

    const result = await worker.runUnit({
      unitId: "route-home",
      route: "/",
      targetFiles: ["/index.html", "/styles.css", "/script.js"],
      prompt: "Generate home route.",
      context: {},
    });

    expect(result.status).toBe("passed");
    expect(result.files.map((file) => file.path)).toEqual(["/index.html", "/styles.css", "/script.js"]);
  });

  it("fails when the model omits a requested route-unit target file", async () => {
    const worker = createSkillToolRouteUnitGenerationWorker({
      baseState: {
        workflow_context: {
          canonicalPrompt: "# Canonical Website Generation Prompt\nInstitutional homepage for CASUX.",
          websiteSurfaceMode: "content-hub-site",
          promptControlManifest: { routes: ["/"] },
        },
      } as any,
      timeoutMs: 10_000,
      invokeRouteModel: async () =>
        JSON.stringify({
          summary: "Missing CSS.",
          files: [{ path: "/index.html", content: "<!doctype html><html><body>Home</body></html>", type: "text/html" }],
        }),
    });

    const result = await worker.runUnit({
      unitId: "route-home",
      route: "/",
      targetFiles: ["/index.html", "/styles.css"],
      prompt: "Generate home route.",
      context: {},
    });

    expect(result.status).toBe("failed");
    expect(result.issues?.[0]).toContain("/styles.css");
  });

  it("uses gpt-5.4-mini by default for direct route-unit home generation", () => {
    const resolved = resolveDirectRouteUnitProviderConfigForTesting(
      {
        provider: "pptoken",
        apiKey: mockProviderToken,
        baseURL: "https://pptoken.example/v1",
        defaultHeaders: {},
        modelName: "gpt-5.4",
      },
      {
        route: "/",
        targetFiles: ["/index.html", "/styles.css", "/script.js"],
      },
    );

    expect(resolved.modelName).toBe("gpt-5.4-mini");
  });

  it("caps route-unit provider timeouts below the full async task budget", () => {
    const resolved = resolveRouteUnitProviderTimeoutMsForTesting({
      taskTimeoutMs: 900_000,
      targetFileCount: 3,
    });

    expect(resolved).toBe(70_000);
    expect(resolved).toBeLessThan(900_000);
  });

  it("injects strict single-visible-locale rules into bilingual route-unit prompts", async () => {
    const worker = createSkillToolRouteUnitGenerationWorker({
      baseState: {
        workflow_context: {
          canonicalPrompt: "# Canonical Website Generation Prompt\nBilingual CASUX homepage.",
          websiteSurfaceMode: "content-hub-site",
          promptControlManifest: { routes: ["/"], localeMode: "bilingual" },
          discoveryBrief: { localeMode: "bilingual" },
        },
      } as any,
      timeoutMs: 10_000,
      invokeRouteModel: async ({ messages }) => {
        const userMessage = String(messages[1]?.content || "");
        expect(userMessage).toContain("Keep exactly one visible language on screen at a time.");
        expect(userMessage).toContain("Do not render paired visible Chinese/English spans");
        expect(userMessage).toContain("Do not use `data-alt-zh`, `data-alt-en`, `data-zh`, `data-en`");
        expect(userMessage).toContain("declare the translated attribute through `data-i18n-attr`");
        return JSON.stringify({
          summary: "Generated bilingual homepage route unit.",
          files: [
            {
              path: "/index.html",
              content:
                "<!doctype html><html lang=\"zh-CN\" data-locale=\"zh-CN\"><body><header><nav><a href=\"/\" data-i18n=\"nav.home\">首页</a></nav><div class=\"locale-switch\"><button type=\"button\" data-locale-toggle data-locale=\"zh-CN\">中文</button><button type=\"button\" data-locale-toggle data-locale=\"en\">English</button></div></header><main><h1 data-i18n=\"hero.title\">CASUX</h1><p data-i18n=\"hero.lead\">Institutional homepage overview with stable i18n markers and a single visible locale.</p></main><footer><p data-i18n=\"footer.summary\">Footer summary for institutional visitors.</p></footer></body></html>",
              type: "text/html",
            },
            { path: "/styles.css", content: "body{font-family:system-ui}", type: "text/css" },
            { path: "/script.js", content: "console.log('ready')", type: "application/javascript" },
            { path: "/i18n/messages.en.json", content: "{\"nav.home\":\"Home\"}", type: "application/json" },
            { path: "/i18n/messages.zh-CN.json", content: "{\"nav.home\":\"首页\"}", type: "application/json" },
          ],
        });
      },
    });

    const result = await worker.runUnit({
      unitId: "route-home",
      route: "/",
      targetFiles: ["/index.html", "/styles.css", "/script.js", "/i18n/messages.en.json", "/i18n/messages.zh-CN.json"],
      prompt: "Generate bilingual home route.",
      context: {},
    });

    expect(result.status).toBe("passed");
  });

  it("drops bulky manifest and appendix sections from canonical prompt excerpts before route-unit dispatch", async () => {
    const worker = createSkillToolRouteUnitGenerationWorker({
      baseState: {
        workflow_context: {
          websiteSurfaceMode: "content-hub-site",
          promptControlManifest: { routes: ["/casux-advocacy"] },
          canonicalPrompt: [
            "# Canonical Website Generation Prompt",
            "",
            "## 0. Confirmed Generation Parameters",
            "- institutional site",
            "",
            "## 1. Site Mission",
            "- keep institutional trust",
            "",
            "## 3. Route Contracts",
            "- /casux-advocacy public-interest positioning",
            "",
            "## 4. Quality Constraints",
            "- one visible locale per node",
            "",
            "### Prompt Control Manifest (Machine Readable)",
            "```json",
            "{\"routes\":[\"/\"]}",
            "```",
            "",
            "## 7. Source Material Appendix",
            "Very long appendix that should not be echoed into route-unit prompts.",
          ].join("\n"),
        },
      } as any,
      timeoutMs: 10_000,
      invokeRouteModel: async ({ messages }) => {
        const userMessage = String(messages[1]?.content || "");
        expect(userMessage).toContain("## 0. Confirmed Generation Parameters");
        expect(userMessage).toContain("## 1. Site Mission");
        expect(userMessage).toContain("## 3. Route Contracts");
        expect(userMessage).toContain("## 4. Quality Constraints");
        expect(userMessage).not.toContain("Prompt Control Manifest");
        expect(userMessage).not.toContain("Source Material Appendix");
        return JSON.stringify({
          summary: "Generated advocacy route unit.",
          files: [
            {
              path: "/casux-advocacy/index.html",
              content:
                "<!doctype html><html lang=\"zh-CN\" data-locale=\"zh-CN\"><body><header><nav><a href=\"/casux-advocacy\" data-i18n=\"nav.advocacy\">倡议</a></nav><div class=\"locale-switch\"><button type=\"button\" data-locale-toggle data-locale=\"zh-CN\">中文</button><button type=\"button\" data-locale-toggle data-locale=\"en\">English</button></div></header><main><h1 data-i18n=\"hero.title\">倡议</h1><p data-i18n=\"hero.lead\">Public-interest positioning and collaboration narratives.</p></main><footer><p data-i18n=\"footer.summary\">Footer summary.</p></footer></body></html>",
              type: "text/html",
            },
            { path: "/i18n/messages.en.json", content: "{\"nav\":{\"advocacy\":\"Advocacy\"}}", type: "application/json" },
            { path: "/i18n/messages.zh-CN.json", content: "{\"nav\":{\"advocacy\":\"倡议\"}}", type: "application/json" },
          ],
        });
      },
    });

    const result = await worker.runUnit({
      unitId: "route-casux-advocacy",
      route: "/casux-advocacy",
      targetFiles: ["/casux-advocacy/index.html", "/i18n/messages.en.json", "/i18n/messages.zh-CN.json"],
      prompt: "Generate advocacy route.",
      context: {},
    });

    expect(result.status).toBe("passed");
  });

  it("passes compact collection opening bans through the route-unit prompt for information-platform routes", async () => {
    const worker = createSkillToolRouteUnitGenerationWorker({
      baseState: {
        workflow_context: {
          canonicalPrompt: "# Canonical Website Generation Prompt\nInstitutional content hub.",
          websiteSurfaceMode: "content-hub-site",
          promptControlManifest: { routes: ["/", "/casux-information-platform"] },
        },
      } as any,
      timeoutMs: 10_000,
      invokeRouteModel: async ({ messages }) => {
        const userMessage = String(messages[1]?.content || "");
        expect(userMessage).toContain("routeOwnedOpening=information-platform-lead");
        expect(userMessage).toContain("openingRootClass=first visible <section> root must include information-platform-lead");
        expect(userMessage).toContain("openingLayout=one route-owned collection/index surface");
        expect(userMessage).toContain("openingMarkup=no <aside> inside the opening band");
        expect(userMessage).toContain("openingBan=no hero");
        expect(userMessage).toContain("openingIdentity=public information library or materials directory");
        return JSON.stringify({
          summary: "Generated information platform route unit.",
          files: [
            {
              path: "/casux-information-platform/index.html",
              content: "<!doctype html><html><body><main><section class=\"information-platform-lead\"><h1>Info</h1></section></main></body></html>",
              type: "text/html",
            },
          ],
        });
      },
    });

    const result = await worker.runUnit({
      unitId: "route-casux-information-platform",
      route: "/casux-information-platform",
      targetFiles: ["/casux-information-platform/index.html"],
      prompt: "Generate information platform route.",
      context: {
        navLabel: "Information",
        pageKind: "content-collection-index",
        openingFamily: "collection",
        openingTopology: "information-platform lead -> collection navigator -> standards/research/update ledgers",
        routeContract: [
          "route=/casux-information-platform",
          "routeOwnedOpening=information-platform-lead | resource-collection-lead | knowledge-hub-lead",
          "openingRootClass=first visible <section> root must include information-platform-lead | resource-collection-lead | knowledge-hub-lead",
          "openingLayout=one route-owned collection/index surface with the navigator inside the opening band",
          "openingMarkup=no <aside> inside the opening band; supporting proof must stay embedded inside the same route-owned root surface",
          "openingBan=no hero, hero--split, hero-grid, hero__grid, hero-copy, hero-panel, hero-aside, right-rail aside, or promo split-hero masthead",
          "openingIdentity=public information library or materials directory, not an entry point or gateway explainer",
        ],
      },
    });

    expect(result.status).toBe("passed");
  });

  it("uses direct REST fetch for pptoken route-unit generation", async () => {
    process.env.PPTOKEN_API_KEY = "pptoken-test";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Generated homepage route unit.",
                  files: [
                    { path: "/index.html", content: "<!doctype html><html><body>Home</body></html>", type: "text/html" },
                    { path: "/styles.css", content: "body{font-family:system-ui}", type: "text/css" },
                  ],
                }),
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const worker = createSkillToolRouteUnitGenerationWorker({
      baseState: {
        workflow_context: {
          canonicalPrompt: "# Canonical Website Generation Prompt\nInstitutional homepage for CASUX.",
          websiteSurfaceMode: "content-hub-site",
          promptControlManifest: { routes: ["/"] },
          providerLock: {
            provider: "pptoken",
            model: "gpt-5.4-mini",
          },
        },
      } as any,
      timeoutMs: 10_000,
    });

    const result = await worker.runUnit({
      unitId: "route-home",
      route: "/",
      targetFiles: ["/index.html", "/styles.css"],
      prompt: "Generate home route.",
      context: {},
    });

    expect(result.status).toBe("passed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?] | undefined;
    expect(call).toBeTruthy();
    const url = call?.[0];
    const init = call?.[1];
    expect(String(url)).toBe("https://cn.pptoken.cc/v1/chat/completions");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body || "{}"));
    expect(body.model).toBe("gpt-5.4-mini");
    expect(body.messages).toHaveLength(2);
    expect(result.files.map((file) => file.path)).toEqual(["/index.html", "/styles.css"]);
  });

  it("accepts a route-unit-specific interior override when provided", () => {
    const previousInteriorModel = process.env.LLM_MODEL_ROUTE_UNIT_INTERIOR_HTML;
    try {
      process.env.LLM_MODEL_ROUTE_UNIT_INTERIOR_HTML = "openai/gpt-5.4";
      const resolved = resolveDirectRouteUnitProviderConfigForTesting(
        {
          provider: "pptoken",
          apiKey: mockProviderToken,
          baseURL: "https://pptoken.example/v1",
          defaultHeaders: {},
          modelName: "gpt-5.4-mini",
        },
        {
          route: "/casux-creation",
          targetFiles: ["/casux-creation/index.html"],
        },
      );

      expect(resolved.modelName).toBe("gpt-5.4");
    } finally {
      if (previousInteriorModel === undefined) delete process.env.LLM_MODEL_ROUTE_UNIT_INTERIOR_HTML;
      else process.env.LLM_MODEL_ROUTE_UNIT_INTERIOR_HTML = previousInteriorModel;
    }
  });

  it("falls back to the next provider after retrying pptoken malformed route-unit output", async () => {
    const previousPptokenKey = process.env.PPTOKEN_API_KEY;
    const previousAibermKey = process.env.AIBERM_API_KEY;
    const previousProviderOrder = process.env.LLM_PROVIDER_ORDER;
    const previousHealthPath = process.env.SHPITTO_PROVIDER_HEALTH_PATH;
    const healthPath = path.resolve(process.cwd(), ".tmp", "v2-route-generation-worker-health-test.json");
    await fs.rm(healthPath, { force: true });
    process.env.PPTOKEN_API_KEY = "pptoken-test";
    process.env.AIBERM_API_KEY = "aiberm-test";
    process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm";
    process.env.SHPITTO_PROVIDER_HEALTH_PATH = healthPath;
    const attemptedProviders: string[] = [];

    try {
      const worker = createSkillToolRouteUnitGenerationWorker({
        baseState: {
          workflow_context: {
            canonicalPrompt: "# Canonical Website Generation Prompt\nInstitutional homepage for CASUX.",
            websiteSurfaceMode: "content-hub-site",
            promptControlManifest: { routes: ["/"] },
          },
        } as any,
        timeoutMs: 10_000,
        invokeRouteModel: async ({ attempt }) => {
          attemptedProviders.push(attempt.config.provider);
          if (attempt.config.provider === "pptoken") {
            return JSON.stringify({
              summary: "Incomplete result.",
              files: [{ path: "/index.html", content: "<!doctype html><html><body>Home</body></html>", type: "text/html" }],
            });
          }
          return JSON.stringify({
            summary: "Recovered on fallback provider.",
            files: [
              { path: "/index.html", content: "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><h1>CASUX</h1><p>Institutional overview.</p></main><footer>Footer</footer></body></html>", type: "text/html" },
              { path: "/styles.css", content: "body{font-family:system-ui}", type: "text/css" },
            ],
          });
        },
      });

      const result = await worker.runUnit({
        unitId: "route-home",
        route: "/",
        targetFiles: ["/index.html", "/styles.css"],
        prompt: "Generate home route.",
        context: {},
      });

      expect(result.status).toBe("passed");
      expect(attemptedProviders).toEqual(["pptoken", "pptoken", "pptoken", "aiberm"]);
      expect(result.files.map((file) => file.path)).toEqual(["/index.html", "/styles.css"]);
    } finally {
      process.env.PPTOKEN_API_KEY = previousPptokenKey;
      process.env.AIBERM_API_KEY = previousAibermKey;
      process.env.LLM_PROVIDER_ORDER = previousProviderOrder;
      process.env.SHPITTO_PROVIDER_HEALTH_PATH = previousHealthPath;
    }
  });

  it("falls back to the next provider after retrying an undefined-message TypeError", async () => {
    const previousPptokenKey = process.env.PPTOKEN_API_KEY;
    const previousAibermKey = process.env.AIBERM_API_KEY;
    const previousProviderOrder = process.env.LLM_PROVIDER_ORDER;
    const previousHealthPath = process.env.SHPITTO_PROVIDER_HEALTH_PATH;
    const healthPath = path.resolve(process.cwd(), ".tmp", "v2-route-generation-worker-typeerror-health-test.json");
    await fs.rm(healthPath, { force: true });
    process.env.PPTOKEN_API_KEY = "pptoken-test";
    process.env.AIBERM_API_KEY = "aiberm-test";
    process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm";
    process.env.SHPITTO_PROVIDER_HEALTH_PATH = healthPath;
    const attemptedProviders: string[] = [];

    try {
      const worker = createSkillToolRouteUnitGenerationWorker({
        baseState: {
          workflow_context: {
            canonicalPrompt: "# Canonical Website Generation Prompt\nInstitutional homepage for CASUX.",
            websiteSurfaceMode: "content-hub-site",
            promptControlManifest: { routes: ["/"] },
          },
        } as any,
        timeoutMs: 10_000,
        invokeRouteModel: async ({ attempt }) => {
          attemptedProviders.push(attempt.config.provider);
          if (attempt.config.provider === "pptoken") {
            throw new TypeError("Cannot read properties of undefined (reading 'message')");
          }
          return JSON.stringify({
            summary: "Recovered after provider-envelope crash.",
            files: [
              {
                path: "/index.html",
                content:
                  "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><h1>CASUX</h1><p>Institutional overview.</p></main><footer>Footer</footer></body></html>",
                type: "text/html",
              },
              { path: "/styles.css", content: "body{font-family:system-ui}", type: "text/css" },
            ],
          });
        },
      });

      const result = await worker.runUnit({
        unitId: "route-home",
        route: "/",
        targetFiles: ["/index.html", "/styles.css"],
        prompt: "Generate home route.",
        context: {},
      });

      expect(result.status).toBe("passed");
      expect(attemptedProviders).toEqual(["pptoken", "pptoken", "pptoken", "aiberm"]);
      expect(result.files.map((file) => file.path)).toEqual(["/index.html", "/styles.css"]);
    } finally {
      process.env.PPTOKEN_API_KEY = previousPptokenKey;
      process.env.AIBERM_API_KEY = previousAibermKey;
      process.env.LLM_PROVIDER_ORDER = previousProviderOrder;
      process.env.SHPITTO_PROVIDER_HEALTH_PATH = previousHealthPath;
    }
  });

  it("preserves fallback providers when workflow_context carries a preferred provider lock", async () => {
    const previousPptokenKey = process.env.PPTOKEN_API_KEY;
    const previousAibermKey = process.env.AIBERM_API_KEY;
    const previousProviderOrder = process.env.LLM_PROVIDER_ORDER;
    const previousHealthPath = process.env.SHPITTO_PROVIDER_HEALTH_PATH;
    const healthPath = path.resolve(process.cwd(), ".tmp", "v2-route-generation-worker-preferred-lock-health-test.json");
    await fs.rm(healthPath, { force: true });
    process.env.PPTOKEN_API_KEY = "pptoken-test";
    process.env.AIBERM_API_KEY = "aiberm-test";
    process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm";
    process.env.SHPITTO_PROVIDER_HEALTH_PATH = healthPath;
    const attemptedProviders: string[] = [];

    try {
      const worker = createSkillToolRouteUnitGenerationWorker({
        baseState: {
          workflow_context: {
            canonicalPrompt: "# Canonical Website Generation Prompt\nInstitutional homepage for CASUX.",
            websiteSurfaceMode: "content-hub-site",
            promptControlManifest: { routes: ["/"] },
            providerLock: {
              provider: "pptoken",
              model: "gpt-5.4-mini",
            },
          },
        } as any,
        timeoutMs: 10_000,
        invokeRouteModel: async ({ attempt }) => {
          attemptedProviders.push(attempt.config.provider);
          if (attempt.config.provider === "pptoken") {
            throw new Error("502 Upstream request failed");
          }
          return JSON.stringify({
            summary: "Recovered on fallback provider.",
            files: [
              {
                path: "/index.html",
                content:
                  "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><h1>CASUX</h1><p>Institutional overview.</p></main><footer>Footer</footer></body></html>",
                type: "text/html",
              },
              { path: "/styles.css", content: "body{font-family:system-ui}", type: "text/css" },
            ],
          });
        },
      });

      const result = await worker.runUnit({
        unitId: "route-home",
        route: "/",
        targetFiles: ["/index.html", "/styles.css"],
        prompt: "Generate home route.",
        context: {},
      });

      expect(result.status).toBe("passed");
      expect(attemptedProviders).toEqual(["pptoken", "pptoken", "pptoken", "aiberm"]);
    } finally {
      process.env.PPTOKEN_API_KEY = previousPptokenKey;
      process.env.AIBERM_API_KEY = previousAibermKey;
      process.env.LLM_PROVIDER_ORDER = previousProviderOrder;
      process.env.SHPITTO_PROVIDER_HEALTH_PATH = previousHealthPath;
    }
  });
});
