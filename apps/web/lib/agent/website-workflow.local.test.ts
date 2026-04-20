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
      expect(context.designMd.length).toBeGreaterThan(0);
      expect(context.stylePreset.mode === "light" || context.stylePreset.mode === "dark").toBe(true);
      expect(context.hit.style_preset).toBeTruthy();
      expect(context.templateBlueprint).toBeTruthy();
      expect(["adaptive", "fixed"]).toContain(context.templateBlueprint.routeMode);
    } finally {
      if (prevRemote === undefined) delete process.env.AWESOME_DESIGN_ALLOW_REMOTE_FETCH;
      else process.env.AWESOME_DESIGN_ALLOW_REMOTE_FETCH = prevRemote;

      if (prevRefresh === undefined) delete process.env.AWESOME_DESIGN_REFRESH;
      else process.env.AWESOME_DESIGN_REFRESH = prevRefresh;
    }
  });

  it("returns stable top candidates for LC-CNC prompts without forced industrial fallback", async () => {
    const prompt = [
      "为 LC-CNC 生成完整 6 页面静态站点。",
      "行业：CNC 数控设备制造。",
      "目标用户：工厂采购、设备工程师、工艺负责人。",
      "视觉风格：工业科技、专业可信、深色+橙色点缀。",
      "必须包含页面：/ /company /products /news /cases /contact。",
    ].join("\n");

    const hit = await resolveDesignSkillHit(prompt);
    expect(hit.id).toBeTruthy();
    const top = hit.selection_candidates || [];
    expect(top.length).toBeGreaterThan(0);
    expect(top[0]?.id).toBe(hit.id);
  });
});
