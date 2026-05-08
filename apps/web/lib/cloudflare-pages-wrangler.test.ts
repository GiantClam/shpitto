import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Bundler } from "./bundler";
import { deployWithWrangler, materializeBundleForWrangler } from "./cloudflare-pages-wrangler";

const createdRoots: string[] = [];

async function cleanup() {
  await Promise.all(createdRoots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
}

afterEach(async () => {
  await cleanup();
});

describe("cloudflare-pages-wrangler", () => {
  it("materializes a bundle into a Pages deployment directory", async () => {
    const bundle = await Bundler.createBundle({
      staticSite: {
        mode: "skill-direct",
        files: [
          { path: "/index.html", type: "text/html", content: "<!doctype html><html><body>ok</body></html>" },
          { path: "/_worker.js", type: "application/javascript", content: "export default {};" },
        ],
      },
    });
    const outputDir = path.resolve(process.cwd(), ".tmp", `wrangler-test-${Date.now()}`);
    createdRoots.push(outputDir);

    const result = await materializeBundleForWrangler(bundle, outputDir);

    expect(result.fileCount).toBe(2);
    expect(await fs.readFile(path.join(outputDir, "index.html"), "utf8")).toContain("<body>ok</body>");
    expect(await fs.readFile(path.join(outputDir, "_worker.js"), "utf8")).toContain("export default");
  });

  it("runs wrangler pages deploy with project name and returns production alias", async () => {
    const bundle = await Bundler.createBundle({
      staticSite: {
        mode: "skill-direct",
        files: [{ path: "/index.html", type: "text/html", content: "<!doctype html><html><body>ok</body></html>" }],
      },
    });
    const outputRoot = path.resolve(process.cwd(), ".tmp", `wrangler-runner-test-${Date.now()}`);
    createdRoots.push(outputRoot);
    let captured: { command: string; args: string[]; cwd?: string } | undefined;

    const result = await deployWithWrangler({
      taskId: "task-1",
      projectName: "Shpitto Blog Runtime Test",
      bundle,
      outputRoot,
      commandRunner: async (command, args, options) => {
        captured = { command, args, cwd: options.cwd };
        return {
          stdout: "Published at https://abc123.shpitto-blog-runtime-test.pages.dev",
          stderr: "",
        };
      },
    });

    expect(captured?.args).toEqual(
      expect.arrayContaining(["pages", "deploy", "--project-name", "shpitto-blog-runtime-test", "--branch", "main"]),
    );
    expect(result.deploymentUrl).toBe("https://abc123.shpitto-blog-runtime-test.pages.dev");
    expect(result.productionUrl).toBe("https://shpitto-blog-runtime-test.pages.dev");
  });
});
