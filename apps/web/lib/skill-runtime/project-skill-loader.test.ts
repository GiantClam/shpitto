import { describe, expect, it } from "vitest";
import os from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  loadProjectSkill,
  loadProjectSkillBundle,
  resolveProjectSkillAlias,
  WEBSITE_GENERATION_SKILL_BUNDLE,
} from "./project-skill-loader";

describe("project-skill-loader", () => {
  it("resolves aliases for brainstorming and writing-plans", () => {
    expect(resolveProjectSkillAlias("brainstorming")).toBe("superpowers-brainstorming");
    expect(resolveProjectSkillAlias("writing-plans")).toBe("superpowers-writing-plans");
    expect(resolveProjectSkillAlias("static-site-css-styles")).toBe("website-generation-workflow");
  });

  it("loads main website-generation-workflow skill from apps/web/skills", async () => {
    const skill = await loadProjectSkill("website-generation-workflow");
    expect(skill.id).toBe("website-generation-workflow");
    expect(skill.skillMdPath.replace(/\\/g, "/")).toContain("/apps/web/skills/website-generation-workflow/SKILL.md");
    expect(String(skill.content || "").length).toBeGreaterThan(50);
    expect(skill.content).toContain("Canonical Prompt Confirmation Gate");
    expect(skill.content).toContain("Page Differentiation Contract");
    expect(skill.content).toContain("Shared Shell/Footer Contract");
    expect(skill.content).toContain("Generation must not start from the raw user request alone");
    expect(skill.config?.routePlanningPolicy).toBeTruthy();
  });

  it("loads project skills when the deployment root is apps/web", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shpitto-skill-root-"));
    const skillRoot = path.join(tmpRoot, "skills", "website-generation-workflow");
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(path.join(skillRoot, "SKILL.md"), "# Website Generation\n\nDeployment-root skill fixture.", "utf8");
    await fs.writeFile(path.join(skillRoot, "skill.json"), JSON.stringify({ fixture: true }), "utf8");

    const skill = await loadProjectSkill("website-generation-workflow", tmpRoot);

    expect(skill.id).toBe("website-generation-workflow");
    expect(skill.skillMdPath.replace(/\\/g, "/")).toContain("/skills/website-generation-workflow/SKILL.md");
    expect(skill.content).toContain("Deployment-root skill fixture");
    expect(skill.config?.fixture).toBe(true);
  });

  it("loads project skills from monorepo root when start is apps/web", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shpitto-monorepo-skill-root-"));
    await fs.writeFile(path.join(tmpRoot, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
    const appRoot = path.join(tmpRoot, "apps", "web");
    const skillRoot = path.join(appRoot, "skills", "website-generation-workflow");
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(path.join(skillRoot, "SKILL.md"), "# Website Generation\n\nMonorepo-root skill fixture.", "utf8");

    const skill = await loadProjectSkill("website-generation-workflow", appRoot);

    expect(skill.id).toBe("website-generation-workflow");
    expect(skill.skillMdPath.replace(/\\/g, "/")).toContain("/apps/web/skills/website-generation-workflow/SKILL.md");
    expect(skill.content).toContain("Monorepo-root skill fixture");
  });

  it("loads website generation skill bundle with aliases", async () => {
    const bundle = await loadProjectSkillBundle(WEBSITE_GENERATION_SKILL_BUNDLE);
    expect(bundle.skills.length).toBeGreaterThanOrEqual(8);
    expect(bundle.resolvedIds).toContain("website-generation-workflow");
    expect(bundle.resolvedIds).toContain("superpowers-brainstorming");
    expect(bundle.resolvedIds).toContain("superpowers-writing-plans");
    expect(bundle.resolvedIds).toContain("web-image-generator");
    expect(bundle.resolvedIds).toContain("web-icon-library");
  });
});
