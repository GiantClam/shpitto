import {
  evaluateWebsiteGenerationReleaseGate,
  type WebsiteGenerationReleaseGate,
} from "./website-generation-release-gate.ts";

export type WebsiteGenerationDefaultLane = "legacy" | "website-generation-mvp";

export type WebsiteGenerationV2CutoverStatus = {
  defaultLane: WebsiteGenerationDefaultLane;
  releaseGatePassed: boolean;
  readyForDefaultCutover: boolean;
  rollbackAvailable: boolean;
  rollbackEnv: {
    SHPITTO_WEBSITE_GENERATION_LANE: "legacy";
    SHPITTO_WEBSITE_GENERATION_MVP: "0";
  };
  blockers: string[];
  releaseGate: WebsiteGenerationReleaseGate;
};

function envFlagEnabled(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return !["0", "false", "off", "no", "disabled"].includes(normalized);
}

export function determineWebsiteGenerationDefaultLane(
  env: Record<string, string | undefined> = process.env,
): WebsiteGenerationDefaultLane {
  const rawLane = String(env.SHPITTO_WEBSITE_GENERATION_LANE || "")
    .trim()
    .toLowerCase();
  const explicitMvpFlag = String(env.SHPITTO_WEBSITE_GENERATION_MVP || "").trim();
  const disabledByLane = rawLane === "legacy" || rawLane === "off" || rawLane === "disabled";
  const enabled = disabledByLane ? false : explicitMvpFlag ? envFlagEnabled(explicitMvpFlag, true) : true;
  return enabled ? "website-generation-mvp" : "legacy";
}

export function buildWebsiteGenerationV2CutoverStatus(params: {
  releaseGate: WebsiteGenerationReleaseGate;
  env?: Record<string, string | undefined>;
}): WebsiteGenerationV2CutoverStatus {
  const defaultLane = determineWebsiteGenerationDefaultLane(params.env);
  const blockers = [...params.releaseGate.reasons];
  if (!params.releaseGate.passed) {
    blockers.push("website-generation-v2 release gate is not passing");
  }
  if (defaultLane !== "website-generation-mvp") {
    blockers.push("default website-generation lane is not set to website-generation-mvp");
  }
  return {
    defaultLane,
    releaseGatePassed: params.releaseGate.passed,
    readyForDefaultCutover: params.releaseGate.passed && defaultLane === "website-generation-mvp",
    rollbackAvailable: true,
    rollbackEnv: {
      SHPITTO_WEBSITE_GENERATION_LANE: "legacy",
      SHPITTO_WEBSITE_GENERATION_MVP: "0",
    },
    blockers,
    releaseGate: params.releaseGate,
  };
}

export async function evaluateWebsiteGenerationV2CutoverStatus(): Promise<WebsiteGenerationV2CutoverStatus> {
  const releaseGate = await evaluateWebsiteGenerationReleaseGate();
  return buildWebsiteGenerationV2CutoverStatus({ releaseGate });
}
