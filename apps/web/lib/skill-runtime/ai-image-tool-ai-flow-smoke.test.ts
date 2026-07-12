import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildPreparedWorkspaceBundle } from "../opencode-cli/nextjs-baseline.ts";

const temporaryRoots: string[] = [];

async function writeBundle(rootDir: string, files: Array<{ path: string; content: string }>) {
  for (const file of files) {
    const absolutePath = path.join(rootDir, file.path);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.content, "utf8");
  }
}

afterAll(async () => {
  for (const root of temporaryRoots) {
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe("ai-image-tool AI flow smoke", () => {
  it("materializes prompt input, result preview, replay, and failed-state placeholders", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "shpitto-ai-flow-smoke-"));
    temporaryRoots.push(rootDir);

    const bundle = buildPreparedWorkspaceBundle({
      workspaceRoot: rootDir,
      request: {
        skillId: "build-ai-image-tool",
        taskClass: "baseline_generation",
        projectRoot: rootDir,
        userIntentSummary: "Launch the canonical AI image template baseline.",
        executionScope: "full-baseline",
        successCriteria: ["all required routes exist", "shared shell is preserved"],
        structuredInputs: {
          productName: "FluxKrea Free",
          industry: "AI image generation or creative tooling",
          targetAudience: ["creators", "AI makers"],
          primaryGoal: ["launch an AI image tool baseline"],
          locale: "en",
          routes: [
            "/",
            "/pricing",
            "/flux-prompt-generator",
            "/sign-in",
            "/app",
            "/app/generate",
            "/app/history",
            "/app/giftcode",
            "/app/order",
            "/privacy-policy",
            "/terms-of-use",
          ],
        },
        templateContext: {
          templateId: "ai-image-tool-starter",
          siteType: "ai-image-tool-site",
          templateFamily: "ai-image-tool-platform",
          foundations: ["ai-tool-product-foundation"],
          seeds: ["fluxkreafree-product-template"],
        },
      },
      templateManifest: {
        templateId: "ai-image-tool-baseline-v1",
        templateVersion: "2026-06-29",
        templateFamily: "ai-image-tool-platform",
        siteType: "ai-image-tool-site",
        templateRoutes: [
          "/",
          "/pricing",
          "/flux-prompt-generator",
          "/sign-in",
          "/app",
          "/app/generate",
          "/app/history",
          "/app/giftcode",
          "/app/order",
          "/privacy-policy",
          "/terms-of-use",
        ],
      },
      routeContract: {
        requiredRoutes: [
          "/",
          "/pricing",
          "/flux-prompt-generator",
          "/sign-in",
          "/app",
          "/app/generate",
          "/app/history",
          "/app/giftcode",
          "/app/order",
          "/privacy-policy",
          "/terms-of-use",
        ],
        optionalRoutes: [],
        sharedShellContract: ["preserve shared nav", "preserve shared footer"],
        routeOwnershipNotes: [],
      },
      selectedFoundations: {
        designSystemName: "AI Tool Product Foundation",
      },
      selectedSeeds: {
        selected: [{ id: "fluxkreafree-product-template", source: "shpitto" }],
      },
      deploymentTarget: {
        target: "vercel",
        staticFirst: true,
        framework: "nextjs-app-router",
      },
    });

    await writeBundle(rootDir, bundle.workspaceFiles);

    const workspaceComponent = await fs.readFile(
      path.join(rootDir, "components/sections/ai-image-tool/app-workspace.tsx"),
      "utf8",
    );
    const historyComponent = await fs.readFile(
      path.join(rootDir, "components/sections/ai-image-tool/history-timeline.tsx"),
      "utf8",
    );
    const promptGeneratorPage = await fs.readFile(
      path.join(rootDir, "app/flux-prompt-generator/page.tsx"),
      "utf8",
    );
    const generateApiRoute = await fs.readFile(
      path.join(rootDir, "app/api/generate/route.ts"),
      "utf8",
    );

    expect(workspaceComponent).toContain("<textarea");
    expect(workspaceComponent).toContain("fetch('/api/generate'");
    expect(workspaceComponent).toContain("Run mock generation");
    expect(workspaceComponent).toContain("Result preview");
    expect(workspaceComponent).toContain("failed generation recovered with prompt edits ready for retry");
    expect(workspaceComponent).toContain("Retry last failed run");
    expect(historyComponent).toContain("Replay this run, duplicate the prompt, or export the selected image.");
    expect(promptGeneratorPage).toContain("PromptGeneratorSurface");
    expect(generateApiRoute).toContain('export async function POST');
    expect(generateApiRoute).toContain("Mock generation failed. Adjust prompt structure and retry.");
  });
});
