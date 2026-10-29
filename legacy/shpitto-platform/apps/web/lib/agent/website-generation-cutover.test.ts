import { describe, expect, it } from "vitest";

import {
  buildWebsiteGenerationV2CutoverStatus,
  determineWebsiteGenerationDefaultLane,
} from "./website-generation-cutover";

describe("website-generation-cutover", () => {
  it("defaults website requests to the website-generation-mvp lane", () => {
    expect(determineWebsiteGenerationDefaultLane({})).toBe("website-generation-mvp");
  });

  it("supports explicit rollback to the legacy lane", () => {
    expect(
      determineWebsiteGenerationDefaultLane({
        SHPITTO_WEBSITE_GENERATION_LANE: "legacy",
      }),
    ).toBe("legacy");
    expect(
      determineWebsiteGenerationDefaultLane({
        SHPITTO_WEBSITE_GENERATION_MVP: "0",
      }),
    ).toBe("legacy");
  });

  it("reports cutover readiness only when the release gate passes and default lane is v2", () => {
    const ready = buildWebsiteGenerationV2CutoverStatus({
      env: {},
      releaseGate: {
        passed: true,
        matrixPassed: true,
        requiredPromotionFamilies: ["homepage"],
        requiredFreshScenarios: ["vbuy"],
        requiredDeployScenarios: ["vbuy"],
        requiredPassedScenarios: ["casux", "vbuy"],
        scenarios: [],
        reasons: [],
      },
    });
    expect(ready.readyForDefaultCutover).toBe(true);
    expect(ready.blockers).toEqual([]);

    const blocked = buildWebsiteGenerationV2CutoverStatus({
      env: {
        SHPITTO_WEBSITE_GENERATION_LANE: "legacy",
      },
      releaseGate: {
        passed: false,
        matrixPassed: false,
        requiredPromotionFamilies: ["homepage"],
        requiredFreshScenarios: ["vbuy"],
        requiredDeployScenarios: ["vbuy"],
        requiredPassedScenarios: ["casux", "vbuy"],
        scenarios: [],
        reasons: ["casux is preview_only"],
      },
    });
    expect(blocked.readyForDefaultCutover).toBe(false);
    expect(blocked.blockers).toEqual(
      expect.arrayContaining([
        "casux is preview_only",
        "website-generation-v2 release gate is not passing",
        "default website-generation lane is not set to website-generation-mvp",
      ]),
    );
  });
});
