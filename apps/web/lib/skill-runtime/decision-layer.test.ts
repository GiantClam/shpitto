import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { buildLocalDecisionPlan } from "./decision-layer";

describe("decision-layer", () => {
  it("builds structured page blueprints from prompt and nav", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Generate an industrial site. Nav: Home | 3C Machines | Custom Solutions | Cases | About | Contact",
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.routes.length).toBeGreaterThanOrEqual(6);
    expect(plan.pageBlueprints.length).toBe(plan.routes.length);

    const contact = plan.pageBlueprints.find((page) => page.route === "/contact");
    expect(contact).toBeTruthy();
    expect(contact?.contentSkeleton).toContain("quote-form");
    expect(Number(contact?.componentMix.form || 0)).toBeGreaterThan(20);
  });
});
