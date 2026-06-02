import fs from "node:fs/promises";
import path from "node:path";

import {
  compareGenerationTraces,
  type GenerationTraceLike,
  type ReplayGenerationSummaryEntry,
} from "./chat-replay-live-test-helpers.ts";

type GenerationTraceComparisonVerdict = "same_contract" | "partial_match" | "drifted" | "missing";

export type ReplayGenerationSummaryReadResult = {
  filePath: string;
  entries: ReplayGenerationSummaryEntry[];
  lineCount: number;
};

export type ReplayGenerationLaneSnapshot = {
  lane: string;
  replayMode: "local" | "live";
  status: string | null;
  updatedAt: string;
  expectedContractHash: string | null;
  generatedContractHash: string | null;
  expectedToGeneratedVerdict: "same_contract" | "partial_match" | "drifted" | "missing";
  generatedToDeployedVerdict: "same_contract" | "partial_match" | "drifted" | "missing";
  expectedTrace: GenerationTraceLike | null;
  generatedTrace: GenerationTraceLike | null;
  deployedTrace: GenerationTraceLike | null;
};

export type ReplayGenerationLaneComparison = ReturnType<typeof compareGenerationTraces> & {
  baselineLane: string;
  candidateLane: string;
};

export type ReplayGenerationScenarioGroup = {
  groupKey: string;
  scenarioFamily: string;
  sourceChatId: string | null;
  replayScenario: string;
  contractHash: string | null;
  runCount: number;
  lanes: ReplayGenerationLaneSnapshot[];
  laneCounts: Record<string, number>;
  expectedToGeneratedVerdictCounts: Record<string, number>;
  generatedToDeployedVerdictCounts: Record<string, number>;
  laneComparisons: ReplayGenerationLaneComparison[];
};

export type ReplayGenerationScenarioFamilySummary = {
  scenarioFamily: string;
  scenarioCount: number;
  groupCount: number;
  laneCounts: Record<string, number>;
  crossLaneVerdictCounts: Record<string, number>;
  expectedToGeneratedVerdictCounts: Record<string, number>;
  generatedToDeployedVerdictCounts: Record<string, number>;
};

export type ReplayGenerationSummaryAggregate = {
  summaryVersion: 1;
  sourcePath: string;
  entryCount: number;
  lineCount: number;
  generatedAt: string;
  laneCounts: Record<string, number>;
  replayModeCounts: Record<string, number>;
  expectedToGeneratedVerdictCounts: Record<string, number>;
  generatedToDeployedVerdictCounts: Record<string, number>;
  scenarioCounts: Record<string, number>;
  scenarioFamilyCounts: Record<string, number>;
  crossLaneComparisonVerdictCounts: Record<string, number>;
  groups: ReplayGenerationScenarioGroup[];
  families: ReplayGenerationScenarioFamilySummary[];
};

export type ReplayPromotionGateEvaluation = {
  scenario: string;
  passed: boolean;
  reasons: string[];
  inspectedGroupCount: number;
  requiredLanes: string[];
  matchingGroups: Array<{
    groupKey: string;
    scenarioFamily?: string;
    contractHash: string | null;
    lanes: string[];
    expectedVerdicts: string[];
    crossLaneVerdicts: string[];
  }>;
};

function normalizeComparisonVerdict(
  value: unknown,
  fallback: GenerationTraceComparisonVerdict = "missing",
): GenerationTraceComparisonVerdict {
  const normalized = String(value || "").trim();
  if (
    normalized === "same_contract" ||
    normalized === "partial_match" ||
    normalized === "drifted" ||
    normalized === "missing"
  ) {
    return normalized;
  }
  return fallback;
}

function normalizeKeyPart(value: string | null | undefined, fallback: string) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function resolveEntryLane(entry: ReplayGenerationSummaryEntry) {
  return normalizeKeyPart(
    entry.generatedTrace?.generationLane || entry.expectedTrace?.generationLane || entry.deployedTrace?.generationLane,
    "unknown",
  );
}

function resolveEntryContractHash(entry: ReplayGenerationSummaryEntry) {
  return (
    String(
      entry.expectedTrace?.contractHash || entry.generatedTrace?.contractHash || entry.deployedTrace?.contractHash || "",
    ).trim() || null
  );
}

function countByKey(target: Record<string, number>, key: string | null | undefined) {
  const normalized = normalizeKeyPart(key, "unknown");
  target[normalized] = (target[normalized] || 0) + 1;
}

function laneOrder(value: string) {
  const normalized = String(value || "").trim();
  if (normalized === "legacy") return 0;
  if (normalized === "website-generation-mvp") return 1;
  return 10;
}

function buildScenarioGroupKey(entry: ReplayGenerationSummaryEntry) {
  return [
    normalizeKeyPart(entry.sourceChatId, "unknown-chat"),
    normalizeKeyPart(entry.replayScenario, "unspecified"),
    normalizeKeyPart(resolveEntryContractHash(entry), "unknown-contract"),
  ].join("::");
}

function deriveScenarioFamily(scenario: string) {
  const normalized = String(scenario || "").trim().toLowerCase();
  if (!normalized) return "unspecified";
  if (normalized.includes("casux")) return "casux";
  if (normalized.includes("homepage")) return "homepage";
  if (normalized.includes("fullsite")) return "fullsite";
  if (normalized.includes("specific-chat")) return "specific-chat";
  if (normalized.includes("deploy")) return "deploy";
  const prefix = normalized.split(/[:/]/u)[0]?.trim();
  if (prefix) return prefix;
  return normalized.split("-")[0] || "unspecified";
}

export async function readReplayGenerationSummaryEntries(
  inputPath = path.resolve(process.cwd(), ".tmp", "replay-generation-summary.jsonl"),
): Promise<ReplayGenerationSummaryReadResult> {
  const filePath = path.resolve(inputPath);
  const text = await fs.readFile(filePath, "utf8");
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const entries = lines.map((line, index) => {
    try {
      return JSON.parse(line) as ReplayGenerationSummaryEntry;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error || "unknown parse error");
      throw new Error(`Failed to parse replay summary JSONL line ${index + 1}: ${detail}`);
    }
  });
  return {
    filePath,
    entries,
    lineCount: lines.length,
  };
}

export function summarizeReplayGenerationEntries(
  entries: ReplayGenerationSummaryEntry[],
  sourcePath = path.resolve(process.cwd(), ".tmp", "replay-generation-summary.jsonl"),
): ReplayGenerationSummaryAggregate {
  const laneCounts: Record<string, number> = {};
  const replayModeCounts: Record<string, number> = {};
  const expectedToGeneratedVerdictCounts: Record<string, number> = {};
  const generatedToDeployedVerdictCounts: Record<string, number> = {};
  const scenarioCounts: Record<string, number> = {};
  const scenarioFamilyCounts: Record<string, number> = {};
  const crossLaneComparisonVerdictCounts: Record<string, number> = {};
  const groups = new Map<string, ReplayGenerationSummaryEntry[]>();

  for (const entry of entries) {
    countByKey(laneCounts, resolveEntryLane(entry));
    countByKey(replayModeCounts, entry.replayMode);
    countByKey(
      expectedToGeneratedVerdictCounts,
      entry.expectedToGeneratedComparison?.verdict || (entry.expectedTrace || entry.generatedTrace ? "missing" : "unknown"),
    );
    countByKey(
      generatedToDeployedVerdictCounts,
      entry.generatedToDeployedComparison?.verdict || (entry.deployedTrace ? "missing" : "not_applicable"),
    );
    countByKey(scenarioCounts, entry.replayScenario);
    countByKey(scenarioFamilyCounts, deriveScenarioFamily(entry.replayScenario));

    const key = buildScenarioGroupKey(entry);
    const list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  }

  const groupList = Array.from(groups.entries())
    .map(([groupKey, groupEntries]) => {
      const latestByLane = new Map<string, ReplayGenerationSummaryEntry>();
      const laneCountsByGroup: Record<string, number> = {};
      const expectedVerdictsByGroup: Record<string, number> = {};
      const deployedVerdictsByGroup: Record<string, number> = {};

      for (const entry of groupEntries) {
        const lane = resolveEntryLane(entry);
        countByKey(laneCountsByGroup, lane);
        countByKey(
          expectedVerdictsByGroup,
          entry.expectedToGeneratedComparison?.verdict || (entry.expectedTrace || entry.generatedTrace ? "missing" : "unknown"),
        );
        countByKey(
          deployedVerdictsByGroup,
          entry.generatedToDeployedComparison?.verdict || (entry.deployedTrace ? "missing" : "not_applicable"),
        );

        const previous = latestByLane.get(lane);
        if (!previous || String(entry.updatedAt || "") >= String(previous.updatedAt || "")) {
          latestByLane.set(lane, entry);
        }
      }

      const lanes = Array.from(latestByLane.entries())
        .map(([lane, entry]) => ({
          lane,
          replayMode: entry.replayMode,
          status: entry.status || null,
          updatedAt: entry.updatedAt,
          expectedContractHash: entry.expectedTrace?.contractHash || null,
          generatedContractHash: entry.generatedTrace?.contractHash || null,
          expectedToGeneratedVerdict: normalizeComparisonVerdict(entry.expectedToGeneratedComparison?.verdict),
          generatedToDeployedVerdict: normalizeComparisonVerdict(entry.generatedToDeployedComparison?.verdict),
          expectedTrace: entry.expectedTrace || null,
          generatedTrace: entry.generatedTrace || null,
          deployedTrace: entry.deployedTrace || null,
        }))
        .sort((a, b) => laneOrder(a.lane) - laneOrder(b.lane) || a.lane.localeCompare(b.lane));

      const laneComparisons: ReplayGenerationLaneComparison[] = [];
      for (let index = 0; index < lanes.length; index += 1) {
        for (let otherIndex = index + 1; otherIndex < lanes.length; otherIndex += 1) {
          const baseline = lanes[index]!;
          const candidate = lanes[otherIndex]!;
          const comparison = compareGenerationTraces(baseline.generatedTrace, candidate.generatedTrace, {
            ignoreGenerationLane: true,
          });
          laneComparisons.push({
            ...comparison,
            baselineLane: baseline.lane,
            candidateLane: candidate.lane,
          });
          countByKey(crossLaneComparisonVerdictCounts, comparison.verdict);
        }
      }

      const latestEntry = groupEntries
        .slice()
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;

      return {
        groupKey,
        scenarioFamily: deriveScenarioFamily(latestEntry?.replayScenario || "unspecified"),
        sourceChatId: latestEntry?.sourceChatId || null,
        replayScenario: latestEntry?.replayScenario || "unspecified",
        contractHash: resolveEntryContractHash(latestEntry),
        runCount: groupEntries.length,
        lanes,
        laneCounts: laneCountsByGroup,
        expectedToGeneratedVerdictCounts: expectedVerdictsByGroup,
        generatedToDeployedVerdictCounts: deployedVerdictsByGroup,
        laneComparisons,
      } satisfies ReplayGenerationScenarioGroup;
    })
    .sort((a, b) => a.groupKey.localeCompare(b.groupKey));

  const families = Array.from(
    groupList.reduce((map, group) => {
      const existing = map.get(group.scenarioFamily) || {
        scenarioFamily: group.scenarioFamily,
        scenarioCount: 0,
        groupCount: 0,
        laneCounts: {},
        crossLaneVerdictCounts: {},
        expectedToGeneratedVerdictCounts: {},
        generatedToDeployedVerdictCounts: {},
      };
      existing.groupCount += 1;
      existing.scenarioCount = existing.groupCount;
      for (const [lane, count] of Object.entries(group.laneCounts)) {
        existing.laneCounts[lane] = (existing.laneCounts[lane] || 0) + count;
      }
      for (const [verdict, count] of Object.entries(group.expectedToGeneratedVerdictCounts)) {
        existing.expectedToGeneratedVerdictCounts[verdict] =
          (existing.expectedToGeneratedVerdictCounts[verdict] || 0) + count;
      }
      for (const [verdict, count] of Object.entries(group.generatedToDeployedVerdictCounts)) {
        existing.generatedToDeployedVerdictCounts[verdict] =
          (existing.generatedToDeployedVerdictCounts[verdict] || 0) + count;
      }
      for (const comparison of group.laneComparisons) {
        existing.crossLaneVerdictCounts[comparison.verdict] =
          (existing.crossLaneVerdictCounts[comparison.verdict] || 0) + 1;
      }
      map.set(group.scenarioFamily, existing);
      return map;
    }, new Map<string, ReplayGenerationScenarioFamilySummary>()),
  )
    .map(([, family]) => family)
    .sort((a, b) => a.scenarioFamily.localeCompare(b.scenarioFamily));

  return {
    summaryVersion: 1,
    sourcePath: path.resolve(sourcePath),
    entryCount: entries.length,
    lineCount: entries.length,
    generatedAt: new Date().toISOString(),
    laneCounts,
    replayModeCounts,
    expectedToGeneratedVerdictCounts,
    generatedToDeployedVerdictCounts,
    scenarioCounts,
    scenarioFamilyCounts,
    crossLaneComparisonVerdictCounts,
    groups: groupList,
    families,
  };
}

export function formatReplayGenerationSummaryReport(summary: ReplayGenerationSummaryAggregate) {
  const lines: string[] = [];
  lines.push("Replay Generation Summary");
  lines.push(`Source: ${summary.sourcePath}`);
  lines.push(`Entries: ${summary.entryCount}`);
  lines.push(`Groups: ${summary.groups.length}`);
  lines.push("");
  lines.push(`Lane counts: ${formatCountMap(summary.laneCounts)}`);
  lines.push(`Replay modes: ${formatCountMap(summary.replayModeCounts)}`);
  lines.push(`Expected->Generated verdicts: ${formatCountMap(summary.expectedToGeneratedVerdictCounts)}`);
  lines.push(`Generated->Deployed verdicts: ${formatCountMap(summary.generatedToDeployedVerdictCounts)}`);
  lines.push(`Scenario families: ${formatCountMap(summary.scenarioFamilyCounts)}`);
  lines.push(`Cross-lane verdicts: ${formatCountMap(summary.crossLaneComparisonVerdictCounts)}`);
  lines.push("");
  if (summary.families.length > 0) {
    lines.push("Scenario families:");
    for (const family of summary.families) {
      lines.push(
        `- ${family.scenarioFamily}: groups=${family.groupCount} lanes=${formatCountMap(family.laneCounts)} expected=${formatCountMap(family.expectedToGeneratedVerdictCounts)} cross-lane=${formatCountMap(family.crossLaneVerdictCounts)}`,
      );
    }
    lines.push("");
  }
  for (const group of summary.groups) {
    lines.push(
      `- ${group.replayScenario} [family=${group.scenarioFamily}] | chat=${group.sourceChatId || "unknown"} | contract=${group.contractHash || "unknown"} | runs=${group.runCount}`,
    );
    for (const lane of group.lanes) {
      const routes = Array.from(new Set((lane.generatedTrace?.routes || []).map((item) => String(item || "").trim()).filter(Boolean)));
      const files = Array.from(new Set((lane.generatedTrace?.generatedFiles || []).map((item) => String(item || "").trim()).filter(Boolean)));
      lines.push(
        `  lane=${lane.lane} mode=${lane.replayMode} status=${lane.status || "-"} verdict=${lane.expectedToGeneratedVerdict} surface=${lane.generatedTrace?.websiteSurfaceMode || lane.expectedTrace?.websiteSurfaceMode || "-"} routes=${routes.join(",") || "-"} files=${files.join(",") || "-"}`,
      );
    }
    for (const comparison of group.laneComparisons) {
      lines.push(
        `  compare ${comparison.baselineLane} -> ${comparison.candidateLane}: ${comparison.verdict} (routeSet=${comparison.routeSetMatch ? "same" : "diff"}, files=${comparison.fileSetMatch ? "same" : "diff"}, surface=${comparison.websiteSurfaceModeMatch ? "same" : "diff"}, reasons=${comparison.driftReasons.join("|") || "-"})`,
      );
      if (comparison.missingRoutes.length > 0 || comparison.extraRoutes.length > 0) {
        lines.push(
          `    route-drift missing=${comparison.missingRoutes.join(",") || "-"} extra=${comparison.extraRoutes.join(",") || "-"}`,
        );
      }
      if (comparison.missingFiles.length > 0 || comparison.extraFiles.length > 0) {
        lines.push(
          `    file-drift missing=${comparison.missingFiles.join(",") || "-"} extra=${comparison.extraFiles.join(",") || "-"}`,
        );
      }
    }
  }
  return lines.join("\n");
}

function formatCountMap(map: Record<string, number>) {
  const entries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) return "(none)";
  return entries.map(([key, count]) => `${key}=${count}`).join(", ");
}

export function evaluateReplayPromotionGate(
  summary: ReplayGenerationSummaryAggregate,
  options: {
    scenario: string;
    requiredLanes?: string[];
  },
): ReplayPromotionGateEvaluation {
  const scenario = String(options.scenario || "").trim();
  const requiredLanes = (options.requiredLanes || ["legacy", "website-generation-mvp"])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const matchingGroups = summary.groups.filter((group) => group.replayScenario === scenario);
  const reasons: string[] = [];

  if (!scenario) {
    return {
      scenario,
      passed: false,
      reasons: ["Missing scenario."],
      inspectedGroupCount: 0,
      requiredLanes,
      matchingGroups: [],
    };
  }

  if (matchingGroups.length === 0) {
    reasons.push(`No replay summary groups found for scenario '${scenario}'.`);
  }

  const groupViews = matchingGroups.map((group) => {
    const lanes = group.lanes.map((lane) => lane.lane);
    const expectedVerdicts = group.lanes.map((lane) => lane.expectedToGeneratedVerdict);
    const crossLaneVerdicts = group.laneComparisons.map((comparison) => comparison.verdict);
    return {
      groupKey: group.groupKey,
      scenarioFamily: group.scenarioFamily,
      contractHash: group.contractHash,
      lanes,
      expectedVerdicts,
      crossLaneVerdicts,
    };
  });

  const hasRequiredLaneCoverage = matchingGroups.some((group) => requiredLanes.every((lane) => group.lanes.some((entry) => entry.lane === lane)));
  if (!hasRequiredLaneCoverage) {
    reasons.push(`No scenario group contains all required lanes: ${requiredLanes.join(", ")}.`);
  }

  const hasLaneDrift = matchingGroups.some((group) =>
    group.lanes.some((lane) => lane.expectedToGeneratedVerdict === "drifted"),
  );
  if (hasLaneDrift) {
    reasons.push("At least one lane drifted away from its expected generation contract.");
  }

  const hasCrossLaneDrift = matchingGroups.some((group) =>
    group.laneComparisons.some((comparison) => comparison.verdict === "drifted"),
  );
  if (hasCrossLaneDrift) {
    reasons.push("At least one cross-lane comparison drifted on contract axes.");
  }

  const hasCrossLaneEvidence = matchingGroups.some((group) => group.laneComparisons.length > 0);
  if (!hasCrossLaneEvidence) {
    reasons.push("No cross-lane comparison evidence is available for this scenario.");
  }

  return {
    scenario,
    passed: reasons.length === 0,
    reasons,
    inspectedGroupCount: matchingGroups.length,
    requiredLanes,
    matchingGroups: groupViews,
  };
}

export function formatReplayPromotionGateReport(gate: ReplayPromotionGateEvaluation) {
  const lines = [
    `Replay Promotion Gate: ${gate.scenario}`,
    `Passed: ${gate.passed}`,
    `Inspected groups: ${gate.inspectedGroupCount}`,
    `Required lanes: ${gate.requiredLanes.join(", ") || "(none)"}`,
  ];
  if (gate.reasons.length > 0) {
    lines.push("", "Reasons:");
    for (const reason of gate.reasons) {
      lines.push(`- ${reason}`);
    }
  }
  if (gate.matchingGroups.length > 0) {
    lines.push("", "Matching groups:");
    for (const group of gate.matchingGroups) {
      lines.push(
        `- ${group.groupKey} | contract=${group.contractHash || "unknown"} | lanes=${group.lanes.join(", ") || "-"} | expected=${group.expectedVerdicts.join(", ") || "-"} | cross=${group.crossLaneVerdicts.join(", ") || "-"}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export type ReplayPromotionFamilyGateEvaluation = {
  scenarioFamily: string;
  passed: boolean;
  reasons: string[];
  groupCount: number;
  requiredLanes: string[];
  matchingGroups: Array<{
    groupKey: string;
    replayScenario: string;
    lanes: string[];
    crossLaneVerdicts: string[];
    expectedVerdicts: string[];
  }>;
};

export function evaluateReplayPromotionFamilyGate(
  summary: ReplayGenerationSummaryAggregate,
  options: {
    scenarioFamily: string;
    requiredLanes?: string[];
  },
): ReplayPromotionFamilyGateEvaluation {
  const scenarioFamily = String(options.scenarioFamily || "").trim().toLowerCase();
  const requiredLanes = (options.requiredLanes || ["legacy", "website-generation-mvp"])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const matchingGroups = summary.groups.filter((group) => group.scenarioFamily === scenarioFamily);
  const reasons: string[] = [];
  if (!scenarioFamily) reasons.push("Missing scenario family.");
  if (matchingGroups.length === 0) reasons.push(`No replay summary groups found for scenario family '${scenarioFamily}'.`);

  if (matchingGroups.some((group) => requiredLanes.some((lane) => !group.lanes.some((entry) => entry.lane === lane)))) {
    reasons.push(`At least one group in family '${scenarioFamily}' is missing one of the required lanes: ${requiredLanes.join(", ")}.`);
  }
  if (matchingGroups.some((group) => group.lanes.some((lane) => lane.expectedToGeneratedVerdict === "drifted"))) {
    reasons.push(`At least one group in family '${scenarioFamily}' drifted between expected and generated traces.`);
  }
  if (matchingGroups.some((group) => group.laneComparisons.some((comparison) => comparison.verdict === "drifted"))) {
    reasons.push(`At least one cross-lane comparison in family '${scenarioFamily}' drifted.`);
  }

  return {
    scenarioFamily,
    passed: reasons.length === 0,
    reasons,
    groupCount: matchingGroups.length,
    requiredLanes,
    matchingGroups: matchingGroups.map((group) => ({
      groupKey: group.groupKey,
      replayScenario: group.replayScenario,
      lanes: group.lanes.map((lane) => lane.lane),
      crossLaneVerdicts: group.laneComparisons.map((comparison) => comparison.verdict),
      expectedVerdicts: group.lanes.map((lane) => lane.expectedToGeneratedVerdict),
    })),
  };
}
