import {
  buildPromptManifestRouteUnits,
  buildWebsiteGenerationContract,
  type SelectedSeedSkillManifest,
  type WebsiteGenerationContract,
} from "../agent/website-generation-contract.ts";
import { normalizeRouteUnitContract, type RouteUnitContract } from "./route-unit-contract.ts";

export type ImmutableGenerationContract = Omit<WebsiteGenerationContract, "routeUnitContracts"> & {
  routeUnitContracts: RouteUnitContract[];
};

export function normalizeWebsiteGenerationContract(contract: WebsiteGenerationContract): ImmutableGenerationContract {
  const routeUnits =
    contract.routeUnitContracts?.length > 0
      ? contract.routeUnitContracts
      : buildPromptManifestRouteUnits(contract.promptControlManifest, contract.selectedSeedSkillManifest);
  return {
    ...contract,
    routeUnitContracts: routeUnits.map((item) => normalizeRouteUnitContract(item)),
  };
}

export function buildImmutableGenerationContract(params: {
  generationLane: string;
  websiteSurfaceMode?: string | null;
  promptControlManifest?: unknown;
  discoveryBrief?: unknown;
  selectedSeedSkillManifest?: SelectedSeedSkillManifest;
  routeUnitContracts?: RouteUnitContract[];
}): ImmutableGenerationContract {
  const base = buildWebsiteGenerationContract({
    generationLane: params.generationLane,
    websiteSurfaceMode: params.websiteSurfaceMode,
    promptControlManifest: params.promptControlManifest,
    discoveryBrief: params.discoveryBrief,
    selectedSeedSkillManifest: params.selectedSeedSkillManifest,
    routeUnitContracts: params.routeUnitContracts,
  });
  return normalizeWebsiteGenerationContract(base);
}

