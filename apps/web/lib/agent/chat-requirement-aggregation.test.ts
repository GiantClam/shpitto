import { describe, expect, it } from "vitest";
import {
  aggregateRequirementFromHistory,
  buildRequirementPatchPlan,
  buildRequirementSlots,
  buildRequirementSpec,
  getRequirementCompletionPercent,
} from "./chat-orchestrator";

describe("chat requirement aggregation", () => {
  it("aggregates recent user messages and deduplicates repeated inputs", () => {
    const aggregated = aggregateRequirementFromHistory({
      historyUserMessages: [
        "做一个工业网站",
        "做一个工业网站",
        "目标用户是海外采购",
        "页面包含 Home About Contact",
      ],
      currentUserText: "风格蓝色，部署到 cloudflare",
      maxMessages: 6,
    });

    expect(aggregated.sourceMessages.length).toBe(4);
    expect(aggregated.requirementText).toContain("海外采购");
    expect(aggregated.requirementText).toContain("cloudflare");
  });

  it("fills more slots after multi-turn aggregation", () => {
    const text = aggregateRequirementFromHistory({
      historyUserMessages: [
        "LC-CNC 是工业设备制造商",
        "目标受众是海外采购和工程师",
        "需要 Home/About/Products/Cases/Contact",
      ],
      currentUserText: "视觉风格科技蓝，CTA 联系我们，部署到cloudflare",
    }).requirementText;
    const slots = buildRequirementSlots(text);
    const percent = getRequirementCompletionPercent(slots);
    expect(percent).toBeGreaterThanOrEqual(70);
  });

  it("lets later correction turns supersede conflicting earlier requirements", () => {
    const aggregated = aggregateRequirementFromHistory({
      historyUserMessages: ["生成英文站点", "风格蓝色，面向海外采购"],
      currentUserText: "不要英文，改成中文，主色换成绿色",
    });
    const spec = buildRequirementSpec(aggregated.requirementText, aggregated.sourceMessages);
    const patchPlan = buildRequirementPatchPlan("不要英文，改成中文，主色换成绿色", aggregated.revision);

    expect(aggregated.supersededMessages.join("\n")).toContain("英文");
    expect(spec.locale).toBe("zh-CN");
    expect(spec.visualStyle).toContain("绿色");
    expect(spec.visualStyle).not.toContain("蓝色");
    expect(spec.targetAudience).toContain("采购");
    expect(spec.fields.locale?.sourceText).toContain("中文");
    expect(patchPlan.operations.some((op) => op.op === "remove" && op.target === "locale")).toBe(true);
    expect(patchPlan.operations.some((op) => op.op === "set" && op.target === "visualStyle")).toBe(true);
  });
});
