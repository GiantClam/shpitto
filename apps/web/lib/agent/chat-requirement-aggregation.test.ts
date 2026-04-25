import { describe, expect, it } from "vitest";
import { aggregateRequirementFromHistory, buildRequirementSlots, getRequirementCompletionPercent } from "./chat-orchestrator";

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
});

