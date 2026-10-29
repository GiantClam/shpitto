import {
  buildPromptManifestRouteUnits,
  buildWebsiteGenerationContract,
  type SelectedSeedContractEntry,
  type SelectedSeedSkillManifest,
  type WebsiteGenerationContract,
} from "../agent/website-generation-contract.ts";
import { normalizeRouteUnitContract, type RouteUnitContract } from "./route-unit-contract.ts";

export type ImmutableGenerationContract = Omit<WebsiteGenerationContract, "routeUnitContracts"> & {
  routeUnitContracts: RouteUnitContract[];
};

export function normalizeWebsiteGenerationContract(contract: WebsiteGenerationContract): ImmutableGenerationContract {
  const base = buildWebsiteGenerationContract({
    generationLane: contract.generationLane,
    websiteSurfaceMode: contract.websiteSurfaceMode,
    productBaselineSelection: contract.productBaselineSelection,
    promptControlManifest: contract.promptControlManifest,
    discoveryBrief: contract.discoveryBrief,
    selectedSeedSkillManifest: contract.selectedSeedSkillManifest,
    selectedSeedContracts: contract.selectedSeedContracts,
    routeUnitContracts: contract.routeUnitContracts,
  });
  const routeUnits =
    base.routeUnitContracts?.length > 0
      ? base.routeUnitContracts
      : buildPromptManifestRouteUnits(base.promptControlManifest, base.selectedSeedSkillManifest);
  return {
    ...base,
    routeUnitContracts: routeUnits.map((item) => normalizeRouteUnitContract(item)),
  };
}

export function buildImmutableGenerationContract(params: {
  generationLane: string;
  websiteSurfaceMode?: string | null;
  productBaselineSelection?: WebsiteGenerationContract["productBaselineSelection"];
  promptControlManifest?: unknown;
  discoveryBrief?: unknown;
  selectedSeedSkillManifest?: SelectedSeedSkillManifest;
  selectedSeedContracts?: SelectedSeedContractEntry[];
  routeUnitContracts?: RouteUnitContract[];
}): ImmutableGenerationContract {
  const base = buildWebsiteGenerationContract({
    generationLane: params.generationLane,
    websiteSurfaceMode: params.websiteSurfaceMode,
    productBaselineSelection: params.productBaselineSelection,
    promptControlManifest: params.promptControlManifest,
    discoveryBrief: params.discoveryBrief,
    selectedSeedSkillManifest: params.selectedSeedSkillManifest,
    selectedSeedContracts: params.selectedSeedContracts,
    routeUnitContracts: params.routeUnitContracts,
  });
  return normalizeWebsiteGenerationContract(base);
}
