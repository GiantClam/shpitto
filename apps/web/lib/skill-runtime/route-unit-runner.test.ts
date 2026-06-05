import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildImmutableGenerationContract } from "./generation-contract.ts";
import { GenerationContractViolationError } from "./contract-violation.ts";
import { createStaticGenerationWorkerAdapter } from "./generation-worker-adapter.ts";
import { runV2RouteUnitRuntime } from "./route-unit-runner.ts";

function buildContract(routes: string[], localeMode?: string) {
  return buildImmutableGenerationContract({
    generationLane: "website-generation-mvp",
    websiteSurfaceMode: "content-hub-site",
    promptControlManifest: {
      routes,
      ...(localeMode ? { localeMode } : {}),
      pageIntents: routes.map((route) => ({
        route,
        navLabel: route === "/" ? "Home" : "Research Center",
        pageKind: route === "/" ? "home" : "content-collection-index",
        purpose: route === "/" ? "Institutional homepage." : "Research library.",
      })),
    },
    discoveryBrief: {
      surfaceMode: "content-hub-site",
      routes,
      ...(localeMode ? { localeMode } : {}),
    },
    selectedSeedSkillManifest: {
      selected: [{ id: "content-hub-site", source: "shpitto" }],
    },
  });
}

describe("route unit runner", () => {
  it("persists contract and route checkpoints for a passing runtime", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-runner-pass");
    await fs.rm(checkpointDir, { recursive: true, force: true });
    const contract = buildContract(["/", "/research-center"]);
    const result = await runV2RouteUnitRuntime({
      state: { workflow_context: {} } as any,
      timeoutMs: 1000,
      checkpointDir,
      contract,
      generate: async () => ({
        state: {
          site_artifacts: {
            staticSite: {
              files: [
                {
                  path: "/index.html",
                  content:
                    "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, and collaboration pathways.</p></main><footer>Footer</footer></body></html>",
                },
                {
                  path: "/research-center/index.html",
                  content:
                    "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>Research Center</h1><p>The research center curates studies, standards resources, and evidence-backed materials for policy, implementation, and training teams.</p></main><footer>Footer</footer></body></html>",
                },
                { path: "/styles.css", content: "body{font-family:system-ui}" },
                { path: "/script.js", content: "console.log('ready')" },
              ],
            },
          },
        } as any,
        assistantText: "",
        actions: [],
        pageCount: 2,
        fileCount: 4,
        generatedFiles: ["/index.html", "/research-center/index.html", "/styles.css", "/script.js"],
        phase: "completed",
        completedPhases: [],
      }),
    });

    expect(result.verification.status).toBe("passed");
    const files = await fs.readdir(checkpointDir);
    expect(files).toContain("generation-contract.json");
    expect(files).toContain("generation-verification.json");
    expect(files).toContain("route-home.input.json");
    expect(files).toContain("route-home.verification.json");
  });

  it("throws a contract violation error when route verification fails", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-runner-fail");
    await fs.rm(checkpointDir, { recursive: true, force: true });
    const contract = buildContract(["/"]);

    await expect(
      runV2RouteUnitRuntime({
        state: { workflow_context: {} } as any,
        timeoutMs: 1000,
        checkpointDir,
        contract,
        generate: async () => ({
          state: {
            site_artifacts: {
              staticSite: {
                files: [
                  {
                    path: "/index.html",
                    content:
                      "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><h1>CASUX</h1><p>This gateway is the entry point and route map for understanding how the site is organized.</p></main><footer>Footer</footer></body></html>",
                  },
                  { path: "/styles.css", content: "body{font-family:system-ui}" },
                  { path: "/script.js", content: "console.log('ready')" },
                ],
              },
            },
          } as any,
          assistantText: "",
          actions: [],
          pageCount: 1,
          fileCount: 3,
          generatedFiles: ["/index.html", "/styles.css", "/script.js"],
          phase: "completed",
          completedPhases: [],
        }),
      }),
    ).rejects.toBeInstanceOf(GenerationContractViolationError);

    const written = JSON.parse(await fs.readFile(path.join(checkpointDir, "generation-verification.json"), "utf8"));
    expect(written.status).toBe("contract_violation");
    expect(written.violationCode).toBe("homepage_semantic_mismatch");
  });

  it("reuses a passed checkpoint when the contract hash matches", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-runner-resume");
    await fs.rm(checkpointDir, { recursive: true, force: true });
    const contract = buildContract(["/", "/research-center"]);
    let invocationCount = 0;
    const generate = async () => {
      invocationCount += 1;
      return {
        state: {
          site_artifacts: {
            staticSite: {
              files: [
                {
                  path: "/index.html",
                  content:
                    "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, and collaboration pathways.</p></main><footer>Footer</footer></body></html>",
                },
                {
                  path: "/research-center/index.html",
                  content:
                    "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>Research Center</h1><p>The research center curates studies, standards resources, and evidence-backed materials for policy, implementation, and training teams.</p></main><footer>Footer</footer></body></html>",
                },
                { path: "/styles.css", content: "body{font-family:system-ui}" },
                { path: "/script.js", content: "console.log('ready')" },
              ],
            },
          },
        } as any,
        assistantText: "",
        actions: [],
        pageCount: 2,
        fileCount: 4,
        generatedFiles: ["/index.html", "/research-center/index.html", "/styles.css", "/script.js"],
        phase: "completed",
        completedPhases: [],
      };
    };

    const first = await runV2RouteUnitRuntime({
      state: { workflow_context: {} } as any,
      timeoutMs: 1000,
      checkpointDir,
      contract,
      generate,
    });
    const second = await runV2RouteUnitRuntime({
      state: { workflow_context: {} } as any,
      timeoutMs: 1000,
      checkpointDir,
      contract,
      generate,
    });

    expect(first.verification.status).toBe("passed");
    expect(second.verification.status).toBe("passed");
    expect(invocationCount).toBe(1);
  });

  it("re-prompts locale-shell repairs with strict shared i18n guidance for the homepage", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-runner-bilingual-repair");
    await fs.rm(checkpointDir, { recursive: true, force: true });
    const contract = buildContract(["/"], "bilingual");
    const seenPrompts: string[] = [];
    let invocationCount = 0;
    const unitWorker = createStaticGenerationWorkerAdapter({
      id: "test-bilingual-repair",
      capabilities: ["route-unit"],
      runUnit: async (input) => {
        invocationCount += 1;
        seenPrompts.push(input.prompt);
        if (invocationCount === 1) {
          return {
            unitId: input.unitId,
            status: "passed",
            files: [
              {
                path: "/index.html",
                content:
                  "<!doctype html><html lang=\"zh-CN\" data-locale=\"zh-CN\"><body><header><a href=\"/\">CASUX</a><nav><a href=\"/\">Home</a></nav><div class=\"locale-switch\"><button type=\"button\" data-locale-toggle data-locale=\"zh-CN\">中文</button><button type=\"button\" data-locale-toggle data-locale=\"en\">EN</button></div></header><main><h1><span class=\"t-zh\">CASUX</span><span class=\"t-en\">CASUX</span></h1><p><span class=\"t-zh\">官方机构概览。</span><span class=\"t-en\">Official institutional overview.</span></p><img src=\"hero.jpg\" alt=\"中文图像\" data-alt-zh=\"中文图像\" data-alt-en=\"English image\"><footer><p><span class=\"t-zh\">页脚摘要。</span><span class=\"t-en\">Footer summary.</span></p></footer></main></body></html>",
                type: "text/html",
              },
              { path: "/styles.css", content: "body{font-family:system-ui}", type: "text/css" },
              { path: "/script.js", content: "console.log('ready')", type: "application/javascript" },
              { path: "/i18n/messages.en.json", content: "{\"hero.title\":\"CASUX\"}", type: "application/json" },
              { path: "/i18n/messages.zh-CN.json", content: "{\"hero.title\":\"CASUX\"}", type: "application/json" },
            ],
          };
        }

        expect(input.prompt).toContain("Repair this route unit to satisfy the verifier.");
        expect(input.prompt).toContain("Keep exactly one visible language at a time");
        expect(input.prompt).toContain("`.t-zh` / `.t-en`");
        expect(input.prompt).toContain("`data-alt-zh`, `data-alt-en`, `data-zh`, or `data-en`");
        expect(input.prompt).toContain("Use `data-i18n-attr`");
        return {
          unitId: input.unitId,
          status: "passed",
          files: [
            {
              path: "/index.html",
              content:
                "<!doctype html><html lang=\"zh-CN\" data-locale=\"zh-CN\"><body><header><a href=\"/\">CASUX</a><nav><a href=\"/\" data-i18n=\"nav.home\">首页</a></nav><div class=\"locale-switch\"><button type=\"button\" data-locale-toggle data-locale=\"zh-CN\" data-i18n=\"locale.zh\">中文</button><button type=\"button\" data-locale-toggle data-locale=\"en\" data-i18n=\"locale.en\">English</button></div></header><main><h1 data-i18n=\"hero.title\">CASUX 官方机构概览</h1><p data-i18n=\"hero.lead\">CASUX provides an institutional overview with one active locale at a time and stable i18n markers for the shared shell.</p><img src=\"hero.jpg\" alt=\"温暖明亮的儿童友好学习空间\" data-i18n=\"hero.imageAlt\" data-i18n-attr=\"alt\"><footer><p data-i18n=\"footer.summary\">Footer summary for institutional visitors and partners.</p></footer></main></body></html>",
              type: "text/html",
            },
            { path: "/styles.css", content: "body{font-family:system-ui}", type: "text/css" },
            { path: "/script.js", content: "console.log('ready')", type: "application/javascript" },
            {
              path: "/i18n/messages.en.json",
              content:
                "{\"nav.home\":\"Home\",\"locale.zh\":\"Chinese\",\"locale.en\":\"English\",\"hero.title\":\"CASUX official institutional overview\",\"hero.lead\":\"CASUX provides an institutional overview with one active locale at a time and stable i18n markers for the shared shell.\",\"hero.imageAlt\":\"A warm, bright child-friendly learning space\",\"footer.summary\":\"Footer summary for institutional visitors and partners.\"}",
              type: "application/json",
            },
            {
              path: "/i18n/messages.zh-CN.json",
              content:
                "{\"nav.home\":\"首页\",\"locale.zh\":\"中文\",\"locale.en\":\"English\",\"hero.title\":\"CASUX 官方机构概览\",\"hero.lead\":\"CASUX 以单一可见语言和稳定 i18n 标记提供机构概览。\",\"hero.imageAlt\":\"温暖明亮的儿童友好学习空间\",\"footer.summary\":\"面向机构访客与合作伙伴的页脚摘要。\"}",
              type: "application/json",
            },
          ],
        };
      },
    });

    const result = await runV2RouteUnitRuntime({
      state: { workflow_context: {} } as any,
      timeoutMs: 1000,
      checkpointDir,
      contract,
      unitWorker,
    });

    expect(result.verification.status).toBe("passed");
    expect(invocationCount).toBe(2);
    expect(seenPrompts).toHaveLength(2);
  });

  it("recovers missing passed route artifacts from prior route checkpoints instead of requiring a full rerun", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-runner-partial-recovery");
    await fs.rm(checkpointDir, { recursive: true, force: true });
    const contract = buildContract(["/", "/research-center"]);
    let invocationCount = 0;
    const first = await runV2RouteUnitRuntime({
      state: { workflow_context: {} } as any,
      timeoutMs: 1000,
      checkpointDir,
      contract,
      generate: async () => {
        invocationCount += 1;
        return {
          state: {
            site_artifacts: {
              staticSite: {
                files: [
                  {
                    path: "/index.html",
                    content:
                      "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, and collaboration pathways.</p></main><footer>Footer</footer></body></html>",
                  },
                  {
                    path: "/research-center/index.html",
                    content:
                      "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>Research Center</h1><p>The research center curates studies, standards resources, and evidence-backed materials for policy, implementation, and training teams.</p></main><footer>Footer</footer></body></html>",
                  },
                  { path: "/styles.css", content: "body{font-family:system-ui}" },
                  { path: "/script.js", content: "console.log('ready')" },
                ],
              },
            },
          } as any,
          assistantText: "",
          actions: [],
          pageCount: 2,
          fileCount: 4,
          generatedFiles: ["/index.html", "/research-center/index.html", "/styles.css", "/script.js"],
          phase: "completed",
          completedPhases: [],
        };
      },
    });

    const second = await runV2RouteUnitRuntime({
      state: { workflow_context: {} } as any,
      timeoutMs: 1000,
      checkpointDir,
      contract,
      resumeFromCheckpoint: false,
      generate: async () => {
        invocationCount += 1;
        return {
          state: {
            site_artifacts: {
              staticSite: {
                files: [
                  {
                    path: "/index.html",
                    content:
                      "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, and collaboration pathways.</p></main><footer>Footer</footer></body></html>",
                  },
                  { path: "/styles.css", content: "body{font-family:system-ui}" },
                  { path: "/script.js", content: "console.log('ready')" },
                ],
              },
            },
          } as any,
          assistantText: "",
          actions: [],
          pageCount: 1,
          fileCount: 3,
          generatedFiles: ["/index.html", "/styles.css", "/script.js"],
          phase: "completed",
          completedPhases: [],
        };
      },
    });

    expect(first.verification.status).toBe("passed");
    expect(second.verification.status).toBe("passed");
    expect(invocationCount).toBe(2);
    const recoveredFiles = Array.isArray(second.project?.staticSite?.files) ? second.project.staticSite.files : [];
    expect(recoveredFiles.some((file: any) => file.path === "/research-center/index.html")).toBe(true);
  });

  it("reruns only the missing route units when prior route checkpoints are incomplete", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-runner-unit-worker-recovery");
    await fs.rm(checkpointDir, { recursive: true, force: true });
    const contract = buildContract(["/", "/research-center"]);
    const first = await runV2RouteUnitRuntime({
      state: { workflow_context: {} } as any,
      timeoutMs: 1000,
      checkpointDir,
      contract,
      unitWorker: {
        id: "test-route-unit-worker",
        capabilities: ["route-unit"],
        runUnit: async (input) => ({
          unitId: input.unitId,
          status: "passed",
          files: input.targetFiles.map((target) => ({
            path: target,
            content:
              target === "/index.html"
                ? "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, and collaboration pathways.</p></main><footer>Footer</footer></body></html>"
                : target === "/research-center/index.html"
                  ? "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>Research Center</h1><p>The research center curates studies, standards resources, and evidence-backed materials for policy, implementation, and training teams.</p></main><footer>Footer</footer></body></html>"
                  : "body{font-family:system-ui}",
            type: target.endsWith(".html") ? "text/html" : "text/css",
          })),
        }),
      },
    });

    expect(first.verification.status).toBe("passed");

    const generatedProjectPath = path.join(checkpointDir, "generated-project.json");
    const generatedProject = JSON.parse(await fs.readFile(generatedProjectPath, "utf8"));
    generatedProject.staticSite.files = generatedProject.staticSite.files.filter(
      (file: any) => file.path !== "/research-center/index.html",
    );
    generatedProject.pages = generatedProject.pages.filter((page: any) => page.path !== "/research-center");
    await fs.writeFile(generatedProjectPath, JSON.stringify(generatedProject, null, 2), "utf8");
    await fs.rm(path.join(checkpointDir, "route-research-center.verification.json"), { force: true });

    let rerunUnits = 0;
    const second = await runV2RouteUnitRuntime({
      state: { workflow_context: {} } as any,
      timeoutMs: 1000,
      checkpointDir,
      contract,
      resumeFromCheckpoint: false,
      unitWorker: {
        id: "test-route-unit-worker",
        capabilities: ["route-unit"],
        runUnit: async (input) => {
          rerunUnits += 1;
          expect(input.route).toBe("/research-center");
          return {
            unitId: input.unitId,
            status: "passed",
            files: input.targetFiles.map((target) => ({
              path: target,
              content:
                target === "/research-center/index.html"
                  ? "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>Research Center</h1><p>The research center curates studies, standards resources, and evidence-backed materials for policy, implementation, and training teams.</p></main><footer>Footer</footer></body></html>"
                  : "body{font-family:system-ui}",
              type: target.endsWith(".html") ? "text/html" : "text/css",
            })),
          };
        },
      },
    });

    expect(second.verification.status).toBe("passed");
    expect(rerunUnits).toBe(1);
  });

  it("preserves verifier-approved routes across transient worker failure and reruns only the failed route", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-runner-transient-worker-failure");
    await fs.rm(checkpointDir, { recursive: true, force: true });
    const contract = buildContract(["/", "/research-center"]);

    await expect(
      runV2RouteUnitRuntime({
        state: { workflow_context: {} } as any,
        timeoutMs: 1000,
        checkpointDir,
        contract,
        unitWorker: {
          id: "test-route-unit-worker",
          capabilities: ["route-unit"],
          runUnit: async (input) => {
            if (input.route === "/research-center") {
              throw new Error("502 Bad Gateway from pptoken");
            }
            return {
              unitId: input.unitId,
              status: "passed",
              files: input.targetFiles.map((target) => ({
                path: target,
                content:
                  target === "/index.html"
                    ? "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, and collaboration pathways.</p></main><footer>Footer</footer></body></html>"
                    : target.endsWith(".css")
                      ? "body{font-family:system-ui}"
                      : "console.log('ready')",
                type: target.endsWith(".html")
                  ? "text/html"
                  : target.endsWith(".css")
                    ? "text/css"
                    : "application/javascript",
              })),
            };
          },
        },
      }),
    ).rejects.toThrow(/502 Bad Gateway/i);

    const savedHomeRecord = JSON.parse(
      await fs.readFile(path.join(checkpointDir, "route-home.verification.json"), "utf8"),
    );
    expect(savedHomeRecord.status).toBe("passed");
    const savedProject = JSON.parse(await fs.readFile(path.join(checkpointDir, "generated-project.json"), "utf8"));
    expect(savedProject.staticSite.files.some((file: any) => file.path === "/index.html")).toBe(true);
    expect(savedProject.staticSite.files.some((file: any) => file.path === "/research-center/index.html")).toBe(false);

    const rerunRoutes: string[] = [];
    const rerun = await runV2RouteUnitRuntime({
      state: { workflow_context: {} } as any,
      timeoutMs: 1000,
      checkpointDir,
      contract,
      unitWorker: {
        id: "test-route-unit-worker",
        capabilities: ["route-unit"],
        runUnit: async (input) => {
          rerunRoutes.push(String(input.route || ""));
          return {
            unitId: input.unitId,
            status: "passed",
            files: input.targetFiles.map((target) => ({
              path: target,
              content:
                target === "/research-center/index.html"
                  ? "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>Research Center</h1><p>The research center curates studies, standards resources, and evidence-backed materials for policy, implementation, and training teams.</p></main><footer>Footer</footer></body></html>"
                  : target.endsWith(".css")
                    ? "body{font-family:system-ui}"
                    : "console.log('ready')",
              type: target.endsWith(".html")
                ? "text/html"
                : target.endsWith(".css")
                  ? "text/css"
                  : "application/javascript",
            })),
          };
        },
      },
    });

    expect(rerun.verification.status).toBe("passed");
    expect(rerunRoutes).toEqual(["/research-center"]);
  });

  it("applies verifier-guided route repair before failing the runtime", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-runner-verifier-repair");
    await fs.rm(checkpointDir, { recursive: true, force: true });
    const contract = buildContract(["/"]);
    contract.routeUnitContracts = contract.routeUnitContracts.map((item) => ({
      ...item,
      openingFamily: "homepage",
      openingTopology:
        "brand-led institutional masthead -> capability overview shelves -> standards/research proof band -> consultation or route CTA",
    }));
    let attempts = 0;

    const result = await runV2RouteUnitRuntime({
      state: { workflow_context: {} } as any,
      timeoutMs: 1000,
      checkpointDir,
      contract,
      unitWorker: {
        id: "test-route-unit-worker",
        capabilities: ["route-unit"],
        runUnit: async (input) => {
          attempts += 1;
          const isRepair = Array.isArray((input.context as any)?.repairHints);
          return {
            unitId: input.unitId,
            status: "passed",
            files: input.targetFiles.map((target) => ({
              path: target,
              content:
                target === "/index.html"
                  ? isRepair
                    ? "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><section class=\"institutional-masthead\"><p>CASUX official homepage overview.</p><h1>CASUX institution overview</h1><p>CASUX explains public standards, research, advocacy, certification, and consultation routes in one institution-led homepage for education operators, research partners, and institutional buyers. The opening states the public scope, governance purpose, evidence pathways, and collaboration context before readers move into deeper route shelves and proof sections. It frames the homepage as the official institutional summary and clarifies why the program exists, how it supports public understanding, and which capabilities matter for evaluation.</p></section><section><h2>Capability overview</h2><p>Overview shelves and proof bands clarify the public scope before visitors continue deeper into standards, research, certification, advocacy, and consultation guidance with enough concrete detail to feel substantial. The capability shelf summarizes creation, construction, certification, advocacy, research, and information services so the first screen can hand off to later bands without collapsing into a generic split hero.</p></section></main><footer>Footer</footer></body></html>"
                    : "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><section class=\"masthead\"><div class=\"hero-grid\"><h1>CASUX</h1><p>Institution overview for standards, research, advocacy, certification, and consultation. This draft still uses a generic split hero even though the page is supposed to read like an official institution-led homepage overview with clear public value, capability sequencing, and proof structure for education operators, research partners, and institutional buyers.</p></div></section><section><p>Additional context exists here only to ensure the verifier evaluates topology rather than a short-copy failure.</p></section></main><footer>Footer</footer></body></html>"
                  : target === "/styles.css"
                    ? "body{font-family:system-ui}"
                    : "console.log('ready')",
              type: target.endsWith(".html")
                ? "text/html"
                : target.endsWith(".css")
                  ? "text/css"
                  : "application/javascript",
            })),
          };
        },
      },
    });

    expect(result.verification.status).toBe("passed");
    expect(attempts).toBe(2);
  });

  it("reuses recovered checkpoint site artifacts when generated-project.json is empty", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-runner-recover-site-materialization");
    await fs.rm(checkpointDir, { recursive: true, force: true });
    const contract = buildContract(["/", "/research-center"]);

    const first = await runV2RouteUnitRuntime({
      state: { workflow_context: {} } as any,
      timeoutMs: 1000,
      checkpointDir,
      contract,
      unitWorker: {
        id: "test-route-unit-worker",
        capabilities: ["route-unit"],
        runUnit: async (input) => ({
          unitId: input.unitId,
          status: "passed",
          files: input.targetFiles.map((target) => ({
            path: target,
            content:
              target === "/index.html"
                ? "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, and collaboration pathways.</p></main><footer>Footer</footer></body></html>"
                : target === "/research-center/index.html"
                  ? "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>Research Center</h1><p>The research center curates studies, standards resources, and evidence-backed materials for policy, implementation, and training teams.</p></main><footer>Footer</footer></body></html>"
                  : target.endsWith(".css")
                    ? "body{font-family:system-ui}"
                    : "console.log('ready')",
            type: target.endsWith(".html")
              ? "text/html"
              : target.endsWith(".css")
                ? "text/css"
                : "application/javascript",
          })),
        }),
      },
    });

    expect(first.verification.status).toBe("passed");

    await fs.mkdir(path.join(checkpointDir, "site", "research-center"), { recursive: true });
    await fs.writeFile(
      path.join(checkpointDir, "site", "index.html"),
      "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>CASUX</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work that helps members discover trusted programs, reference materials, and collaboration pathways.</p></main><footer>Footer</footer></body></html>",
      "utf8",
    );
    await fs.writeFile(
      path.join(checkpointDir, "site", "research-center", "index.html"),
      "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research-center\">Research Center</a></nav></header><main><h1>Research Center</h1><p>The research center curates studies, standards resources, and evidence-backed materials for policy, implementation, and training teams.</p></main><footer>Footer</footer></body></html>",
      "utf8",
    );
    await fs.writeFile(path.join(checkpointDir, "site", "styles.css"), "body{font-family:system-ui}", "utf8");
    await fs.writeFile(path.join(checkpointDir, "site", "script.js"), "console.log('ready')", "utf8");
    await fs.writeFile(
      path.join(checkpointDir, "generated-project.json"),
      JSON.stringify({ projectId: "empty", pages: [], staticSite: { mode: "route-unit-v2", files: [] } }, null, 2),
      "utf8",
    );

    let rerunUnits = 0;
    const second = await runV2RouteUnitRuntime({
      state: { workflow_context: {} } as any,
      timeoutMs: 1000,
      checkpointDir,
      contract,
      unitWorker: {
        id: "test-route-unit-worker",
        capabilities: ["route-unit"],
        runUnit: async () => {
          rerunUnits += 1;
          throw new Error("should not rerun when recovered checkpoint site artifacts are available");
        },
      },
    });

    expect(second.verification.status).toBe("passed");
    expect(rerunUnits).toBe(0);
    expect(second.project?.staticSite?.files.some((file: any) => file.path === "/research-center/index.html")).toBe(true);
  });

  it("lets bilingual interior route units extend shared locale catalogs without overwriting earlier keys", async () => {
    const checkpointDir = path.resolve(process.cwd(), ".tmp", "route-unit-runner-bilingual-catalog-merge");
    await fs.rm(checkpointDir, { recursive: true, force: true });
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

    const result = await runV2RouteUnitRuntime({
      state: { workflow_context: {} } as any,
      timeoutMs: 1000,
      checkpointDir,
      contract,
      unitWorker: {
        id: "test-route-unit-worker",
        capabilities: ["route-unit"],
        runUnit: async (input) => {
          if (input.route === "/") {
            return {
              unitId: input.unitId,
              status: "passed",
              files: [
                {
                  path: "/index.html",
                  content:
                    "<!doctype html><html lang='zh-CN' data-locale='zh-CN'><body><header><nav><a href='/' data-i18n='nav.home'>首页</a><a href='/research-center' data-i18n='nav.research'>研究</a></nav><button type='button' data-locale-switch aria-label='切换至英文'>EN</button></header><main><h1 data-i18n='home.title'>CASUX institution overview</h1><p data-i18n='home.lead'>CASUX presents an institutional overview with standards, research, and public-information guidance for child-friendly space operators.</p><p data-i18n='home.support'>The homepage keeps one active locale at a time while shared shell and proof copy remain translatable through shared message catalogs.</p></main><footer><p data-i18n='footer.summary'>Footer summary for institutional visitors.</p></footer></body></html>",
                  type: "text/html",
                },
                { path: "/styles.css", content: "body{font-family:system-ui}.locale-switch{display:inline-flex}", type: "text/css" },
                { path: "/script.js", content: "document.querySelector('[data-locale-switch]');", type: "application/javascript" },
                {
                  path: "/i18n/messages.en.json",
                  content: JSON.stringify({
                    nav: { home: "Home", research: "Research" },
                    home: {
                      title: "CASUX institution overview",
                      lead: "CASUX presents an institutional overview with standards, research, and public-information guidance for child-friendly space operators.",
                      support:
                        "The homepage keeps one active locale at a time while shared shell and proof copy remain translatable through shared message catalogs.",
                    },
                    footer: { summary: "Footer summary for institutional visitors." },
                  }),
                  type: "application/json",
                },
                {
                  path: "/i18n/messages.zh-CN.json",
                  content: JSON.stringify({
                    nav: { home: "首页", research: "研究" },
                    home: {
                      title: "CASUX 机构概览",
                      lead: "CASUX 为儿童友好空间运营方提供关于标准、研究与公共信息的机构级概览。",
                      support: "首页一次只显示一种语言，但共享壳与证明性文案仍通过共享消息目录完成切换。",
                    },
                    footer: { summary: "面向机构访客的页脚摘要。" },
                  }),
                  type: "application/json",
                },
              ],
            };
          }

          expect(input.targetFiles).toEqual(
            expect.arrayContaining([
              "/research-center/index.html",
              "/i18n/messages.en.json",
              "/i18n/messages.zh-CN.json",
            ]),
          );
          return {
            unitId: input.unitId,
            status: "passed",
            files: [
              {
                path: "/research-center/index.html",
                content:
                  "<!doctype html><html lang='zh-CN' data-locale='zh-CN'><body><header><nav><a href='/' data-i18n='nav.home'>首页</a><a href='/research-center' data-i18n='nav.research'>研究</a></nav><button type='button' data-locale-switch aria-label='切换至英文'>EN</button></header><main><h1 data-i18n='research.title'>Research Center</h1><p data-i18n='research.lead'>The research center curates evidence, studies, and public-facing resources for institutional partners and implementation teams.</p><p data-i18n='research.support'>Its route-specific content adds new bilingual keys without rewriting the shared shell catalogs from the homepage.</p></main><footer><p data-i18n='footer.summary'>Footer summary for institutional visitors.</p></footer></body></html>",
                type: "text/html",
              },
              {
                path: "/i18n/messages.en.json",
                content: JSON.stringify({
                  research: {
                    title: "Research Center",
                    lead:
                      "The research center curates evidence, studies, and public-facing resources for institutional partners and implementation teams.",
                    support:
                      "Its route-specific content adds new bilingual keys without rewriting the shared shell catalogs from the homepage.",
                  },
                }),
                type: "application/json",
              },
              {
                path: "/i18n/messages.zh-CN.json",
                content: JSON.stringify({
                  research: {
                    title: "研究中心",
                    lead: "研究中心为机构伙伴与实施团队整理证据、研究成果与公共资源。",
                    support: "它的路由专属内容会增量补充双语键，而不会重写首页已经建立的共享壳目录。",
                  },
                }),
                type: "application/json",
              },
            ],
          };
        },
      },
    });

    expect(result.verification.status).toBe("passed");
    const files = Array.isArray(result.project?.staticSite?.files) ? result.project.staticSite.files : [];
    const enCatalog = JSON.parse(String(files.find((file: any) => file.path === "/i18n/messages.en.json")?.content || "{}"));
    const zhCatalog = JSON.parse(String(files.find((file: any) => file.path === "/i18n/messages.zh-CN.json")?.content || "{}"));
    expect(enCatalog.nav?.home).toBe("Home");
    expect(enCatalog.research?.title).toBe("Research Center");
    expect(zhCatalog.nav?.home).toBe("首页");
    expect(zhCatalog.research?.title).toBe("研究中心");
  });
});
