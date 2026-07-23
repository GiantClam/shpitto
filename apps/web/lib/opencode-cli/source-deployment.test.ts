import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { packageSourceWorkspace } from "./source-deployment.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("source deployment adapter", () => {
  it("packages runnable source without local secrets or build caches", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shpitto-source-workspace-"));
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shpitto-source-output-"));
    roots.push(workspaceRoot, outputRoot);
    await fs.mkdir(path.join(workspaceRoot, ".shpitto"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, ".opencode", "node_modules", "dependency"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "node_modules"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, ".next"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "package.json"), "{}", "utf8");
    await fs.writeFile(path.join(workspaceRoot, ".env.local"), "SECRET=hidden", "utf8");
    await fs.writeFile(path.join(workspaceRoot, ".env.example"), "SECRET=", "utf8");
    await fs.writeFile(path.join(workspaceRoot, ".shpitto", "opencode-session.json"), "{}", "utf8");
    await fs.writeFile(path.join(workspaceRoot, ".opencode", "node_modules", "dependency", "index.js"), "module.exports = {};", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "app.tsx"), "export {};", "utf8");

    const result = await packageSourceWorkspace({ workspaceRoot, outputRoot, packageName: "demo" });

    expect(result.target).toBe("source");
    expect(await fs.readFile(path.join(outputRoot, "app.tsx"), "utf8")).toContain("export");
    await expect(fs.access(path.join(outputRoot, ".env.local"))).rejects.toThrow();
    await expect(fs.access(path.join(outputRoot, "node_modules"))).rejects.toThrow();
    await expect(fs.access(path.join(outputRoot, ".opencode"))).rejects.toThrow();
    await expect(fs.access(path.join(outputRoot, ".shpitto", "opencode-session.json"))).rejects.toThrow();
    expect(await fs.readFile(path.join(outputRoot, "SHPITTO-SOURCE-PACKAGE.json"), "utf8")).toContain('"target": "source"');
  });
});
