type CuratedStockImage = {
  src: string;
  alt: string;
  caption: string;
};

// Keep the generic website-generation path free of scenario-specific stock defaults.
// Route media should come from the active prompt/spec contract or runtime-selected stock search,
// not from a hardcoded industry library baked into the executor.
const CURATED_STOCK_IMAGE_LIBRARY: Record<string, CuratedStockImage> = {};

export { CURATED_STOCK_IMAGE_LIBRARY };
export type { CuratedStockImage };

export function selectCuratedLibraryImage(_route: string, _requirementText: string): CuratedStockImage | undefined {
  return undefined;
}
