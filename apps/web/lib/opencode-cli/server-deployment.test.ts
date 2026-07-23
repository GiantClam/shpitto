import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deployServerCapableTemplate } from "./server-deployment.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function createWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shpitto-server-deploy-"));
  roots.push(root);
  await fs.mkdir(path.join(root, ".shpitto"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ dependencies: { next: "16.2.4" }, scripts: { build: "next build" } }),
    "utf8",
  );
  await fs.writeFile(path.join(root, ".shpitto", "deployment-target.json"), '{"runtime":"server"}', "utf8");
  return root;
}

describe("server deployment adapter", () => {
  it("builds and deploys a Next.js workspace through the selected adapter", async () => {
    const workspaceRoot = await createWorkspace();
    const calls: string[][] = [];
    const result = await deployServerCapableTemplate({
      workspaceRoot,
      target: "vercel",
      projectName: "demo-template",
      commandRunner: async (command, args) => {
        calls.push([command, ...args]);
        if (args[0] === "deploy") return { stdout: "https://demo-template-abc.vercel.app deployment abc123", stderr: "" };
        return { stdout: "build ok", stderr: "" };
      },
    });

    expect(calls.map((call) => call.slice(1, 2))).toEqual([["install"], ["build"], ["deploy"]]);
    expect(result.deploymentUrl).toBe("https://demo-template-abc.vercel.app");
    expect(result.deploymentId).toBe("abc123");
    expect(result.rollbackCommand).toContain("vercel rollback");
  });

  it("does not treat a server workspace without a public Railway URL as deployed", async () => {
    const workspaceRoot = await createWorkspace();
    await expect(
      deployServerCapableTemplate({
        workspaceRoot,
        target: "railway",
        commandRunner: async () => ({ stdout: "deployment complete", stderr: "" }),
      }),
    ).rejects.toThrow(/public URL/);
  });

  it("builds a server workspace as a Docker image", async () => {
    const workspaceRoot = await createWorkspace();
    await fs.writeFile(path.join(workspaceRoot, "Dockerfile"), "FROM node:20-alpine\n", "utf8");
    const calls: string[][] = [];
    const result = await deployServerCapableTemplate({
      workspaceRoot,
      target: "docker",
      projectName: "demo-template",
      commandRunner: async (command, args) => {
        calls.push([command, ...args]);
        return { stdout: "Successfully tagged demo-template:latest", stderr: "" };
      },
    });

    expect(calls.at(-1)).toEqual(["docker", "build", "--tag", "demo-template:latest", "."]);
    expect(result.deploymentUrl).toBe("docker://demo-template:latest");
    expect(result.rollbackCommand).toContain("docker image rm");
  });
});
