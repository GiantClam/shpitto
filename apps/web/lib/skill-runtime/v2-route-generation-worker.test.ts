import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

import { createSkillToolRouteUnitGenerationWorker } from "./v2-route-generation-worker.ts";

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

  it("falls through to the next provider when a provider returns malformed or incomplete route-unit output", async () => {
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
      expect(attemptedProviders).toEqual(["pptoken", "aiberm"]);
      expect(result.files.map((file) => file.path)).toEqual(["/index.html", "/styles.css"]);
    } finally {
      process.env.PPTOKEN_API_KEY = previousPptokenKey;
      process.env.AIBERM_API_KEY = previousAibermKey;
      process.env.LLM_PROVIDER_ORDER = previousProviderOrder;
      process.env.SHPITTO_PROVIDER_HEALTH_PATH = previousHealthPath;
    }
  });

  it("falls through to the next provider when the provider stack throws an undefined-message TypeError", async () => {
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
      expect(attemptedProviders).toEqual(["pptoken", "aiberm"]);
      expect(result.files.map((file) => file.path)).toEqual(["/index.html", "/styles.css"]);
    } finally {
      process.env.PPTOKEN_API_KEY = previousPptokenKey;
      process.env.AIBERM_API_KEY = previousAibermKey;
      process.env.LLM_PROVIDER_ORDER = previousProviderOrder;
      process.env.SHPITTO_PROVIDER_HEALTH_PATH = previousHealthPath;
    }
  });
});
