import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { listWebsiteSeedSkillIds, loadProjectSkill, selectWebsiteSeedSkillsForIntent } from "./project-skill-loader";

const firstPartyWebsiteSeeds = [
  "open-design-web-prototype",
  "open-design-saas-landing",
  "open-design-dashboard",
  "open-design-pricing-page",
];

async function listCheckedInOpenDesignSkillDirs(): Promise<string[]> {
  const skillsRoot = path.join(process.cwd(), "skills");
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith("open-design-"))
    .sort();
}

describe("Open Design website skills in the real project environment", () => {
  it("discovers checked-in Open Design website skills from SKILL.md frontmatter", async () => {
    const checkedInOpenDesignSkills = await listCheckedInOpenDesignSkillDirs();
    const discoveredWebsiteSeeds = await listWebsiteSeedSkillIds();

    expect(checkedInOpenDesignSkills).toEqual(expect.arrayContaining(firstPartyWebsiteSeeds));
    expect(discoveredWebsiteSeeds).toEqual(expect.arrayContaining(checkedInOpenDesignSkills));
    expect(discoveredWebsiteSeeds).not.toContain("website-generation-workflow");

    for (const id of firstPartyWebsiteSeeds) {
      const skill = await loadProjectSkill(id);
      expect(skill.id).toBe(id);
      expect(skill.websiteMetadata?.mode).toBe("website");
      expect(skill.websiteMetadata?.platform).toBe("responsive");
      expect(skill.websiteMetadata?.preview?.entry).toBe("index.html");
      expect(skill.websiteMetadata?.designSystem?.requires).toBe(true);
      expect(skill.frontmatter.triggers.length).toBeGreaterThan(0);
    }
  });

  it("selects website seed skills by real frontmatter triggers instead of TS hardcoding", async () => {
    const cases = [
      {
        requirementText: "Create a SaaS product landing page with hero, social proof, pricing and CTA.",
        expectedId: "open-design-saas-landing",
      },
      {
        requirementText: "Build an admin dashboard for analytics, KPI cards, charts, incidents and operations.",
        expectedId: "open-design-dashboard",
      },
      {
        requirementText: "Generate a pricing page with plans, subscription tiers, comparison table and FAQ.",
        expectedId: "open-design-pricing-page",
      },
      {
        requirementText: "Draft a single page web prototype for a homepage with marketing content.",
        expectedId: "open-design-web-prototype",
      },
    ];

    for (const item of cases) {
      const selected = await selectWebsiteSeedSkillsForIntent({
        requirementText: item.requirementText,
        maxSkills: 1,
      });

      expect(selected[0]?.id).toBe(item.expectedId);
      expect(selected[0]?.score).toBeGreaterThan(0);
      expect(selected[0]?.reason).toMatch(/name|scenario|trigger/);
    }

    const fallback = await selectWebsiteSeedSkillsForIntent({
      requirementText: "Create a tasteful editorial website with strong responsive layouts.",
      maxSkills: 1,
    });
    expect(fallback[0]?.id).toBe("open-design-web-prototype");
    expect(fallback[0]?.reason).toBe("fallback:generic-website-seed");
  });
});
