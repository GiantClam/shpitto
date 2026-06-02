import path from "node:path";

import {
  evaluateWebsiteGenerationReleaseGate,
  formatWebsiteGenerationReleaseGate,
} from "../lib/agent/website-generation-release-gate.ts";

function readArgValue(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  if (index >= 0 && argv[index + 1]) return String(argv[index + 1]).trim();
  return "";
}

function readCsvArg(argv: string[], flag: string, fallback: string[]) {
  const raw = readArgValue(argv, flag);
  if (!raw) return fallback;
  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : fallback;
}

const argv = process.argv.slice(2);
const matrixReportPath =
  readArgValue(argv, "--matrix-report") ||
  path.resolve(process.cwd(), ".tmp", "open-design-regression-matrix", "report.json");
const casuxReportPath =
  readArgValue(argv, "--casux-report") ||
  path.resolve(process.cwd(), ".tmp", "website-generation-mvp", "casux", "fullflow-report.json");
const vbuyReportPath =
  readArgValue(argv, "--vbuy-report") ||
  path.resolve(process.cwd(), ".tmp", "website-generation-mvp", "vbuygroup", "fullflow-report.json");

const gate = await evaluateWebsiteGenerationReleaseGate({
  matrixReportPath,
  scenarioReports: [
    { name: "casux", reportPath: casuxReportPath },
    { name: "vbuy", reportPath: vbuyReportPath },
  ],
  requiredPromotionFamilies: readCsvArg(argv, "--promotion-families", ["homepage", "fullsite", "casux"]),
  requiredFreshScenarios: readCsvArg(argv, "--require-fresh", ["vbuy"]),
  requiredDeployScenarios: readCsvArg(argv, "--require-deploy", ["vbuy"]),
  requiredPassedScenarios: readCsvArg(argv, "--require-passed", ["casux", "vbuy"]),
});

console.log(formatWebsiteGenerationReleaseGate(gate));
if (!gate.passed) {
  process.exitCode = 1;
}

