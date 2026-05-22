type CuratedStockImage = {
  src: string;
  alt: string;
  caption: string;
};

const CURATED_TOWEL_EXPORT_IMAGE_LIBRARY: Record<string, CuratedStockImage> = {
  "/": {
    src: "https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&q=80&w=1600",
    alt: "Folded beach towels beside a bright pool and sea-toned resort deck",
    caption: "Poolside and resort use contexts help buyers picture color, handfeel, and presentation together.",
  },
  "/products": {
    src: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=1400",
    alt: "Folded towel assortment showing material texture, colorways, and stack presentation",
    caption: "Folded assortments and material detail help buyers compare colorways, texture, and presentation quality at a glance.",
  },
  "/custom-solutions": {
    src: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=1400",
    alt: "Beach and hospitality towel setup suggesting branded resort and private-label programs",
    caption: "Hospitality and private-label towel programs become easier to evaluate when branding, packaging, and end-use context are shown together.",
  },
  "/cases": {
    src: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&q=80&w=1400",
    alt: "Towels arranged in a hospitality and beach-use scenario for buyer-facing case storytelling",
    caption: "Real hospitality and resort presentation scenes make application fit, finish, and buyer outcomes easier to judge.",
  },
  "/contact": {
    src: "https://images.unsplash.com/photo-1496417263034-38ec4f0b665a?auto=format&fit=crop&q=80&w=1200",
    alt: "Hospitality towel samples and packaging materials laid out for quotation review",
    caption: "Sample layouts and packaging references help buyers move faster from inquiry to quotation and specification follow-up.",
  },
  "/about": {
    src: "https://images.unsplash.com/photo-1513828583688-c52646db42da?auto=format&fit=crop&q=80&w=1400",
    alt: "Factory-side textile inspection and folded towel quality review",
    caption: "Factory-side inspection and quality review imagery reinforce production discipline and operating credibility.",
  },
};

export { CURATED_TOWEL_EXPORT_IMAGE_LIBRARY };
export type { CuratedStockImage };

export function shouldUseTowelExportLibrary(requirementText: string): boolean {
  return /(?:towel|textile|beach towel|bath towel|sports towel|pool|beach|spa|hospitality|resort|毛巾|纺织|泳池|沙滩|酒店|水疗)/i.test(
    String(requirementText || ""),
  );
}

export function selectCuratedLibraryImage(route: string, requirementText: string): CuratedStockImage | undefined {
  if (shouldUseTowelExportLibrary(requirementText)) {
    const normalizedRoute = String(route || "/").trim() || "/";
    return CURATED_TOWEL_EXPORT_IMAGE_LIBRARY[normalizedRoute] || CURATED_TOWEL_EXPORT_IMAGE_LIBRARY["/"];
  }
  return undefined;
}
