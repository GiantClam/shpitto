import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";

import {
  appendReplayGenerationSummaryEntry,
  buildReplayGenerationSummaryEntry,
  captureMobilePreviewScreenshots,
  compareGenerationTraces,
  extractTaskGenerationTrace,
  routeToHtmlPath,
  normalizeRoute,
} from "./chat-replay-live-test-helpers";

describe("chat replay live test helpers", () => {
  it("normalizes routes and converts them to html paths", () => {
    expect(normalizeRoute("blog/")).toBe("/blog");
    expect(routeToHtmlPath("/")).toBe("/index.html");
    expect(routeToHtmlPath("/blog")).toBe("/blog/index.html");
  });

  it("skips screenshot qa cleanly when preview url is missing", async () => {
    const result = await captureMobilePreviewScreenshots({
      previewUrl: "",
      outputDir: path.resolve(process.cwd(), ".tmp", "qa-screenshots", "missing-url"),
    });

    expect(result.executed).toBe(false);
    expect(result.artifacts).toEqual([]);
    expect(result.skippedReason).toMatch(/missing preview url/i);
  });

  it("extracts contract-backed generation trace metadata from a task result", () => {
    const trace = extractTaskGenerationTrace({
      id: "task-123",
      result: {
        internal: {
          inputState: {
            workflow_context: {
              contractHash: "a".repeat(64),
              generationLane: "website-generation-mvp",
              websiteSurfaceMode: "content-hub-site",
              promptControlManifest: { routes: ["/", "/research-center"] },
              selectedSeedSkillManifest: {
                selected: [{ id: "content-hub-site", source: "shpitto" }],
              },
              routeUnitContracts: [
                { route: "/", navLabel: "Home", pageKind: "intent", routeContract: ["route=/"] },
                { route: "/research-center", navLabel: "Research Center", pageKind: "intent", routeContract: ["route=/research-center"] },
              ],
            },
            site_artifacts: {
              staticSite: {
                files: [{ path: "/index.html" }, { path: "/research-center/index.html" }, { path: "/styles.css" }],
              },
            },
          },
        },
      },
    });

    expect(trace.taskId).toBe("task-123");
    expect(trace.contractHash).toBe("a".repeat(64));
    expect(trace.generationLane).toBe("website-generation-mvp");
    expect(trace.websiteSurfaceMode).toBe("content-hub-site");
    expect(trace.routeCount).toBe(2);
    expect(trace.routes).toEqual(["/", "/research-center"]);
    expect(trace.selectedSeedSkillIds).toEqual(["content-hub-site"]);
    expect(trace.promptManifestRoutes).toEqual(["/", "/research-center"]);
    expect(trace.generatedFiles).toEqual(["/index.html", "/research-center/index.html", "/styles.css"]);
  });

  it("compares two generation traces and reports contract drift", () => {
    const baseline = {
      taskId: "task-a",
      contractHash: "a".repeat(64),
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      routeCount: 2,
      routes: ["/", "/research-center"],
      selectedSeedSkillIds: ["content-hub-site"],
      promptManifestRoutes: ["/", "/research-center"],
      generatedFiles: ["/index.html", "/research-center/index.html", "/styles.css"],
    };
    const candidate = {
      ...baseline,
      taskId: "task-b",
    };
    const same = compareGenerationTraces(baseline, candidate);
    expect(same.verdict).toBe("same_contract");
    expect(same.contractHashMatch).toBe(true);
    expect(same.routeSetMatch).toBe(true);

    const drifted = compareGenerationTraces(baseline, {
      ...candidate,
      contractHash: "b".repeat(64),
      websiteSurfaceMode: "docs-knowledge-site",
      routes: ["/"],
      selectedSeedSkillIds: ["docs-knowledge-site"],
      generatedFiles: ["/index.html"],
    });
    expect(drifted.verdict).toBe("drifted");
    expect(drifted.contractHashMatch).toBe(false);
    expect(drifted.websiteSurfaceModeMatch).toBe(false);
    expect(drifted.routeSetMatch).toBe(false);
    expect(drifted.missingRoutes).toEqual(["/research-center"]);
    expect(drifted.missingFiles).toEqual(["/research-center/index.html", "/styles.css"]);

    const crossLane = compareGenerationTraces(
      baseline,
      {
        ...candidate,
        generationLane: "website-generation-mvp",
      },
      { ignoreGenerationLane: true },
    );
    expect(crossLane.verdict).toBe("same_contract");
    expect(crossLane.generationLaneMatch).toBe(true);
  });

  it("writes replay summary entries as jsonl", async () => {
    const outputPath = path.resolve(process.cwd(), ".tmp", "vitest-replay-summary.jsonl");
    await fs.rm(outputPath, { force: true });
    const entry = buildReplayGenerationSummaryEntry({
      sourceChatId: "chat-source",
      replayChatId: "chat-replay",
      replayMode: "local",
      replayScenario: "vbuy-homepage",
      status: "succeeded",
      expectedTrace: {
        taskId: "task-a",
        contractHash: "a".repeat(64),
        generationLane: "website-generation-mvp",
        websiteSurfaceMode: "content-hub-site",
        routeCount: 1,
        routes: ["/"],
        selectedSeedSkillIds: ["content-hub-site"],
        promptManifestRoutes: ["/"],
      },
    });

    const writtenPath = await appendReplayGenerationSummaryEntry(entry, outputPath);
    expect(writtenPath).toBe(outputPath);
    const raw = await fs.readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw.trim());
    expect(parsed.replayMode).toBe("local");
    expect(parsed.replayScenario).toBe("vbuy-homepage");
    expect(parsed.expectedTrace.contractHash).toBe("a".repeat(64));
  });
});
