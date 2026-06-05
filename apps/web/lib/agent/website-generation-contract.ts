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

function inferManifestPageKind(route: string, navLabel: string, purpose: string, providedPageKind: string): string {
  const normalizedRoute = String(route || "").trim() || "/";
  const text = `${normalizedRoute} ${navLabel} ${purpose}`.toLowerCase();
  const normalizedProvided = String(providedPageKind || "").trim().toLowerCase();
  if (normalizedRoute === "/") return "home";
  if (normalizedProvided === "blog-data-index" || normalizedProvided === "content-collection-index") return normalizedProvided;
  if (/research|standards?|information(?:-platform)?|resource|resources|downloads?|library|documents?|publications?|reports?|knowledge-hub/.test(text)) {
    return "content-collection-index";
  }
  return String(providedPageKind || "intent").trim() || "intent";
}

function inferManifestOpeningFamily(route: string, navLabel: string, purpose: string, pageKind: string): string | undefined {
  if (route === "/") return "homepage";
  if (pageKind === "content-collection-index" || pageKind === "blog-data-index") return "collection";
  const text = `${route} ${navLabel} ${purpose}`.toLowerCase();
  if (/creation/.test(text)) return "route-owned";
  if (/construction/.test(text)) return "route-owned";
  if (/advocacy/.test(text)) return "content-hub";
  if (/certification/.test(text)) return "content-hub";
  if (/cases?|projects?|portfolio/.test(text)) return "evidence";
  if (/products?|catalog/.test(text)) return "catalog";
  if (/solutions?|services?/.test(text)) return "solutions";
  if (/contact|inquiry/.test(text)) return "conversion";
  if (/about|company|team|profile/.test(text)) return "identity";
  return "route-owned";
}

function inferManifestOpeningTopology(route: string, navLabel: string, purpose: string, pageKind: string): string | undefined {
  const text = `${route} ${navLabel} ${purpose}`.toLowerCase();
  if (route === "/") return "brand-led institutional masthead -> capability overview shelves -> standards/research proof band -> consultation or route CTA";
  if (pageKind === "content-collection-index" || pageKind === "blog-data-index") {
    if (/information(?:-platform)?|resource|resources|downloads?|library|materials?/.test(text)) {
      return "information-platform lead -> collection navigator -> standards/research/update ledgers";
    }
    if (/research|standards?|documents?|publications?|reports?/.test(text)) {
      return "research index lead -> topic navigator -> publication/evidence ledger";
    }
    return "knowledge-hub lead band -> collection navigator -> resource/result stack";
  }
  if (/creation/.test(text)) return "creation masthead -> narrative framework grid -> proof/CTA";
  if (/construction/.test(text)) return "process lead band -> execution roadmap -> implementation proof row";
  if (/certification/.test(text)) return "certification criteria lead -> scoring/results ledger -> review-prep and consultation band";
  if (/advocacy/.test(text)) return "advocacy lead band -> participation network -> action framework";
  if (/cases?|projects?|portfolio/.test(text)) return "evidence header -> case ledger -> outcome/proof strip";
  if (/products?|catalog/.test(text)) return "catalog lead band -> assortment navigator -> comparison/specification row";
  if (/solutions?|services?/.test(text)) return "process intro band -> collaboration timeline -> scenario-fit proof row";
  if (/contact|inquiry/.test(text)) return "conversion-first inquiry block -> contact channels -> response expectation row";
  if (/about|company|team|profile/.test(text)) return "company masthead -> operating profile slab -> trust/process strip";
  return "route-specific lead band -> primary content band -> supporting proof/CTA";
}

function buildManifestRouteContractHighlights(route: string, navLabel: string, purpose: string, pageKind: string): string[] {
  const text = `${route} ${navLabel} ${purpose}`.toLowerCase();
  const isInformationCollection = /information(?:-platform)?|resource|resources|downloads?|library|materials?/.test(text);
  const isResearchCollection = !isInformationCollection && /research|standards?|documents?|publications?|reports?/.test(text);
  if (pageKind !== "content-collection-index" && pageKind !== "blog-data-index") return [];
  const openingHints = isInformationCollection
    ? "routeOwnedOpening=information-platform-lead | resource-collection-lead | knowledge-hub-lead"
    : isResearchCollection
      ? "routeOwnedOpening=research-index-lead | knowledge-hub-lead | resource-collection-lead"
      : "routeOwnedOpening=knowledge-hub-lead | resource-collection-lead | collection-lead";
  const highlights = [
    openingHints,
    `openingRootClass=first visible <section> root must include ${openingHints.split("=")[1]}`,
    "openingLayout=one route-owned collection/index surface with the navigator inside the opening band",
    "openingMarkup=no <aside> inside the opening band; supporting proof must stay embedded inside the same route-owned root surface",
    "openingBan=no hero, hero--split, hero-grid, hero__grid, hero-copy, hero-panel, hero-aside, right-rail aside, or promo split-hero masthead",
  ];
  if (isInformationCollection) {
    highlights.push("openingIdentity=public information library or materials directory, not an entry point or gateway explainer");
  }
  if (isResearchCollection) {
    highlights.push("openingIdentity=research or standards index, not a promotional hero or faux product catalog");
  }
  return highlights;
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
    const pageKind = inferManifestPageKind(route, navLabel, String(item.purpose || ""), String(item.pageKind || item.source || "intent"));
    const purpose = String(item.purpose || "").trim();
    return [
      {
        route,
        navLabel,
        pageKind,
        routeContract: [
          `route=${route}`,
          `navLabel=${navLabel}`,
          `pageKind=${pageKind}`,
          ...(purpose ? [`purpose=${purpose}`] : []),
          ...buildManifestRouteContractHighlights(route, navLabel, purpose, pageKind),
        ],
        openingFamily: inferManifestOpeningFamily(route, navLabel, purpose, pageKind),
        openingTopology: inferManifestOpeningTopology(route, navLabel, purpose, pageKind),
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
