import { createClient } from "@supabase/supabase-js";

export interface TemplateRecord {
  id: string;
  name: string;
  description: string | null;
  template_type: string | null;
  template_kind: string | null;
  template_source: string | null;
}

export interface RecommendationRequest {
  prompt: string;
  pageKind?: string;
}

export interface RecommendationBundle {
  page: TemplateRecord | null;
  sections: TemplateRecord[];
  atomics: TemplateRecord[];
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const KEYWORD_MAP: Record<string, string[]> = {
  landing: ["landing", "首页", "营销", "launch", "主站"],
  product: ["产品", "规格", "型号", "配置", "方案", "系统"],
  about: ["关于", "团队", "文化", "使命", "公司"],
  pricing: ["价格", "报价", "定价", "订阅"],
  case: ["案例", "客户", "项目", "应用"],
  careers: ["招聘", "加入", "岗位", "人才"],
  docs: ["文档", "开发", "API", "指南"],
  testimonials: ["口碑", "评价", "推荐"],
  faq: ["常见", "FAQ", "问题"],
  logos: ["合作", "伙伴", "客户"],
  cta: ["咨询", "联系", "预约", "购买", "试用"],
};

const SECTION_PRIORITY = [
  "hero",
  "value-props",
  "feature-highlight",
  "product-preview",
  "logos",
  "testimonials",
  "faq",
  "cta",
];

function tokenize(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[，。！？、]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreTemplate(template: TemplateRecord, tokens: string[], pageKind?: string): number {
  let score = 0;
  const haystack = `${template.name} ${template.description || ""}`.toLowerCase();

  tokens.forEach((token) => {
    if (haystack.includes(token)) {
      score += 2;
    }
  });

  if (pageKind && template.template_kind === pageKind) {
    score += 8;
  }

  if (template.template_source === "library") {
    score += 3;
  }

  if (template.template_kind && KEYWORD_MAP[template.template_kind]) {
    const hits = KEYWORD_MAP[template.template_kind].some((keyword) =>
      haystack.includes(keyword.toLowerCase())
    );
    if (hits) {
      score += 2;
    }
  }

  return score;
}

function inferPageKind(prompt: string): string | undefined {
  const text = prompt.toLowerCase();
  const entries: [string, string[]][] = Object.entries(KEYWORD_MAP);
  for (const [kind, keywords] of entries) {
    if (["testimonials", "faq", "logos", "cta"].includes(kind)) continue;
    if (keywords.some((keyword) => text.includes(keyword.toLowerCase()))) {
      if (kind === "case") return "case-study";
      return kind;
    }
  }
  return undefined;
}

function rankTemplates(
  templates: TemplateRecord[],
  tokens: string[],
  pageKind?: string
): TemplateRecord[] {
  return [...templates]
    .map((template) => ({ template, score: scoreTemplate(template, tokens, pageKind) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.template);
}

export async function recommendTemplates(
  request: RecommendationRequest
): Promise<RecommendationBundle> {
  const tokens = tokenize(request.prompt);
  const resolvedPageKind = request.pageKind || inferPageKind(request.prompt);

  const { data, error } = await supabase
    .from("shpitto_templates")
    .select("id, name, description, template_type, template_kind, template_source")
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  const templates = (data || []) as TemplateRecord[];

  const pages = templates.filter((t) => t.template_type === "page");
  const sections = templates.filter((t) => t.template_type === "section");
  const atomics = templates.filter((t) => t.template_type === "atomic");

  const rankedPages = rankTemplates(pages, tokens, resolvedPageKind);
  const selectedPage = rankedPages[0] || null;

  const rankedSections = rankTemplates(sections, tokens, resolvedPageKind);
  const orderedSections = SECTION_PRIORITY
    .map((kind) => rankedSections.find((s) => s.template_kind === kind))
    .filter(Boolean) as TemplateRecord[];

  const sectionFallback = rankedSections.filter(
    (item) => !orderedSections.some((picked) => picked.id === item.id)
  );

  const selectedSections = [...orderedSections, ...sectionFallback].slice(0, 6);

  const rankedAtomics = rankTemplates(atomics, tokens, resolvedPageKind);
  const selectedAtomics = rankedAtomics.slice(0, 3);

  return {
    page: selectedPage,
    sections: selectedSections,
    atomics: selectedAtomics,
  };
}
