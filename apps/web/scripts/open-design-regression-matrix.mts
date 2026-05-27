import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "scripts/.env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });

type CommandResult = {
  name: string;
  ok: boolean;
  durationMs: number;
  exitCode: number | null;
  error?: string;
};

type ScenarioSummary = {
  kind: "homepage" | "fullsite";
  scenario: string;
  ok: boolean;
  attempts: number;
  passedOnRetry: boolean;
  elapsedMs: number | null;
  siteGeneratorMode: string | null;
  surfaceMode: string | null;
  provider: string | null;
  model: string | null;
  qaWarnings: number;
  routeVisualPassRatio?: string;
  bridgeAttempted?: boolean;
  bridgeFallbacks?: number;
  repairStatus?: string | null;
  repairAttemptCount?: number;
  blogDetailCount?: number;
  reportPath?: string;
  error?: string;
};

type CasuxSummary = {
  kind: "casux-fullflow";
  ok: boolean;
  elapsedMs: number | null;
  deployedUrl: string | null;
  productionUrl: string | null;
  hasRuntimeContentRoute: boolean;
  deploymentVerificationHome: string | null;
  deploymentVerificationMountedLive: string | null;
  deploymentVerificationRuntimeJson: string | null;
  manifestRouteCount: number;
  reportPath?: string;
  error?: string;
};

type MatrixReport = {
  generatedAt: string;
  passed: boolean;
  cwd: string;
  staticGate?: CommandResult;
  homepage: ScenarioSummary[];
  fullsite: ScenarioSummary[];
  casux?: CasuxSummary;
};

const pnpmBin = process.platform === "win32" ? "pnpm" : "pnpm";
const homepageScenarios = parseScenarioList(
  process.env.SHPITTO_OD_MATRIX_HOMEPAGE_SCENARIOS,
  ["corporate", "docs", "hub"],
);
const fullsiteScenarios = parseScenarioList(
  process.env.SHPITTO_OD_MATRIX_FULLSITE_SCENARIOS,
  ["corporate", "docs", "hub", "publishable"],
);
const outputRoot = path.resolve(
  process.cwd(),
  String(process.env.SHPITTO_OD_MATRIX_OUTPUT_DIR || ".tmp/open-design-regression-matrix"),
);
const maxScenarioAttempts = Math.max(1, Number(process.env.SHPITTO_OD_MATRIX_MAX_ATTEMPTS || 2) || 2);

function parseScenarioList(raw: string | undefined, fallback: string[]): string[] {
  const list = String(raw || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? Array.from(new Set(list)) : fallback;
}

function envFlag(name: string): boolean {
  const normalized = String(process.env[name] || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function countWarnings(summary: any): number {
  if (!summary || typeof summary !== "object") return 0;
  if (Array.isArray(summary.warnings)) return summary.warnings.length;
  if (typeof summary.warningCount === "number") return summary.warningCount;
  if (typeof summary.totalWarnings === "number") return summary.totalWarnings;
  return 0;
}

function formatDuration(durationMs: number | null): string {
  if (!Number.isFinite(Number(durationMs)) || Number(durationMs) < 0) return "-";
  const totalSeconds = Math.round(Number(durationMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

async function runCommand(params: {
  name: string;
  args: string[];
  env?: Record<string, string>;
}): Promise<CommandResult> {
  const startedAt = Date.now();
  const childEnv = {
    ...process.env,
    ...params.env,
  };
  const commandText = [pnpmBin, ...params.args].map(shellQuote).join(" ");
  return await new Promise((resolve) => {
    const child = spawn(commandText, [], {
      cwd: process.cwd(),
      env: childEnv,
      stdio: "inherit",
      shell: true,
    });
    child.on("error", (error) => {
      resolve({
        name: params.name,
        ok: false,
        durationMs: Date.now() - startedAt,
        exitCode: null,
        error: String(error?.message || error || "spawn failed"),
      });
    });
    child.on("close", (code) => {
      resolve({
        name: params.name,
        ok: code === 0,
        durationMs: Date.now() - startedAt,
        exitCode: code,
      });
    });
  });
}

function shellQuote(value: string): string {
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

async function readJsonFile(filePath: string): Promise<any | null> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function findNewestJsonFile(dirPath: string, minMtimeMs = 0): Promise<string | null> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
        .map(async (entry) => {
          const filePath = path.join(dirPath, entry.name);
          const stats = await fs.stat(filePath);
          return { filePath, mtimeMs: stats.mtimeMs };
        }),
    );
    const filtered = files
      .filter((file) => file.mtimeMs >= minMtimeMs)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (filtered.length > 0) return filtered[0].filePath;
    const fallback = files.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    return fallback?.filePath || null;
  } catch {
    return null;
  }
}

async function runHomepageScenario(scenario: string): Promise<ScenarioSummary> {
  const reportPath = path.resolve(process.cwd(), ".tmp", "open-design-homepage-live", scenario, "report.json");
  let lastCommand: CommandResult | null = null;
  let report: any | null = null;
  let attempts = 0;
  for (let attempt = 1; attempt <= maxScenarioAttempts; attempt += 1) {
    attempts = attempt;
    lastCommand = await runCommand({
      name: `homepage:${scenario}:attempt-${attempt}`,
      args: ["run", "smoke:open-design-homepage:live"],
      env: {
        NODE_USE_ENV_PROXY: "1",
        RUN_OPEN_DESIGN_HOMEPAGE_LIVE: "1",
        SHPITTO_OD_HOMEPAGE_SCENARIO: scenario,
      },
    });
    report = await readJsonFile(reportPath);
    if (lastCommand.ok && report) break;
  }
  return {
    kind: "homepage",
    scenario,
    ok: Boolean(lastCommand?.ok && report),
    attempts,
    passedOnRetry: Boolean(lastCommand?.ok && report && attempts > 1),
    elapsedMs: Number(report?.elapsedMs || lastCommand?.durationMs || 0) || null,
    siteGeneratorMode: String(report?.siteGeneratorMode || "hybrid"),
    surfaceMode: String(report?.surfaceMode || report?.websiteSurfaceMode || ""),
    provider: String(report?.provider || ""),
    model: String(report?.model || ""),
    qaWarnings: countWarnings(report?.qaSummary),
    reportPath: report ? reportPath : undefined,
    error:
      lastCommand?.ok
        ? undefined
        : lastCommand?.error || `command exited with code ${lastCommand?.exitCode ?? "unknown"}`,
  };
}

async function runFullsiteScenario(scenario: string): Promise<ScenarioSummary> {
  const reportPath = path.resolve(process.cwd(), ".tmp", "open-design-fullsite-live", scenario, "report.json");
  let lastCommand: CommandResult | null = null;
  let report: any | null = null;
  let attempts = 0;
  for (let attempt = 1; attempt <= maxScenarioAttempts; attempt += 1) {
    attempts = attempt;
    lastCommand = await runCommand({
      name: `fullsite:${scenario}:attempt-${attempt}`,
      args: ["run", "smoke:open-design-fullsite:live"],
      env: {
        NODE_USE_ENV_PROXY: "1",
        RUN_OPEN_DESIGN_FULLSITE_LIVE: "1",
        SHPITTO_OD_FULLSITE_SCENARIO: scenario,
      },
    });
    report = await readJsonFile(reportPath);
    if (lastCommand.ok && report) break;
  }
  const routeVisualChecks = Array.isArray(report?.routeVisualChecks) ? report.routeVisualChecks : [];
  const visualPassed = routeVisualChecks.filter((item: any) => item?.passed === true).length;
  return {
    kind: "fullsite",
    scenario,
    ok: Boolean(lastCommand?.ok && report),
    attempts,
    passedOnRetry: Boolean(lastCommand?.ok && report && attempts > 1),
    elapsedMs: Number(report?.elapsedMs || lastCommand?.durationMs || 0) || null,
    siteGeneratorMode: String(report?.siteGeneratorMode || ""),
    surfaceMode: String(report?.surfaceMode || report?.websiteSurfaceMode || ""),
    provider: String(report?.provider || ""),
    model: String(report?.model || ""),
    qaWarnings: countWarnings(report?.qaSummary),
    routeVisualPassRatio: routeVisualChecks.length > 0 ? `${visualPassed}/${routeVisualChecks.length}` : undefined,
    bridgeAttempted: Boolean(report?.routeUnitProviderBridge?.attempted),
    bridgeFallbacks: Number(report?.routeUnitProviderBridge?.legacyFallbackCount || 0),
    repairStatus: String(report?.routeRepairEvidence?.status || ""),
    repairAttemptCount: Number(report?.routeRepairEvidence?.repairAttemptCount || 0),
    blogDetailCount: Array.isArray(report?.blogDetailRoutes) ? report.blogDetailRoutes.length : 0,
    reportPath: report ? reportPath : undefined,
    error:
      lastCommand?.ok
        ? undefined
        : lastCommand?.error || `command exited with code ${lastCommand?.exitCode ?? "unknown"}`,
  };
}

async function runCasuxFullflowScenario(): Promise<CasuxSummary> {
  const reportDir = path.resolve(process.cwd(), ".tmp", "casux-fullflow-live");
  const startedAt = Date.now();
  const command = await runCommand({
    name: "casux-fullflow",
    args: ["run", "smoke:casux-fullflow:live"],
    env: {
      NODE_USE_ENV_PROXY: "1",
      RUN_CASUX_FULLFLOW_LIVE: "1",
    },
  });
  const reportPath = await findNewestJsonFile(reportDir, startedAt - 2_000);
  const report = reportPath ? await readJsonFile(reportPath) : null;
  return {
    kind: "casux-fullflow",
    ok: Boolean(command.ok && report),
    elapsedMs: Number(command.durationMs || 0) || null,
    deployedUrl: report?.deployedUrl ? String(report.deployedUrl) : null,
    productionUrl: report?.productionUrl ? String(report.productionUrl) : null,
    hasRuntimeContentRoute: Boolean(report?.hasRuntimeContentRoute),
    deploymentVerificationHome: report?.deploymentVerification?.home
      ? String(report.deploymentVerification.home)
      : null,
    deploymentVerificationMountedLive: report?.deploymentVerification?.mountedLive
      ? String(report.deploymentVerification.mountedLive)
      : null,
    deploymentVerificationRuntimeJson: report?.deploymentVerification?.runtimeJson
      ? String(report.deploymentVerification.runtimeJson)
      : null,
    manifestRouteCount: Array.isArray(report?.manifestRoutes) ? report.manifestRoutes.length : 0,
    reportPath: reportPath || undefined,
    error: command.ok ? undefined : command.error || `command exited with code ${command.exitCode ?? "unknown"}`,
  };
}

function renderMarkdown(report: MatrixReport): string {
  const lines = [
    "# Open Design Regression Matrix",
    "",
    `- generated_at: ${report.generatedAt}`,
    `- passed: ${report.passed}`,
    `- cwd: ${report.cwd}`,
  ];
  if (report.staticGate) {
    lines.push(
      `- static_gate: ${report.staticGate.ok ? "passed" : "failed"} (${formatDuration(report.staticGate.durationMs)})`,
    );
  }
  lines.push("", "## Homepage Matrix", "");
  lines.push("| Scenario | Status | Attempts | Duration | Surface | Generator | Provider | Warnings | Report |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const item of report.homepage) {
    lines.push(
      `| ${item.scenario} | ${item.ok ? "pass" : "fail"} | ${item.attempts}${item.passedOnRetry ? " (retry)" : ""} | ${formatDuration(item.elapsedMs)} | ${item.surfaceMode || "-"} | ${item.siteGeneratorMode || "-"} | ${item.provider || "-"} | ${item.qaWarnings} | ${item.reportPath || "-"} |`,
    );
  }
  lines.push("", "## Fullsite Matrix", "");
  lines.push("| Scenario | Status | Attempts | Duration | Surface | Generator | Provider | Visual | Bridge | Repairs | Blog Details | Report |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const item of report.fullsite) {
    const bridge = item.bridgeAttempted ? `attempted/${item.bridgeFallbacks ?? 0} fallback` : "not-attempted";
    const repairs = item.repairStatus
      ? `${item.repairStatus}${typeof item.repairAttemptCount === "number" ? ` (${item.repairAttemptCount})` : ""}`
      : "-";
    lines.push(
      `| ${item.scenario} | ${item.ok ? "pass" : "fail"} | ${item.attempts}${item.passedOnRetry ? " (retry)" : ""} | ${formatDuration(item.elapsedMs)} | ${item.surfaceMode || "-"} | ${item.siteGeneratorMode || "-"} | ${item.provider || "-"} | ${item.routeVisualPassRatio || "-"} | ${bridge} | ${repairs} | ${item.blogDetailCount ?? 0} | ${item.reportPath || "-"} |`,
    );
  }
  if (report.casux) {
    lines.push("", "## CASUX Full Flow", "");
    lines.push("| Scenario | Status | Duration | Manifest Routes | Runtime Route | Verification | Deployed URL | Report |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    const verification = [
      report.casux.deploymentVerificationHome,
      report.casux.deploymentVerificationRuntimeJson,
      report.casux.deploymentVerificationMountedLive,
    ]
      .filter(Boolean)
      .join(" / ");
    lines.push(
      `| casux-fullflow | ${report.casux.ok ? "pass" : "fail"} | ${formatDuration(report.casux.elapsedMs)} | ${report.casux.manifestRouteCount || 0} | ${report.casux.hasRuntimeContentRoute ? "yes" : "no"} | ${verification || "-"} | ${report.casux.deployedUrl || report.casux.productionUrl || "-"} | ${report.casux.reportPath || "-"} |`,
    );
  }
  const failures = [...report.homepage, ...report.fullsite, ...(report.casux ? [report.casux] : [])].filter(
    (item) => !item.ok || item.error,
  );
  if (failures.length > 0) {
    lines.push("", "## Failures", "");
    for (const item of failures) {
      const scenario = "scenario" in item ? item.scenario : "casux";
      lines.push(`- ${item.kind}:${scenario} -> ${item.error || "missing report or failed command"}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });

  let staticGate: CommandResult | undefined;
  if (!envFlag("SHPITTO_OD_MATRIX_SKIP_STATIC")) {
    staticGate = await runCommand({
      name: "test:hybrid-generation",
      args: ["run", "test:hybrid-generation"],
    });
  }

  const homepage: ScenarioSummary[] = [];
  const fullsite: ScenarioSummary[] = [];
  let casux: CasuxSummary | undefined;

  if (!envFlag("SHPITTO_OD_MATRIX_SKIP_HOMEPAGE")) {
    for (const scenario of homepageScenarios) {
      homepage.push(await runHomepageScenario(scenario));
    }
  }

  if (!envFlag("SHPITTO_OD_MATRIX_SKIP_FULLSITE")) {
    for (const scenario of fullsiteScenarios) {
      fullsite.push(await runFullsiteScenario(scenario));
    }
  }

  if (!envFlag("SHPITTO_OD_MATRIX_SKIP_CASUX")) {
    casux = await runCasuxFullflowScenario();
  }

  const passed =
    (staticGate ? staticGate.ok : true) &&
    homepage.every((item) => item.ok) &&
    fullsite.every((item) => item.ok) &&
    (casux ? casux.ok : true);
  const report: MatrixReport = {
    generatedAt: new Date().toISOString(),
    passed,
    cwd: process.cwd(),
    staticGate,
    homepage,
    fullsite,
    casux,
  };

  await Promise.all([
    fs.writeFile(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2), "utf8"),
    fs.writeFile(path.join(outputRoot, "report.md"), renderMarkdown(report), "utf8"),
  ]);

  console.log(`Open Design regression matrix ${passed ? "passed" : "failed"}.`);
  console.log(`Report: ${path.join(outputRoot, "report.md")}`);
  if (!passed) process.exitCode = 1;
}

await main();
