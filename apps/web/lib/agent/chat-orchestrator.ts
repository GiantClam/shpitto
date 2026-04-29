import {
  WEBSITE_DESIGN_DIRECTIONS,
  renderWebsiteDesignDirectionPrompt,
} from "../open-design/design-directions";

export type ConversationStage = "drafting" | "previewing" | "deployed" | "deploying";

export type ChatIntent = "clarify" | "generate" | "refine_preview" | "refine_deployed" | "deploy";

export type RequirementSlot = {
  key: string;
  label: string;
  filled: boolean;
  evidence?: string;
  required?: boolean;
  inputType?: "single" | "multi" | "text" | "page-structure" | "logo" | "content-source";
  options?: RequirementSlotOption[];
  allowCustom?: boolean;
  value?: unknown;
};

export type RequirementSlotOption = {
  value: string;
  label: string;
  i18n?: Partial<Record<"zh" | "en", string>>;
};

export type PageStructureRequirement = {
  mode?: "single" | "multi";
  planning?: "manual" | "auto";
  pages?: string[];
};

export type BrandLogoRequirement = {
  mode?: "uploaded" | "text_mark" | "generated_placeholder" | "none";
  assetKey?: string;
  assetId?: string;
  assetName?: string;
  fileName?: string;
  referenceText?: string;
  altText?: string;
};

export type RequirementFormValues = {
  siteType?: string;
  targetAudience?: string[];
  designTheme?: string[];
  pageStructure?: PageStructureRequirement;
  functionalRequirements?: string[];
  primaryGoal?: string[];
  language?: "zh-CN" | "en" | "bilingual";
  brandLogo?: BrandLogoRequirement;
  contentSources?: string[];
  customNotes?: string;
};

export type RequirementSpec = {
  revision: number;
  siteType?: string;
  brand?: string;
  businessContext?: string;
  targetAudience?: string[];
  pages?: string[];
  pageStructure?: PageStructureRequirement;
  visualStyle?: string[];
  functionalRequirements?: string[];
  contentModules?: string[];
  ctas?: string[];
  primaryGoal?: string[];
  locale?: "zh-CN" | "en" | "bilingual";
  tone?: string;
  brandLogo?: BrandLogoRequirement;
  contentSources?: string[];
  customNotes?: string;
  deployment?: {
    provider?: string;
    domain?: string;
    requested: boolean;
  };
  explicitConstraints: string[];
  source: "structured-parser";
  fields: Record<string, { value: unknown; sourceIndex: number; sourceText: string }>;
};

export type RequirementPatchOperation = {
  op: "set" | "remove" | "append";
  target:
    | "brand"
    | "businessContext"
    | "targetAudience"
    | "pages"
    | "visualStyle"
    | "contentModules"
    | "ctas"
    | "locale"
    | "tone"
    | "deployment"
    | "text";
  value?: string | string[] | RequirementSpec["deployment"];
  sourceText: string;
};

export type RequirementPatchPlan = {
  revision: number;
  operations: RequirementPatchOperation[];
  instructionText: string;
};

export type AggregatedRequirement = {
  requirementText: string;
  sourceMessages: string[];
  revision: number;
  supersededMessages: string[];
  correctionSummary: string[];
};

export type IntentDecision = {
  intent: ChatIntent;
  confidence: number;
  reason: string;
  completionPercent: number;
  missingSlots: string[];
  assumedDefaults: string[];
  shouldCreateTask: boolean;
};

export type RequiredSlotValidation = {
  passed: boolean;
  missingRequiredSlots: string[];
  nextSlot?: RequirementSlot;
};

export const REQUIREMENT_FORM_HEADER = "[Requirement Form]";

const SUPPORTED_FUNCTIONAL_REQUIREMENT_LABELS: Record<string, string> = {
  customer_inquiry_form: "客户询盘表单填写",
  contact_form: "联系表单",
  search_filter: "搜索/筛选",
  downloads: "资料下载",
  none: "无需特殊功能，仅展示内容",
};

const SUPPORTED_FUNCTIONAL_REQUIREMENT_VALUES = new Set(Object.keys(SUPPORTED_FUNCTIONAL_REQUIREMENT_LABELS));

const SUPPORTED_FUNCTIONAL_REQUIREMENT_PATTERNS: Array<{ value: string; pattern: RegExp }> = [
  { value: "customer_inquiry_form", pattern: /客户询盘|询盘表单|询价表单|需求表单|inquiry/i },
  { value: "contact_form", pattern: /联系表单|联系页面|留言表单|contact form/i },
  { value: "search_filter", pattern: /搜索|筛选|过滤|search|filter/i },
  { value: "downloads", pattern: /资料下载|下载|文档|download|downloads/i },
  { value: "none", pattern: /无需特殊功能|仅展示内容|不需要功能|none/i },
];

const UNSUPPORTED_FUNCTIONAL_REQUIREMENT_PATTERN =
  /用户注册|注册登录|登录|会员系统|在线支付|支付|预约|预订|后台管理|管理后台|user registration|login|sign in|payment|booking|admin/i;

function normalizeText(value: string): string {
  return String(value || "").trim();
}

function containsAny(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const match = text.match(re);
    if (match?.[0]) return match[0];
  }
  return undefined;
}

function toLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function unique(values: string[], limit = 12): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value).replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function splitList(raw: string): string[] {
  return String(raw || "")
    .split(/[|,，、;；\n]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return unique(value.map((item) => normalizeText(String(item))));
  if (typeof value === "string") return unique(splitList(value));
  return [];
}

function normalizeFormLanguage(value: unknown): RequirementFormValues["language"] | undefined {
  const normalized = normalizeText(String(value || "")).toLowerCase();
  if (normalized === "zh-cn" || normalized === "zh" || normalized === "chinese" || normalized === "中文") return "zh-CN";
  if (normalized === "en" || normalized === "english" || normalized === "英文") return "en";
  if (normalized === "bilingual" || normalized === "both" || normalized === "中英双语" || normalized === "双语") {
    return "bilingual";
  }
  return undefined;
}

function normalizePageStructure(value: unknown): PageStructureRequirement | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const modeText = normalizeText(String(raw.mode || "")).toLowerCase();
  const mode = modeText === "single" || modeText === "one-page" || modeText === "单页"
    ? "single"
    : modeText === "multi" || modeText === "multi-page" || modeText === "多页"
        || modeText === "auto" || modeText === "auto-generate" || modeText === "automatic" || modeText === "自动" || modeText === "自动生成"
      ? "multi"
      : undefined;
  const planningText = normalizeText(String(raw.planning || raw.plan || raw.autoPlan || "")).toLowerCase();
  const planning =
    planningText === "auto" ||
    planningText === "automatic" ||
    planningText === "true" ||
    planningText === "自动" ||
    modeText === "auto" ||
    modeText === "auto-generate" ||
    modeText === "automatic" ||
    modeText === "自动" ||
    modeText === "自动生成"
      ? "auto"
      : planningText === "manual" || planningText === "手动"
        ? "manual"
        : undefined;
  const pages = toStringArray(raw.pages);
  if (!mode && !planning && pages.length === 0) return undefined;
  return {
    ...(mode ? { mode } : planning === "auto" ? { mode: "multi" as const } : {}),
    ...(planning ? { planning } : {}),
    ...(pages.length > 0 ? { pages } : {}),
  };
}

function normalizeBrandLogo(value: unknown): BrandLogoRequirement | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const modeText = normalizeText(String(raw.mode || "")).toLowerCase();
  const mode = ["uploaded", "text_mark", "generated_placeholder", "none"].includes(modeText)
    ? (modeText as BrandLogoRequirement["mode"])
    : undefined;
  const assetKey = normalizeText(String(raw.assetKey || raw.key || ""));
  const assetId = normalizeText(String(raw.assetId || raw.id || ""));
  const assetName = normalizeText(String(raw.assetName || raw.name || raw.fileName || ""));
  const fileName = normalizeText(String(raw.fileName || raw.name || ""));
  const referenceText = normalizeText(String(raw.referenceText || ""));
  const altText = normalizeText(String(raw.altText || ""));
  if (!mode && !assetKey && !assetId && !referenceText) return undefined;
  return {
    ...(mode ? { mode } : {}),
    ...(assetKey ? { assetKey } : {}),
    ...(assetId ? { assetId } : {}),
    ...(assetName ? { assetName } : {}),
    ...(fileName ? { fileName } : {}),
    ...(referenceText ? { referenceText } : {}),
    ...(altText ? { altText } : {}),
  };
}

function normalizeSupportedFunctionalRequirements(values: string[]): string[] {
  const mapped: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    if (SUPPORTED_FUNCTIONAL_REQUIREMENT_VALUES.has(normalized)) {
      mapped.push(normalized);
      continue;
    }
    if (UNSUPPORTED_FUNCTIONAL_REQUIREMENT_PATTERN.test(normalized)) continue;
    const supported = SUPPORTED_FUNCTIONAL_REQUIREMENT_PATTERNS.find((item) => item.pattern.test(normalized));
    if (supported) mapped.push(supported.value);
  }
  return unique(mapped);
}

function normalizeContentSources(values: string[]): string[] {
  const mapped: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) continue;
    if (["new_site", "existing_domain", "uploaded_files", "industry_research"].includes(normalized)) {
      mapped.push(normalized);
    } else if (/新建站|没有资料|暂无内容|new website|new site/.test(normalized)) {
      mapped.push("new_site");
    } else if (/已有域名|旧站|域名|existing domain|domain/.test(normalized)) {
      mapped.push("existing_domain");
    } else if (/上传资料|上传文件|uploaded files|file/.test(normalized)) {
      mapped.push("uploaded_files");
    } else if (/行业资料|竞品|industry research|competitor/.test(normalized)) {
      mapped.push("industry_research");
    }
  }
  return unique(mapped);
}

function normalizeRequirementFormValues(value: unknown): RequirementFormValues | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const siteType = normalizeText(String(raw.siteType || raw.websiteType || ""));
  const targetAudience = toStringArray(raw.targetAudience);
  const designTheme = toStringArray(raw.designTheme || raw.visualStyle);
  const pageStructure = normalizePageStructure(raw.pageStructure);
  const functionalRequirements = normalizeSupportedFunctionalRequirements(
    toStringArray(raw.functionalRequirements || raw.features || raw.functions),
  );
  const primaryGoal = toStringArray(raw.primaryGoal || raw.ctas);
  const language = normalizeFormLanguage(raw.language || raw.locale);
  const brandLogo = normalizeBrandLogo(raw.brandLogo || raw.logo);
  const contentSources = normalizeContentSources(toStringArray(raw.contentSources || raw.contentSource));
  const customNotes = normalizeText(String(raw.customNotes || raw.notes || ""));

  if (
    !siteType &&
    targetAudience.length === 0 &&
    designTheme.length === 0 &&
    !pageStructure &&
    functionalRequirements.length === 0 &&
    primaryGoal.length === 0 &&
    !language &&
    !brandLogo &&
    contentSources.length === 0 &&
    !customNotes
  ) {
    return undefined;
  }

  return {
    ...(siteType ? { siteType } : {}),
    ...(targetAudience.length > 0 ? { targetAudience } : {}),
    ...(designTheme.length > 0 ? { designTheme } : {}),
    ...(pageStructure ? { pageStructure } : {}),
    ...(functionalRequirements.length > 0 ? { functionalRequirements } : {}),
    ...(primaryGoal.length > 0 ? { primaryGoal } : {}),
    ...(language ? { language } : {}),
    ...(brandLogo ? { brandLogo } : {}),
    ...(contentSources.length > 0 ? { contentSources } : {}),
    ...(customNotes ? { customNotes } : {}),
  };
}

export function parseRequirementFormFromText(input: string): {
  cleanText: string;
  formValues?: RequirementFormValues;
  hasForm: boolean;
} {
  const raw = String(input || "");
  const headerIndex = raw.toLowerCase().indexOf(REQUIREMENT_FORM_HEADER.toLowerCase());
  if (headerIndex < 0) {
    return { cleanText: raw.trim(), hasForm: false };
  }

  const before = raw.slice(0, headerIndex).trim();
  const after = raw.slice(headerIndex + REQUIREMENT_FORM_HEADER.length).trim();
  const fenced = after.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = (fenced?.[1] || after).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    parsed = undefined;
  }
  return {
    cleanText: before,
    formValues: normalizeRequirementFormValues(parsed),
    hasForm: true,
  };
}

function extractLabelValue(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:${escaped})\\s*[:：]\\s*([^\\n]+)`, "i"));
    if (match?.[1]) return normalizeText(match[1]);
  }
  return undefined;
}

function extractDelimitedList(text: string, labels: string[]): string[] {
  const value = extractLabelValue(text, labels);
  if (value) return splitList(value);
  return [];
}

function hasCorrectionIntent(text: string): boolean {
  return /(?:改成|换成|不要|不用|取消|删除|移除|去掉|instead|replace|change|remove|delete|no longer|not\s+english|not\s+chinese)/i.test(
    text,
  );
}

function categorizeRequirementMessage(text: string): Set<RequirementPatchOperation["target"]> {
  const raw = normalizeText(text);
  const categories = new Set<RequirementPatchOperation["target"]>();
  if (/中文|英文|english|chinese|zh-cn|\ben\b|语言|locale/i.test(raw)) categories.add("locale");
  if (/风格|style|配色|color|颜色|主色|蓝|绿|红|橙|紫|黑|typography|字体/i.test(raw)) categories.add("visualStyle");
  if (/页面|导航|pages?|routes?|sitemap|首页|关于|产品|服务|案例|联系|blog|pricing/i.test(raw)) categories.add("pages");
  if (/cta|按钮|联系|询价|下载|预约|contact|quote|whatsapp/i.test(raw)) categories.add("ctas");
  if (/客户|受众|audience|用户|采购|工程师|buyers?|engineers?/i.test(raw)) categories.add("targetAudience");
  if (/模块|sections?|hero|案例|新闻|表单|faq|认证|下载/i.test(raw)) categories.add("contentModules");
  if (/品牌|公司|业务|定位|brand|company|business/i.test(raw)) categories.add("brand");
  if (/部署|上线|发布|cloudflare|vercel|domain|域名/i.test(raw)) categories.add("deployment");
  return categories;
}

function filterSupersededMessages(messages: string[]): { activeMessages: string[]; supersededMessages: string[]; correctionSummary: string[] } {
  const lockedCategories = new Set<RequirementPatchOperation["target"]>();
  const activeReversed: string[] = [];
  const supersededMessages: string[] = [];
  const correctionSummary: string[] = [];

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    const categories = categorizeRequirementMessage(message);
    const intersectsLocked = Array.from(categories).some((category) => lockedCategories.has(category));
    const allCategoriesLocked = categories.size > 0 && Array.from(categories).every((category) => lockedCategories.has(category));
    if (intersectsLocked) {
      supersededMessages.push(message);
    }
    if (allCategoriesLocked) {
      continue;
    }
    activeReversed.push(message);
    if (hasCorrectionIntent(message) && categories.size > 0) {
      for (const category of categories) lockedCategories.add(category);
      correctionSummary.push(`修正覆盖：${Array.from(categories).join(", ")}`);
    }
  }

  return {
    activeMessages: activeReversed.reverse(),
    supersededMessages: supersededMessages.reverse(),
    correctionSummary: correctionSummary.reverse(),
  };
}

type ExtractedRequirementFields = {
  siteType?: string;
  brand?: string;
  businessContext?: string;
  targetAudience?: string[];
  pages?: string[];
  pageStructure?: PageStructureRequirement;
  visualStyle?: string[];
  functionalRequirements?: string[];
  contentModules?: string[];
  ctas?: string[];
  primaryGoal?: string[];
  locale?: "zh-CN" | "en" | "bilingual";
  tone?: string;
  brandLogo?: BrandLogoRequirement;
  contentSources?: string[];
  customNotes?: string;
  deployment?: RequirementSpec["deployment"];
};

function extractRequirementFieldsFromText(text: string): ExtractedRequirementFields {
  const raw = normalizeText(text);
  const form = parseRequirementFormFromText(raw).formValues;
  const startsWithNonBrandLabel = /^\s*(?:pages?|page list|routes?|sitemap|页面|导航|audience|target audience|客户|目标受众|用户|style|visual|视觉|风格|配色|cta|actions|按钮|转化动作|language|语言|tone|语气|modules?|sections?|内容模块|模块)\s*[:：]/i.test(
    raw,
  );
  const siteType =
    form?.siteType ||
    (/企业官网|公司官网|机构官网|corporate|company website|official website/i.test(raw)
      ? "company"
      : /落地页|landing page/i.test(raw)
        ? "landing"
        : /电商|商城|ecommerce|shop|store/i.test(raw)
          ? "ecommerce"
          : /作品集|portfolio/i.test(raw)
            ? "portfolio"
            : /活动页|event/i.test(raw)
              ? "event"
              : undefined);
  const brand =
    extractLabelValue(raw, ["brand", "品牌", "公司", "company", "name", "名称"]) ||
    raw.match(/(?:for|给|为)\s*([A-Za-z][A-Za-z0-9 _-]{1,48})\s*(?:build|create|generate|做|生成|官网|网站)/i)?.[1]?.trim() ||
    (!startsWithNonBrandLabel
      ? raw.match(/\b([A-Z][A-Z0-9-]{2,32})\b(?:\s+(?:website|site|官网|网站))?/i)?.[1]?.trim()
      : undefined);
  const pages = unique([
    ...(form?.pageStructure?.pages || []),
    ...extractDelimitedList(raw, ["pages", "page list", "routes", "sitemap", "页面", "导航", "页面结构"]),
    ...Array.from(raw.matchAll(/\/[a-zA-Z0-9][a-zA-Z0-9/_-]{0,60}/g)).map((match) => match[0]),
    ...Array.from(
      raw.matchAll(
        /\b(home|about|products?|services?|solutions?|cases?|contact|news|blog|downloads?|pricing)\b/gi,
      ),
    ).map((match) => match[1]),
    ...Array.from(raw.matchAll(/(首页|关于|产品|服务|方案|案例|联系|新闻|博客|下载|价格)/g)).map((match) => match[1]),
  ]);
  const wantsAutoPageStructure = /自动生成页面结构|自动规划页面|自动页面结构|帮我规划页面|auto(?:matically)? generate (?:the )?(?:page structure|sitemap)|auto(?:matic)? sitemap/i.test(raw);
  const pageStructure =
    form?.pageStructure ||
    (wantsAutoPageStructure
      ? { mode: "multi" as const, planning: "auto" as const }
      : pages.length > 0
        ? { mode: pages.length > 1 ? "multi" as const : "single" as const, planning: "manual" as const, pages }
        : undefined);
  const visualStyle = unique([
    ...(form?.designTheme || []),
    ...extractDelimitedList(raw, ["style", "visual", "视觉", "风格", "配色"]),
    ...Array.from(raw.matchAll(/(工业风|科技感|温暖|活泼|高级|极简|专业|可信|蓝色|绿色|黑金|高对比)/g)).map(
      (match) => match[1],
    ),
  ]);
  const targetAudience = unique([
    ...(form?.targetAudience || []),
    ...extractDelimitedList(raw, ["audience", "target audience", "客户", "目标受众", "用户"]),
    ...Array.from(raw.matchAll(/(采购|工程师|设计师|政府|研究者|manufacturer|buyers?|engineers?|customers?)/gi)).map(
      (match) => match[1],
    ),
  ]);
  const contentModules = unique([
    ...extractDelimitedList(raw, ["modules", "sections", "内容模块", "模块"]),
    ...Array.from(raw.matchAll(/(hero|案例|新闻|表单|认证|查询|下载|数据|图表|合作伙伴|faq|FAQ)/gi)).map(
      (match) => match[1],
    ),
  ]);
  const contentSources = normalizeContentSources([
    ...(form?.contentSources || []),
    ...(raw.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i) ? ["existing_domain"] : []),
    ...Array.from(
      raw.matchAll(/(新建站|没有资料|暂无内容|已有域名|旧站|域名|上传资料|上传文件|行业资料|竞品|new website|existing domain|domain|uploaded files|industry research)/gi),
    ).map((match) => match[1]),
  ]);
  const functionalRequirements = normalizeSupportedFunctionalRequirements([
    ...(form?.functionalRequirements || []),
    ...extractDelimitedList(raw, ["features", "functions", "功能", "功能需求"]),
    ...Array.from(
      raw.matchAll(
        /(客户询盘|询盘表单|询价表单|需求表单|联系表单|留言表单|搜索|筛选|下载|资料下载|inquiry form|contact form|search|filter|download)/gi,
      ),
    ).map((match) => match[1]),
  ]);
  const primaryGoal = unique([
    ...(form?.primaryGoal || []),
    ...Array.from(
      raw.matchAll(/(获取咨询|展示产品|建立品牌信任|下载资料|预约演示|在线购买|lead generation|brand trust|book demo|purchase|download)/gi),
    ).map((match) => match[1]),
  ]);
  const ctas = unique([
    ...extractDelimitedList(raw, ["cta", "actions", "按钮", "转化动作"]),
    ...Array.from(raw.matchAll(/(联系|询价|quote|whatsapp|catalog|订阅|下载|查询|预约|contact)/gi)).map(
      (match) => match[1],
    ),
  ]);
  const locale =
    form?.language ||
    (/中英双语|双语|bilingual/i.test(raw)
      ? "bilingual"
      : /中文|chinese|zh-cn/i.test(raw)
        ? "zh-CN"
        : /英文|english|en\b/i.test(raw)
          ? "en"
          : undefined);
  const deploymentProvider = /cloudflare/i.test(raw) ? "cloudflare" : /vercel/i.test(raw) ? "vercel" : undefined;
  const domain = raw.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i)?.[0];
  const deployment = {
    provider: deploymentProvider,
    domain,
    requested: /cloudflare|vercel|deploy|部署|发布|上线|pages\.dev/i.test(raw),
  };

  return {
    siteType,
    brand,
    businessContext: extractLabelValue(raw, ["business", "业务", "定位", "背景"]),
    targetAudience,
    pages,
    pageStructure,
    visualStyle,
    functionalRequirements,
    contentModules,
    ctas,
    primaryGoal,
    locale,
    tone: extractLabelValue(raw, ["tone", "语气", "口吻"]),
    brandLogo: form?.brandLogo,
    contentSources,
    customNotes: form?.customNotes || extractLabelValue(raw, ["content notes", "business details", "资料说明", "业务细节", "补充说明"]),
    deployment: deployment.requested || deployment.provider || deployment.domain ? deployment : undefined,
  };
}

function hasValue(value: unknown): boolean {
  return !(
    value === undefined ||
    value === null ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0)
  );
}

function mergeRequirementFieldsFromSources(sourceMessages: string[]): {
  values: ExtractedRequirementFields;
  fields: RequirementSpec["fields"];
} {
  const values: ExtractedRequirementFields = {};
  const fields: RequirementSpec["fields"] = {};
  const setField = (key: keyof ExtractedRequirementFields, value: unknown, sourceIndex: number, sourceText: string) => {
    if (!hasValue(value)) return;
    (values as Record<string, unknown>)[key] = value;
    fields[key] = { value, sourceIndex, sourceText };
  };
  const appendField = (key: keyof ExtractedRequirementFields, value: unknown, sourceIndex: number, sourceText: string) => {
    if (!hasValue(value)) return;
    if (Array.isArray(value)) {
      const merged = unique([...(Array.isArray((values as any)[key]) ? (values as any)[key] : []), ...value]);
      (values as Record<string, unknown>)[key] = merged;
      fields[key] = { value: merged, sourceIndex, sourceText };
      return;
    }
    setField(key, value, sourceIndex, sourceText);
  };

  sourceMessages.forEach((message, sourceIndex) => {
    const extracted = extractRequirementFieldsFromText(message);
    const categories = categorizeRequirementMessage(message);
    const correction = hasCorrectionIntent(message);
    const apply = (key: keyof ExtractedRequirementFields, target: RequirementPatchOperation["target"]) => {
      const value = extracted[key];
      if (!hasValue(value)) return;
      if (correction && categories.has(target)) {
        setField(key, value, sourceIndex, message);
      } else {
        appendField(key, value, sourceIndex, message);
      }
    };

    apply("siteType", "text");
    apply("brand", "brand");
    apply("businessContext", "businessContext");
    apply("targetAudience", "targetAudience");
    apply("pages", "pages");
    apply("pageStructure", "pages");
    apply("visualStyle", "visualStyle");
    apply("functionalRequirements", "contentModules");
    apply("contentModules", "contentModules");
    apply("ctas", "ctas");
    apply("primaryGoal", "ctas");
    apply("locale", "locale");
    apply("tone", "tone");
    apply("brandLogo", "text");
    apply("contentSources", "contentModules");
    apply("customNotes", "businessContext");
    apply("deployment", "deployment");
  });

  return { values, fields };
}

export function buildRequirementSpec(text: string, sourceMessages?: string[]): RequirementSpec {
  const raw = normalizeText(text);
  const parsedInput = parseRequirementFormFromText(raw);
  const sources = (sourceMessages && sourceMessages.length > 0 ? sourceMessages : parsedInput.hasForm ? [raw] : raw.split(/\n+/g))
    .map((message) => normalizeText(message))
    .filter(Boolean);
  const merged = mergeRequirementFieldsFromSources(sources);
  const explicitConstraints = unique(
    raw
      .split(/\n|。|；|;/g)
      .filter((line) => /必须|不要|不能|must|should|avoid|required/i.test(line)),
    20,
  );

  return {
    revision: sources.length,
    siteType: merged.values.siteType,
    brand: merged.values.brand,
    businessContext: merged.values.businessContext,
    targetAudience: merged.values.targetAudience || [],
    pages: merged.values.pages || [],
    pageStructure: merged.values.pageStructure,
    visualStyle: merged.values.visualStyle || [],
    functionalRequirements: merged.values.functionalRequirements || [],
    contentModules: merged.values.contentModules || [],
    ctas: merged.values.ctas || [],
    primaryGoal: merged.values.primaryGoal || [],
    locale: merged.values.locale,
    tone: merged.values.tone,
    brandLogo: merged.values.brandLogo,
    contentSources: merged.values.contentSources || [],
    customNotes: merged.values.customNotes,
    deployment: merged.values.deployment || { requested: false },
    explicitConstraints,
    source: "structured-parser",
    fields: merged.fields,
  };
}

export function buildRequirementPatchPlan(text: string, revision = 1): RequirementPatchPlan {
  const raw = normalizeText(text);
  const spec = buildRequirementSpec(raw, [raw]);
  const operations: RequirementPatchOperation[] = [];
  const correction = hasCorrectionIntent(raw);
  const removeLocale =
    /不要英文|不用英文|not\s+english|no\s+english/i.test(raw)
      ? "en"
      : /不要中文|不用中文|not\s+chinese|no\s+chinese/i.test(raw)
        ? "zh-CN"
        : undefined;

  if (removeLocale) operations.push({ op: "remove", target: "locale", value: removeLocale, sourceText: raw });
  if (spec.locale) operations.push({ op: correction ? "set" : "append", target: "locale", value: spec.locale, sourceText: raw });
  if (spec.visualStyle?.length) {
    operations.push({ op: correction ? "set" : "append", target: "visualStyle", value: spec.visualStyle, sourceText: raw });
  }
  if (spec.pages?.length) operations.push({ op: correction ? "set" : "append", target: "pages", value: spec.pages, sourceText: raw });
  if (spec.ctas?.length) operations.push({ op: correction ? "set" : "append", target: "ctas", value: spec.ctas, sourceText: raw });
  if (spec.targetAudience?.length) {
    operations.push({ op: correction ? "set" : "append", target: "targetAudience", value: spec.targetAudience, sourceText: raw });
  }
  if (spec.contentModules?.length) {
    operations.push({ op: correction ? "set" : "append", target: "contentModules", value: spec.contentModules, sourceText: raw });
  }
  if (spec.deployment?.requested || spec.deployment?.provider || spec.deployment?.domain) {
    operations.push({ op: correction ? "set" : "append", target: "deployment", value: spec.deployment, sourceText: raw });
  }
  if (operations.length === 0 && raw) {
    operations.push({ op: correction ? "set" : "append", target: "text", value: raw, sourceText: raw });
  }

  return {
    revision,
    operations,
    instructionText: raw,
  };
}

export function isDeployIntent(text: string): boolean {
  const rawText = String(text || "").trim().toLowerCase();
  if (/^(?:\u90e8\u7f72|\u53d1\u5e03|\u4e0a\u7ebf|\u786e\u8ba4\u90e8\u7f72)$/.test(rawText)) return true;
  if (rawText.includes("\u90e8\u7f72\u5230 cloudflare")) return true;
  if (rawText.includes("\u90e8\u7f72\u5230cloudflare")) return true;
  if (rawText.includes("\u53d1\u5e03\u5230 cloudflare")) return true;
  if (rawText.includes("\u53d1\u5e03\u5230cloudflare")) return true;
  if (rawText.includes("\u4e0a\u7ebf\u5230 cloudflare")) return true;
  if (rawText.includes("\u4e0a\u7ebf\u5230cloudflare")) return true;
  const normalized = toLower(text);
  if (!normalized) return false;
  if (/^(?:部署|发布|上线|确认部署)$/.test(normalized)) return true;
  if (normalized.includes("部署到 cloudflare")) return true;
  if (normalized.includes("发布到 cloudflare")) return true;
  if (normalized.includes("上线到 cloudflare")) return true;
  if (/^deploy(?:\s+now|\s+site)?$/.test(normalized)) return true;
  if (/^(?:部署|发布|上线|确认部署|部署到cloudflare)$/.test(normalized)) return true;
  if (normalized.includes("deploy to cloudflare")) return true;
  if (normalized.includes("deploy cloudflare")) return true;
  if (normalized.includes("部署到cloudflare")) return true;
  if (normalized.includes("部署到 cloudflare")) return true;
  if (normalized.includes("发布到cloudflare")) return true;
  return false;
}

export function isGenerateIntent(text: string): boolean {
  const normalized = toLower(text);
  if (!normalized) return false;
  return /(?:开始生成|直接生成|马上生成|立即生成|生成网站|生成页面|开始做|go ahead|start|generate|build now|create now|ship it|开工)/i.test(
    normalized,
  );
}

function isConcreteWebsiteGenerationRequest(text: string, completionPercent: number): boolean {
  const normalized = toLower(text);
  if (!normalized) return false;

  const hasCreateVerb = /(?:\bbuild\b|\bcreate\b|\bgenerate\b|生成|创建|搭建|做)/i.test(normalized);
  const hasWebsiteTarget = /(?:website|site|landing page|web page|网页|网站|官网|页面)/i.test(normalized);
  if (!hasCreateVerb || !hasWebsiteTarget) return false;

  const hasMultiPageSignal = /(?:\b\d+\s*[- ]?page\b|\bpages?\s*[:：]|多页|导航|nav(?:igation)?)/i.test(
    normalized,
  );
  return completionPercent >= 50 || hasMultiPageSignal;
}

export function isRefineIntent(text: string): boolean {
  const normalized = toLower(text);
  if (!normalized) return false;
  return /(?:调整|改一下|微调|优化|修改|换成|把.+改成|refine|tweak|adjust|update|change|polish)/i.test(normalized);
}

export function isRebuildIntent(text: string): boolean {
  const normalized = toLower(text);
  if (!normalized) return false;
  return /(?:全量重做|重新生成|推倒重来|全部重做|full regenerate|regenerate all|rebuild)/i.test(normalized);
}

function localizedOption(value: string, zh: string, en: string): RequirementSlotOption {
  return { value, label: zh, i18n: { zh, en } };
}

const SITE_TYPE_OPTIONS: RequirementSlotOption[] = [
  localizedOption("company", "企业官网", "Company website"),
  localizedOption("landing", "产品落地页", "Product landing page"),
  localizedOption("ecommerce", "电商展示", "E-commerce showcase"),
  localizedOption("portfolio", "作品集", "Portfolio"),
  localizedOption("event", "活动页", "Event page"),
  localizedOption("other", "其他", "Other"),
];

const AUDIENCE_OPTIONS: RequirementSlotOption[] = [
  localizedOption("consumers", "普通消费者", "Consumers"),
  localizedOption("enterprise_buyers", "企业采购", "Enterprise buyers"),
  localizedOption("investors", "投资人", "Investors"),
  localizedOption("developers", "开发者", "Developers"),
  localizedOption("students", "学生", "Students"),
  localizedOption("government", "政府机构", "Government organizations"),
  localizedOption("overseas_customers", "海外客户", "Overseas customers"),
];

const DESIGN_THEME_OPTIONS: RequirementSlotOption[] = [
  ...WEBSITE_DESIGN_DIRECTIONS.map((direction) =>
    localizedOption(direction.id, direction.zhLabel, direction.label),
  ),
  localizedOption("professional", "专业可信", "Professional and trustworthy"),
  localizedOption("tech", "科技感", "Technology-driven"),
  localizedOption("luxury", "高端奢华", "Premium"),
  localizedOption("playful", "活泼年轻", "Playful and youthful"),
  localizedOption("minimal", "极简现代", "Minimal and modern"),
  localizedOption("industrial", "工业制造", "Industrial manufacturing"),
  localizedOption("warm", "温暖亲和", "Warm and approachable"),
];

const PAGE_OPTIONS: RequirementSlotOption[] = [
  localizedOption("home", "首页", "Home"),
  localizedOption("about", "关于", "About"),
  localizedOption("products", "产品", "Products"),
  localizedOption("services", "服务", "Services"),
  localizedOption("cases", "案例", "Cases"),
  localizedOption("pricing", "价格", "Pricing"),
  localizedOption("blog", "博客", "Blog"),
  localizedOption("contact", "联系", "Contact"),
];

const FUNCTIONAL_REQUIREMENT_OPTIONS: RequirementSlotOption[] = [
  localizedOption("customer_inquiry_form", SUPPORTED_FUNCTIONAL_REQUIREMENT_LABELS.customer_inquiry_form, "Customer inquiry form"),
  localizedOption("contact_form", SUPPORTED_FUNCTIONAL_REQUIREMENT_LABELS.contact_form, "Contact form"),
  localizedOption("search_filter", SUPPORTED_FUNCTIONAL_REQUIREMENT_LABELS.search_filter, "Search and filters"),
  localizedOption("downloads", SUPPORTED_FUNCTIONAL_REQUIREMENT_LABELS.downloads, "Downloads"),
  localizedOption("none", SUPPORTED_FUNCTIONAL_REQUIREMENT_LABELS.none, "No special functionality, content display only"),
];

const PRIMARY_GOAL_OPTIONS: RequirementSlotOption[] = [
  localizedOption("lead_generation", "获取咨询", "Lead generation"),
  localizedOption("product_showcase", "展示产品", "Product showcase"),
  localizedOption("brand_trust", "建立品牌信任", "Build brand trust"),
  localizedOption("download_materials", "下载资料", "Material downloads"),
  localizedOption("book_demo", "预约演示", "Book a demo"),
  localizedOption("online_purchase", "在线购买", "Online purchase"),
];

const LANGUAGE_OPTIONS: RequirementSlotOption[] = [
  localizedOption("zh-CN", "中文", "Chinese"),
  localizedOption("en", "英文", "English"),
  localizedOption("bilingual", "中英双语", "Chinese and English"),
];

const LOGO_OPTIONS: RequirementSlotOption[] = [
  localizedOption("uploaded", "上传已有 Logo", "Upload existing logo"),
  localizedOption("text_mark", "暂无 Logo，使用品牌文字标识", "No logo yet, use a text wordmark"),
  localizedOption("generated_placeholder", "暂无 Logo，请生成临时文字 Logo", "No logo yet, generate a temporary text logo"),
  localizedOption("none", "不展示 Logo", "Do not show a logo"),
];

const CONTENT_SOURCE_OPTIONS: RequirementSlotOption[] = [
  localizedOption("new_site", "新建站，无现成内容", "New website, no existing content"),
  localizedOption("existing_domain", "已有域名或旧站", "Existing domain or old website"),
  localizedOption("uploaded_files", "上传资料", "Uploaded materials"),
  localizedOption("industry_research", "使用行业资料扩充", "Use industry research"),
];

const SLOT_DEFINITIONS: Array<{
  key: string;
  label: string;
  required?: boolean;
  inputType?: RequirementSlot["inputType"];
  options?: RequirementSlotOption[];
  allowCustom?: boolean;
  patterns: RegExp[];
}> = [
  {
    key: "site-type",
    label: "网站类型",
    required: true,
    inputType: "single",
    options: SITE_TYPE_OPTIONS,
    patterns: [/企业官网|公司官网|机构官网|落地页|landing|电商|商城|portfolio|作品集|活动页|event/i],
  },
  {
    key: "brand-positioning",
    label: "品牌定位与业务背景",
    inputType: "text",
    patterns: [/公司|品牌|机构|factory|manufacturer|casux|lc-cnc|灵创|适儿/i],
  },
  {
    key: "content-source",
    label: "内容来源",
    required: true,
    inputType: "content-source",
    options: CONTENT_SOURCE_OPTIONS,
    patterns: [/新建站|没有资料|暂无内容|已有域名|旧站|域名|上传资料|上传文件|行业资料|竞品|new website|existing domain|domain|uploaded files|industry research/i],
  },
  {
    key: "target-audience",
    label: "目标受众与使用场景",
    required: true,
    inputType: "multi",
    options: AUDIENCE_OPTIONS,
    allowCustom: true,
    patterns: [/受众|audience|客户|user|政府|设计师|采购|researcher|研究者/i],
  },
  {
    key: "sitemap-pages",
    label: "页面数与页面结构",
    required: true,
    inputType: "page-structure",
    options: PAGE_OPTIONS,
    allowCustom: true,
    patterns: [/首页|contact|about|cases|导航|nav|page|页面|3c|产品|自动生成页面结构|自动规划页面|auto(?:matic)? sitemap/i],
  },
  {
    key: "visual-system",
    label: "设计主题",
    required: true,
    inputType: "multi",
    options: DESIGN_THEME_OPTIONS,
    allowCustom: true,
    patterns: [/风格|style|配色|color|字体|typography|工业风|活泼|温暖|科技感/i],
  },
  {
    key: "content-modules",
    label: "核心内容模块",
    patterns: [/hero|案例|新闻|模块|section|功能|form|表单|认证|研究中心/i],
  },
  {
    key: "functional-requirements",
    label: "功能需求",
    required: true,
    inputType: "multi",
    options: FUNCTIONAL_REQUIREMENT_OPTIONS,
    patterns: [/询盘|表单|搜索|筛选|下载|多语言|语言切换|功能|inquiry|form|search|filter|download|language switch/i],
  },
  {
    key: "interaction-cta",
    label: "核心转化目标",
    required: true,
    inputType: "multi",
    options: PRIMARY_GOAL_OPTIONS,
    allowCustom: true,
    patterns: [/cta|按钮|联系|whatsapp|quote|catalog|订阅|下载|查询/i],
  },
  {
    key: "language-and-tone",
    label: "语言与语气",
    required: true,
    inputType: "single",
    options: LANGUAGE_OPTIONS,
    patterns: [/中文|英文|english|chinese|语气|tone|专业|亲切/i],
  },
  {
    key: "brand-logo",
    label: "Logo 策略",
    required: true,
    inputType: "logo",
    options: LOGO_OPTIONS,
    patterns: [/logo|标识|商标|brand mark/i],
  },
  {
    key: "deployment-and-domain",
    label: "部署域名与交付要求",
    patterns: [/cloudflare|部署|pages\.dev|域名|子域名|上线/i],
  },
];

export function buildRequirementSlots(text: string): RequirementSlot[] {
  const normalized = toLower(text);
  const parsedForm = parseRequirementFormFromText(text);
  const spec = buildRequirementSpec(text, parsedForm.hasForm ? [text] : undefined);
  const structuredEvidence: Record<string, string | undefined> = {
    "site-type": spec.siteType,
    "brand-positioning": spec.brand || spec.businessContext,
    "content-source": spec.contentSources?.join(", "),
    "target-audience": spec.targetAudience?.join(", "),
    "sitemap-pages": spec.pageStructure?.mode
      ? `${spec.pageStructure.mode}${spec.pageStructure.pages?.length ? `: ${spec.pageStructure.pages.join(", ")}` : ""}`
      : spec.pages?.join(", "),
    "visual-system": spec.visualStyle?.join(", "),
    "functional-requirements": spec.functionalRequirements?.join(", "),
    "content-modules": spec.contentModules?.join(", "),
    "interaction-cta": (spec.primaryGoal?.length ? spec.primaryGoal : spec.ctas)?.join(", "),
    "language-and-tone": spec.locale || spec.tone,
    "brand-logo": spec.brandLogo?.mode
      ? spec.brandLogo.mode === "uploaded" && !(spec.brandLogo.assetKey || spec.brandLogo.assetId || spec.brandLogo.referenceText)
        ? undefined
        : spec.brandLogo.mode
      : undefined,
    "deployment-and-domain": spec.deployment?.provider || spec.deployment?.domain || (spec.deployment?.requested ? "deployment requested" : undefined),
  };
  return SLOT_DEFINITIONS.map((slot) => {
    const evidence = structuredEvidence[slot.key] || containsAny(normalized, slot.patterns);
    const value =
      slot.key === "site-type"
        ? spec.siteType
        : slot.key === "content-source"
          ? spec.contentSources
        : slot.key === "target-audience"
          ? spec.targetAudience
          : slot.key === "sitemap-pages"
            ? spec.pageStructure
            : slot.key === "visual-system"
              ? spec.visualStyle
              : slot.key === "functional-requirements"
                ? spec.functionalRequirements
                : slot.key === "interaction-cta"
                  ? spec.primaryGoal?.length
                    ? spec.primaryGoal
                    : spec.ctas
                  : slot.key === "language-and-tone"
                    ? spec.locale || spec.tone
                    : slot.key === "brand-logo"
                      ? spec.brandLogo
                      : undefined;
    return {
      key: slot.key,
      label: slot.label,
      filled: Boolean(evidence),
      evidence: evidence ? evidence.slice(0, 80) : undefined,
      required: Boolean(slot.required),
      inputType: slot.inputType,
      options: slot.options,
      allowCustom: slot.allowCustom,
      value,
    };
  });
}

export function getRequirementCompletionPercent(slots: RequirementSlot[]): number {
  const total = Math.max(1, slots.length);
  const filled = slots.filter((slot) => slot.filled).length;
  return Math.round((filled / total) * 100);
}

export function validateRequiredRequirementSlots(slots: RequirementSlot[]): RequiredSlotValidation {
  const missing = slots.filter((slot) => {
    if (!slot.required) return false;
    if (!slot.filled) return true;
    if (slot.key === "sitemap-pages") {
      const value = (slot.value || {}) as PageStructureRequirement;
      if (value.mode === "multi" && value.planning !== "auto" && (!Array.isArray(value.pages) || value.pages.length === 0)) return true;
    }
    if (slot.key === "brand-logo") {
      const value = (slot.value || {}) as BrandLogoRequirement;
      if (!value.mode) return true;
      if (value.mode === "uploaded" && !(value.assetKey || value.assetId || value.referenceText)) return true;
    }
    return false;
  });
  return {
    passed: missing.length === 0,
    missingRequiredSlots: missing.map((slot) => slot.label),
    nextSlot: missing[0],
  };
}

export function aggregateRequirementFromHistory(params: {
  historyUserMessages: string[];
  currentUserText: string;
  maxMessages?: number;
}): AggregatedRequirement {
  const maxMessages = Math.max(1, Math.min(12, Number(params.maxMessages || 8)));
  const rawMessages = [...(params.historyUserMessages || []), params.currentUserText]
    .map((text) => normalizeText(text))
    .filter(Boolean);

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const text of rawMessages) {
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(text);
  }

  const { activeMessages, supersededMessages, correctionSummary } = filterSupersededMessages(deduped);
  const sourceMessages = activeMessages.slice(-maxMessages);
  return {
    sourceMessages,
    revision: deduped.length,
    supersededMessages,
    correctionSummary,
    requirementText: sourceMessages.join("\n"),
  };
}

export function deriveConversationStage(params: {
  latestTaskStatus?: string;
  latestProgressStage?: string;
  latestDeployedUrl?: string;
  checkpointProjectPath?: string;
  workflowContext?: Record<string, unknown> | undefined;
}): ConversationStage {
  const status = toLower(String(params.latestTaskStatus || ""));
  const progressStage = toLower(String(params.latestProgressStage || ""));
  const deployedUrl = normalizeText(String(params.latestDeployedUrl || ""));
  const workflow = (params.workflowContext || {}) as Record<string, unknown>;
  const workflowDeployed = normalizeText(String(workflow.deployed_url || ""));
  const checkpointProjectPath =
    normalizeText(String(params.checkpointProjectPath || "")) ||
    normalizeText(String(workflow.checkpointProjectPath || "")) ||
    normalizeText(String(workflow.deploySourceProjectPath || ""));

  if ((status === "queued" || status === "running") && progressStage.includes("deploy")) {
    return "deploying";
  }
  if (deployedUrl || workflowDeployed) return "deployed";
  if (checkpointProjectPath) return "previewing";
  return "drafting";
}

function inferAssumedDefaults(stage: ConversationStage, missingSlots: string[]): string[] {
  const defaults: string[] = [];
  if (missingSlots.includes("语言与语气")) defaults.push("Default language: Chinese-first, professional and trustworthy tone");
  if (missingSlots.includes("部署域名与交付要求")) defaults.push("Default deployment: Cloudflare Pages (pages.dev)");
  if (stage === "drafting" && missingSlots.includes("页面数与页面结构")) {
    defaults.push("Default page strategy: automatically plan first-level, second-level, and third-level pages based on the business");
  }
  return defaults;
}

export function decideChatIntent(params: {
  userText: string;
  stage: ConversationStage;
  slots: RequirementSlot[];
  isWebsiteSkill: boolean;
  forceGenerate?: boolean;
}): IntentDecision {
  const text = normalizeText(params.userText);
  const lower = toLower(text);
  const completion = getRequirementCompletionPercent(params.slots);
  const missingSlotLabels = params.slots.filter((slot) => !slot.filled).map((slot) => slot.label);

  if (params.forceGenerate) {
    return {
      intent: "generate",
      confidence: 1,
      reason: "legacy-confirmation-prefix",
      completionPercent: completion,
      missingSlots: missingSlotLabels,
      assumedDefaults: inferAssumedDefaults(params.stage, missingSlotLabels),
      shouldCreateTask: true,
    };
  }

  if (!params.isWebsiteSkill) {
    return {
      intent: "generate",
      confidence: 0.95,
      reason: "non-website-skill-default-generate",
      completionPercent: completion,
      missingSlots: missingSlotLabels,
      assumedDefaults: [],
      shouldCreateTask: true,
    };
  }

  if (isDeployIntent(text)) {
    if (params.stage === "previewing" || params.stage === "deployed") {
      return {
        intent: "deploy",
        confidence: 0.98,
        reason: "explicit-deploy-intent",
        completionPercent: completion,
        missingSlots: missingSlotLabels,
        assumedDefaults: [],
        shouldCreateTask: true,
      };
    }
    return {
      intent: "clarify",
      confidence: 0.82,
      reason: "deploy-request-without-preview-baseline",
      completionPercent: completion,
      missingSlots: missingSlotLabels,
      assumedDefaults: [],
      shouldCreateTask: false,
    };
  }

  if (params.stage === "deploying") {
    return {
      intent: "clarify",
      confidence: 0.9,
      reason: "deploying-task-in-progress",
      completionPercent: completion,
      missingSlots: missingSlotLabels,
      assumedDefaults: [],
      shouldCreateTask: false,
    };
  }

  if (isRebuildIntent(text)) {
    return {
      intent: "generate",
      confidence: 0.93,
      reason: "explicit-full-rebuild-intent",
      completionPercent: completion,
      missingSlots: missingSlotLabels,
      assumedDefaults: inferAssumedDefaults(params.stage, missingSlotLabels),
      shouldCreateTask: true,
    };
  }

  if (isRefineIntent(text)) {
    if (params.stage === "deployed") {
      return {
        intent: "refine_deployed",
        confidence: 0.91,
        reason: "explicit-refine-intent-on-deployed",
        completionPercent: completion,
        missingSlots: missingSlotLabels,
        assumedDefaults: [],
        shouldCreateTask: true,
      };
    }
    if (params.stage === "previewing") {
      return {
        intent: "refine_preview",
        confidence: 0.91,
        reason: "explicit-refine-intent-on-preview",
        completionPercent: completion,
        missingSlots: missingSlotLabels,
        assumedDefaults: [],
        shouldCreateTask: true,
      };
    }
  }

  if (params.stage === "drafting" && isConcreteWebsiteGenerationRequest(text, completion)) {
    return {
      intent: "generate",
      confidence: 0.84,
      reason: "explicit-concrete-website-generation-request",
      completionPercent: completion,
      missingSlots: missingSlotLabels,
      assumedDefaults: inferAssumedDefaults(params.stage, missingSlotLabels),
      shouldCreateTask: true,
    };
  }

  if (isGenerateIntent(text)) {
    return {
      intent: "generate",
      confidence: 0.9,
      reason: "explicit-generate-intent",
      completionPercent: completion,
      missingSlots: missingSlotLabels,
      assumedDefaults: inferAssumedDefaults(params.stage, missingSlotLabels),
      shouldCreateTask: true,
    };
  }

  if (params.stage === "deployed") {
    return {
      intent: "refine_deployed",
      confidence: 0.68,
      reason: "post-deploy-follow-up-defaults-to-refine",
      completionPercent: completion,
      missingSlots: missingSlotLabels,
      assumedDefaults: [],
      shouldCreateTask: true,
    };
  }

  if (params.stage === "previewing") {
    return {
      intent: "refine_preview",
      confidence: 0.68,
      reason: "preview-follow-up-defaults-to-refine",
      completionPercent: completion,
      missingSlots: missingSlotLabels,
      assumedDefaults: [],
      shouldCreateTask: true,
    };
  }

  const looksLikeWebsiteRequest = /(?:website|site|landing|网页|网站|官网|页面|build|create|生成)/i.test(lower);
  if (params.stage === "drafting" && looksLikeWebsiteRequest && completion >= 70) {
    return {
      intent: "generate",
      confidence: 0.76,
      reason: "auto-generate-when-requirement-is-sufficient",
      completionPercent: completion,
      missingSlots: missingSlotLabels,
      assumedDefaults: inferAssumedDefaults(params.stage, missingSlotLabels),
      shouldCreateTask: true,
    };
  }

  return {
    intent: "clarify",
    confidence: completion >= 40 ? 0.74 : 0.88,
    reason: "insufficient-signal-needs-clarification",
    completionPercent: completion,
    missingSlots: missingSlotLabels,
    assumedDefaults: inferAssumedDefaults(params.stage, missingSlotLabels),
    shouldCreateTask: false,
  };
}

export function composeStructuredPrompt(rawRequirement: string, slots: RequirementSlot[]): string {
  const normalizedRequirement = normalizeText(rawRequirement);
  const parsedForm = parseRequirementFormFromText(rawRequirement);
  const spec = buildRequirementSpec(rawRequirement, parsedForm.hasForm ? [rawRequirement] : undefined);
  const promptLabels: Record<string, string> = {
    company: "Company website",
    landing: "Product landing page",
    ecommerce: "E-commerce showcase",
    portfolio: "Portfolio",
    event: "Event page",
    other: "Other",
    consumers: "Consumers",
    enterprise_buyers: "Enterprise buyers",
    investors: "Investors",
    developers: "Developers",
    students: "Students",
    government: "Government organizations",
    overseas_customers: "Overseas customers",
    professional: "Professional and trustworthy",
    tech: "Technology-driven",
    luxury: "Premium",
    playful: "Playful and youthful",
    minimal: "Minimal and modern",
    industrial: "Industrial manufacturing",
    warm: "Warm and approachable",
    home: "Home",
    about: "About",
    products: "Products",
    services: "Services",
    cases: "Cases",
    pricing: "Pricing",
    blog: "Blog",
    contact: "Contact",
    customer_inquiry_form: "Customer inquiry form",
    contact_form: "Contact form",
    search_filter: "Search and filters",
    downloads: "Downloads",
    none: "No special functionality, content display only",
    lead_generation: "Lead generation",
    product_showcase: "Product showcase",
    brand_trust: "Build brand trust",
    download_materials: "Material downloads",
    book_demo: "Book a demo",
    online_purchase: "Online purchase",
    "zh-CN": "Chinese",
    en: "English",
    bilingual: "Chinese and English",
    uploaded: "Uploaded logo",
    text_mark: "Text wordmark",
    generated_placeholder: "Generated temporary text logo",
    new_site: "New website, no existing content",
    existing_domain: "Existing domain or old website",
    uploaded_files: "Uploaded materials",
    industry_research: "Use industry research",
    ...Object.fromEntries(WEBSITE_DESIGN_DIRECTIONS.map((direction) => [direction.id, direction.label])),
  };
  const slotLabel = (slot: RequirementSlot) => {
    const labels: Record<string, string> = {
      "site-type": "Website type",
      "brand-positioning": "Brand positioning and business context",
      "content-source": "Content source",
      "target-audience": "Target audience and use cases",
      "sitemap-pages": "Page count and site structure",
      "visual-system": "Design theme",
      "content-modules": "Core content modules",
      "functional-requirements": "Functional requirements",
      "interaction-cta": "Primary conversion goal",
      "language-and-tone": "Language and tone",
      "brand-logo": "Logo strategy",
      "deployment-and-domain": "Deployment, domain, and delivery requirements",
    };
    return labels[slot.key] || slot.label;
  };
  const optionLabel = (_options: RequirementSlotOption[], value?: string) => promptLabels[value || ""] || value || "";
  const optionLabels = (options: RequirementSlotOption[], values?: string[]) =>
    (values || []).map((value) => optionLabel(options, value)).filter(Boolean).join(", ");
  const logoMode = spec.brandLogo?.mode === "none"
    ? "Do not show a logo"
    : spec.brandLogo?.mode
      ? optionLabel(LOGO_OPTIONS, spec.brandLogo.mode)
      : "";
  const pageStructureLabel =
    spec.pageStructure?.mode === "single"
        ? "Single-page website"
        : spec.pageStructure?.mode === "multi" && spec.pageStructure.planning === "auto"
          ? "Multi-page website (automatically plan first-level navigation, second-level detail pages, and necessary third-level content pages)"
          : spec.pageStructure?.mode === "multi"
          ? `Multi-page website (${(spec.pageStructure.pages || spec.pages || []).join(" / ") || "use the confirmed page list"})`
          : "";
  const confirmedParameters = [
    spec.siteType ? `- Website type: ${optionLabel(SITE_TYPE_OPTIONS, spec.siteType)}` : "",
    spec.targetAudience?.length ? `- Target audience: ${optionLabels(AUDIENCE_OPTIONS, spec.targetAudience)}` : "",
    spec.visualStyle?.length ? `- Design theme: ${optionLabels(DESIGN_THEME_OPTIONS, spec.visualStyle)}` : "",
    pageStructureLabel ? `- Site structure: ${pageStructureLabel}` : "",
    spec.functionalRequirements?.length
      ? `- Functional requirements: ${optionLabels(FUNCTIONAL_REQUIREMENT_OPTIONS, spec.functionalRequirements)}`
      : "",
    spec.primaryGoal?.length ? `- Primary goal: ${optionLabels(PRIMARY_GOAL_OPTIONS, spec.primaryGoal)}` : "",
    spec.locale ? `- Language: ${optionLabel(LANGUAGE_OPTIONS, spec.locale)}` : "",
    logoMode
      ? `- Logo source: ${logoMode}${spec.brandLogo?.assetName ? ` (${spec.brandLogo.assetName})` : ""}`
      : "",
    spec.contentSources?.length ? `- Content sources: ${optionLabels(CONTENT_SOURCE_OPTIONS, spec.contentSources)}` : "",
    spec.customNotes ? `- Business/content details: ${spec.customNotes}` : "",
  ].filter(Boolean);
  const logoRequirement =
    spec.brandLogo?.mode === "uploaded"
      ? [
          "## 0.5 Brand Assets",
          "- Logo source: the user uploaded a logo asset.",
          spec.brandLogo.referenceText ? `- Logo asset reference: ${spec.brandLogo.referenceText}` : "",
          "- Use the uploaded logo asset. Do not redraw, replace, or invent a brand mark.",
          "- Logo placement: left side of the navigation bar and brand area in the footer. Use a readable reversed or monochrome adaptation on dark surfaces.",
        ]
          .filter(Boolean)
          .join("\n")
      : spec.brandLogo?.mode
        ? [
            "## 0.5 Brand Assets",
            `- Logo source: ${logoMode}.`,
            "- Logo placement: left side of the navigation bar and brand area in the footer.",
          ].join("\n")
        : "";
  const highlights = normalizedRequirement
    .split(/[\n。；;!?！？]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((item) => `- ${item}`);
  const missing = slots
    .filter((slot) => !slot.filled)
    .map((slot) => `- ${slotLabel(slot)}`)
    .join("\n");
  const completion = `${slots.filter((slot) => slot.filled).length}/${slots.length}`;
  const visualDirectionContract = renderWebsiteDesignDirectionPrompt(spec.visualStyle);

  return [
    "# Canonical Website Generation Prompt",
    "",
    `> Requirement completion: ${completion}`,
    "",
    "## 0. Confirmed Generation Parameters",
    confirmedParameters.length > 0 ? confirmedParameters.join("\n") : "- No complete confirmed parameters yet",
    "",
    logoRequirement,
    logoRequirement ? "" : "",
    "## 1. Original Requirement",
    "```",
    normalizedRequirement || "(empty requirement)",
    "```",
    "",
    "## 1.5 Explicit User Constraints (Highest Priority)",
    highlights.length > 0 ? highlights.join("\n") : "- None yet; ask for them in follow-up if needed",
    "",
    "## 1.6 Content Source Instructions",
    spec.contentSources?.length
      ? [
          `- Source mode: ${optionLabels(CONTENT_SOURCE_OPTIONS, spec.contentSources)}.`,
          spec.contentSources.includes("new_site")
            ? "- If this is a new website with limited material, do not invent unsupported facts. Use user-provided business details first and mark assumptions explicitly."
            : "",
          spec.contentSources.includes("existing_domain")
            ? "- If a domain is provided, prioritize same-domain research and extracted website facts before generic industry research."
            : "",
          spec.contentSources.includes("uploaded_files")
            ? "- If uploaded materials are referenced, extract their content into the website knowledge profile and use them as high-confidence source material."
            : "",
          spec.contentSources.includes("industry_research")
            ? "- Use industry research only to fill structural and market context gaps; do not present it as brand-owned facts."
            : "",
          spec.customNotes ? `- User supplied content notes: ${spec.customNotes}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "- No content source strategy was confirmed yet.",
    "",
    "## 2. Website Overall Positioning Prompt",
    "```",
    "Generate a complete website from this canonical prompt. Treat source facts, uploaded files, domain research, and explicit user constraints as the highest-priority content inputs.",
    "The website must make brand positioning, target audience, information architecture, page-level purpose, conversion path, and trust-building content explicit.",
    "Do not infer a product-selling site, SaaS site, industrial site, or e-commerce site unless the confirmed requirement or source material says so.",
    "The final output must be a static multi-file website with complete HTML pages, shared styles.css, shared script.js, accessible navigation, and responsive layouts.",
    "```",
    "",
    "## 3. Page-Level Detailed Prompt",
    "```",
    "For every generated route, write the page as if it had its own brief:",
    "1. Page goal and audience intent.",
    "2. Required source facts, messages, and page-specific copy direction.",
    "3. Section order and visual hierarchy.",
    "4. Components and interactions that fit this page only.",
    "5. Internal links to related pages and the intended next action.",
    "6. Mobile behavior and accessibility requirements.",
    "If the page structure is auto-planned, first derive a compact sitemap from source material and user goals. Cover necessary first-level navigation and deeper pages only when the content justifies them.",
    "Do not repeat an inner-page body template with only text changed. Each page must have a distinct content structure based on its own purpose.",
    "```",
    "",
    "## 4. General Design Specification Prompt",
    "```",
    "Define a cohesive visual system: color tokens, typography, spacing, border radius, shadows, grid behavior, responsive breakpoints, hover states, focus states, and subtle motion.",
    "The visual direction must fit the website type and source material, not a preset theme. Keep the interface polished, readable, and practical on desktop, tablet, and mobile.",
    "```",
    "",
    visualDirectionContract,
    visualDirectionContract ? "" : "",
    "## 5. Special Component Prompt",
    "```",
    "Include only components supported by confirmed requirements and source material:",
    "- Implement only supported interactive blocks from the confirmed functional requirements. Do not generate unsupported backend capabilities such as real authentication, online payments, booking systems, or admin consoles.",
    "- If customer inquiry form is selected, include name, company, email/phone, requirement description, product/service selection, submit feedback, anti-spam, and consent hints.",
    "- Include search, filters, downloads, login/register mock UI, certification lookup, or data components only when explicitly selected or justified by source content.",
    "- Contact form component with Name, Email, Phone, Message, and Consent.",
    "- Data visualization components may be used only for source-backed metrics or clearly marked assumptions.",
    "```",
    "",
    "## 6. Missing Information To Clarify",
    missing || "- None",
  ].join("\n");
}

export function buildClarificationQuestion(params: {
  slots: RequirementSlot[];
  stage: ConversationStage;
  decision: IntentDecision;
}): string {
  if (params.stage === "previewing") {
    return "A preview version exists. Describe the exact change you want, such as color, title, layout, or copy, and I will refine from the preview baseline.";
  }
  if (params.stage === "deployed") {
    return "A published version already exists. Describe the change you want, and I will refine from the deployed version and can redeploy it.";
  }

  const missing = params.slots.filter((slot) => !slot.filled);
  if (missing.length === 0) {
    return "The requirement is mostly complete. You can add more details or confirm generation to start the build.";
  }

  const requiredMissing = missing.filter((slot) => slot.required);
  const labelMap: Record<string, string> = {
    "site-type": "website type",
    "content-source": "content source",
    "target-audience": "target audience",
    "sitemap-pages": "page count and site structure",
    "visual-system": "design theme",
    "functional-requirements": "functional requirements",
    "interaction-cta": "primary conversion goal",
    "language-and-tone": "language and tone",
    "brand-logo": "logo strategy",
  };
  const top = (requiredMissing.length > 0 ? requiredMissing : missing)
    .slice(0, 2)
    .map((slot) => labelMap[slot.key] || slot.label)
    .join(", ");
  if (requiredMissing.length > 0) {
    return `Required information is still missing: ${top}. Complete the form options before generating the Prompt Draft.`;
  }
  return `Optional information is still missing: ${top}. You can add more details or generate the Prompt Draft with defaults.`;
}
