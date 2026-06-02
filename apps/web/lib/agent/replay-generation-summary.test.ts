import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildReplayGenerationSummaryEntry,
  compareGenerationTraces,
} from "./chat-replay-live-test-helpers";
import {
  evaluateReplayPromotionFamilyGate,
  evaluateReplayPromotionGate,
  formatReplayPromotionGateReport,
  formatReplayGenerationSummaryReport,
  readReplayGenerationSummaryEntries,
  summarizeReplayGenerationEntries,
} from "./replay-generation-summary";

describe("replay generation summary", () => {
  it("reads jsonl entries and groups runs by chat, scenario, and contract hash", async () => {
    const expectedTrace = {
      taskId: "expected-task",
      contractHash: "a".repeat(64),
      generationLane: "legacy",
      websiteSurfaceMode: "content-hub-site",
      routeCount: 2,
      routes: ["/", "/research-center"],
      selectedSeedSkillIds: ["content-hub-site"],
      promptManifestRoutes: ["/", "/research-center"],
    };
    const generatedLegacy = {
      ...expectedTrace,
      taskId: "generated-legacy",
    };
    const generatedMvp = {
      ...expectedTrace,
      taskId: "generated-mvp",
      generationLane: "website-generation-mvp",
    };

    const entries = [
      buildReplayGenerationSummaryEntry({
        sourceChatId: "chat-1",
        replayChatId: "replay-legacy",
        replayMode: "local",
        replayScenario: "casux-fullsite",
        status: "completed",
        expectedTrace,
        generatedTrace: generatedLegacy,
        expectedToGeneratedComparison: compareGenerationTraces(expectedTrace, generatedLegacy),
        updatedAt: "2026-06-01T10:00:00.000Z",
      }),
      buildReplayGenerationSummaryEntry({
        sourceChatId: "chat-1",
        replayChatId: "replay-mvp",
        replayMode: "local",
        replayScenario: "casux-fullsite",
        status: "completed",
        expectedTrace: {
          ...expectedTrace,
          generationLane: "website-generation-mvp",
        },
        generatedTrace: generatedMvp,
        expectedToGeneratedComparison: compareGenerationTraces(
          {
            ...expectedTrace,
            generationLane: "website-generation-mvp",
          },
          generatedMvp,
        ),
        updatedAt: "2026-06-01T10:05:00.000Z",
      }),
    ];

    const summaryPath = path.resolve(process.cwd(), ".tmp", "vitest-replay-generation-summary.jsonl");
    await fs.mkdir(path.dirname(summaryPath), { recursive: true });
    await fs.writeFile(summaryPath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");

    const read = await readReplayGenerationSummaryEntries(summaryPath);
    expect(read.lineCount).toBe(2);
    expect(read.entries).toHaveLength(2);

    const summary = summarizeReplayGenerationEntries(read.entries, read.filePath);
    expect(summary.entryCount).toBe(2);
    expect(summary.groups).toHaveLength(1);
    expect(summary.scenarioFamilyCounts.casux).toBe(2);
    expect(summary.families[0]?.scenarioFamily).toBe("casux");
    expect(summary.laneCounts.legacy).toBe(1);
    expect(summary.laneCounts["website-generation-mvp"]).toBe(1);
    expect(summary.crossLaneComparisonVerdictCounts.same_contract).toBe(1);

    const group = summary.groups[0]!;
    expect(group.replayScenario).toBe("casux-fullsite");
    expect(group.contractHash).toBe("a".repeat(64));
    expect(group.lanes.map((lane) => lane.lane)).toEqual(["legacy", "website-generation-mvp"]);
    expect(group.laneComparisons).toHaveLength(1);
    expect(group.laneComparisons[0]!.verdict).toBe("same_contract");

    const report = formatReplayGenerationSummaryReport(summary);
    expect(report).toContain("Replay Generation Summary");
    expect(report).toContain("casux-fullsite");
    expect(report).toContain("legacy");
    expect(report).toContain("website-generation-mvp");
  });

  it("separates groups when contract hash changes and records drift", () => {
    const entries = [
      buildReplayGenerationSummaryEntry({
        sourceChatId: "chat-2",
        replayChatId: "replay-a",
        replayMode: "live",
        replayScenario: "specific-chat-generate-deploy",
        expectedTrace: {
          taskId: "task-a",
          contractHash: "a".repeat(64),
          generationLane: "legacy",
          websiteSurfaceMode: "content-hub-site",
          routeCount: 1,
          routes: ["/"],
          selectedSeedSkillIds: ["content-hub-site"],
          promptManifestRoutes: ["/"],
        },
        generatedTrace: {
          taskId: "task-a-gen",
          contractHash: "a".repeat(64),
          generationLane: "legacy",
          websiteSurfaceMode: "content-hub-site",
          routeCount: 1,
          routes: ["/"],
          selectedSeedSkillIds: ["content-hub-site"],
          promptManifestRoutes: ["/"],
        },
        expectedToGeneratedComparison: {
          ...compareGenerationTraces(
            {
              taskId: "task-a",
              contractHash: "a".repeat(64),
              generationLane: "legacy",
              websiteSurfaceMode: "content-hub-site",
              routeCount: 1,
              routes: ["/"],
              selectedSeedSkillIds: ["content-hub-site"],
              promptManifestRoutes: ["/"],
            },
            {
              taskId: "task-a-gen",
              contractHash: "a".repeat(64),
              generationLane: "legacy",
              websiteSurfaceMode: "content-hub-site",
              routeCount: 1,
              routes: ["/"],
              selectedSeedSkillIds: ["content-hub-site"],
              promptManifestRoutes: ["/"],
            },
          ),
        },
      }),
      buildReplayGenerationSummaryEntry({
        sourceChatId: "chat-2",
        replayChatId: "replay-b",
        replayMode: "live",
        replayScenario: "specific-chat-generate-deploy",
        expectedTrace: {
          taskId: "task-b",
          contractHash: "b".repeat(64),
          generationLane: "website-generation-mvp",
          websiteSurfaceMode: "docs-knowledge-site",
          routeCount: 1,
          routes: ["/docs"],
          selectedSeedSkillIds: ["docs-knowledge-site"],
          promptManifestRoutes: ["/docs"],
        },
        generatedTrace: {
          taskId: "task-b-gen",
          contractHash: "c".repeat(64),
          generationLane: "website-generation-mvp",
          websiteSurfaceMode: "docs-knowledge-site",
          routeCount: 1,
          routes: ["/docs"],
          selectedSeedSkillIds: ["docs-knowledge-site"],
          promptManifestRoutes: ["/docs"],
        },
        expectedToGeneratedComparison: compareGenerationTraces(
          {
            taskId: "task-b",
            contractHash: "b".repeat(64),
            generationLane: "website-generation-mvp",
            websiteSurfaceMode: "docs-knowledge-site",
            routeCount: 1,
            routes: ["/docs"],
            selectedSeedSkillIds: ["docs-knowledge-site"],
            promptManifestRoutes: ["/docs"],
          },
          {
            taskId: "task-b-gen",
            contractHash: "c".repeat(64),
            generationLane: "website-generation-mvp",
            websiteSurfaceMode: "docs-knowledge-site",
            routeCount: 1,
            routes: ["/docs"],
            selectedSeedSkillIds: ["docs-knowledge-site"],
            promptManifestRoutes: ["/docs"],
          },
        ),
      }),
    ];

    const summary = summarizeReplayGenerationEntries(entries);
    expect(summary.groups).toHaveLength(2);
    expect(summary.expectedToGeneratedVerdictCounts.same_contract).toBe(1);
    expect(summary.expectedToGeneratedVerdictCounts.partial_match).toBe(1);
  });

  it("evaluates a minimal promotion gate from grouped replay evidence", () => {
    const summary = summarizeReplayGenerationEntries([
      buildReplayGenerationSummaryEntry({
        sourceChatId: "chat-3",
        replayChatId: "legacy-run",
        replayMode: "local",
        replayScenario: "casux-fullsite",
        expectedTrace: {
          taskId: "expected-legacy",
          contractHash: "d".repeat(64),
          generationLane: "legacy",
          websiteSurfaceMode: "content-hub-site",
          routeCount: 1,
          routes: ["/"],
          selectedSeedSkillIds: ["content-hub-site"],
          promptManifestRoutes: ["/"],
        },
        generatedTrace: {
          taskId: "generated-legacy",
          contractHash: "d".repeat(64),
          generationLane: "legacy",
          websiteSurfaceMode: "content-hub-site",
          routeCount: 1,
          routes: ["/"],
          selectedSeedSkillIds: ["content-hub-site"],
          promptManifestRoutes: ["/"],
        },
        expectedToGeneratedComparison: compareGenerationTraces(
          {
            taskId: "expected-legacy",
            contractHash: "d".repeat(64),
            generationLane: "legacy",
            websiteSurfaceMode: "content-hub-site",
            routeCount: 1,
            routes: ["/"],
            selectedSeedSkillIds: ["content-hub-site"],
            promptManifestRoutes: ["/"],
          },
          {
            taskId: "generated-legacy",
            contractHash: "d".repeat(64),
            generationLane: "legacy",
            websiteSurfaceMode: "content-hub-site",
            routeCount: 1,
            routes: ["/"],
            selectedSeedSkillIds: ["content-hub-site"],
            promptManifestRoutes: ["/"],
          },
        ),
      }),
      buildReplayGenerationSummaryEntry({
        sourceChatId: "chat-3",
        replayChatId: "mvp-run",
        replayMode: "local",
        replayScenario: "casux-fullsite",
        expectedTrace: {
          taskId: "expected-mvp",
          contractHash: "d".repeat(64),
          generationLane: "website-generation-mvp",
          websiteSurfaceMode: "content-hub-site",
          routeCount: 1,
          routes: ["/"],
          selectedSeedSkillIds: ["content-hub-site"],
          promptManifestRoutes: ["/"],
        },
        generatedTrace: {
          taskId: "generated-mvp",
          contractHash: "d".repeat(64),
          generationLane: "website-generation-mvp",
          websiteSurfaceMode: "content-hub-site",
          routeCount: 1,
          routes: ["/"],
          selectedSeedSkillIds: ["content-hub-site"],
          promptManifestRoutes: ["/"],
        },
        expectedToGeneratedComparison: compareGenerationTraces(
          {
            taskId: "expected-mvp",
            contractHash: "d".repeat(64),
            generationLane: "website-generation-mvp",
            websiteSurfaceMode: "content-hub-site",
            routeCount: 1,
            routes: ["/"],
            selectedSeedSkillIds: ["content-hub-site"],
            promptManifestRoutes: ["/"],
          },
          {
            taskId: "generated-mvp",
            contractHash: "d".repeat(64),
            generationLane: "website-generation-mvp",
            websiteSurfaceMode: "content-hub-site",
            routeCount: 1,
            routes: ["/"],
            selectedSeedSkillIds: ["content-hub-site"],
            promptManifestRoutes: ["/"],
          },
        ),
      }),
    ]);

    const gate = evaluateReplayPromotionGate(summary, { scenario: "casux-fullsite" });
    expect(gate.passed).toBe(true);
    expect(gate.inspectedGroupCount).toBe(1);
    expect(gate.reasons).toEqual([]);
    expect(formatReplayPromotionGateReport(gate)).toContain("Passed: true");
    const familyGate = evaluateReplayPromotionFamilyGate(summary, { scenarioFamily: "casux" });
    expect(familyGate.passed).toBe(true);
    expect(familyGate.groupCount).toBe(1);
  });
});
