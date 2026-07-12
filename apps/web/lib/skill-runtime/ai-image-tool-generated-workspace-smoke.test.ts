import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildPreparedWorkspaceBundle } from "../opencode-cli/nextjs-baseline.ts";

const runGeneratedWorkspaceBuild = process.env.RUN_AI_IMAGE_TEMPLATE_WORKSPACE_BUILD === "1";
const temporaryRoots: string[] = [];

async function writeBundle(rootDir: string, files: Array<{ path: string; content: string }>) {
  for (const file of files) {
    const absolutePath = path.join(rootDir, file.path);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.content, "utf8");
  }
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", [command, ...args].join(" ")], {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
            shell: false,
          })
        : spawn(command, args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
            shell: false,
          });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

async function startServer(
  cwd: string,
  port: number,
): Promise<{
  stop: () => Promise<void>;
}> {
  const { spawn } = await import("node:child_process");
  const child =
    process.platform === "win32"
      ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `corepack pnpm start --hostname 127.0.0.1 --port ${port}`], {
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
        })
      : spawn("corepack", ["pnpm", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
        });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const response = await fetch(baseUrl);
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {}
  }

  if (!ready) {
    try {
      child.kill("SIGTERM");
    } catch {}
    throw new Error(`Generated workspace server did not become ready.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }

  return {
    stop: async () => {
      if (!child.killed) {
        try {
          child.kill("SIGTERM");
        } catch {}
      }
    },
  };
}

afterAll(async () => {
  for (const root of temporaryRoots) {
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe("ai-image-tool generated workspace smoke", () => {
  it("materializes the canonical baseline routes and template artifacts", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "shpitto-ai-image-template-"));
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
            "/flux-ai",
            "/flux-schnell",
            "/krea-alternative",
            "/pricing",
            "/flux-prompt-generator",
            "/blog",
            "/sign-in",
            "/signin",
            "/sign-up",
            "/cms",
            "/cms/tasks",
            "/cms/projects",
            "/cms/assets",
            "/cms/settings",
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
          defaultRoutes: [
            "/",
            "/flux-ai",
            "/flux-schnell",
            "/krea-alternative",
            "/pricing",
            "/flux-prompt-generator",
            "/blog",
            "/sign-in",
            "/signin",
            "/sign-up",
            "/cms",
            "/cms/tasks",
            "/cms/projects",
            "/cms/assets",
            "/cms/settings",
            "/app",
            "/app/generate",
            "/app/history",
            "/app/giftcode",
            "/app/order",
            "/privacy-policy",
            "/terms-of-use",
          ],
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
          "/flux-ai",
          "/flux-schnell",
          "/krea-alternative",
          "/pricing",
          "/flux-prompt-generator",
          "/blog",
          "/sign-in",
          "/signin",
          "/sign-up",
          "/cms",
          "/cms/tasks",
          "/cms/projects",
          "/cms/assets",
          "/cms/settings",
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
          "/flux-ai",
          "/flux-schnell",
          "/krea-alternative",
          "/pricing",
          "/flux-prompt-generator",
          "/blog",
          "/sign-in",
          "/signin",
          "/sign-up",
          "/cms",
          "/cms/tasks",
          "/cms/projects",
          "/cms/assets",
          "/cms/settings",
          "/app",
          "/app/generate",
          "/app/history",
          "/app/giftcode",
          "/app/order",
          "/privacy-policy",
          "/terms-of-use",
        ],
        optionalRoutes: [],
        sharedShellContract: [
          "preserve shared nav",
          "preserve shared footer",
        ],
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

    const expectedFiles = [
      "app/page.tsx",
      "app/pricing/page.tsx",
      "app/flux-prompt-generator/page.tsx",
      "app/sign-in/page.tsx",
      "app/cms/page.tsx",
      "app/cms/tasks/page.tsx",
      "app/cms/projects/page.tsx",
      "app/cms/assets/page.tsx",
      "app/cms/settings/page.tsx",
      "app/app/page.tsx",
      "app/app/generate/page.tsx",
      "app/app/history/page.tsx",
      "app/app/giftcode/page.tsx",
      "app/app/order/page.tsx",
      "app/api/generate/route.ts",
      "lib/cms.ts",
      "components/sections/ai-image-tool/cms-shell.tsx",
      "app/privacy-policy/page.tsx",
      "app/terms-of-use/page.tsx",
      ".shpitto/template-manifest.json",
      "README.md",
    ];

    for (const relativePath of expectedFiles) {
      await expect(fs.access(path.join(rootDir, relativePath))).resolves.toBeUndefined();
    }

    const generatePage = await fs.readFile(path.join(rootDir, "app/app/generate/page.tsx"), "utf8");
    const historyPage = await fs.readFile(path.join(rootDir, "app/app/history/page.tsx"), "utf8");
    const orderPage = await fs.readFile(path.join(rootDir, "app/app/order/page.tsx"), "utf8");
    const cmsPage = await fs.readFile(path.join(rootDir, "app/cms/page.tsx"), "utf8");
    const cmsTasksPage = await fs.readFile(path.join(rootDir, "app/cms/tasks/page.tsx"), "utf8");
    const cmsAdapter = await fs.readFile(path.join(rootDir, "lib/cms.ts"), "utf8");
    expect(generatePage).toContain("GenerateConsole");
    expect(historyPage).toContain("HistoryTimeline");
    expect(orderPage).toContain("OrderPanel");
    expect(cmsPage).toContain("getCmsOverview");
    expect(cmsTasksPage).toContain("getCmsTasks");
    expect(cmsAdapter).toContain("PAYLOAD_API_URL");
    expect(cmsAdapter).toContain("PRODUCT_API_URL");

    if (runGeneratedWorkspaceBuild) {
      const installResult = await runCommand("corepack", ["pnpm", "install"], rootDir);
      expect(installResult.exitCode).toBe(0);

      const buildResult = await runCommand("corepack", ["pnpm", "build"], rootDir);
      expect(buildResult.exitCode).toBe(0);
      expect(buildResult.stdout).toContain("Compiled successfully");

      const port = 4137;
      const server = await startServer(rootDir, port);
      try {
        const requiredRoutes = [
          "/",
          "/pricing",
          "/flux-prompt-generator",
          "/sign-in",
          "/cms",
          "/cms/tasks",
          "/cms/projects",
          "/cms/assets",
          "/cms/settings",
          "/app",
          "/app/generate",
          "/app/history",
          "/app/giftcode",
          "/app/order",
          "/privacy-policy",
          "/terms-of-use",
        ];
        for (const route of requiredRoutes) {
          const response = await fetch(`http://127.0.0.1:${port}${route}`);
          expect(response.status).toBe(200);
        }

        const successResponse = await fetch(`http://127.0.0.1:${port}/api/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: "studio portrait mock" }),
        });
        const successPayload = (await successResponse.json()) as {
          ok?: boolean;
          result?: { imageUrl?: string };
        };
        expect(successResponse.status).toBe(200);
        expect(successPayload.ok).toBe(true);
        expect(String(successPayload.result?.imageUrl || "")).toContain("data:image/svg+xml");

        const failedResponse = await fetch(`http://127.0.0.1:${port}/api/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: "fail this mock request" }),
        });
        const failedPayload = (await failedResponse.json()) as {
          ok?: boolean;
          error?: string;
        };
        expect(failedResponse.status).toBe(422);
        expect(failedPayload.ok).toBe(false);
        expect(failedPayload.error).toMatch(/Mock generation failed/i);
      } finally {
        await server.stop();
      }
    }
  }, runGeneratedWorkspaceBuild ? 180_000 : 10_000);
});
