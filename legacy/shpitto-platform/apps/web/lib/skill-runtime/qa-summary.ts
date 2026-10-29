export type QaIssueSummary = {
  code: string;
  severity: "error" | "warning";
  count: number;
};

export type QaSummary = {
  averageScore: number;
  totalRoutes: number;
  passedRoutes: number;
  totalRetries: number;
  retriesAllowed: number;
  antiSlopIssueCount: number;
  categories: QaIssueSummary[];
  observations?: Array<{
    code: "repeated-opening-family" | "visual-monotony" | "weak-hero";
    severity: "observation";
    message: string;
    routes: string[];
  }>;
  shadowVisualEvaluation?: {
    score: number;
    signals: Array<{
      code:
        | "authoredness"
        | "section-differentiation"
        | "seed-faithfulness"
        | "typography-palette-discipline"
        | "opening-non-generic-quality";
      verdict: "strong" | "mixed" | "weak";
      message: string;
      routes?: string[];
    }>;
  };
};

export type ShadowVisualEvaluationRouteUnit = {
  route: string;
  routeContract: string[];
  openingFamily?: string;
  openingTopology?: string;
};

function isEnabled(raw: string | undefined, defaultValue = true): boolean {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return defaultValue;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isShadowVisualQaEnabled(raw = process.env.SHPITTO_OD_VISUAL_QA_SHADOW): boolean {
  return isEnabled(raw, true);
}

export function buildShadowVisualEvaluation(params: {
  routeUnits: ShadowVisualEvaluationRouteUnit[];
  stylesCss?: string;
  selectedSeedSkillIds: string[];
}): QaSummary["shadowVisualEvaluation"] | undefined {
  if (!isShadowVisualQaEnabled()) return undefined;
  const routeUnits = Array.isArray(params.routeUnits) ? params.routeUnits : [];
  if (routeUnits.length === 0) return undefined;
  const nonHomeRoutes = routeUnits.filter((unit) => unit.route !== "/");
  const uniqueOpeningFamilies = new Set(nonHomeRoutes.map((unit) => unit.openingFamily).filter(Boolean));
  const seedFaithfulCount = routeUnits.filter((unit) => unit.routeContract.some((line) => /^seedContract=/.test(line))).length;
  const cssVarCount = (String(params.stylesCss || "").match(/--[a-z0-9-]+\s*:/gi) || []).length;
  const usesGenericHeroOnly =
    nonHomeRoutes.length > 0 && nonHomeRoutes.every((unit) => /(generic|route-specific lead band)/i.test(String(unit.openingTopology || "")));
  const signals: NonNullable<QaSummary["shadowVisualEvaluation"]>["signals"] = [
    {
      code: "authoredness",
      verdict: params.selectedSeedSkillIds.length > 0 && uniqueOpeningFamilies.size >= Math.max(1, Math.ceil(nonHomeRoutes.length / 2)) ? "strong" : "mixed",
      message:
        params.selectedSeedSkillIds.length > 0
          ? "Imported seed contracts are active and route openings show authored variation."
          : "No imported seed contract was active, so authoredness remains provisional.",
      routes: routeUnits.map((unit) => unit.route),
    },
    {
      code: "section-differentiation",
      verdict: uniqueOpeningFamilies.size >= Math.max(1, Math.ceil(nonHomeRoutes.length / 2)) ? "strong" : "weak",
      message:
        uniqueOpeningFamilies.size >= Math.max(1, Math.ceil(nonHomeRoutes.length / 2))
          ? "Interior routes use differentiated opening families rather than one repeated body rhythm."
          : "Too many interior routes still share the same opening family or cadence.",
      routes: nonHomeRoutes.map((unit) => unit.route),
    },
    {
      code: "seed-faithfulness",
      verdict: seedFaithfulCount >= Math.max(1, Math.ceil(routeUnits.length * 0.6)) ? "strong" : "mixed",
      message:
        seedFaithfulCount >= Math.max(1, Math.ceil(routeUnits.length * 0.6))
          ? "Most route contracts retain explicit seed ownership markers."
          : "Seed ownership is present but not consistently reflected across route contracts.",
      routes: routeUnits.filter((unit) => unit.routeContract.some((line) => /^seedContract=/.test(line))).map((unit) => unit.route),
    },
    {
      code: "typography-palette-discipline",
      verdict: cssVarCount >= 6 ? "strong" : "mixed",
      message:
        cssVarCount >= 6
          ? "The emitted stylesheet keeps a tokenized palette/typography surface instead of ad hoc scattered values."
          : "The emitted stylesheet shows limited token discipline, which weakens visual consistency.",
    },
    {
      code: "opening-non-generic-quality",
      verdict: !usesGenericHeroOnly ? "strong" : "weak",
      message: !usesGenericHeroOnly
        ? "Opening topology avoids a pure generic hero/grid/card collapse."
        : "Opening topology still leans too heavily on generic lead-band fallback wording.",
      routes: nonHomeRoutes.map((unit) => unit.route),
    },
  ];
  const scoreMap = { strong: 92, mixed: 78, weak: 62 } as const;
  const score = Math.round(signals.reduce((sum, signal) => sum + scoreMap[signal.verdict], 0) / Math.max(1, signals.length));
  return {
    score,
    signals,
  };
}
