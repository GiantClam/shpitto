import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { prepareProductizedTemplateWorkspace } from "./template-lifecycle.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("productized template lifecycle", () => {
  it("copies an existing workspace for refinement and overlays the operation skill", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "shpitto-template-lifecycle-"));
    roots.push(root);
    const sourceRoot = path.join(root, "source");
    const targetRoot = path.join(root, "target");
    const state = {
      messages: [new HumanMessage("Build an AI image generation product.")],
      workflow_context: {
        skillId: "build-ai-image-tool",
        sourceRequirement: "Build an AI image generation product with a generator and history.",
        templateSkillId: "build-ai-image-tool",
      },
      sitemap: ["/", "/app/generate", "/app/history"],
    } as any;

    const generated = await prepareProductizedTemplateWorkspace({
      operation: "generate",
      baseSkillId: "build-ai-image-tool",
      state,
      workspaceRoot: sourceRoot,
    });
    const sentinel = path.join(sourceRoot, "app", "page.tsx");
    await fs.appendFile(sentinel, "\nexport const lifecycleSentinel = true;\n", "utf8");

    const refined = await prepareProductizedTemplateWorkspace({
      operation: "refine",
      baseSkillId: "build-ai-image-tool",
      state: { ...state, site_artifacts: generated.projectArtifact } as any,
      workspaceRoot: targetRoot,
      sourceWorkspaceRoot: sourceRoot,
      projectArtifact: generated.projectArtifact,
    });

    expect(await fs.readFile(sentinel.replace(sourceRoot, targetRoot), "utf8")).toContain("lifecycleSentinel");
    expect(refined.request.skillId).toBe("template-modify");
    expect(refined.request.taskClass).toBe("scoped_refinement");
    await expect(fs.access(path.join(targetRoot, ".opencode", "skills", "template-modify", "SKILL.md"))).resolves.toBeUndefined();
    expect((refined.projectArtifact as any).shpittoWorkspace.rootDir).toBe(targetRoot);
  });
});
