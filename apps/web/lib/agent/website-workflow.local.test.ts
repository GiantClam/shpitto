import { describe, expect, it } from "vitest";
import { loadWorkflowSkillContext, resolveDesignSkillHit } from "./website-workflow";

describe("website-workflow local awesome-design templates", () => {
  it("loads design context from local templates without remote fetch", async () => {
    const prevRemote = process.env.AWESOME_DESIGN_ALLOW_REMOTE_FETCH;
    const prevRefresh = process.env.AWESOME_DESIGN_REFRESH;

    process.env.AWESOME_DESIGN_ALLOW_REMOTE_FETCH = "0";
    process.env.AWESOME_DESIGN_REFRESH = "1";

    try {
      const hit = await resolveDesignSkillHit("LC-CNC industrial precision manufacturing");
      expect(hit.id).toBeTruthy();
      expect(hit.id).not.toBe("awesome-index-unavailable");

      const context = await loadWorkflowSkillContext("LC-CNC industrial precision manufacturing");
      expect(context.hit.id).toBe(hit.id);
      expect(context.designMd.length).toBeGreaterThan(120);
      expect(context.hit.design_md_url?.startsWith("local://")).toBe(true);
      expect(context.hit.design_md_path?.startsWith("apps/web/skills/website-generation-workflow/")).toBe(true);
      expect(context.stylePreset.mode === "light" || context.stylePreset.mode === "dark").toBe(true);
      expect(context.hit.style_preset).toBeTruthy();
      expect(context.hit.style_preset?.colors?.primary).toMatch(/^#[0-9A-F]{6}$/);
      expect(context.templateBlueprint).toBeTruthy();
      expect(context.templateBlueprint.routeMode).toBe("fixed");
      expect(context.templateBlueprint.paths).toEqual(["/", "/company", "/products", "/news", "/cases", "/contact"]);
      expect(context.templateBlueprint.pages["/contact"]?.componentTypes).toContain("ContactForm");
    } finally {
      if (prevRemote === undefined) delete process.env.AWESOME_DESIGN_ALLOW_REMOTE_FETCH;
      else process.env.AWESOME_DESIGN_ALLOW_REMOTE_FETCH = prevRemote;

      if (prevRefresh === undefined) delete process.env.AWESOME_DESIGN_REFRESH;
      else process.env.AWESOME_DESIGN_REFRESH = prevRefresh;
    }
  });

  it("prefers industrial-friendly style candidates for LC-CNC prompts", async () => {
    const prompt = [
      "为 LC-CNC 生成完整 6 页面静态站点。",
      "行业：CNC 数控设备制造。",
      "目标用户：工厂采购、设备工程师、工艺负责人。",
      "视觉风格：工业科技、专业可信、深色+橙色点缀。",
      "必须包含页面：/ /company /products /news /cases /contact。",
    ].join("\n");

    const hit = await resolveDesignSkillHit(prompt);
    expect(hit.id).toBeTruthy();
    expect(hit.id).not.toBe("cal");
    expect(hit.id).not.toBe("intercom");
    const top = hit.selection_candidates || [];
    expect(top.length).toBeGreaterThan(0);
    expect(top.some((entry) => ["bmw", "tesla", "ferrari", "lamborghini", "renault"].includes(entry.id))).toBe(
      true,
    );
  });
});
