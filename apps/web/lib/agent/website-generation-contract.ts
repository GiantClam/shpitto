import crypto from "node:crypto";

export type SelectedSeedSkillManifestEntry = {
  id: string;
  source: "shpitto" | "imported-open-design" | "imported-html-anything";
  reason?: string;
};

export type SelectedSeedSkillManifest = {
  selected: SelectedSeedSkillManifestEntry[];
};

export type GenerationContractRouteUnit = {
  route: string;
  navLabel: string;
  pageKind: string;
  routeContract: string[];
  openingFamily?: string;
  openingTopology?: string;
  inheritedSeedSkillIds?: string[];
};

export type WebsiteGenerationContract = {
  contractVersion: 1;
  contractHash: string;
  generationLane: string;
  websiteSurfaceMode: string;
  promptControlManifest: Record<string, unknown> | null;
  discoveryBrief: Record<string, unknown> | null;
  selectedSeedSkillManifest: SelectedSeedSkillManifest;
  routeUnitContracts: GenerationContractRouteUnit[];
};

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function stableSortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableSortObject(item));
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries.map(([key, entryValue]) => [key, stableSortObject(entryValue)]));
}

export function inferSeedSkillSource(skillId: string): SelectedSeedSkillManifestEntry["source"] {
  const normalized = String(skillId || "").trim().toLowerCase();
  if (normalized.startsWith("imported-open-design")) return "imported-open-design";
  if (normalized.startsWith("imported-html-anything")) return "imported-html-anything";
  return "shpitto";
}

export function buildSelectedSeedSkillManifest(
  skillIds: string[],
  reason?: string,
): SelectedSeedSkillManifest {
  return {
    selected: Array.from(new Set(skillIds.map((item) => String(item || "").trim()).filter(Boolean))).map((id) => ({
      id,
      source: inferSeedSkillSource(id),
      reason,
    })),
  };
}

export function buildPromptManifestRouteUnits(
  promptControlManifest: unknown,
  seedSkillManifest?: SelectedSeedSkillManifest,
): GenerationContractRouteUnit[] {
  const manifest = normalizeRecord(promptControlManifest);
  if (!manifest) return [];
  const pageIntents = Array.isArray(manifest.pageIntents) ? manifest.pageIntents : [];
  const inheritedSeedSkillIds = (seedSkillManifest?.selected || []).map((item) => item.id);
  return pageIntents.flatMap((entry) => {
    const item = normalizeRecord(entry);
    if (!item) return [];
    const route = String(item.route || "").trim();
    if (!route) return [];
    const navLabel = String(item.navLabel || "").trim() || (route === "/" ? "Home" : route.replace(/^\/+/, ""));
    const pageKind = String(item.pageKind || item.source || "intent").trim() || "intent";
    const purpose = String(item.purpose || "").trim();
    return [
      {
        route,
        navLabel,
        pageKind,
        routeContract: [`route=${route}`, `navLabel=${navLabel}`, `pageKind=${pageKind}`, ...(purpose ? [`purpose=${purpose}`] : [])],
        inheritedSeedSkillIds,
      } satisfies GenerationContractRouteUnit,
    ];
  });
}

export function buildWebsiteGenerationContract(params: {
  generationLane: string;
  websiteSurfaceMode?: string | null;
  promptControlManifest?: unknown;
  discoveryBrief?: unknown;
  selectedSeedSkillManifest?: SelectedSeedSkillManifest;
  routeUnitContracts?: GenerationContractRouteUnit[];
}): WebsiteGenerationContract {
  const promptControlManifest = normalizeRecord(params.promptControlManifest);
  const discoveryBrief = normalizeRecord(params.discoveryBrief);
  const selectedSeedSkillManifest =
    params.selectedSeedSkillManifest || buildSelectedSeedSkillManifest([], "no selected seed skill recorded");
  const routeUnitContracts =
    (params.routeUnitContracts || []).map((item) => ({
      ...item,
      routeContract: normalizeStringList(item.routeContract),
      inheritedSeedSkillIds: normalizeStringList(item.inheritedSeedSkillIds),
    })) || [];
  const websiteSurfaceMode =
    String(params.websiteSurfaceMode || promptControlManifest?.websiteSurfaceMode || discoveryBrief?.surfaceMode || "").trim() || "unknown";

  const hashPayload = stableSortObject({
    generationLane: params.generationLane,
    websiteSurfaceMode,
    promptControlManifest,
    discoveryBrief,
    selectedSeedSkillManifest,
    routeUnitContracts,
  });

  return {
    contractVersion: 1,
    contractHash: crypto.createHash("sha256").update(JSON.stringify(hashPayload)).digest("hex"),
    generationLane: params.generationLane,
    websiteSurfaceMode,
    promptControlManifest,
    discoveryBrief,
    selectedSeedSkillManifest,
    routeUnitContracts,
  };
}
