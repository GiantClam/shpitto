import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { materializePreparedWorkspace } from "./nextjs-baseline.ts";
import {
  normalizeWorkspaceRelativePath,
  resolveSkillManifest,
} from "./skill-manifest.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("Shpitto OpenCode skill manifest", () => {
  it("declares bounded capabilities and a result evidence requirement", () => {
    const manifest = resolveSkillManifest("build-ai-image-tool");

    expect(manifest.capabilities).toEqual(["inspect", "modify", "validate", "preview", "deploy"]);
    expect(manifest.mutationScopes).toContain("billing");
    expect(manifest.workspacePolicy.requireSkillResult).toBe(true);
    expect(manifest.workspacePolicy.allowProductionMutation).toBe(false);
    expect(manifest.resultPath).toBe(".shpitto/skill-result.json");
  });

  it("rejects workspace paths that can escape the workspace", () => {
    expect(() => normalizeWorkspaceRelativePath("../secrets.env")).toThrow("Unsafe workspace-relative path");
    expect(() => normalizeWorkspaceRelativePath("/absolute/path")).toThrow("Unsafe workspace-relative path");
  });

  it("materializes the selected skill and policy into the OpenCode workspace", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "shpitto-skill-workspace-"));
    temporaryRoots.push(root);
    const request = {
      skillId: "build-marketing-site",
      taskClass: "baseline_generation" as const,
      projectRoot: root,
      userIntentSummary: "Build a launch-ready marketing website.",
      executionScope: "full-baseline",
      successCriteria: ["all required routes exist"],
      structuredInputs: {
        companyName: "Northstar",
        targetAudience: ["founders"],
        primaryGoal: ["launch"],
        locale: "en",
        routes: ["/", "/pricing"],
      },
      templateContext: {
        templateId: "marketing-landing-site",
        siteType: "marketing-landing-site",
        templateFamily: "marketing-launch",
        foundations: [],
        seeds: [],
      },
      skillManifest: resolveSkillManifest("build-marketing-site"),
      workspacePolicy: resolveSkillManifest("build-marketing-site").workspacePolicy,
    };

    await materializePreparedWorkspace({
      request,
      templateManifest: {
        templateId: "marketing-landing-site",
        templateVersion: "1.0.0",
        templateFamily: "marketing-launch",
        siteType: "marketing-landing-site",
        templateRoutes: ["/", "/pricing"],
      },
      routeContract: {
        requiredRoutes: ["/", "/pricing"],
        optionalRoutes: [],
        sharedShellContract: ["preserve shell"],
        routeOwnershipNotes: [],
      },
      selectedFoundations: {},
      selectedSeeds: { selected: [] },
      deploymentTarget: { target: "static-export", staticFirst: true, framework: "nextjs-app-router" },
      workspaceRoot: root,
    });

    await expect(fs.access(path.join(root, "AGENTS.md"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(root, ".shpitto", "skill-manifest.json"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(root, ".opencode", "skills", "build-marketing-site", "SKILL.md"))).resolves.toBeUndefined();
    const policy = await fs.readFile(path.join(root, "AGENTS.md"), "utf8");
    expect(policy).toContain("Write a JSON result to `.shpitto/skill-result.json`");
  });
});
