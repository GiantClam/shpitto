type CuratedStockImage = {
  src: string;
  alt: string;
  caption: string;
};

const CURATED_STOCK_IMAGE_LIBRARY: Record<string, CuratedStockImage> = {
  "portfolio-home-operator": {
    src: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=1600",
    alt: "Product strategy workspace with laptop, notebook, and planning notes spread across a desk",
    caption: "Working notes, implementation trade-offs, and product thinking in view.",
  },
  "portfolio-blog-editorial": {
    src: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&q=80&w=1600",
    alt: "Editorial desk with laptop, notebook, and coffee beside active writing notes",
    caption: "Field notes, drafts, and practical writing in progress.",
  },
  "portfolio-about-session": {
    src: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&q=80&w=1600",
    alt: "Small team discussion around a table with notebooks and laptops open",
    caption: "Consulting conversations grounded in shared notes and concrete decisions.",
  },
  "portfolio-contact-workshop": {
    src: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&q=80&w=1600",
    alt: "Collaborative workshop table with people reviewing notes, laptops, and planning materials",
    caption: "Bring the workflow, the draft, or the open question and work through it clearly.",
  },
};

export { CURATED_STOCK_IMAGE_LIBRARY };
export type { CuratedStockImage };

function normalizeText(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function isPortfolioBlogSurface(requirementText: string): boolean {
  const text = normalizeText(requirementText);
  return /\b(?:portfolio|personal site|blog|writer|writing|essay|article|editorial|creator|consultant|profile|publication|journal|field note|technical blog)\b/i.test(
    text,
  );
}

function resolveCuratedPortfolioBucket(route: string, requirementText: string): keyof typeof CURATED_STOCK_IMAGE_LIBRARY | undefined {
  const normalizedRoute = String(route || "").trim().toLowerCase() || "/";
  const text = normalizeText(requirementText);
  const portfolioBlogSurface = isPortfolioBlogSurface(text);
  const blogLikeSurface = /\b(?:blog|article|essay|editorial|publication|journal|archive|field note)\b/i.test(text);

  if (normalizedRoute === "/blog" || normalizedRoute.startsWith("/blog/")) {
    return blogLikeSurface || portfolioBlogSurface ? "portfolio-blog-editorial" : undefined;
  }

  if (!portfolioBlogSurface) return undefined;
  if (normalizedRoute === "/") return "portfolio-home-operator";
  if (normalizedRoute === "/about") return "portfolio-about-session";
  if (normalizedRoute === "/contact") return "portfolio-contact-workshop";
  return undefined;
}

export function selectCuratedLibraryImage(route: string, requirementText: string): CuratedStockImage | undefined {
  const bucket = resolveCuratedPortfolioBucket(route, requirementText);
  return bucket ? CURATED_STOCK_IMAGE_LIBRARY[bucket] : undefined;
}
