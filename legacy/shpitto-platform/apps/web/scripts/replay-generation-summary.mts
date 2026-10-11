import fs from "node:fs/promises";
import path from "node:path";

import {
  evaluateReplayPromotionFamilyGate,
  evaluateReplayPromotionGate,
  formatReplayPromotionGateReport,
  formatReplayGenerationSummaryReport,
  readReplayGenerationSummaryEntries,
  summarizeReplayGenerationEntries,
} from "../lib/agent/replay-generation-summary.ts";

type CliOptions = {
  inputPath: string;
  outputPath: string | null;
  json: boolean;
  gateScenario: string | null;
  gateScenarioFamily: string | null;
  requiredLanes: string[];
};

function parseArgs(argv: string[]): CliOptions {
  let inputPath = path.resolve(process.cwd(), ".tmp", "replay-generation-summary.jsonl");
  let outputPath: string | null = null;
  let json = false;
  let gateScenario: string | null = null;
  let gateScenarioFamily: string | null = null;
  let requiredLanes = ["legacy", "website-generation-mvp"];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "").trim();
    if (!arg) continue;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--gate-scenario" && argv[index + 1]) {
      gateScenario = String(argv[index + 1] || "").trim() || null;
      index += 1;
      continue;
    }
    if (arg === "--gate-scenario-family" && argv[index + 1]) {
      gateScenarioFamily = String(argv[index + 1] || "").trim().toLowerCase() || null;
      index += 1;
      continue;
    }
    if (arg === "--required-lanes" && argv[index + 1]) {
      requiredLanes = String(argv[index + 1] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === "--input" && argv[index + 1]) {
      inputPath = path.resolve(process.cwd(), String(argv[index + 1] || "").trim());
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      outputPath = path.resolve(process.cwd(), String(argv[index + 1] || "").trim());
      index += 1;
      continue;
    }
  }

  return { inputPath, outputPath, json, gateScenario, gateScenarioFamily, requiredLanes };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const read = await readReplayGenerationSummaryEntries(options.inputPath);
  const summary = summarizeReplayGenerationEntries(read.entries, read.filePath);
  const gate = options.gateScenario
    ? evaluateReplayPromotionGate(summary, {
        scenario: options.gateScenario,
        requiredLanes: options.requiredLanes,
      })
    : null;
  const familyGate = options.gateScenarioFamily
    ? evaluateReplayPromotionFamilyGate(summary, {
        scenarioFamily: options.gateScenarioFamily,
        requiredLanes: options.requiredLanes,
      })
    : null;
  const outputPayload = gate || familyGate ? { summary, ...(gate ? { gate } : {}), ...(familyGate ? { familyGate } : {}) } : summary;
  const outputText = options.json
    ? `${JSON.stringify(outputPayload, null, 2)}\n`
    : `${formatReplayGenerationSummaryReport(summary)}${gate ? `\n${formatReplayPromotionGateReport(gate)}` : ""}${
        familyGate
          ? `\nReplay Promotion Family Gate: ${familyGate.scenarioFamily}\nPassed: ${familyGate.passed}\nGroups: ${familyGate.groupCount}\nRequired lanes: ${familyGate.requiredLanes.join(", ")}${
              familyGate.reasons.length > 0 ? `\nReasons:\n- ${familyGate.reasons.join("\n- ")}` : ""
            }\n`
          : ""
      }`;

  if (options.outputPath) {
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, outputText, "utf8");
  }

  process.stdout.write(outputText);
  if ((gate && !gate.passed) || (familyGate && !familyGate.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const detail = error instanceof Error ? error.stack || error.message : String(error || "unknown error");
  process.stderr.write(`${detail}\n`);
  process.exitCode = 1;
});
