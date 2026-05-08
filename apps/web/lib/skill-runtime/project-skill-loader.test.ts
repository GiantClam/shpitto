import { describe, expect, it } from "vitest";
import os from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getWebsiteGenerationSkillBundle,
  listDocumentContentSkillIds,
  listWebsiteSeedSkillIds,
  loadProjectSkill,
  loadProjectSkillBundle,
  renderProjectSkillResourceIndex,
  resolveProjectSkillAlias,
  selectDocumentContentSkillsForIntent,
  selectWebsiteSeedSkillsForIntent,
} from "./project-skill-loader";

describe("project-skill-loader", () => {
  it("resolves aliases for brainstorming and writing-plans", () => {
    expect(resolveProjectSkillAlias("brainstorming")).toBe("superpowers-brainstorming");
    expect(resolveProjectSkillAlias("writing-plans")).toBe("superpowers-writing-plans");
    expect(resolveProjectSkillAlias("static-site-css-styles")).toBe("website-generation-workflow");
    expect(resolveProjectSkillAlias("web-prototype")).toBe("web-prototype");
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
    const skillIds = await getWebsiteGenerationSkillBundle();
    const bundle = await loadProjectSkillBundle(skillIds);
    expect(bundle.skills.length).toBeGreaterThanOrEqual(8);
    expect(bundle.resolvedIds).toContain("website-generation-workflow");
    expect(bundle.resolvedIds).toContain("superpowers-brainstorming");
    expect(bundle.resolvedIds).toContain("superpowers-writing-plans");
    expect(bundle.resolvedIds).toContain("web-image-generator");
    expect(bundle.resolvedIds).toContain("web-icon-library");
    expect(bundle.resolvedIds).toContain("open-design-web-prototype");
    expect(bundle.resolvedIds).toContain("open-design-saas-landing");
    expect(bundle.resolvedIds).toContain("open-design-dashboard");
    expect(bundle.resolvedIds).toContain("open-design-pricing-page");
    expect(bundle.resolvedIds).toContain("pdf");
    expect(bundle.resolvedIds).toContain("docx");
    expect(bundle.resolvedIds).toContain("pptx");
  });

  it("loads imported document content skills from apps/web/skills", async () => {
    const documentSkillIds = await listDocumentContentSkillIds();

    expect(documentSkillIds).toEqual(expect.arrayContaining(["pdf", "docx", "pptx"]));

    const [pdf, docx, pptx] = await Promise.all([
      loadProjectSkill("pdf"),
      loadProjectSkill("docx"),
      loadProjectSkill("pptx"),
    ]);

    expect(pdf.content).toContain("PDF Processing Guide");
    expect(docx.content).toContain("DOCX creation");
    expect(pptx.content).toContain("PPTX Skill");
  });

  it("discovers website seed skills from od.mode frontmatter", async () => {
    const seedIds = await listWebsiteSeedSkillIds();

    expect(seedIds).toEqual(
      expect.arrayContaining([
        "open-design-web-prototype",
        "open-design-saas-landing",
        "open-design-dashboard",
        "open-design-pricing-page",
      ]),
    );
  });

  it("loads website-only Open Design skill metadata", async () => {
    const skill = await loadProjectSkill("web-prototype");

    expect(skill.id).toBe("open-design-web-prototype");
    expect(skill.websiteMetadata?.mode).toBe("website");
    expect(skill.websiteMetadata?.platform).toBe("responsive");
    expect(skill.websiteMetadata?.preview?.entry).toBe("index.html");
    expect(skill.websiteMetadata?.designSystem?.requires).toBe(true);
  });

  it("indexes seed template and checklist resources into a compact summary", async () => {
    const skill = await loadProjectSkill("web-prototype");

    expect(skill.resourceIndex?.templateHtml?.path).toBe("assets/template.html");
    expect(skill.resourceIndex?.templateHtml?.tokenNames).toEqual(
      expect.arrayContaining(["--bg", "--surface", "--fg", "--muted", "--border", "--accent"]),
    );
    expect(skill.resourceIndex?.templateHtml?.responsiveBreakpoint).toBe("920px");
    expect(skill.resourceIndex?.checklist?.path).toBe("references/checklist.md");
    expect(skill.resourceIndex?.checklist?.p0Count).toBeGreaterThanOrEqual(8);
    expect(skill.resourceIndex?.checklist?.criticalChecks).toEqual(
      expect.arrayContaining(["No raw hex outside `:root` token block.", "No invented metrics."]),
    );
    expect(renderProjectSkillResourceIndex(skill.resourceIndex)).toContain("## Seed Resource Index");
    expect(renderProjectSkillResourceIndex(skill.resourceIndex)).toContain("assets/template.html: reusable HTML seed");
    expect(renderProjectSkillResourceIndex(skill.resourceIndex)).toContain("references/checklist.md: self-review gates");
  });

  it("selects seed skills by workflow intent instead of loading all seeds", async () => {
    const dashboard = await selectWebsiteSeedSkillsForIntent({
      requirementText: "为企业运营团队生成一个数据看板和管理后台，展示 KPI、趋势和告警。",
      maxSkills: 1,
    });
    expect(dashboard[0]?.id).toBe("open-design-dashboard");

    const pricing = await selectWebsiteSeedSkillsForIntent({
      requirementText: "生成一个 SaaS 定价页，包含套餐、订阅、方案对比和 FAQ。",
      maxSkills: 1,
    });
    expect(pricing[0]?.id).toBe("open-design-pricing-page");
  });

  it("selects document content skills from referenced assets", async () => {
    const selected = await selectDocumentContentSkillsForIntent({
      requirementText: "请读取上传材料并生成官网",
      referencedAssets: [
        "Asset: /project-assets/demo/files/uploads/company-profile.pdf",
        "Asset: /project-assets/demo/files/uploads/brand-brief.docx",
        "Asset: /project-assets/demo/files/uploads/investor-deck.pptx",
      ],
      maxSkills: 3,
    });

    expect(selected.map((item) => item.id)).toEqual(["docx", "pdf", "pptx"]);
    expect(selected.every((item) => item.reason.includes("asset:"))).toBe(true);
  });

  it("selects document content skills from user intent", async () => {
    const selected = await selectDocumentContentSkillsForIntent({
      requirementText: "需要读取 PDF、Word 文档和 PPT 演示内容，提取信息生成网站",
      maxSkills: 3,
    });

    expect(selected.map((item) => item.id)).toEqual(expect.arrayContaining(["pdf", "docx", "pptx"]));
  });

  it("rejects Open Design skills with non-website modes", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shpitto-od-skill-root-"));
    const skillRoot = path.join(tmpRoot, "skills", "bad-mobile-skill");
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(
      path.join(skillRoot, "SKILL.md"),
      [
        "---",
        "name: bad-mobile-skill",
        "od:",
        "  mode: mobile",
        "---",
        "",
        "# Bad Mobile Skill",
      ].join("\n"),
      "utf8",
    );

    await expect(loadProjectSkill("bad-mobile-skill", tmpRoot)).rejects.toThrow(/only "website" is allowed/);
  });
});
