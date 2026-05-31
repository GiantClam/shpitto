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
    expect(skill.content).toContain("website-refinement-workflow");
    expect(skill.content).toContain("Preview-stage visual and copy feedback");
    expect(skill.config?.routePlanningPolicy).toBeTruthy();
  });

  it("loads first-stage orchestrator and type-specific website skills", async () => {
    const orchestrator = await loadProjectSkill("website-orchestrator");
    const corporate = await loadProjectSkill("corporate-b2b-site");

    expect(orchestrator.id).toBe("website-orchestrator");
    expect(orchestrator.content).toContain("matching type-specific website generator skill");
    expect(corporate.id).toBe("corporate-b2b-site");
    expect(corporate.content).toContain("official company presence");
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
    expect(bundle.resolvedIds).toContain("website-orchestrator");
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
  }, 20_000);

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

  it("discovers active imported website skills from nested namespaces without TS aliases", async () => {
    const seedIds = await listWebsiteSeedSkillIds();

    expect(seedIds).toEqual(
      expect.arrayContaining([
        "docs-knowledge-foundation",
        "content-hub-foundation",
        "docs-reference-template",
        "content-resource-template",
      ]),
    );

    const skill = await loadProjectSkill("docs-knowledge-foundation");
    expect(skill.skillMdPath.replace(/\\/g, "/")).toContain(
      "/apps/web/skills/imported-open-design/docs-knowledge-foundation/SKILL.md",
    );
    expect(skill.websiteMetadata?.activation?.rolloutStatus).toBe("active");
    expect(skill.websiteMetadata?.activation?.mode).toBe("primary");
    expect(skill.resourceIndex?.exampleHtml?.path).toBe("example.html");
    expect(renderProjectSkillResourceIndex(skill.resourceIndex)).toContain("example.html: example-backed HTML contract");
  });

  it("discovers active imported HTML Anything website skills from nested namespaces", async () => {
    const docsSkill = await loadProjectSkill("docs-reference-template");
    const contentSkill = await loadProjectSkill("content-resource-template");

    expect(docsSkill.skillMdPath.replace(/\\/g, "/")).toContain(
      "/apps/web/skills/imported-html-anything/docs-reference-template/SKILL.md",
    );
    expect(docsSkill.websiteMetadata?.activation?.compatibleSurfaceModes).toContain("docs-knowledge-site");
    expect(contentSkill.websiteMetadata?.activation?.compatibleSurfaceModes).toContain("content-hub-site");
  });

  it("keeps imported skill activation gated in native generator mode for non-imported flows", async () => {
    const previous = process.env.SHPITTO_OD_IMPORTED_SKILLS;
    const previousGenerator = process.env.SHPITTO_SITE_GENERATOR;
    delete process.env.SHPITTO_OD_IMPORTED_SKILLS;
    process.env.SHPITTO_SITE_GENERATOR = "native";

    const defaultSelected = await selectWebsiteSeedSkillsForIntent({
      requirementText: "Build a corporate B2B website with products, solutions, and contact.",
      routes: ["/", "/products", "/solutions", "/contact"],
      maxSkills: 3,
    });
    expect(defaultSelected.map((item) => item.id)).not.toContain("docs-knowledge-foundation");

    process.env.SHPITTO_OD_IMPORTED_SKILLS = "1";
    const enabledSelected = await selectWebsiteSeedSkillsForIntent({
      requirementText: "Build a documentation knowledge base with implementation guides and references.",
      maxSkills: 3,
    });
    expect(enabledSelected.map((item) => item.id)).toContain("docs-knowledge-foundation");

    if (previous === undefined) delete process.env.SHPITTO_OD_IMPORTED_SKILLS;
    else process.env.SHPITTO_OD_IMPORTED_SKILLS = previous;
    if (previousGenerator === undefined) delete process.env.SHPITTO_SITE_GENERATOR;
    else process.env.SHPITTO_SITE_GENERATOR = previousGenerator;
  });

  it("uses default hybrid generator mode to promote compatible Open Design and HTML Anything primary seeds", async () => {
    const previous = process.env.SHPITTO_OD_IMPORTED_SKILLS;
    const previousGenerator = process.env.SHPITTO_SITE_GENERATOR;
    delete process.env.SHPITTO_OD_IMPORTED_SKILLS;
    delete process.env.SHPITTO_SITE_GENERATOR;

    const selected = await selectWebsiteSeedSkillsForIntent({
      requirementText: "Build a documentation knowledge base with implementation guides and API reference routes.",
      routes: ["/", "/docs", "/guides", "/api-reference", "/support"],
      maxSkills: 4,
    });
    const ids = selected.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(["docs-knowledge-foundation", "docs-reference-template"]));
    expect(selected.find((item) => item.id === "docs-knowledge-foundation")?.reason).toContain("generator:hybrid:open-design");
    expect(selected.find((item) => item.id === "docs-reference-template")?.reason).toContain("generator:hybrid:html-anything");

    if (previous === undefined) delete process.env.SHPITTO_OD_IMPORTED_SKILLS;
    else process.env.SHPITTO_OD_IMPORTED_SKILLS = previous;
    if (previousGenerator === undefined) delete process.env.SHPITTO_SITE_GENERATOR;
    else process.env.SHPITTO_SITE_GENERATOR = previousGenerator;
  });

  it("treats all first-stage website surfaces as imported-skill-first by default", async () => {
    const previous = process.env.SHPITTO_OD_IMPORTED_SKILLS;
    delete process.env.SHPITTO_OD_IMPORTED_SKILLS;

    const docs = await selectWebsiteSeedSkillsForIntent({
      requirementText: "Build a documentation knowledge base with API reference and implementation guides.",
      routes: ["/", "/docs", "/guides", "/api-reference"],
      maxSkills: 2,
    });

    expect(docs.some((item) => item.reason.includes("imported-skill-first:docs-knowledge-site"))).toBe(true);
    const corporate = await selectWebsiteSeedSkillsForIntent({
      requirementText: "Build a corporate B2B website with products, solutions, cases, and contact.",
      routes: ["/", "/products", "/solutions", "/cases", "/contact"],
      maxSkills: 3,
    });
    expect(corporate.some((item) => item.reason.includes("imported-skill-first:corporate-b2b-site"))).toBe(true);

    if (previous === undefined) delete process.env.SHPITTO_OD_IMPORTED_SKILLS;
    else process.env.SHPITTO_OD_IMPORTED_SKILLS = previous;
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

  it("selects the pricing seed as a controlled imported primary companion for pricing routes on supported surfaces", async () => {
    const selected = await selectWebsiteSeedSkillsForIntent({
      requirementText: "Create a corporate B2B website for an enterprise software vendor.",
      routes: ["/", "/solutions", "/pricing", "/contact"],
      maxSkills: 2,
    });

    const pricing = selected.find((item) => item.id === "open-design-pricing-page");
    expect(pricing?.reason).toContain("surface:corporate-b2b-site");

    const skill = await loadProjectSkill("open-design-pricing-page");
    expect(skill.websiteMetadata?.activation?.compatibleSurfaceModes).toEqual(
      expect.arrayContaining(["marketing-landing-site", "corporate-b2b-site"]),
    );
  });

  it("keeps reusable quality skills as English executable website contracts", async () => {
    const skillIds = [
      "responsive-by-default",
      "section-quality-checklist",
      "design-system-enforcement",
      "visual-qa-mandatory",
      "end-to-end-validation",
    ];
    const skills = await Promise.all(skillIds.map((id) => loadProjectSkill(id)));

    for (const skill of skills) {
      expect(skill.content).toContain("contract");
      expect(skill.content).not.toMatch(/[\u4e00-\u9fff]/);
      expect(skill.content).not.toMatch(/�|鈥|涓|绔|瑙|闇|鐢|鍝/);
    }
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
