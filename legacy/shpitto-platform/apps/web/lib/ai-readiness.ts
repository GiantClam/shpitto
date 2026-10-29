export type AiReadinessPillar = {
  title: string;
  description: string;
  points: string[];
};

const AI_READINESS_PILLARS: AiReadinessPillar[] = [
  {
    title: "Clear company, product, and application hierarchy",
    description:
      "AI systems and search engines work better when company information, product categories, product details, and application pages have distinct jobs.",
    points: [
      "Separate homepage positioning from deeper product and application pages",
      "Avoid burying every topic inside one oversized company profile",
      "Use headings and page intent that map to how overseas buyers actually search",
    ],
  },
  {
    title: "Buyer-language content with usable technical detail",
    description:
      "Export websites need plain-language positioning plus the specification and proof details that help technical buyers evaluate fit.",
    points: [
      "Explain products, tolerances, certifications, or sourcing strengths in concrete terms",
      "Connect technical detail to buyer outcomes instead of listing raw features only",
      "Keep FAQs, contact paths, and trust signals close to the relevant pages",
    ],
  },
  {
    title: "Structured metadata and linked topic clusters",
    description:
      "Metadata, breadcrumb paths, and related-page links help crawlers and AI agents understand how your content fits together.",
    points: [
      "Use descriptive titles, canonical paths, and article or FAQ schema where appropriate",
      "Link category pages, blog posts, and use-case pages around the same topic cluster",
      "Keep page slugs and taxonomy labels consistent across the site",
    ],
  },
];

export const AI_READY_FAQ = [
  {
    question: "What does AI-ready content mean for an export website?",
    answer:
      "It means your website content is structured clearly enough for both human buyers and AI systems to identify company strengths, product scope, applications, and inquiry paths without guessing.",
  },
  {
    question: "Is AI-ready content different from SEO content?",
    answer:
      "It overlaps with SEO, but the emphasis is broader. SEO helps pages rank and get discovered, while AI-ready content also improves how language models and answer engines interpret your company and products.",
  },
  {
    question: "Do manufacturers and trading companies need separate page structures?",
    answer:
      "Usually yes. Manufacturers often need stronger product, factory, and application proof, while trading companies need clearer sourcing breadth, supplier coordination, and RFQ paths.",
  },
  {
    question: "Can Shpitto help after the first version goes live?",
    answer:
      "Yes. The goal is not one-off copy generation. Shpitto is meant to support ongoing updates to company pages, product pages, and industry content as the business evolves.",
  },
];

export function getAiReadinessPillars() {
  return AI_READINESS_PILLARS;
}
