export type WebsiteDesignDirection = {
  id: string;
  label: string;
  zhLabel: string;
  mood: string;
  zhMood: string;
  references: string[];
  displayFont: string;
  bodyFont: string;
  monoFont?: string;
  palette: {
    bg: string;
    surface: string;
    fg: string;
    muted: string;
    border: string;
    accent: string;
  };
  posture: string[];
};

export type WebsiteDesignRecommendationInput = {
  siteType?: string;
  targetAudience?: string[];
  primaryGoal?: string[];
  contentSources?: string[];
  designTheme?: string[];
  functionalRequirements?: string[];
  customNotes?: string;
};

export type WebsiteDesignDirectionRecommendationReason = {
  kind: "siteType" | "audience" | "goal" | "contentSource" | "keyword";
  matched: string;
};

export type WebsiteDesignDirectionRecommendation = {
  direction: WebsiteDesignDirection;
  score: number;
  reasons: WebsiteDesignDirectionRecommendationReason[];
};

export const WEBSITE_DESIGN_DIRECTIONS: WebsiteDesignDirection[] = [
  {
    id: "editorial-monocle",
    label: "Editorial / Monocle",
    zhLabel: "杂志编辑 / Monocle",
    mood:
      "Print-magazine feel with generous whitespace, serif display type, paper tones, ink text, and one warm accent.",
    zhMood: "杂志式留白、衬线大标题、纸张底色、墨色文字和单一暖色强调。",
    references: ["Monocle", "Financial Times Weekend", "NYT Magazine", "It's Nice That"],
    displayFont: "'Iowan Old Style', 'Charter', Georgia, serif",
    bodyFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    palette: {
      bg: "oklch(97% 0.012 80)",
      surface: "oklch(99% 0.005 80)",
      fg: "oklch(20% 0.02 60)",
      muted: "oklch(48% 0.015 60)",
      border: "oklch(89% 0.012 80)",
      accent: "oklch(58% 0.16 35)",
    },
    posture: [
      "Use serif display, quiet sans body, and mono only for metadata.",
      "Use borders and whitespace instead of shadows.",
      "Use one decisive image or editorial pull quote, not decorative clutter.",
      "Use the accent at most twice per viewport.",
    ],
  },
  {
    id: "modern-minimal",
    label: "Modern minimal / Linear",
    zhLabel: "现代极简 / Linear",
    mood:
      "Precise software-native interface with near-greyscale surfaces, hairline borders, crisp type, and one cobalt accent.",
    zhMood: "软件产品式精确感，近灰阶界面、细线边框、清晰字体和单一钴蓝强调。",
    references: ["Linear", "Vercel", "Notion", "Stripe docs"],
    displayFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
    bodyFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
    palette: {
      bg: "oklch(99% 0.002 240)",
      surface: "oklch(100% 0 0)",
      fg: "oklch(18% 0.012 250)",
      muted: "oklch(54% 0.012 250)",
      border: "oklch(92% 0.005 250)",
      accent: "oklch(58% 0.18 255)",
    },
    posture: [
      "Use tight display spacing and clean alignment.",
      "Use hairline borders; avoid heavy shadows.",
      "Use mono tabular numerics for product metrics.",
      "Let content and product UI carry the page, not illustrations.",
    ],
  },
  {
    id: "warm-soft",
    label: "Warm soft / Mercury",
    zhLabel: "温暖柔和 / Mercury",
    mood:
      "Cream backgrounds, gentle radii, soft editorial tone, and restrained terracotta accents for a human product website.",
    zhMood: "奶油色背景、柔和圆角、温暖编辑感和克制陶土色强调，适合亲和可信的网站。",
    references: ["Mercury", "Substack", "Headspace", "Stripe pre-2020"],
    displayFont: "'Tiempos Headline', 'Newsreader', 'Iowan Old Style', Georgia, serif",
    bodyFont: "'Sohne', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    palette: {
      bg: "oklch(97% 0.018 70)",
      surface: "oklch(99% 0.008 70)",
      fg: "oklch(22% 0.02 50)",
      muted: "oklch(50% 0.018 50)",
      border: "oklch(90% 0.014 70)",
      accent: "oklch(64% 0.13 28)",
    },
    posture: [
      "Use serif display and soft sans body.",
      "Use gentle radii from 12px to 16px.",
      "Use soft glows sparingly, not heavy drop shadows.",
      "Prefer real photos, screenshots, or honest placeholders over generic icons.",
    ],
  },
  {
    id: "tech-utility",
    label: "Tech utility / GitHub",
    zhLabel: "技术工具 / GitHub",
    mood:
      "Information-dense engineering interface with structured grids, status pills, restrained green signal, and useful content per square inch.",
    zhMood: "工程工具式信息密度，结构化网格、状态标签、克制信号绿和高可读内容。",
    references: ["GitHub", "Datadog", "Cloudflare dashboard", "Sentry"],
    displayFont: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",
    bodyFont: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace",
    palette: {
      bg: "oklch(98% 0.005 250)",
      surface: "oklch(100% 0 0)",
      fg: "oklch(22% 0.02 240)",
      muted: "oklch(50% 0.018 240)",
      border: "oklch(90% 0.008 240)",
      accent: "oklch(58% 0.16 145)",
    },
    posture: [
      "Prioritize dashboards, tables, status rows, logs, and product surfaces.",
      "Use tabular numerics and mono for IDs, code, and metrics.",
      "Avoid oversized marketing hero illustrations.",
      "Make information density the visual feature.",
    ],
  },
  {
    id: "brutalist-experimental",
    label: "Brutalist / Are.na",
    zhLabel: "粗野实验 / Are.na",
    mood:
      "Deliberately sharp, high-contrast, grid-visible layout with oversized type and almost no decorative softness.",
    zhMood: "刻意锋利、高对比、显性网格、超大字体和低装饰感，适合强表达网站。",
    references: ["Are.na", "Yale Center for British Art", "MSCHF", "Read.cv"],
    displayFont: "'Times New Roman', 'Iowan Old Style', Georgia, serif",
    bodyFont: "ui-monospace, 'IBM Plex Mono', 'JetBrains Mono', Menlo, monospace",
    palette: {
      bg: "oklch(96% 0.004 100)",
      surface: "oklch(100% 0 0)",
      fg: "oklch(15% 0.02 100)",
      muted: "oklch(40% 0.02 100)",
      border: "oklch(15% 0.02 100)",
      accent: "oklch(60% 0.22 25)",
    },
    posture: [
      "Use strong borders and asymmetric grids.",
      "Use near-zero radius and no soft cards.",
      "Use oversized display type with intentional tension.",
      "Keep the accent hot and rare.",
    ],
  },
  {
    id: "industrial-b2b",
    label: "Industrial B2B / precision",
    zhLabel: "工业 B2B / 精密制造",
    mood:
      "High-trust industrial website with graphite surfaces, blueprint structure, calibrated blue accents, and clear product evidence.",
    zhMood: "高可信工业站，石墨灰界面、蓝图式结构、校准蓝强调和清晰产品证据。",
    references: ["Siemens", "Hexagon", "Keyence", "Bosch Rexroth"],
    displayFont: "'Space Grotesk', 'IBM Plex Sans', system-ui, sans-serif",
    bodyFont: "'IBM Plex Sans', 'Noto Sans SC', system-ui, sans-serif",
    monoFont: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
    palette: {
      bg: "oklch(97% 0.006 245)",
      surface: "oklch(100% 0 0)",
      fg: "oklch(20% 0.018 250)",
      muted: "oklch(48% 0.018 250)",
      border: "oklch(86% 0.012 250)",
      accent: "oklch(55% 0.16 245)",
    },
    posture: [
      "Use technical proof: specs, process steps, certifications, case evidence.",
      "Use blueprint grids, comparison tables, and product module cards.",
      "Use restrained motion and precise alignment.",
      "Keep CTA direct: quote, catalog, consultation, or sample request.",
    ],
  },
  {
    id: "heritage-manufacturing",
    label: "Heritage manufacturing / craft",
    zhLabel: "传承制造 / 匠心工厂",
    mood:
      "Mature manufacturing brand with warm neutrals, deep ink, brass accents, and story-led trust building.",
    zhMood: "成熟制造品牌，暖中性色、深墨色、黄铜强调和故事化信任表达。",
    references: ["Bang & Olufsen", "Patek Philippe", "Muji", "industrial editorial catalogs"],
    displayFont: "'Iowan Old Style', 'Noto Serif SC', Georgia, serif",
    bodyFont: "'IBM Plex Sans', 'Noto Sans SC', system-ui, sans-serif",
    palette: {
      bg: "oklch(96% 0.018 80)",
      surface: "oklch(99% 0.008 85)",
      fg: "oklch(18% 0.018 65)",
      muted: "oklch(46% 0.018 65)",
      border: "oklch(86% 0.018 80)",
      accent: "oklch(62% 0.12 75)",
    },
    posture: [
      "Use editorial storytelling for history, craft, process, and quality.",
      "Use warm neutral surfaces and measured brass accents.",
      "Use product photography or honest manufacturing placeholders.",
      "Avoid startup-SaaS gradients and generic icon rows.",
    ],
  },
];

export const WEBSITE_DESIGN_DIRECTION_IDS = WEBSITE_DESIGN_DIRECTIONS.map((direction) => direction.id);

const WEBSITE_DESIGN_DIRECTION_SIGNAL_MAP: Record<
  string,
  {
    siteTypes?: string[];
    audiences?: string[];
    goals?: string[];
    contentSources?: string[];
    keywords?: RegExp[];
    negativeKeywords?: RegExp[];
  }
> = {
  "editorial-monocle": {
    siteTypes: ["company", "portfolio"],
    audiences: ["consumers", "investors", "overseas_customers"],
    goals: ["brand_trust"],
    contentSources: ["existing_domain", "uploaded_files"],
    keywords: [/editorial|magazine|journal|story|stories|media|publication|content-heavy/i],
    negativeKeywords: [/dashboard|api|docs|infra|developer|factory|industrial|brutalist|poster/i],
  },
  "modern-minimal": {
    siteTypes: ["landing", "company"],
    audiences: ["developers", "investors", "enterprise_buyers"],
    goals: ["lead_generation", "book_demo", "product_showcase"],
    keywords: [/saas|software|startup|ai|app|product|platform|minimal|clean|linear|modern/i],
    negativeKeywords: [/heritage|craft|artisan|editorial|magazine|brutalist|poster|factory-floor/i],
  },
  "warm-soft": {
    siteTypes: ["company", "landing", "portfolio"],
    audiences: ["consumers", "students", "overseas_customers"],
    goals: ["brand_trust", "lead_generation"],
    keywords: [/warm|friendly|human|approachable|soft|calm|lifestyle|service/i],
    negativeKeywords: [/api|dashboard|docs|technical|industrial|precision|factory|brutalist|poster/i],
  },
  "tech-utility": {
    siteTypes: ["company", "landing"],
    audiences: ["developers", "enterprise_buyers", "government"],
    goals: ["product_showcase", "book_demo"],
    keywords: [/dashboard|data|developer|api|docs|tool|infra|cloud|status|technical/i],
    negativeKeywords: [/editorial|storytelling|craft|artisan|warm-soft|lifestyle|brutalist|poster/i],
  },
  "brutalist-experimental": {
    siteTypes: ["portfolio", "event", "landing"],
    audiences: ["students", "consumers", "developers"],
    keywords: [/brutalist|experimental|bold|avant|graphic|poster|edgy|art/i],
    negativeKeywords: [/precision manufacturing|certification|supplier|catalog|warm|friendly|heritage|timeless/i],
  },
  "industrial-b2b": {
    siteTypes: ["company"],
    audiences: ["enterprise_buyers", "government", "overseas_customers"],
    goals: ["lead_generation", "download_materials", "product_showcase"],
    contentSources: ["existing_domain", "uploaded_files"],
    keywords: [/industrial|manufactur|factory|machine|precision|engineering|b2b|supplier|spec|catalog|certification/i],
    negativeKeywords: [/editorial|magazine|brutalist|poster|playful|youthful|lifestyle/i],
  },
  "heritage-manufacturing": {
    siteTypes: ["company", "portfolio"],
    audiences: ["enterprise_buyers", "overseas_customers", "investors"],
    goals: ["brand_trust", "product_showcase"],
    contentSources: ["existing_domain", "uploaded_files"],
    keywords: [/heritage|craft|premium|luxury|timeless|legacy|materials|quality|artisan/i],
    negativeKeywords: [/api|dashboard|docs|infra|brutalist|poster|edgy|saas|linear/i],
  },
};

function normalizeSignalList(values: string[] | undefined | null): string[] {
  return (values || []).map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
}

function pushUniqueReason(
  reasons: WebsiteDesignDirectionRecommendationReason[],
  reason: WebsiteDesignDirectionRecommendationReason,
) {
  if (reasons.some((item) => item.kind === reason.kind && item.matched === reason.matched)) return;
  reasons.push(reason);
}

function collectKeywordMatches(text: string, patterns: RegExp[] | undefined): string[] {
  const matches = new Set<string>();
  for (const pattern of patterns || []) {
    const match = text.match(pattern);
    if (match?.[0]) matches.add(match[0].toLowerCase());
  }
  return Array.from(matches);
}

export function recommendWebsiteDesignDirections(
  input: WebsiteDesignRecommendationInput,
  limit = 3,
): WebsiteDesignDirectionRecommendation[] {
  const siteType = String(input.siteType || "").trim().toLowerCase();
  const audiences = normalizeSignalList(input.targetAudience);
  const goals = normalizeSignalList(input.primaryGoal);
  const contentSources = normalizeSignalList(input.contentSources);
  const freeText = [
    ...(input.designTheme || []),
    ...(input.functionalRequirements || []),
    String(input.customNotes || ""),
  ]
    .join(" ")
    .toLowerCase();

  const recommendations = WEBSITE_DESIGN_DIRECTIONS.map((direction) => {
    const signalMap = WEBSITE_DESIGN_DIRECTION_SIGNAL_MAP[direction.id] || {};
    const reasons: WebsiteDesignDirectionRecommendationReason[] = [];
    let score = 0;

    if (siteType && signalMap.siteTypes?.includes(siteType)) {
      score += 4;
      pushUniqueReason(reasons, { kind: "siteType", matched: siteType });
    }

    for (const audience of audiences) {
      if (!signalMap.audiences?.includes(audience)) continue;
      score += 3;
      pushUniqueReason(reasons, { kind: "audience", matched: audience });
    }

    for (const goal of goals) {
      if (!signalMap.goals?.includes(goal)) continue;
      score += 2;
      pushUniqueReason(reasons, { kind: "goal", matched: goal });
    }

    for (const source of contentSources) {
      if (!signalMap.contentSources?.includes(source)) continue;
      score += 1;
      pushUniqueReason(reasons, { kind: "contentSource", matched: source });
    }

    for (const match of collectKeywordMatches(freeText, signalMap.keywords)) {
      score += 2;
      pushUniqueReason(reasons, { kind: "keyword", matched: match });
    }

    for (const match of collectKeywordMatches(freeText, signalMap.negativeKeywords)) {
      score -= 3;
    }

    return {
      direction,
      score,
      reasons,
    };
  })
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.direction.label.localeCompare(right.direction.label);
    });

  return recommendations.slice(0, Math.max(1, limit));
}

export function getWebsiteDesignDirection(id: string | undefined | null): WebsiteDesignDirection | undefined {
  const normalized = String(id || "").trim().toLowerCase();
  if (!normalized) return undefined;
  return WEBSITE_DESIGN_DIRECTIONS.find(
    (direction) => direction.id === normalized || direction.label.toLowerCase() === normalized,
  );
}

export function isWebsiteDesignDirectionId(id: string | undefined | null): boolean {
  return Boolean(getWebsiteDesignDirection(id));
}

export function renderWebsiteDesignDirectionPrompt(ids: string[] | undefined | null): string {
  const selected = (ids || []).map((id) => getWebsiteDesignDirection(id)).filter(Boolean) as WebsiteDesignDirection[];
  if (selected.length === 0) return "";

  return [
    "## Confirmed Visual Direction Contract",
    "",
    ...selected.flatMap((direction) => [
      `### ${direction.label} (${direction.id})`,
      `- Mood: ${direction.mood}`,
      `- References: ${direction.references.join(", ")}`,
      "- Palette:",
      `  - bg: ${direction.palette.bg}`,
      `  - surface: ${direction.palette.surface}`,
      `  - fg: ${direction.palette.fg}`,
      `  - muted: ${direction.palette.muted}`,
      `  - border: ${direction.palette.border}`,
      `  - accent: ${direction.palette.accent}`,
      `- Display font: ${direction.displayFont}`,
      `- Body font: ${direction.bodyFont}`,
      direction.monoFont ? `- Mono font: ${direction.monoFont}` : "",
      "- Layout posture:",
      ...direction.posture.map((item) => `  - ${item}`),
      "",
    ]),
    "Apply the selected direction as a hard visual contract unless explicit user brand assets override it. Keep the site responsive across desktop, tablet, and mobile.",
  ]
    .filter(Boolean)
    .join("\n");
}
