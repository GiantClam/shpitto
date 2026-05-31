export function normalizeBlogTaxonomyLabel(value: unknown, fallback = "") {
  const label = String(value ?? "").replace(/\s+/g, " ").trim();
  return label || fallback;
}

const BLOG_TAXONOMY_ACRONYMS: Record<string, string> = {
  ai: "AI",
  api: "API",
  b2b: "B2B",
  cms: "CMS",
  erp: "ERP",
  faq: "FAQ",
  oem: "OEM",
  odm: "ODM",
  saas: "SaaS",
  seo: "SEO",
  ui: "UI",
  ux: "UX",
};

function formatBlogTaxonomyToken(token: string) {
  if (!/[A-Za-z]/.test(token)) return token;

  const lower = token.toLowerCase();
  const acronym = BLOG_TAXONOMY_ACRONYMS[lower];
  if (acronym) return acronym;

  if (/^[A-Z0-9]+$/.test(token) && /[A-Z]/.test(token)) {
    return token;
  }

  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

export function slugifyBlogTaxonomy(value: unknown, fallback = "topic") {
  const label = normalizeBlogTaxonomyLabel(value);
  if (!label) return fallback;

  const slug = label
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^-\p{Letter}\p{Number}]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

export function blogCategoryHref(category: unknown) {
  return `/blog/category/${encodeURIComponent(slugifyBlogTaxonomy(category, "category"))}`;
}

export function blogTagHref(tag: unknown) {
  return `/blog/tag/${encodeURIComponent(slugifyBlogTaxonomy(tag, "tag"))}`;
}

export function blogTaxonomyMatches(value: unknown, slugOrLabel: unknown) {
  return slugifyBlogTaxonomy(value) === slugifyBlogTaxonomy(slugOrLabel);
}

export function humanizeBlogTaxonomySlug(value: unknown, fallback = "Blog") {
  const slug = normalizeBlogTaxonomyLabel(value);
  if (!slug) return fallback;
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => (/^[a-z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function formatBlogTaxonomyDisplayLabel(value: unknown, fallback = "Blog") {
  const label = normalizeBlogTaxonomyLabel(value);
  if (!label) return fallback;
  return label.replace(/[A-Za-z0-9]+/g, (token) => formatBlogTaxonomyToken(token));
}

export function collectBlogTaxonomyMap(values: Array<unknown>) {
  const map = new Map<string, string>();
  for (const value of values) {
    const label = normalizeBlogTaxonomyLabel(value);
    if (!label) continue;
    const slug = slugifyBlogTaxonomy(label);
    if (!map.has(slug)) {
      map.set(slug, label);
    }
  }
  return map;
}
