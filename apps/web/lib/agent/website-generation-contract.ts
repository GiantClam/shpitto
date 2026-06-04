import crypto from "node:crypto";

export type SelectedSeedSkillManifestEntry = {
  id: string;
  source: "shpitto" | "imported-open-design" | "imported-html-anything";
  reason?: string;
};

export type SelectedSeedContractEntry = {
  id: string;
  source: "shpitto" | "imported-open-design" | "imported-html-anything";
  reason?: string;
  contract: Record<string, unknown>;
};

export type SelectedSeedSkillManifest = {
  selected: SelectedSeedSkillManifestEntry[];
};

type SelectedSeedSkillManifestInput = string | SelectedSeedSkillManifestEntry;

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
  selectedSeedContracts: SelectedSeedContractEntry[];
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
  skillIds: SelectedSeedSkillManifestInput[],
  reason?: string,
): SelectedSeedSkillManifest {
  const entries: SelectedSeedSkillManifestEntry[] = [];
  for (const item of skillIds) {
    if (typeof item === "string") {
      const id = String(item || "").trim();
      if (!id) continue;
      entries.push({
        id,
        source: inferSeedSkillSource(id),
        reason,
      });
      continue;
    }
    const id = String(item?.id || "").trim();
    if (!id) continue;
    entries.push({
      id,
      source: item.source || inferSeedSkillSource(id),
      reason: item.reason || reason,
    });
  }

  return {
    selected: Array.from(new Map(entries.map((item) => [item.id, item])).values()),
  };
}

function normalizeSelectedSeedContracts(values: unknown): SelectedSeedContractEntry[] {
  if (!Array.isArray(values)) return [];
  const entries = values.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const id = String((item as any).id || "").trim();
    const rawSource = String((item as any).source || "").trim();
    const contract =
      (item as any).contract && typeof (item as any).contract === "object" && !Array.isArray((item as any).contract)
        ? stableSortObject((item as any).contract)
        : undefined;
    if (!id || !contract) return [];
    return [
      {
        id,
        source:
          rawSource === "imported-open-design" || rawSource === "imported-html-anything"
            ? rawSource
            : ("shpitto" as const),
        reason: String((item as any).reason || "").trim() || undefined,
        contract: contract as Record<string, unknown>,
      } satisfies SelectedSeedContractEntry,
    ];
  });
  return Array.from(new Map(entries.map((item) => [item.id, item])).values());
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
  selectedSeedContracts?: SelectedSeedContractEntry[];
  routeUnitContracts?: GenerationContractRouteUnit[];
}): WebsiteGenerationContract {
  const promptControlManifest = normalizeRecord(params.promptControlManifest);
  const discoveryBrief = normalizeRecord(params.discoveryBrief);
  const selectedSeedContracts = normalizeSelectedSeedContracts(params.selectedSeedContracts);
  const selectedSeedSkillManifest =
    params.selectedSeedSkillManifest ||
    buildSelectedSeedSkillManifest(
      selectedSeedContracts.map((item) => ({
        id: item.id,
        source: item.source,
        reason: item.reason,
      })),
      selectedSeedContracts.length > 0
        ? "seed skill manifest derived from selected seed contracts"
        : "no selected seed skill recorded",
    );
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
    selectedSeedContracts,
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
    selectedSeedContracts,
    routeUnitContracts,
  };
}
