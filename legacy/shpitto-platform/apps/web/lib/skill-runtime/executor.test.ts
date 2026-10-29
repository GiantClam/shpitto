import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildQaSummaryFromPageRecordsForTesting,
  normalizeGeneratedProjectArtifactPreviewForTesting,
  resolveRuntimeTaskExecutionModeForTesting,
  resolveWebsiteRuntimeSkillForTesting,
  STAGE_SKILL_SCOPES,
  SkillRuntimeExecutor,
} from "./executor";
import { buildLocalDecisionPlan } from "./decision-layer";
import { shouldUseOpenCodeForSkill } from "../opencode-cli";
import { createChatTask, getChatTask } from "../agent/chat-task-store";
import { buildExecutionWorkflowRuntime } from "../agent/workflow-runtime-adapter";
import { buildImmutableGenerationContract } from "./generation-contract";

const runV2RouteUnitRuntimeMock = vi.fn();

vi.mock("./route-unit-runner.ts", async () => {
  const actual = await vi.importActual<typeof import("./route-unit-runner.ts")>("./route-unit-runner.ts");
  return {
    ...actual,
    runV2RouteUnitRuntime: (...args: Parameters<typeof actual.runV2RouteUnitRuntime>) => runV2RouteUnitRuntimeMock(...args),
  };
});

afterEach(() => {
  runV2RouteUnitRuntimeMock.mockReset();
});

describe("executor task mode routing", () => {
  it("routes explicit translation tasks to the translation lane", () => {
    expect(
      resolveRuntimeTaskExecutionModeForTesting({
        workflow_context: {
          executionMode: "translate",
          translateRequested: true,
        },
        messages: [new HumanMessage("Generate locale catalogs for French and Japanese.")],
      } as any),
    ).toBe("translate");
  });

  it("keeps refine requests on the refine lane", () => {
    expect(
      resolveRuntimeTaskExecutionModeForTesting({
        workflow_context: {
          executionMode: "refine",
          refineRequested: true,
        },
        messages: [new HumanMessage("Tighten the hero spacing and change the CTA copy.")],
      } as any),
    ).toBe("refine");
  });

  it("routes explicit blog-detail-fill actions to the refine lane", () => {
    expect(
      resolveRuntimeTaskExecutionModeForTesting({
        workflow_context: {
          executionMode: "refine",
          refineRequested: true,
          skillActionDomain: "blog_detail",
          skillAction: "fill_details",
          refineSkillId: "blog-detail-fill-workflow",
        },
        messages: [new HumanMessage("Fill the missing blog detail pages now and align the slugs.")],
      } as any),
    ).toBe("refine");
  });

  it("gives deploy confirmation precedence when deploy is requested", () => {
    expect(
      resolveRuntimeTaskExecutionModeForTesting({
        workflow_context: {
          executionMode: "translate",
          translateRequested: true,
          deployRequested: true,
        },
        messages: [new HumanMessage("Deploy now")],
      } as any),
    ).toBe("deploy");
  });

  it("preserves enterprise surface-mode validation during refine preview normalization", () => {
    const requirementText = "Replace the placeholder hero visual with a real enterprise image.";
    const decision = buildLocalDecisionPlan({
      workflow_context: {
        executionMode: "refine",
        refineRequested: true,
        websiteSurfaceMode: "corporate-b2b-site",
      },
      messages: [new HumanMessage(requirementText)],
    } as any);

    expect(() =>
      normalizeGeneratedProjectArtifactPreviewForTesting({
        decision,
        requirementText,
        workflowContext: {
          executionMode: "refine",
          refineRequested: true,
          websiteSurfaceMode: "corporate-b2b-site",
        },
        project: {
          projectId: "enterprise-refine-preview",
          staticSite: {
            mode: "skill-direct",
            files: [
              {
                path: "/index.html",
                type: "text/html",
                content: [
                  "<!doctype html>",
                  '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Build Home</title><link rel="stylesheet" href="/styles.css"></head><body>',
                  '  <main>',
                  '    <section class="hero"><div class="hero__grid"><div class="hero__content"><h1>Build Home for enterprise buyers</h1><p>Home route for enterprise sourcing teams evaluating precision-component suppliers with real proof, specifications, and consultation paths.</p></div><div class="media-frame"><div class="ph-img" role="img" aria-label="Placeholder visual"></div></div></div></section>',
                  '    <section><h2>Capabilities</h2><p>Review dimensional fit, supply readiness, and manufacturing consistency for demanding programs.</p></section>',
                  '    <section><h2>Evidence</h2><p>Inspect product evidence, application context, and route-specific proof before making contact.</p></section>',
                  '    <section><h2>Consultation</h2><p>Share the use case, timeline, and specification needs to start a buyer-ready discussion.</p></section>',
                  '  </main>',
                  '  <script src="/script.js" defer></script>',
                  "</body></html>",
                ].join(""),
              },
              {
                path: "/styles.css",
                type: "text/css",
                content: ".media-frame{border:1px solid #ddd}.ph-img{min-height:280px;background:#eee}",
              },
              {
                path: "/script.js",
                type: "text/javascript",
                content: "document.documentElement.dataset.ready='true';",
              },
            ],
          },
        },
      }),
    ).toThrow(/corporate-b2b homepage contract|placeholder media scaffolding|enterprise-hero markup/i);
  });

  it("emits shadow visual evaluation signals for native QA summaries when imported seeds are active", () => {
    const summary = buildQaSummaryFromPageRecordsForTesting({
      records: [
        {
          route: "/",
          score: 92,
          passed: true,
          retries: 0,
          antiSlopIssues: [],
        } as any,
        {
          route: "/products",
          score: 89,
          passed: true,
          retries: 0,
          antiSlopIssues: [],
        } as any,
      ],
      retriesAllowed: 0,
      routeUnits: [
        {
          route: "/",
          routeContract: ["route=/", "seedContract=industrial-b2b-foundation"],
          openingFamily: "commanding intro",
          openingTopology: "proof-led masthead",
        },
        {
          route: "/products",
          routeContract: ["route=/products", "seedContract=precision-catalog-template"],
          openingFamily: "catalog evidence rail",
          openingTopology: "route-owned product matrix",
        },
      ],
      stylesCss: ":root{--bg:#fff;--fg:#111;--surface:#f5f5f5;--muted:#777;--border:#ddd;--accent:#0a6}",
      selectedSeedSkillIds: ["industrial-b2b-foundation", "precision-catalog-template"],
    });

    expect(summary.shadowVisualEvaluation?.score).toBeGreaterThan(0);
    expect(summary.shadowVisualEvaluation?.signals.map((signal) => signal.code)).toEqual(
      expect.arrayContaining(["authoredness", "seed-faithfulness", "opening-non-generic-quality"]),
    );
  });

  it("loads design-system enforcement in styles, page, and repair stages", () => {
    expect(STAGE_SKILL_SCOPES.styles).toContain("design-system-enforcement");
    expect(STAGE_SKILL_SCOPES.page).toContain("design-system-enforcement");
    expect(STAGE_SKILL_SCOPES.repair).toContain("design-system-enforcement");
  });

  it("keeps productized marketing skill requests on the OpenCode default lane", async () => {
    const result = await resolveWebsiteRuntimeSkillForTesting({
      explicitSkillId: "build-marketing-site",
      state: {
        messages: [new HumanMessage("Build a launch-ready marketing site for a developer tool with pricing and contact.")],
        workflow_context: {
          skillId: "build-marketing-site",
          requirementSpec: {
            siteType: "marketing",
            targetAudience: ["developers", "founders"],
            primaryGoal: ["launch-ready website baseline"],
          },
        },
        sitemap: {
          routes: ["/", "/pricing", "/contact"],
        },
      } as any,
    });

    const workflow = (result.state.workflow_context || {}) as any;
    expect(workflow.skillId).toBe("website-generation-workflow");
    expect(result.loadedSkill.id).toBe("marketing-landing-site");
    expect(workflow.executionSkillId).toBe("marketing-landing-site");
    expect(workflow.websiteOrchestratorSkillId).toBe("website-orchestrator");
    expect(workflow.loadedSkillIds).toEqual(
      expect.arrayContaining(["website-generation-workflow", "website-orchestrator"]),
    );
    expect(shouldUseOpenCodeForSkill("build-marketing-site")).toBe(true);
  });

  it("retries route-unit runtime after transient pptoken transport failure and still completes the task", async () => {
    process.env.CHAT_TASKS_USE_SUPABASE = "0";
    const prevWindow = process.env.SHPITTO_MVP_EVENTUAL_RECOVERY_WINDOW_MS;
    const prevBase = process.env.SHPITTO_MVP_EVENTUAL_RECOVERY_BASE_MS;
    process.env.SHPITTO_MVP_EVENTUAL_RECOVERY_WINDOW_MS = "30000";
    process.env.SHPITTO_MVP_EVENTUAL_RECOVERY_BASE_MS = "0";

    const chatId = `executor-route-retry-${Date.now()}`;
    const task = await createChatTask(chatId);
    const generationContract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: {
        routes: ["/"],
        files: ["/index.html", "/styles.css", "/script.js"],
        navLabels: ["Home"],
        pageIntents: [{ route: "/", navLabel: "Home", pageKind: "home", purpose: "Institutional homepage." }],
      },
      discoveryBrief: {
        surfaceMode: "content-hub-site",
        routes: ["/"],
      },
      selectedSeedSkillManifest: {
        selected: [{ id: "content-hub-site", source: "shpitto" }],
      },
    });

    let invocation = 0;
    runV2RouteUnitRuntimeMock.mockImplementation(async (params: any) => {
      invocation += 1;
      if (invocation === 1) {
        throw new Error("route-home: TypeError | fetch failed | Error | ECONNRESET | Client network socket disconnected before secure TLS connection was established");
      }
      const homeHtml = [
        "<!doctype html>",
        "<html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Northstar Labs</title><link rel=\"stylesheet\" href=\"/styles.css\"></head><body>",
        "<header><nav><a href=\"/\">Home</a></nav></header>",
        "<main class=\"collection-home\">",
        "<section class=\"archive-masthead\"><h1>Northstar Labs</h1><p>Northstar Labs publishes operational research, implementation briefs, and evidence-led field notes for teams standardizing delivery across product, support, and systems operations.</p><p>The homepage acts as an editorial index for the current operating model, with clear entry points into governance references, launch playbooks, and working sessions.</p></section>",
        "<section class=\"institutional-context\"><h2>Operating model coverage</h2><p>Review how the team structures intake, change approval, and release accountability so stakeholders can understand where decisions are made and how execution risk is surfaced.</p></section>",
        "<section class=\"resource-shelf\"><h2>Implementation playbooks</h2><p>Each playbook packages rollout sequencing, communication checkpoints, and environment-specific constraints so operators can adapt the guidance without losing institutional consistency.</p></section>",
        "<section class=\"standards-ledger\"><h2>Evidence and standards ledger</h2><p>The standards ledger captures source material, rationale, and review status for every public recommendation, making it easy to trace what changed and which assumptions remain under observation.</p></section>",
        "<section class=\"research-index\"><h2>Working session readiness</h2><p>Use the research index to find decision memos, workshop packs, and implementation notes that prepare cross-functional teams for planning sessions, remediation work, and downstream deployment reviews.</p></section>",
        "</main>",
        "<footer><div class=\"site-footer footer-band\"><div class=\"footer-brand\">Northstar Labs</div><nav class=\"footer-nav\"><a href=\"/\">Home</a></nav><div class=\"footer-meta\"><p>Operational research for institutional delivery teams.</p></div></div></footer><script src=\"/script.js\"></script></body></html>",
      ].join("");
      const project = {
        projectId: chatId,
        pages: [
          {
            path: "/",
            html: homeHtml,
          },
        ],
        staticSite: {
          mode: "route-unit-v2",
          files: [
            {
              path: "/index.html",
              type: "text/html",
              content: homeHtml,
            },
            {
              path: "/styles.css",
              type: "text/css",
              content: [
                ":root{--bg:#f5f1e8;--fg:#161616;--muted:#4f4a45;--accent:#7b4b2a;--surface:#fffaf2;--border:#d8c9b4}",
                "body{margin:0;font-family:Georgia,serif;background:var(--bg);color:var(--fg);line-height:1.65}",
                "header,main,footer{width:min(1100px,calc(100% - 48px));margin:0 auto}",
                ".archive-masthead,.institutional-context,.resource-shelf,.standards-ledger,.research-index{padding:24px 0;border-bottom:1px solid var(--border)}",
                ".site-footer{padding:24px;background:#111;color:#fff}.footer-nav{display:flex;gap:12px}.footer-meta{margin-top:8px}",
              ].join(""),
            },
            { path: "/script.js", type: "text/javascript", content: "document.documentElement.dataset.ready='true';" },
          ],
        },
      };
      return {
        contract: params.contract,
        routeInputs: [],
        project,
        verification: { status: "passed", checkedRoutes: ["/"], routeResults: [] },
        execution: {
          state: {
            ...params.state,
            phase: "end",
            site_artifacts: project,
            project_json: project,
          },
          assistantText: "Generation completed successfully.",
          actions: [],
          pageCount: 1,
          fileCount: 3,
          generatedFiles: ["/index.html", "/styles.css", "/script.js"],
          phase: "end",
          completedPhases: [],
          provider: "pptoken",
          model: "gpt-5.4-mini",
        },
      };
    });

    let nextState: any;
    try {
      await SkillRuntimeExecutor.runTask({
        taskId: task.id,
        chatId,
        workerId: "test-worker",
        inputState: {
          messages: [new HumanMessage("Build an institutional homepage for Northstar Labs.")] as any,
          phase: "conversation",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {
            skillId: "website-generation-workflow",
            sourceRequirement: "Build an institutional homepage for Northstar Labs.",
            canonicalPrompt: "# Canonical Website Generation Prompt\nBuild an institutional homepage for Northstar Labs.",
            promptControlManifest: generationContract.promptControlManifest,
            websiteDiscoveryBrief: generationContract.discoveryBrief,
            generationContract,
            contractHash: generationContract.contractHash,
            generationLane: "website-generation-mvp",
            websiteSurfaceMode: "content-hub-site",
            workflowRuntime: buildExecutionWorkflowRuntime({
              chatId,
              executionMode: "generate",
              contractHash: generationContract.contractHash,
              generationLane: "website-generation-mvp",
              websiteSurfaceMode: "content-hub-site",
              promptConfirmed: true,
            }),
          } as any,
        } as any,
        setSessionState: (state) => {
          nextState = state;
        },
      });

      expect(invocation).toBe(2);
      const completedTask = await getChatTask(task.id);
      expect(completedTask?.status).toBe("succeeded");
      expect(String(completedTask?.result?.progress?.stage || "")).toBe("done");
      expect(String(completedTask?.result?.assistantText || "")).toContain("Generation completed successfully");
      expect(nextState?.workflow_context?.workflowRuntime?.status).toBe("completed");
      const checkpointProjectPath = path.resolve(process.cwd(), ".tmp", "chat-tasks", chatId, task.id, "project.json");
      const persisted = JSON.parse(await fs.readFile(checkpointProjectPath, "utf8"));
      expect(Array.isArray(persisted?.staticSite?.files)).toBe(true);
    } finally {
      if (prevWindow === undefined) delete process.env.SHPITTO_MVP_EVENTUAL_RECOVERY_WINDOW_MS;
      else process.env.SHPITTO_MVP_EVENTUAL_RECOVERY_WINDOW_MS = prevWindow;
      if (prevBase === undefined) delete process.env.SHPITTO_MVP_EVENTUAL_RECOVERY_BASE_MS;
      else process.env.SHPITTO_MVP_EVENTUAL_RECOVERY_BASE_MS = prevBase;
    }
  }, 240000);
});
