export type ConversationStage = "drafting" | "previewing" | "deployed" | "deploying";

export type ChatIntent = "clarify" | "generate" | "refine_preview" | "refine_deployed" | "deploy";

export type RequirementSlot = {
  key: string;
  label: string;
  filled: boolean;
  evidence?: string;
};

export type RequirementSpec = {
  revision: number;
  brand?: string;
  businessContext?: string;
  targetAudience?: string[];
  pages?: string[];
  visualStyle?: string[];
  contentModules?: string[];
  ctas?: string[];
  locale?: "zh-CN" | "en";
  tone?: string;
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
  brand?: string;
  businessContext?: string;
  targetAudience?: string[];
  pages?: string[];
  visualStyle?: string[];
  contentModules?: string[];
  ctas?: string[];
  locale?: "zh-CN" | "en";
  tone?: string;
  deployment?: RequirementSpec["deployment"];
};

function extractRequirementFieldsFromText(text: string): ExtractedRequirementFields {
  const raw = normalizeText(text);
  const startsWithNonBrandLabel = /^\s*(?:pages?|page list|routes?|sitemap|页面|导航|audience|target audience|客户|目标受众|用户|style|visual|视觉|风格|配色|cta|actions|按钮|转化动作|language|语言|tone|语气|modules?|sections?|内容模块|模块)\s*[:：]/i.test(
    raw,
  );
  const brand =
    extractLabelValue(raw, ["brand", "品牌", "公司", "company", "name", "名称"]) ||
    raw.match(/(?:for|给|为)\s*([A-Za-z][A-Za-z0-9 _-]{1,48})\s*(?:build|create|generate|做|生成|官网|网站)/i)?.[1]?.trim() ||
    (!startsWithNonBrandLabel
      ? raw.match(/\b([A-Z][A-Z0-9-]{2,32})\b(?:\s+(?:website|site|官网|网站))?/i)?.[1]?.trim()
      : undefined);
  const pages = unique([
    ...extractDelimitedList(raw, ["pages", "page list", "routes", "sitemap", "页面", "导航", "页面结构"]),
    ...Array.from(raw.matchAll(/\/[a-zA-Z0-9][a-zA-Z0-9/_-]{0,60}/g)).map((match) => match[0]),
    ...Array.from(
      raw.matchAll(
        /\b(home|about|products?|services?|solutions?|cases?|contact|news|blog|downloads?|pricing)\b/gi,
      ),
    ).map((match) => match[1]),
    ...Array.from(raw.matchAll(/(首页|关于|产品|服务|方案|案例|联系|新闻|博客|下载|价格)/g)).map((match) => match[1]),
  ]);
  const visualStyle = unique([
    ...extractDelimitedList(raw, ["style", "visual", "视觉", "风格", "配色"]),
    ...Array.from(raw.matchAll(/(工业风|科技感|温暖|活泼|高级|极简|专业|可信|蓝色|绿色|黑金|高对比)/g)).map(
      (match) => match[1],
    ),
  ]);
  const targetAudience = unique([
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
  const ctas = unique([
    ...extractDelimitedList(raw, ["cta", "actions", "按钮", "转化动作"]),
    ...Array.from(raw.matchAll(/(联系|询价|quote|whatsapp|catalog|订阅|下载|查询|预约|contact)/gi)).map(
      (match) => match[1],
    ),
  ]);
  const locale = /中文|chinese|zh-cn/i.test(raw) ? "zh-CN" : /英文|english|en\b/i.test(raw) ? "en" : undefined;
  const deploymentProvider = /cloudflare/i.test(raw) ? "cloudflare" : /vercel/i.test(raw) ? "vercel" : undefined;
  const domain = raw.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i)?.[0];
  const deployment = {
    provider: deploymentProvider,
    domain,
    requested: /cloudflare|vercel|deploy|部署|发布|上线|pages\.dev/i.test(raw),
  };

  return {
    brand,
    businessContext: extractLabelValue(raw, ["business", "业务", "定位", "背景"]),
    targetAudience,
    pages,
    visualStyle,
    contentModules,
    ctas,
    locale,
    tone: extractLabelValue(raw, ["tone", "语气", "口吻"]),
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

    apply("brand", "brand");
    apply("businessContext", "businessContext");
    apply("targetAudience", "targetAudience");
    apply("pages", "pages");
    apply("visualStyle", "visualStyle");
    apply("contentModules", "contentModules");
    apply("ctas", "ctas");
    apply("locale", "locale");
    apply("tone", "tone");
    apply("deployment", "deployment");
  });

  return { values, fields };
}

export function buildRequirementSpec(text: string, sourceMessages?: string[]): RequirementSpec {
  const raw = normalizeText(text);
  const sources = (sourceMessages && sourceMessages.length > 0 ? sourceMessages : raw.split(/\n+/g))
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
    brand: merged.values.brand,
    businessContext: merged.values.businessContext,
    targetAudience: merged.values.targetAudience || [],
    pages: merged.values.pages || [],
    visualStyle: merged.values.visualStyle || [],
    contentModules: merged.values.contentModules || [],
    ctas: merged.values.ctas || [],
    locale: merged.values.locale,
    tone: merged.values.tone,
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
  const normalized = toLower(text);
  if (!normalized) return false;
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

const SLOT_DEFINITIONS: Array<{ key: string; label: string; patterns: RegExp[] }> = [
  {
    key: "brand-positioning",
    label: "品牌定位与业务背景",
    patterns: [/公司|品牌|机构|factory|manufacturer|casux|lc-cnc|灵创|适儿/i],
  },
  {
    key: "target-audience",
    label: "目标受众与使用场景",
    patterns: [/受众|audience|客户|user|政府|设计师|采购|researcher|研究者/i],
  },
  {
    key: "sitemap-pages",
    label: "页面结构与导航",
    patterns: [/首页|contact|about|cases|导航|nav|page|页面|3c|产品/i],
  },
  {
    key: "visual-system",
    label: "视觉风格与配色",
    patterns: [/风格|style|配色|color|字体|typography|工业风|活泼|温暖|科技感/i],
  },
  {
    key: "content-modules",
    label: "核心内容模块",
    patterns: [/hero|案例|新闻|模块|section|功能|form|表单|认证|研究中心/i],
  },
  {
    key: "interaction-cta",
    label: "交互动作与 CTA",
    patterns: [/cta|按钮|联系|whatsapp|quote|catalog|订阅|下载|查询/i],
  },
  {
    key: "language-and-tone",
    label: "语言与语气",
    patterns: [/中文|英文|english|chinese|语气|tone|专业|亲切/i],
  },
  {
    key: "deployment-and-domain",
    label: "部署域名与交付要求",
    patterns: [/cloudflare|部署|pages\.dev|域名|子域名|上线/i],
  },
];

export function buildRequirementSlots(text: string): RequirementSlot[] {
  const normalized = toLower(text);
  const spec = buildRequirementSpec(text);
  const structuredEvidence: Record<string, string | undefined> = {
    "brand-positioning": spec.brand || spec.businessContext,
    "target-audience": spec.targetAudience?.join(", "),
    "sitemap-pages": spec.pages?.join(", "),
    "visual-system": spec.visualStyle?.join(", "),
    "content-modules": spec.contentModules?.join(", "),
    "interaction-cta": spec.ctas?.join(", "),
    "language-and-tone": spec.locale || spec.tone,
    "deployment-and-domain": spec.deployment?.provider || spec.deployment?.domain || (spec.deployment?.requested ? "deployment requested" : undefined),
  };
  return SLOT_DEFINITIONS.map((slot) => {
    const evidence = structuredEvidence[slot.key] || containsAny(normalized, slot.patterns);
    return {
      key: slot.key,
      label: slot.label,
      filled: Boolean(evidence),
      evidence: evidence ? evidence.slice(0, 80) : undefined,
    };
  });
}

export function getRequirementCompletionPercent(slots: RequirementSlot[]): number {
  const total = Math.max(1, slots.length);
  const filled = slots.filter((slot) => slot.filled).length;
  return Math.round((filled / total) * 100);
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
  if (missingSlots.includes("语言与语气")) defaults.push("默认语言：中文优先，语气专业可信");
  if (missingSlots.includes("部署域名与交付要求")) defaults.push("默认部署：Cloudflare Pages（pages.dev）");
  if (stage === "drafting" && missingSlots.includes("页面结构与导航")) {
    defaults.push("默认页面：Home/About/Services/Cases/Contact");
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
  const highlights = normalizedRequirement
    .split(/[\n。；;!?！？]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((item) => `- ${item}`);
  const missing = slots
    .filter((slot) => !slot.filled)
    .map((slot) => `- ${slot.label}`)
    .join("\n");
  const completion = `${slots.filter((slot) => slot.filled).length}/${slots.length}`;

  return [
    "# 网站完整页面生成提示词",
    "",
    `> 需求梳理完成度：${completion}`,
    "",
    "## 一、原始需求",
    "```",
    normalizedRequirement || "(empty requirement)",
    "```",
    "",
    "## 一点五、用户显式约束（必须优先满足）",
    highlights.length > 0 ? highlights.join("\n") : "- 无（需在后续对话中补充）",
    "",
    "## 二、网站整体定位描述（总提示词）",
    "```",
    "请生成一个专业机构官网，要求：",
    "1. 明确品牌定位、目标受众、核心价值主张；",
    "2. 页面之间形成统一导航和信息架构；",
    "3. 输出可直接用于多页面静态站点生成（共享 styles.css/script.js）；",
    "4. 风格、配色、字体、版式与动效统一；",
    "5. 每个页面都包含完整 head/body 结构并正确引用静态资源。",
    "```",
    "",
    "## 三、页面级详细提示词（按页面拆分）",
    "```",
    "请为以下页面分别生成详细内容与区块结构：",
    "- 首页（含导航、Hero、核心模块入口、新闻/案例、数据亮点、合作伙伴、页脚）",
    "- 产品/服务页（分类筛选、参数卡片、CTA）",
    "- 解决方案页（流程、能力、场景）",
    "- 案例页（案例卡片、标签、筛选）",
    "- 关于页（机构介绍、团队、资质、研究成果）",
    "- 联系页（联系方式、地图、可提交表单）",
    "```",
    "",
    "## 四、通用设计规范提示词",
    "```",
    "请输出：颜色系统、字体体系、间距规则、圆角规范、响应式断点、悬停/滚动动效，",
    "并保证桌面、平板、移动端布局一致性。",
    "```",
    "",
    "## 五、特殊组件提示词",
    "```",
    "请至少包含：",
    "- 认证/查询组件（若业务包含认证检索）",
    "- 标准/资料下载组件（若业务包含文档下载）",
    "- 联系表单组件（Name/Email/Phone/Message/Consent）",
    "- 数据可视化组件（统计数字或图表）",
    "```",
    "",
    "## 六、缺失信息（建议补充）",
    missing || "- 无",
  ].join("\n");
}

export function buildClarificationQuestion(params: {
  slots: RequirementSlot[];
  stage: ConversationStage;
  decision: IntentDecision;
}): string {
  if (params.stage === "previewing") {
    return "当前是预览版本。请直接描述你要改的细节（如颜色、标题、布局、文案），我会按预览基线执行微调。";
  }
  if (params.stage === "deployed") {
    return "当前已有已发布版本。请直接描述改动，我会基于已发布版本微调并可再次部署。";
  }

  const missing = params.slots.filter((slot) => !slot.filled);
  if (missing.length === 0) {
    return "需求信息已基本完整。你可以继续补充细节，或直接说“开始生成”进入正式生成。";
  }

  const top = missing.slice(0, 2).map((slot) => slot.label).join("、");
  return `还缺少关键信息：${top}。你可以直接补充，也可以说“开始生成”，我会按默认值先出预览。`;
}
