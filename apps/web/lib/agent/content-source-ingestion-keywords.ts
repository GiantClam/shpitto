function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildKeywordPattern(keywords: readonly string[], flags = "i"): RegExp {
  return new RegExp(keywords.map(escapeRegexLiteral).join("|"), flags);
}

const AUDIENCE_KEYWORDS = [
  "audience",
  "customer",
  "parent",
  "buyer",
  "用户",
  "客户",
  "家长",
  "受众",
] as const;

const OFFERING_KEYWORDS = [
  "service",
  "product",
  "solution",
  "course",
  "assessment",
  "research",
  "服务",
  "产品",
  "方案",
  "课程",
  "评估",
  "研究",
] as const;

const DIFFERENTIATOR_KEYWORDS = [
  "unique",
  "advantage",
  "differenti",
  "certif",
  "expert",
  "优势",
  "差异",
  "差异化",
  "认证",
  "资质",
  "专家",
  "可信",
] as const;

const PROOF_KEYWORDS = [
  "case",
  "client",
  "data",
  "sample",
  "certif",
  "result",
  "案例",
  "客户",
  "数据",
  "样本",
  "资质",
  "成果",
] as const;

const FALLBACK_BUSINESS_SIGNAL_KEYWORDS = [
  "个人简历网站",
  "个人经历",
  "职业履历亮点",
  "全球化进程",
  "研发体系变革专家",
  "科技创业生态建设者",
  "数字内容创作平台",
  "商业价值跃迁",
] as const;

export const CONTENT_INGESTION_AUDIENCE_RE = buildKeywordPattern(AUDIENCE_KEYWORDS);
export const CONTENT_INGESTION_OFFERING_RE = buildKeywordPattern(OFFERING_KEYWORDS);
export const CONTENT_INGESTION_DIFFERENTIATOR_RE = buildKeywordPattern(DIFFERENTIATOR_KEYWORDS);
export const CONTENT_INGESTION_PROOF_RE = buildKeywordPattern(PROOF_KEYWORDS);
export const CONTENT_INGESTION_FALLBACK_SIGNAL_RE = buildKeywordPattern(FALLBACK_BUSINESS_SIGNAL_KEYWORDS, "gu");
