import fs from "node:fs/promises";
import path from "node:path";

type MatrixPromotionFamily = {
  family: string;
  passed: boolean;
  requiredScenarioCount: number;
  passedScenarioCount: number;
  failingScenarios: string[];
};

type MatrixReport = {
  passed?: boolean;
  promotionEvidence?: {
    homepage?: MatrixPromotionFamily;
    fullsite?: MatrixPromotionFamily;
    casux?: MatrixPromotionFamily;
  };
};

type ScenarioGenerationReport = {
  generatedAt?: string;
  outputDir?: string;
  generation?: {
    recoveredFrom?: string | null;
    previewOnly?: boolean;
    verification?: {
      status?: string | null;
    };
  };
  deployment?: {
    verification?: Array<{ ok?: boolean }>;
    cloudflareProject?: {
      latestStage?: string | null;
    } | null;
  };
};

export type ReleaseScenarioStatus = "fresh_pass" | "recovered_pass" | "preview_only" | "failed" | "missing";

export type WebsiteGenerationReleaseScenario = {
  name: string;
  reportPath: string;
  status: ReleaseScenarioStatus;
  verificationStatus: string | null;
  recoveredFrom: string | null;
  previewOnly: boolean;
  deploymentPassed: boolean;
};

export type WebsiteGenerationReleaseGate = {
  passed: boolean;
  reasons: string[];
  matrixPassed: boolean;
  requiredPromotionFamilies: string[];
  requiredFreshScenarios: string[];
  requiredDeployScenarios: string[];
  requiredPassedScenarios: string[];
  scenarios: WebsiteGenerationReleaseScenario[];
};

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function readJsonFileIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

export function classifyReleaseScenario(report: ScenarioGenerationReport | null): ReleaseScenarioStatus {
  if (!report) return "missing";
  const generation = toRecord(report.generation);
  const verification = toRecord(generation.verification);
  const verificationStatus = String(verification.status || "").trim().toLowerCase();
  const previewOnly = Boolean(generation.previewOnly);
  const recoveredFrom = String(generation.recoveredFrom || "").trim();
  if (verificationStatus !== "passed") return "failed";
  if (previewOnly) return "preview_only";
  if (recoveredFrom) return "recovered_pass";
  return "fresh_pass";
}

export function deploymentPassed(report: ScenarioGenerationReport | null) {
  if (!report) return false;
  const deployment = toRecord(report.deployment);
  const checks = Array.isArray(deployment.verification) ? (deployment.verification as Array<Record<string, unknown>>) : [];
  const cloudflareProject = toRecord(deployment.cloudflareProject);
  const latestStage = toRecord(cloudflareProject.latestStage);
  const stageName = String(latestStage.name || "").trim().toLowerCase();
  const stageStatus = String(latestStage.status || "").trim().toLowerCase();
  const deployStagePassed = stageName === "deploy" && stageStatus === "success";
  if (checks.length > 0) {
    if (checks.every((item) => item.ok === true)) return true;
    const onlyNetworkLevelFailures = checks.every(
      (item) => item.ok !== true && (item.status === null || item.status === undefined),
    );
    if (onlyNetworkLevelFailures && deployStagePassed) return true;
    return false;
  }
  return deployStagePassed;
}

export async function evaluateWebsiteGenerationReleaseGate(params?: {
  matrixReportPath?: string;
  scenarioReports?: Array<{ name: string; reportPath: string }>;
  requiredPromotionFamilies?: string[];
  requiredFreshScenarios?: string[];
  requiredDeployScenarios?: string[];
  requiredPassedScenarios?: string[];
}): Promise<WebsiteGenerationReleaseGate> {
  const matrixReportPath = path.resolve(
    params?.matrixReportPath || path.resolve(process.cwd(), ".tmp", "open-design-regression-matrix", "report.json"),
  );
  const matrixReport = await readJsonFileIfExists<MatrixReport>(matrixReportPath);
  const scenarioReports = params?.scenarioReports || [
    {
      name: "casux",
      reportPath: path.resolve(process.cwd(), ".tmp", "website-generation-mvp", "casux", "fullflow-report.json"),
    },
    {
      name: "vbuy",
      reportPath: path.resolve(process.cwd(), ".tmp", "website-generation-mvp", "vbuygroup", "fullflow-report.json"),
    },
  ];
  const requiredPromotionFamilies = params?.requiredPromotionFamilies || ["homepage", "fullsite", "casux"];
  const requiredFreshScenarios = params?.requiredFreshScenarios || ["vbuy"];
  const requiredDeployScenarios = params?.requiredDeployScenarios || ["vbuy"];
  const requiredPassedScenarios = params?.requiredPassedScenarios || ["casux", "vbuy"];
  const reasons: string[] = [];

  const promotionEvidence = toRecord(matrixReport?.promotionEvidence);
  let matrixPassed = Boolean(matrixReport?.passed);
  for (const family of requiredPromotionFamilies) {
    const familyReport = toRecord(promotionEvidence[family]);
    const familyPassed =
      familyReport.passed === true ||
      (family === "homepage" && Array.isArray((matrixReport as any)?.homepage) && (matrixReport as any).homepage.every((item: any) => item?.ok === true)) ||
      (family === "fullsite" && Array.isArray((matrixReport as any)?.fullsite) && (matrixReport as any).fullsite.every((item: any) => item?.ok === true)) ||
      (family === "casux" && toRecord((matrixReport as any)?.casux).ok === true);
    if (!familyPassed) {
      matrixPassed = false;
      reasons.push(`promotion_family_failed:${family}`);
    }
  }

  const scenarios: WebsiteGenerationReleaseScenario[] = [];
  for (const item of scenarioReports) {
    const reportPath = path.resolve(item.reportPath);
    const report = await readJsonFileIfExists<ScenarioGenerationReport>(reportPath);
    const generation = toRecord(report?.generation);
    const verification = toRecord(generation.verification);
    const status = classifyReleaseScenario(report);
    const scenario = {
      name: item.name,
      reportPath,
      status,
      verificationStatus: String(verification.status || "").trim() || null,
      recoveredFrom: String(generation.recoveredFrom || "").trim() || null,
      previewOnly: Boolean(generation.previewOnly),
      deploymentPassed: deploymentPassed(report),
    } satisfies WebsiteGenerationReleaseScenario;
    scenarios.push(scenario);
  }

  for (const scenarioName of requiredPassedScenarios) {
    const scenario = scenarios.find((item) => item.name === scenarioName);
    if (!scenario || !["fresh_pass", "recovered_pass"].includes(scenario.status)) {
      reasons.push(`scenario_not_passed:${scenarioName}`);
    }
  }
  for (const scenarioName of requiredFreshScenarios) {
    const scenario = scenarios.find((item) => item.name === scenarioName);
    if (!scenario || scenario.status !== "fresh_pass") {
      reasons.push(`scenario_not_fresh:${scenarioName}`);
    }
  }
  for (const scenarioName of requiredDeployScenarios) {
    const scenario = scenarios.find((item) => item.name === scenarioName);
    if (!scenario || scenario.deploymentPassed !== true) {
      reasons.push(`scenario_not_deployed:${scenarioName}`);
    }
  }

  return {
    passed: matrixPassed && reasons.length === 0,
    reasons,
    matrixPassed,
    requiredPromotionFamilies,
    requiredFreshScenarios,
    requiredDeployScenarios,
    requiredPassedScenarios,
    scenarios,
  };
}

export function formatWebsiteGenerationReleaseGate(gate: WebsiteGenerationReleaseGate) {
  const lines = [
    "# Website Generation V2 Release Gate",
    "",
    `Passed: ${gate.passed}`,
    `Matrix passed: ${gate.matrixPassed}`,
    `Required promotion families: ${gate.requiredPromotionFamilies.join(", ") || "-"}`,
    `Required fresh scenarios: ${gate.requiredFreshScenarios.join(", ") || "-"}`,
    `Required deploy scenarios: ${gate.requiredDeployScenarios.join(", ") || "-"}`,
    "",
    "## Scenario status",
  ];
  for (const scenario of gate.scenarios) {
    lines.push(
      `- ${scenario.name}: ${scenario.status} (verification=${scenario.verificationStatus || "-"}, recoveredFrom=${scenario.recoveredFrom || "fresh"}, previewOnly=${scenario.previewOnly ? "yes" : "no"}, deployment=${scenario.deploymentPassed ? "passed" : "n/a-or-failed"})`,
    );
  }
  lines.push("", "## Reasons");
  if (gate.reasons.length === 0) {
    lines.push("- none");
  } else {
    for (const reason of gate.reasons) lines.push(`- ${reason}`);
  }
  return `${lines.join("\n")}\n`;
}
