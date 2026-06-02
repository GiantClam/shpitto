import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildImmutableGenerationContract } from "./generation-contract.ts";
import { GenerationContractViolationError } from "./contract-violation.ts";
import { runV2RouteUnitRuntime } from "./route-unit-runner.ts";

function buildContract(routes: string[]) {
  return buildImmutableGenerationContract({
    generationLane: "website-generation-mvp",
    websiteSurfaceMode: "content-hub-site",
    promptControlManifest: {
      routes,
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
});
