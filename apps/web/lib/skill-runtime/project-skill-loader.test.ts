import { describe, expect, it } from "vitest";
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
