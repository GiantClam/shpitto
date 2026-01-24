import crypto from "node:crypto";

type TrackResult = {
  payload?: Record<string, Record<string, unknown>>;
};

const CANONICAL_TYPES = [
  "Hero",
  "Stats",
  "Testimonials",
  "ValuePropositions",
  "ProductPreview",
  "FeatureHighlight",
  "CTASection",
  "FAQ",
  "Logos",
] as const;

const TYPE_ALIASES = new Map<string, (typeof CANONICAL_TYPES)[number]>([
  ["hero", "Hero"],
  ["stats", "Stats"],
  ["testimonials", "Testimonials"],
  ["valuepropositions", "ValuePropositions"],
  ["value_propositions", "ValuePropositions"],
  ["valueproposition", "ValuePropositions"],
  ["value_proposition", "ValuePropositions"],
  ["productpreview", "ProductPreview"],
  ["product_preview", "ProductPreview"],
  ["product", "ProductPreview"],
  ["featurehighlight", "FeatureHighlight"],
  ["feature_highlight", "FeatureHighlight"],
  ["ctasection", "CTASection"],
  ["cta_section", "CTASection"],
  ["faq", "FAQ"],
  ["logos", "Logos"],
  ["logo", "Logos"],
]);

export function normalizeComponentType(input: string): string {
  if (!input) return input;
  if ((CANONICAL_TYPES as readonly string[]).includes(input)) return input;

  const raw = input.trim();
  const exact = TYPE_ALIASES.get(raw.toLowerCase());
  if (exact) return exact;

  const normalized = raw.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const normalizedNoUnderscore = normalized.replace(/_/g, "");

  for (const [k, v] of TYPE_ALIASES.entries()) {
    if (k.replace(/_/g, "") === normalizedNoUnderscore) return v;
  }

  return input;
}

export function stitchTracks<T extends { pages: any[] }>(architect: T, trackResults: TrackResult[]): T {
  const payloads = trackResults.map((r) => r?.payload || {});

  const pages = architect.pages.map((page: any) => {
    const content = (page.puckData?.content || []).map((comp: any) => {
      const mergedProps = payloads.reduce((acc, p) => {
        const patch = p[comp.id];
        if (!patch) return acc;
        return { ...acc, ...patch };
      }, { ...(comp.props || {}) } as Record<string, unknown>);

      return {
        ...comp,
        props: mergedProps,
      };
    });

    return {
      ...page,
      puckData: {
        ...(page.puckData || {}),
        content,
      },
    };
  });

  return { ...(architect as any), pages };
}

type AtomicPatch = {
  id: string;
  path: string;
  value: unknown;
};

const setByDotPath = (obj: any, dotPath: string, value: unknown) => {
  const parts = dotPath.split(".").filter(Boolean);
  if (parts.length === 0) return obj;

  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cur[key];
    if (typeof next !== "object" || next === null) {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[parts[parts.length - 1]!] = value;
  return obj;
};

export function applyAtomicPatch<T extends { pages: any[] }>(project: T, patch: AtomicPatch): T {
  const pages = project.pages.map((page: any) => {
    const content = (page.puckData?.content || []).map((comp: any) => {
      if (comp.id !== patch.id) return comp;
      const next = structuredClone(comp);
      setByDotPath(next, patch.path, patch.value);
      return next;
    });
    return {
      ...page,
      puckData: {
        ...(page.puckData || {}),
        content,
      },
    };
  });

  return { ...(project as any), pages };
}

export function injectOrganizationJsonLd<T extends { branding?: any; pages: any[] }>(project: T): T {
  const name = project.branding?.name;
  const logo = project.branding?.logo;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    logo,
  };

  const pages = project.pages.map((page: any) => {
    const root = { ...(page.puckData?.root || {}) };
    const props = { ...(root.props || {}) };
    props.seoSchema = JSON.stringify(jsonLd);
    root.props = props;
    return {
      ...page,
      puckData: {
        ...(page.puckData || {}),
        root,
      },
    };
  });

  return { ...(project as any), pages };
}

type SkeletonInput = {
  brandingName: string;
  primary: string;
  accent: string;
  paths: string[];
};

const makeId = (base: string, n: number) => `${base}_${String(n).padStart(2, "0")}`;

const defaultPropsForType = (type: string) => {
  switch (type) {
    case "Hero":
      return { title: "Placeholder Title" };
    case "Stats":
      return { items: [{ label: "Metric", value: "0", suffix: "" }] };
    case "Testimonials":
      return { items: [{ content: "Testimonial", author: "Customer", role: "" }] };
    case "ValuePropositions":
      return { items: [{ title: "Benefit", description: "Description", icon: "Check" }] };
    case "ProductPreview":
      return { items: [{ title: "Item", description: "Description", image: "", tag: "" }] };
    case "FeatureHighlight":
      return { title: "Highlight", description: "Description", image: "", align: "left", features: [] };
    case "CTASection":
      return { title: "Call to Action", description: "Description", ctaText: "Get Started", ctaLink: "#", variant: "simple" };
    case "FAQ":
      return { items: [{ question: "Question", answer: "Answer" }] };
    case "Logos":
      return { items: [{ name: "Partner", logo: "https://logo.clearbit.com/example.com" }] };
    default:
      return {};
  }
};

const componentsForPath = (path: string) => {
  if (path === "/") {
    return [
      "Hero",
      "Logos",
      "Stats",
      "ValuePropositions",
      "FeatureHighlight",
      "ProductPreview",
      "Testimonials",
      "FAQ",
      "CTASection",
    ];
  }
  if (path.includes("about")) {
    return ["FeatureHighlight", "ValuePropositions", "Testimonials", "CTASection"];
  }
  if (path.includes("pricing")) {
    return ["ProductPreview", "ValuePropositions", "FAQ", "CTASection"];
  }
  if (path.includes("contact")) {
    return ["FeatureHighlight", "FAQ", "CTASection"];
  }
  if (path.includes("blog") || path.includes("news")) {
    return ["ProductPreview", "CTASection"];
  }
  if (path.includes("career") || path.includes("job")) {
    return ["ValuePropositions", "ProductPreview", "CTASection"];
  }
  if (path.includes("team")) {
    return ["ProductPreview", "FeatureHighlight", "CTASection"];
  }
  if (path.includes("service") || path.includes("product")) {
    return ["ProductPreview", "FeatureHighlight", "FAQ", "CTASection"];
  }
  return ["FeatureHighlight", "ValuePropositions", "CTASection"];
};

export function generateSkeletonProject(input: SkeletonInput) {
  const projectId = crypto.randomUUID();
  const branding = {
    name: input.brandingName,
    colors: { primary: input.primary, accent: input.accent },
    style: { borderRadius: "sm", typography: "Inter" },
  };

  const pages = input.paths.map((p) => {
    const types = componentsForPath(p);
    const counters = new Map<string, number>();
    const content = types.map((t) => {
      const current = (counters.get(t) || 0) + 1;
      counters.set(t, current);
      const base = t.replace(/[A-Z]/g, (m, idx) => (idx === 0 ? m.toLowerCase() : `_${m.toLowerCase()}`)).replace(/^_/, "");
      const id = makeId(base, current);
      return { id, type: t, props: defaultPropsForType(t) };
    });

    return {
      path: p,
      seo: { title: `${p === "/" ? "Home" : p.replace("/", "")} | ${input.brandingName}`, description: "Placeholder description." },
      puckData: { root: {}, content },
    };
  });

  return { projectId, branding, pages };
}
