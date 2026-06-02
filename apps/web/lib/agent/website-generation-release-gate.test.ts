import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  classifyReleaseScenario,
  evaluateWebsiteGenerationReleaseGate,
  formatWebsiteGenerationReleaseGate,
} from "./website-generation-release-gate.ts";

describe("website generation release gate", () => {
  it("classifies fresh, recovered, preview-only, and failed scenarios", () => {
    expect(
      classifyReleaseScenario({
        generation: {
          recoveredFrom: null,
          previewOnly: false,
          verification: { status: "passed" },
        },
      }),
    ).toBe("fresh_pass");
    expect(
      classifyReleaseScenario({
        generation: {
          recoveredFrom: "checkpoint-site",
          previewOnly: false,
          verification: { status: "passed" },
        },
      }),
    ).toBe("recovered_pass");
    expect(
      classifyReleaseScenario({
        generation: {
          recoveredFrom: "checkpoint-site",
          previewOnly: true,
          verification: { status: "passed" },
        },
      }),
    ).toBe("preview_only");
    expect(
      classifyReleaseScenario({
        generation: {
          recoveredFrom: null,
          previewOnly: false,
          verification: { status: "contract_violation" },
        },
      }),
    ).toBe("failed");
  });

  it("evaluates promotion families, freshness, and deployment readiness", async () => {
    const root = path.resolve(process.cwd(), ".tmp", "website-generation-release-gate-test");
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(root, { recursive: true });

    const matrixReportPath = path.join(root, "matrix-report.json");
    await fs.writeFile(
      matrixReportPath,
      JSON.stringify(
        {
          passed: true,
          promotionEvidence: {
            homepage: { family: "homepage", passed: true, requiredScenarioCount: 3, passedScenarioCount: 3, failingScenarios: [] },
            fullsite: { family: "fullsite", passed: true, requiredScenarioCount: 4, passedScenarioCount: 4, failingScenarios: [] },
            casux: { family: "casux", passed: true, requiredScenarioCount: 1, passedScenarioCount: 1, failingScenarios: [] },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const casuxReportPath = path.join(root, "casux-report.json");
    await fs.writeFile(
      casuxReportPath,
      JSON.stringify(
        {
          generation: {
            recoveredFrom: "checkpoint-site",
            previewOnly: false,
            verification: { status: "passed" },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    const vbuyReportPath = path.join(root, "vbuy-report.json");
    await fs.writeFile(
      vbuyReportPath,
      JSON.stringify(
        {
          generation: {
            recoveredFrom: null,
            previewOnly: false,
            verification: { status: "passed" },
          },
          deployment: {
            verification: [{ ok: true }, { ok: true }],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const gate = await evaluateWebsiteGenerationReleaseGate({
      matrixReportPath,
      scenarioReports: [
        { name: "casux", reportPath: casuxReportPath },
        { name: "vbuy", reportPath: vbuyReportPath },
      ],
    });

    expect(gate.passed).toBe(true);
    expect(gate.scenarios.find((item) => item.name === "casux")?.status).toBe("recovered_pass");
    expect(gate.scenarios.find((item) => item.name === "vbuy")?.status).toBe("fresh_pass");
    expect(gate.scenarios.find((item) => item.name === "vbuy")?.deploymentPassed).toBe(true);
    expect(formatWebsiteGenerationReleaseGate(gate)).toContain("Passed: true");
  });

  it("accepts older matrix reports without explicit promotionEvidence when scenario groups already passed", async () => {
    const root = path.resolve(process.cwd(), ".tmp", "website-generation-release-gate-fallback-test");
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(root, { recursive: true });

    const matrixReportPath = path.join(root, "matrix-report.json");
    await fs.writeFile(
      matrixReportPath,
      JSON.stringify(
        {
          passed: true,
          homepage: [{ ok: true }, { ok: true }],
          fullsite: [{ ok: true }, { ok: true }],
          casux: { ok: true },
        },
        null,
        2,
      ),
      "utf8",
    );
    const vbuyReportPath = path.join(root, "vbuy-report.json");
    await fs.writeFile(
      vbuyReportPath,
      JSON.stringify(
        {
          generation: {
            recoveredFrom: null,
            previewOnly: false,
            verification: { status: "passed" },
          },
          deployment: {
            cloudflareProject: {
              latestStage: {
                name: "deploy",
                status: "success",
              },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    const casuxReportPath = path.join(root, "casux-report.json");
    await fs.writeFile(
      casuxReportPath,
      JSON.stringify(
        {
          generation: {
            recoveredFrom: "checkpoint-site",
            previewOnly: false,
            verification: { status: "passed" },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const gate = await evaluateWebsiteGenerationReleaseGate({
      matrixReportPath,
      scenarioReports: [
        { name: "casux", reportPath: casuxReportPath },
        { name: "vbuy", reportPath: vbuyReportPath },
      ],
    });

    expect(gate.passed).toBe(true);
    expect(gate.matrixPassed).toBe(true);
  });
});
