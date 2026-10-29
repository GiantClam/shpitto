export type UseCaseSlug = "manufacturers" | "trading-companies" | "industrial-suppliers";

export type UseCaseDefinition = {
  slug: UseCaseSlug;
  label: string;
  shortLabel: string;
  href: `/use-cases/${UseCaseSlug}`;
  eyebrow: string;
  title: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  audience: string;
  outcomes: string[];
  keyPages: string[];
  benefits: Array<{ title: string; description: string }>;
  faq: Array<{ question: string; answer: string }>;
  matchingBlogCategories: string[];
  relatedGuide: {
    slug: string;
    title: string;
  };
};

const USE_CASES: UseCaseDefinition[] = [
  {
    slug: "manufacturers",
    label: "Manufacturer Website",
    shortLabel: "Manufacturers",
    href: "/use-cases/manufacturers",
    eyebrow: "Export Manufacturer Websites",
    title: "Build a manufacturer website that helps overseas buyers trust you faster",
    description:
      "Shpitto helps manufacturers turn factory strengths, product lines, and application knowledge into an export website with clearer positioning, stronger product pages, and better SEO foundations.",
    seoTitle: "Manufacturer Website Builder for Export B2B Teams | Shpitto",
    seoDescription:
      "Build an SEO-friendly manufacturer website with AI. Shpitto helps factories create export-ready company pages, product pages, and buyer-focused content faster.",
    audience: "Best for factories, OEM/ODM teams, and industrial manufacturers selling to overseas buyers.",
    outcomes: [
      "Explain what you make, who you serve, and why buyers should trust your factory.",
      "Turn product lines and technical capabilities into structured category and detail pages.",
      "Support export SEO with dedicated company, product, and application content instead of a brochure-style homepage only.",
    ],
    keyPages: [
      "Homepage with product range, proof points, and export positioning",
      "Factory profile and company capability pages",
      "Product category and product detail pages",
      "Application or industry pages for buyer intent",
      "FAQ and inquiry pages for sales follow-up",
    ],
    benefits: [
      {
        title: "Professional English-first copy",
        description: "Draft clear company and product content without starting from a blank page.",
      },
      {
        title: "SEO-friendly structure",
        description: "Organize manufacturer, product, and application pages around clearer search intent.",
      },
      {
        title: "Easier updates after launch",
        description: "Keep refining specs, proof points, and messaging as your export priorities change.",
      },
    ],
    faq: [
      {
        question: "Is this only for large factories?",
        answer: "No. It also fits small and mid-sized manufacturers that need a clearer English website for export sales.",
      },
      {
        question: "Can it handle many product categories?",
        answer: "Yes. The use case is designed around structured product categories, product detail pages, and application pages.",
      },
      {
        question: "Does it help with SEO content planning?",
        answer: "Yes. The page model encourages dedicated pages for company, product, and industry search intent instead of one generic company profile.",
      },
    ],
    matchingBlogCategories: ["Manufacturer Website"],
    relatedGuide: {
      slug: "seo-friendly-export-website-for-manufacturers",
      title: "How Manufacturers Can Build an SEO-Friendly Export Website",
    },
  },
  {
    slug: "trading-companies",
    label: "Trading Company Website",
    shortLabel: "Trading Companies",
    href: "/use-cases/trading-companies",
    eyebrow: "Trading Company Websites",
    title: "Build a trading company website that makes sourcing strength easier to understand",
    description:
      "Shpitto helps trading companies explain product scope, supplier coordination, and response speed with a website structure that supports trust, SEO, and inquiry conversion.",
    seoTitle: "Trading Company Website Builder for Export Teams | Shpitto",
    seoDescription:
      "Create a professional trading company website with AI. Shpitto helps export teams publish sourcing, product, and inquiry-ready pages faster.",
    audience: "Best for sourcing teams, export traders, and companies managing multiple supplier or product lines.",
    outcomes: [
      "Show sourcing capability, product range, and operational responsiveness without generic brochure copy.",
      "Guide visitors from homepage positioning into product, category, and inquiry paths.",
      "Keep company and market content easier to update as supplier focus or export markets change.",
    ],
    keyPages: [
      "Homepage focused on sourcing capability and export trust",
      "Company profile with process, supplier control, and service strengths",
      "Product range and category pages",
      "Industry or buyer-solution pages",
      "Contact and RFQ-oriented inquiry pages",
    ],
    benefits: [
      {
        title: "Clearer positioning for overseas buyers",
        description: "Explain product breadth and supply coordination in practical buyer language.",
      },
      {
        title: "Stronger inquiry routes",
        description: "Turn company and product content into clearer next steps for RFQs and contact requests.",
      },
      {
        title: "Reusable content system",
        description: "Keep updating categories, markets, and trust signals without rebuilding the whole site.",
      },
    ],
    faq: [
      {
        question: "Does this fit companies with mixed product lines?",
        answer: "Yes. The page structure supports broad product catalogs and multiple sourcing categories.",
      },
      {
        question: "Can the homepage focus on company credibility instead of ecommerce checkout?",
        answer: "Yes. This use case is built for lead generation and export inquiries, not storefront checkout flows.",
      },
      {
        question: "Can I keep adding markets or industries later?",
        answer: "Yes. You can expand the site with more category, application, and market pages as your business grows.",
      },
    ],
    matchingBlogCategories: ["Trading Company Website"],
    relatedGuide: {
      slug: "trading-company-homepage-checklist",
      title: "What a Trading Company Homepage Should Include",
    },
  },
  {
    slug: "industrial-suppliers",
    label: "Industrial Supplier Website",
    shortLabel: "Industrial Suppliers",
    href: "/use-cases/industrial-suppliers",
    eyebrow: "Industrial Supplier Websites",
    title: "Build an industrial supplier website around products, applications, and buyer questions",
    description:
      "Shpitto helps industrial suppliers organize specifications, application fit, and proof content into pages that are easier for overseas buyers and search engines to understand.",
    seoTitle: "Industrial Supplier Website Builder for Product SEO | Shpitto",
    seoDescription:
      "Create an SEO-friendly industrial supplier website with AI. Shpitto helps teams publish product, application, and inquiry-ready pages for overseas buyers.",
    audience: "Best for industrial suppliers that need stronger product detail, application content, and inquiry-focused website structure.",
    outcomes: [
      "Turn specifications, materials, and applications into product pages that are easier to evaluate.",
      "Reduce content sprawl by separating product, application, and company information clearly.",
      "Support search visibility with pages aligned to buyer questions instead of one oversized catalog page.",
    ],
    keyPages: [
      "Homepage with product scope and industry fit",
      "Product detail pages with specifications and use cases",
      "Application or solution pages by industry segment",
      "Company profile and quality-assurance pages",
      "FAQ, contact, and inquiry pages",
    ],
    benefits: [
      {
        title: "Application-led content",
        description: "Connect products to industries, materials, and buyer problems with clearer page structure.",
      },
      {
        title: "Better product detail depth",
        description: "Support product evaluation with dedicated specification and trust-content sections.",
      },
      {
        title: "Search-ready content clusters",
        description: "Build a stronger semantic relationship between company pages, product pages, and application pages.",
      },
    ],
    faq: [
      {
        question: "Is this suitable for catalog-heavy suppliers?",
        answer: "Yes. It works well when you need category pages, product detail pages, and supporting application content.",
      },
      {
        question: "Can it support technical buyers?",
        answer: "Yes. The structure is useful for combining plain-language buyer positioning with technical product details.",
      },
      {
        question: "Does it support multilingual expansion later?",
        answer: "Yes. You can start with English export content and expand into more languages as new markets open.",
      },
    ],
    matchingBlogCategories: ["Product Catalog Website"],
    relatedGuide: {
      slug: "product-pages-for-overseas-buyers",
      title: "How to Structure Product Pages for Overseas Buyers",
    },
  },
];

export function getAllUseCases() {
  return USE_CASES;
}

export function getFeaturedUseCases() {
  return USE_CASES;
}

export function getUseCaseHref(slug: UseCaseSlug) {
  return `/use-cases/${slug}` as const;
}

export function getUseCaseBySlug(slug: string) {
  return USE_CASES.find((item) => item.slug === slug) || null;
}

export function findUseCaseByBlogCategory(category: unknown) {
  const normalizedCategory = String(category || "").trim().toLowerCase();
  if (!normalizedCategory) return null;
  return (
    USE_CASES.find((item) => item.matchingBlogCategories.some((value) => value.toLowerCase() === normalizedCategory)) || null
  );
}

export function findUseCasesByBlogCategories(categories: Array<unknown>) {
  const results: UseCaseDefinition[] = [];
  const seen = new Set<string>();

  for (const category of categories) {
    const useCase = findUseCaseByBlogCategory(category);
    if (!useCase || seen.has(useCase.slug)) continue;
    seen.add(useCase.slug);
    results.push(useCase);
  }

  return results;
}
