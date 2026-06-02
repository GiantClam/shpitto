import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createChatTask, getChatTask } from "../agent/chat-task-store";
import { buildExecutionWorkflowRuntime } from "../agent/workflow-runtime-adapter";
import { SkillRuntimeExecutor } from "./executor";
import { buildImmutableGenerationContract } from "./generation-contract";

function buildRefineBaselineProject() {
  return {
    projectId: "refine-v2-test",
    pages: [
      {
        path: "/",
        html: "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Old Title</title></head><body><header><nav><a href=\"/\">Home</a><a href=\"/about\">About</a></nav></header><main><h1>Old Title</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work.</p><p>The homepage explains how members discover policy references, training pathways, certification programs, and implementation resources across the network.</p></main><footer><a href=\"/\">CASUX</a><a href=\"/about\">About</a><p>Editorial archive and institutional contact pathways.</p></footer></body></html>",
      },
      {
        path: "/about",
        html: "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>About</title></head><body><header><nav><a href=\"/\">Home</a><a href=\"/about\">About</a></nav></header><main><h1>About</h1><p>CASUX maintains institutional programs, policy coordination, and editorial standards for member-facing initiatives.</p><p>Visitors can review mission context, governance notes, and implementation guidance tied to the institutional archive.</p></main><footer><a href=\"/\">CASUX</a><a href=\"/about\">About</a><p>Research archive, standards references, and institutional support.</p></footer></body></html>",
      },
    ],
    staticSite: {
      mode: "skill-direct",
      files: [
        {
          path: "/index.html",
          type: "text/html",
          content:
            "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Old Title</title></head><body><header><nav><a href=\"/\">Home</a><a href=\"/about\">About</a></nav></header><main><h1>Old Title</h1><p>CASUX is the institutional home for standards, research, advocacy, and certification work.</p><p>The homepage explains how members discover policy references, training pathways, certification programs, and implementation resources across the network.</p></main><footer><a href=\"/\">CASUX</a><a href=\"/about\">About</a><p>Editorial archive and institutional contact pathways.</p></footer></body></html>",
        },
        {
          path: "/about/index.html",
          type: "text/html",
          content:
            "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>About</title></head><body><header><nav><a href=\"/\">Home</a><a href=\"/about\">About</a></nav></header><main><h1>About</h1><p>CASUX maintains institutional programs, policy coordination, and editorial standards for member-facing initiatives.</p><p>Visitors can review mission context, governance notes, and implementation guidance tied to the institutional archive.</p></main><footer><a href=\"/\">CASUX</a><a href=\"/about\">About</a><p>Research archive, standards references, and institutional support.</p></footer></body></html>",
        },
        { path: "/styles.css", type: "text/css", content: "body{color:#111}" },
        { path: "/script.js", type: "text/javascript", content: "console.log('ok');" },
      ],
    },
  };
}

describe("SkillRuntimeExecutor refine V2 verifier integration", () => {
  it("runs baseline continuity verification inside the real refine path", async () => {
    process.env.CHAT_TASKS_USE_SUPABASE = "0";
    const chatId = `refine-v2-${Date.now()}`;
    const task = await createChatTask(chatId);
    const projectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-baseline.json`);
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(projectPath, JSON.stringify(buildRefineBaselineProject(), null, 2), "utf8");
    const generationContract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: {
        routes: ["/", "/about"],
        pageIntents: [
          { route: "/", navLabel: "Home", pageKind: "home", purpose: "Institutional homepage." },
          { route: "/about", navLabel: "About", pageKind: "about", purpose: "Institutional overview." },
        ],
      },
      discoveryBrief: {
        surfaceMode: "content-hub-site",
        routes: ["/", "/about"],
      },
      selectedSeedSkillManifest: {
        selected: [{ id: "content-hub-site", source: "shpitto" }],
      },
    });

    let nextState: any;
    await SkillRuntimeExecutor.runTask({
      taskId: task.id,
      chatId,
      workerId: "test-worker",
      inputState: {
        messages: [{ role: "user", content: "Change the title to Refined Title." }] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          skillId: "website-generation-workflow",
          executionMode: "refine",
          refineRequested: true,
          refineScope: "patch",
          deploySourceProjectPath: projectPath,
          refineSourceProjectPath: projectPath,
          checkpointProjectPath: projectPath,
          promptControlManifest: {
            routes: ["/", "/about"],
            files: ["/index.html", "/about/index.html"],
            navLabels: ["Home", "About"],
            pageIntents: [
              { route: "/", navLabel: "Home", pageKind: "home", purpose: "Institutional homepage." },
              { route: "/about", navLabel: "About", pageKind: "about", purpose: "Institutional overview." },
            ],
          },
          websiteDiscoveryBrief: {
            surfaceMode: "content-hub-site",
            routes: ["/", "/about"],
          },
          generationContract,
          contractHash: generationContract.contractHash,
          generationLane: "website-generation-mvp",
          websiteSurfaceMode: "content-hub-site",
          workflowRuntime: buildExecutionWorkflowRuntime({
            chatId,
            executionMode: "refine",
            contractHash: generationContract.contractHash,
            generationLane: "website-generation-mvp",
            websiteSurfaceMode: "content-hub-site",
          }),
        } as any,
      } as any,
      setSessionState: (state) => {
        nextState = state;
      },
    });

    const checkpointRoot = path.resolve(process.cwd(), ".tmp", "chat-tasks", chatId, task.id);
    const verification = JSON.parse(
      await fs.readFile(path.join(checkpointRoot, "workflow", "refine_verification.json"), "utf8"),
    );
    expect(verification.status).toBe("passed");
    expect(nextState?.workflow_context?.workflowRuntime?.status).toBe("completed");
    const completedTask = await getChatTask(task.id);
    expect(completedTask?.result?.error).toBeUndefined();
    expect(String(completedTask?.result?.progress?.stage || "")).toBe("refined");
  }, 240_000);
});
