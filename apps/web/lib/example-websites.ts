export type ExampleWebsiteDefinition = {
  slug: "precision-components" | "industrial-trading" | "automation-supplier";
  label: string;
  eyebrow: string;
  summary: string;
  audience: string;
  positioning: string;
  pageHighlights: string[];
  seoFocus: string[];
  samplePrompt: string;
  useCaseHref: string;
  relatedGuideHref: string;
};

const EXAMPLE_WEBSITES: ExampleWebsiteDefinition[] = [
  {
    slug: "precision-components",
    label: "Precision Components Manufacturer",
    eyebrow: "Manufacturer Website Example",
    summary:
      "A sample export website direction for a factory that needs clearer technical positioning, stronger trust proof, and product/application pages for overseas buyers.",
    audience: "Best for OEM/ODM manufacturers selling engineered parts, assemblies, or custom-built components.",
    positioning:
      "Lead with production capability, tolerances, quality control, and target industries instead of a generic company profile.",
    pageHighlights: [
      "Homepage with manufacturing strengths, certifications, and product scope",
      "Product category pages organized by process, material, or component family",
      "Application pages for automotive, industrial equipment, and automation buyers",
      "Factory profile, QA workflow, and inquiry-ready contact page",
    ],
    seoFocus: ["manufacturer website", "precision parts supplier", "OEM components", "export website"],
    samplePrompt:
      "Build a professional export website for our precision components factory. Emphasize machining capability, quality control, target industries, and English-first SEO structure.",
    useCaseHref: "/use-cases/manufacturers",
    relatedGuideHref: "/blog/seo-friendly-export-website-for-manufacturers",
  },
  {
    slug: "industrial-trading",
    label: "Industrial Trading Company",
    eyebrow: "Trading Company Website Example",
    summary:
      "A sample website direction for trading teams that need to explain sourcing scope, supplier coordination, and response speed without sounding like a thin brochure site.",
    audience: "Best for export traders, sourcing teams, and companies coordinating multiple factories or product lines.",
    positioning:
      "Make supplier management, category coverage, and project responsiveness obvious to overseas buyers in the first screenful.",
    pageHighlights: [
      "Homepage centered on sourcing breadth and export service reliability",
      "Company profile with supplier control, QA process, and response workflow",
      "Product range pages segmented by buyer category and application",
      "RFQ page with category, spec, and buyer requirement prompts",
    ],
    seoFocus: ["trading company website", "industrial sourcing company", "export supplier", "RFQ website"],
    samplePrompt:
      "Create a trading company website for overseas buyers. Show our sourcing categories, supplier control process, export experience, and strong RFQ flow.",
    useCaseHref: "/use-cases/trading-companies",
    relatedGuideHref: "/blog/trading-company-homepage-checklist",
  },
  {
    slug: "automation-supplier",
    label: "Automation Components Supplier",
    eyebrow: "Industrial Supplier Example",
    summary:
      "A sample website direction for suppliers that need deeper product detail, application context, and clearer navigation between specs, industries, and buyer questions.",
    audience: "Best for industrial suppliers with broad catalogs, application-driven products, or technical buyer audiences.",
    positioning:
      "Connect product specifications to industries, materials, and use cases so buyers can understand fit faster and search engines can map topic clusters better.",
    pageHighlights: [
      "Homepage with product families and industry fit",
      "Detailed product pages with specifications, materials, and compatible applications",
      "Industry solution pages for packaging, robotics, and factory automation",
      "FAQ, support, and inquiry routes for technical buyers",
    ],
    seoFocus: ["industrial supplier website", "product catalog website", "automation components", "application pages"],
    samplePrompt:
      "Generate an industrial supplier website with product detail pages, application pages, and FAQ content for overseas technical buyers in factory automation.",
    useCaseHref: "/use-cases/industrial-suppliers",
    relatedGuideHref: "/blog/product-pages-for-overseas-buyers",
  },
];

export function getExampleWebsites() {
  return EXAMPLE_WEBSITES;
}
