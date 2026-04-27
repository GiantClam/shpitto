"use client";

import {
  FormEvent,
  KeyboardEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FolderOpen,
  Globe2,
  Loader2,
  LogOut,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Settings,
  Sparkles,
  Upload,
  User2,
  X,
} from "lucide-react";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";

type TaskStatus = "queued" | "running" | "succeeded" | "failed";

type TaskResult = {
  assistantText?: string;
  deployedUrl?: string;
  error?: string;
  actions?: Array<{ text: string; payload?: string; type?: "button" | "url" }>;
  progress?: {
    stage?: string;
    stageMessage?: string;
    provider?: string;
    model?: string;
    fileCount?: number;
    pageCount?: number;
    generatedFiles?: string[];
  };
};

type TaskPayload = {
  id: string;
  chatId: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  result: TaskResult | null;
};

type TaskEventPayload = {
  phase?: unknown;
  stage?: unknown;
  filePath?: unknown;
  path?: unknown;
  error?: unknown;
  message?: unknown;
  text?: unknown;
};

type TaskEvent = {
  id: string;
  eventType: string;
  stage?: string | null;
  payload?: TaskEventPayload | null;
  createdAt: string;
};

type TaskResponse = {
  ok: boolean;
  task?: TaskPayload | null;
  events?: TaskEvent[];
  error?: string;
};

type HistoryMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  metadata?: Record<string, unknown> | null;
  createdAt: number;
};

type HistoryResponse = {
  ok: boolean;
  messages?: HistoryMessage[];
  task?: TaskPayload | null;
  events?: TaskEvent[];
  error?: string;
};

function isTaskEventTimelineMessage(message: HistoryMessage): boolean {
  const metadata = (message.metadata || {}) as Record<string, unknown>;
  const source = String(metadata.source || "").trim().toLowerCase();
  if (source === "task_event_snapshot") return true;

  const eventType = String(metadata.eventType || "").trim().toLowerCase();
  if (eventType.startsWith("task_")) return true;

  const text = String(message.text || "").trim().toLowerCase();
  if (/^task_[a-z_]+\b/.test(text)) return true;
  if (text.includes("提供商：") || text.includes("模型：")) return true;
  if (text.includes("provider:") || text.includes("model:")) return true;
  return false;
}

type SessionPayload = {
  id: string;
  title: string;
  updatedAt: number;
  archived?: boolean;
};

type SessionsResponse = {
  ok: boolean;
  sessions?: SessionPayload[];
  error?: string;
};

type ProjectAsset = {
  id: string;
  key: string;
  name: string;
  source: "upload" | "chat_upload" | "generated";
  category: "image" | "code" | "document" | "other";
  contentType: string;
  size: number;
  updatedAt: number;
  url: string;
  referenceText: string;
};

type AssetUploadResponse = {
  ok: boolean;
  uploaded?: ProjectAsset[];
  error?: string;
};

type AssetListResponse = {
  ok: boolean;
  assets?: ProjectAsset[];
  error?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
};

type RequirementSlotOption = {
  value: string;
  label: string;
  i18n?: Partial<Record<"zh" | "en", string>>;
};

type RequirementFormLocale = "zh" | "en";

const CHAT_CARD_COPY: Record<RequirementFormLocale, Record<string, string>> = {
  zh: {
    promptDraftExpand: "Prompt Draft（点击展开）",
    confirmAndGenerate: "确认并开始生成",
    progressTitle: "网站生成进度",
    taskSubmitted: "任务已提交",
    workerStarted: "后台生成已启动",
    runningNote: "生成任务仍在后台运行，可以离开或刷新页面，进度会自动恢复。",
    queued: "排队中",
    running: "生成中",
    succeeded: "已完成",
    failed: "失败",
    waiting: "等待中",
    noPrompt: "请输入需求。",
    received: "已收到消息，正在分析你的意图和当前阶段...",
    submitFailed: "提交失败",
    uploadedFiles: "已上传 {count} 个文件，并添加到本条消息。",
    uploadFailed: "附件上传失败",
    pagesUnit: "个页面",
    filesUnit: "个文件",
    waitingWorker: "等待后台执行器",
    lastUpdated: "最后更新",
    currentProcessing: "当前处理",
    homePage: "首页",
    globalStyles: "全站样式",
    interactionScript: "交互脚本",
    taskPlan: "生成计划",
    findings: "需求分析",
    design: "视觉方案",
    qaReport: "质量检查报告",
    processingTask: "正在处理生成任务",
    queuedTitle: "任务已进入队列",
    startedTitle: "后台生成已启动",
    completedTitle: "网站生成完成",
    failedTitle: "生成失败",
    deployedTitle: "网站部署完成",
    refinedTitle: "修改已应用",
    designDirection: "正在整理设计方向",
    planning: "正在拆解生成计划",
    analyzing: "正在分析网站需求",
    styling: "正在确定视觉风格",
    generatingStyles: "正在生成全站样式",
    generatingScript: "正在生成交互脚本",
    generatingHome: "正在生成首页",
    generatingPages: "正在生成内页",
    checkingQa: "正在检查页面质量",
    repairing: "正在修复生成结果",
    deploying: "正在部署网站",
    generatingPrefix: "正在生成",
    processingPrefix: "正在处理",
  },
  en: {
    promptDraftExpand: "Prompt Draft (click to expand)",
    confirmAndGenerate: "Confirm and Generate",
    progressTitle: "Website generation progress",
    taskSubmitted: "Task submitted",
    workerStarted: "Background generation started",
    runningNote: "The generation task is still running in the background. You can leave or refresh this page and progress will recover automatically.",
    queued: "Queued",
    running: "Generating",
    succeeded: "Completed",
    failed: "Failed",
    waiting: "Waiting",
    noPrompt: "Please enter a prompt.",
    received: "Message received. Analyzing your intent and current stage...",
    submitFailed: "Submit failed",
    uploadedFiles: "Uploaded {count} file(s) and added them to this message.",
    uploadFailed: "Attachment upload failed",
    pagesUnit: "page(s)",
    filesUnit: "file(s)",
    waitingWorker: "waiting for background worker",
    lastUpdated: "last updated",
    currentProcessing: "Current item",
    homePage: "Home page",
    globalStyles: "Global styles",
    interactionScript: "Interaction script",
    taskPlan: "Generation plan",
    findings: "Requirement analysis",
    design: "Visual direction",
    qaReport: "QA report",
    processingTask: "Processing generation task",
    queuedTitle: "Task queued",
    startedTitle: "Background generation started",
    completedTitle: "Website generation completed",
    failedTitle: "Generation failed",
    deployedTitle: "Website deployed",
    refinedTitle: "Changes applied",
    designDirection: "Organizing design direction",
    planning: "Breaking down the generation plan",
    analyzing: "Analyzing website requirements",
    styling: "Defining visual style",
    generatingStyles: "Generating global styles",
    generatingScript: "Generating interaction script",
    generatingHome: "Generating home page",
    generatingPages: "Generating inner pages",
    checkingQa: "Checking page quality",
    repairing: "Repairing generated output",
    deploying: "Deploying website",
    generatingPrefix: "Generating ",
    processingPrefix: "Processing ",
  },
};

const REQUIREMENT_FORM_COPY: Record<RequirementFormLocale, Record<string, string>> = {
  zh: {
    title: "生成前必填信息",
    description: "完成这些选项后才会生成 Prompt Draft。",
    required: "必填",
    uiLanguage: "界面语言",
    websiteType: "网站类型",
    targetAudience: "目标受众",
    contentSources: "内容来源",
    contentNotes: "业务/内容补充",
    contentSourceHint: "如果是新建站，请补充品牌定位、核心服务、优势、案例或资质；如果有旧站或资料，系统会优先使用域名和上传文件。",
    customAudience: "自定义受众",
    designTheme: "设计主题",
    customTheme: "自定义主题",
    pageStructure: "页面数与页面结构",
    singlePage: "单页网站",
    multiPage: "多页网站",
    autoPlanPages: "自动规划页面结构",
    autoPlanDescription: "系统会根据网站类型、目标受众和核心转化目标自动规划一级导航、二级详情页和必要的三级页面，适合用户暂时无法描述完整站点结构的场景。",
    customPage: "自定义页面",
    functionalRequirements: "功能需求",
    supportedFunctionHint: "仅展示当前生成链路已支持的功能；注册登录、在线支付、预约系统和后台管理暂不开放选择。",
    primaryGoal: "核心转化目标",
    customGoal: "自定义目标",
    websiteLanguage: "网站语言",
    logoStrategy: "Logo 策略",
    uploadLogo: "上传 Logo",
    logoRequired: "需要上传或选择一个 Logo",
    add: "添加",
    submit: "生成 Prompt Draft",
    incomplete: "请先完成所有必填选项。",
  },
  en: {
    title: "Required Information Before Generation",
    description: "Complete these choices before generating the Prompt Draft.",
    required: "Required",
    uiLanguage: "Interface language",
    websiteType: "Website type",
    targetAudience: "Target audience",
    contentSources: "Content sources",
    contentNotes: "Business/content details",
    contentSourceHint: "For a new website, add brand positioning, services, advantages, cases, or credentials. If you have an old site or files, the system will prioritize domain and uploaded materials.",
    customAudience: "Custom audience",
    designTheme: "Design theme",
    customTheme: "Custom theme",
    pageStructure: "Page count and site structure",
    singlePage: "Single-page website",
    multiPage: "Multi-page website",
    autoPlanPages: "Automatically plan page structure",
    autoPlanDescription: "The system will plan primary navigation, second-level detail pages, and necessary third-level content pages from the website type, audience, and conversion goal. This is useful when users cannot describe the full structure yet.",
    customPage: "Custom page",
    functionalRequirements: "Functional requirements",
    supportedFunctionHint: "Only currently supported generation features are shown. Sign-up/login, online payments, booking systems, and admin dashboards are not selectable yet.",
    primaryGoal: "Primary conversion goal",
    customGoal: "Custom goal",
    websiteLanguage: "Website language",
    logoStrategy: "Logo strategy",
    uploadLogo: "Upload Logo",
    logoRequired: "Upload or select a logo",
    add: "Add",
    submit: "Generate Prompt Draft",
    incomplete: "Complete all required choices first.",
  },
};

const OPTION_I18N_FALLBACKS: Record<string, Record<RequirementFormLocale, string>> = {
  company: { zh: "企业官网", en: "Company website" },
  landing: { zh: "产品落地页", en: "Product landing page" },
  ecommerce: { zh: "电商展示", en: "E-commerce showcase" },
  portfolio: { zh: "作品集", en: "Portfolio" },
  event: { zh: "活动页", en: "Event page" },
  other: { zh: "其他", en: "Other" },
  consumers: { zh: "普通消费者", en: "Consumers" },
  enterprise_buyers: { zh: "企业采购", en: "Enterprise buyers" },
  investors: { zh: "投资人", en: "Investors" },
  developers: { zh: "开发者", en: "Developers" },
  students: { zh: "学生", en: "Students" },
  government: { zh: "政府机构", en: "Government organizations" },
  overseas_customers: { zh: "海外客户", en: "Overseas customers" },
  professional: { zh: "专业可信", en: "Professional and trustworthy" },
  tech: { zh: "科技感", en: "Technology-driven" },
  luxury: { zh: "高端奢华", en: "Premium" },
  playful: { zh: "活泼年轻", en: "Playful and youthful" },
  minimal: { zh: "极简现代", en: "Minimal and modern" },
  industrial: { zh: "工业制造", en: "Industrial manufacturing" },
  warm: { zh: "温暖亲和", en: "Warm and approachable" },
  home: { zh: "首页", en: "Home" },
  about: { zh: "关于", en: "About" },
  products: { zh: "产品", en: "Products" },
  services: { zh: "服务", en: "Services" },
  cases: { zh: "案例", en: "Cases" },
  pricing: { zh: "价格", en: "Pricing" },
  blog: { zh: "博客", en: "Blog" },
  contact: { zh: "联系", en: "Contact" },
  customer_inquiry_form: { zh: "客户询盘表单填写", en: "Customer inquiry form" },
  contact_form: { zh: "联系表单", en: "Contact form" },
  search_filter: { zh: "搜索/筛选", en: "Search and filters" },
  downloads: { zh: "资料下载", en: "Downloads" },
  multilingual_switch: { zh: "多语言切换", en: "Language switch" },
  none: { zh: "无需特殊功能，仅展示内容", en: "No special functionality, content display only" },
  lead_generation: { zh: "获取咨询", en: "Lead generation" },
  product_showcase: { zh: "展示产品", en: "Product showcase" },
  brand_trust: { zh: "建立品牌信任", en: "Build brand trust" },
  download_materials: { zh: "下载资料", en: "Material downloads" },
  book_demo: { zh: "预约演示", en: "Book a demo" },
  online_purchase: { zh: "在线购买", en: "Online purchase" },
  "zh-CN": { zh: "中文", en: "Chinese" },
  en: { zh: "英文", en: "English" },
  bilingual: { zh: "中英双语", en: "Chinese and English" },
  uploaded: { zh: "上传已有 Logo", en: "Upload existing logo" },
  text_mark: { zh: "暂无 Logo，使用品牌文字标识", en: "No logo yet, use a text wordmark" },
  generated_placeholder: { zh: "暂无 Logo，请生成临时文字 Logo", en: "No logo yet, generate a temporary text logo" },
  new_site: { zh: "新建站，无现成内容", en: "New website, no existing content" },
  existing_domain: { zh: "已有域名或旧站", en: "Existing domain or old website" },
  uploaded_files: { zh: "上传资料", en: "Uploaded materials" },
  industry_research: { zh: "使用行业资料扩充", en: "Use industry research" },
};

type RequirementSlotCard = {
  key: string;
  label: string;
  filled?: boolean;
  required?: boolean;
  inputType?: "single" | "multi" | "text" | "page-structure" | "logo" | "content-source";
  options?: RequirementSlotOption[];
  value?: unknown;
};

type RequirementFormValues = {
  siteType?: string;
  targetAudience: string[];
  contentSources: string[];
  designTheme: string[];
  pageStructure: {
    mode: "single" | "multi";
    planning?: "manual" | "auto";
    pages: string[];
  };
  functionalRequirements: string[];
  primaryGoal: string[];
  language?: string;
  brandLogo: {
    mode?: "uploaded" | "text_mark" | "generated_placeholder" | "none";
    assetKey?: string;
    assetName?: string;
    referenceText?: string;
    altText?: string;
  };
  customNotes: string;
};

const DEFAULT_PROMPT =
  "Build a 6-page industrial-style English website for LC-CNC: Home, 3C Machines, Custom Solutions, Cases, About, Contact. Keep shared styles and script across all pages, and ensure navigation links work.";
const DEFAULT_ASSISTANT_GREETING =
  "Describe your website request and I will submit a generation task with live progress.";
const REQUIREMENT_FORM_HEADER = "[Requirement Form]";
const CHAT_PANEL_WIDTH_STORAGE_KEY = "shpitto.chatPanelWidth";
const CHAT_PANEL_DEFAULT_WIDTH = 460;
const CHAT_PANEL_MIN_WIDTH = 360;
const CHAT_PANEL_MAX_WIDTH = 720;

function clampChatPanelWidth(value: number): number {
  const normalized = Number.isFinite(value) ? value : CHAT_PANEL_DEFAULT_WIDTH;
  return Math.min(CHAT_PANEL_MAX_WIDTH, Math.max(CHAT_PANEL_MIN_WIDTH, Math.round(normalized)));
}

function createUserMessage(prompt: string) {
  return {
    id: crypto.randomUUID(),
    role: "user" as const,
    parts: [{ type: "text" as const, text: prompt }],
  };
}

function detectMessageLocale(text: unknown): RequirementFormLocale {
  return /[\u4e00-\u9fff]/.test(String(text || "")) ? "zh" : "en";
}

function localeFromMetadata(metadata?: Record<string, unknown> | null, fallbackText?: unknown): RequirementFormLocale {
  const raw = String(metadata?.locale || metadata?.displayLocale || "").trim();
  if (raw === "zh" || raw === "en") return raw;
  return detectMessageLocale(fallbackText);
}

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "code"; language: string; text: string }
  | { type: "rule" };

function parseMarkdownBlocks(input: string): MarkdownBlock[] {
  const lines = String(input || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let listType: "unordered-list" | "ordered-list" | "" = "";
  let listItems: string[] = [];
  let inCode = false;
  let codeLanguage = "";
  let codeLines: string[] = [];

  const flushParagraph = () => {
    const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };

  const flushList = () => {
    if (listType && listItems.length > 0) {
      blocks.push({ type: listType, items: listItems });
    }
    listType = "";
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = String(rawLine || "");
    const trimmed = line.trim();
    const codeFence = trimmed.match(/^```([A-Za-z0-9_-]+)?\s*$/);
    if (codeFence) {
      if (inCode) {
        blocks.push({ type: "code", language: codeLanguage, text: codeLines.join("\n") });
        inCode = false;
        codeLanguage = "";
        codeLines = [];
      } else {
        flushParagraph();
        flushList();
        inCode = true;
        codeLanguage = String(codeFence[1] || "").trim();
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^(?:---+|\*\*\*+|___+)$/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "rule" });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading?.[2]) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }

    const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
    if (unordered?.[1]) {
      flushParagraph();
      if (listType && listType !== "unordered-list") flushList();
      listType = "unordered-list";
      listItems.push(unordered[1].trim());
      continue;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (ordered?.[1]) {
      flushParagraph();
      if (listType && listType !== "ordered-list") flushList();
      listType = "ordered-list";
      listItems.push(ordered[1].trim());
      continue;
    }

    if (listType && /^\s{2,}\S/.test(line)) {
      listItems[listItems.length - 1] = `${listItems[listItems.length - 1] || ""} ${trimmed}`.trim();
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  if (inCode) blocks.push({ type: "code", language: codeLanguage, text: codeLines.join("\n") });
  flushParagraph();
  flushList();
  return blocks;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = String(text || "").split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`${part}-${index}`} className="rounded bg-[color-mix(in_oklab,var(--shp-bg)_74%,black_26%)] px-1 py-0.5 font-mono text-[0.92em] text-[var(--shp-primary-soft)]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-[var(--shp-text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function MarkdownDraftView({ content, compact = false }: { content: string; compact?: boolean }) {
  const blocks = parseMarkdownBlocks(content);
  const visibleBlocks = compact ? blocks.slice(0, 5) : blocks;
  return (
    <div className={compact ? "space-y-1.5 text-left" : "space-y-3 text-left"}>
      {visibleBlocks.map((block, index) => {
        if (block.type === "heading") {
          const headingClass =
            block.level <= 1
              ? compact
                ? "text-sm font-semibold text-[var(--shp-text)]"
                : "text-lg font-bold text-[var(--shp-text)]"
              : compact
                ? "text-xs font-semibold text-[var(--shp-text)]"
                : "text-sm font-semibold text-[var(--shp-text)]";
          return (
            <p key={`heading-${index}`} className={headingClass}>
              {renderInlineMarkdown(block.text)}
            </p>
          );
        }
        if (block.type === "paragraph") {
          return (
            <p key={`paragraph-${index}`} className={compact ? "line-clamp-2 text-xs text-[var(--shp-muted)]" : "text-sm leading-relaxed text-[var(--shp-muted)]"}>
              {renderInlineMarkdown(block.text)}
            </p>
          );
        }
        if (block.type === "unordered-list" || block.type === "ordered-list") {
          const ListTag = block.type === "ordered-list" ? "ol" : "ul";
          return (
            <ListTag
              key={`list-${index}`}
              className={[
                compact ? "space-y-1 text-xs text-[var(--shp-muted)]" : "space-y-1.5 text-sm text-[var(--shp-muted)]",
                block.type === "ordered-list" ? "list-decimal pl-5" : "list-disc pl-5",
              ].join(" ")}
            >
              {block.items.slice(0, compact ? 4 : undefined).map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`} className="pl-1 leading-relaxed">
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ListTag>
          );
        }
        if (block.type === "code") {
          return (
            <div key={`code-${index}`} className="overflow-hidden rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_78%,black_22%)]">
              {block.language && !compact ? (
                <div className="border-b border-[color-mix(in_oklab,var(--shp-border)_52%,transparent)] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--shp-muted)]">
                  {block.language}
                </div>
              ) : null}
              <pre className={compact ? "max-h-14 overflow-hidden p-2 text-[11px] leading-relaxed text-[var(--shp-muted)]" : "overflow-auto p-3 text-xs leading-relaxed text-[var(--shp-text)]"}>
                <code>{block.text}</code>
              </pre>
            </div>
          );
        }
        return <hr key={`rule-${index}`} className="border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)]" />;
      })}
      {compact && blocks.length > visibleBlocks.length ? (
        <p className="text-[11px] text-[var(--shp-primary-soft)]">...</p>
      ) : null}
    </div>
  );
}

function toReadableStage(stage?: string, locale: RequirementFormLocale = "en") {
  if (!stage) return "-";
  if (stage.startsWith("generating:")) {
    const fileLabel = friendlyFileLabel(stage.replace("generating:", ""), locale);
    return `${CHAT_CARD_COPY[locale].generatingPrefix}${fileLabel || stage.replace("generating:", "")}`;
  }
  return stage;
}

function statusTone(status?: TaskStatus | null): string {
  if (status === "succeeded")
    return "text-[var(--shp-primary)] bg-[color-mix(in_oklab,var(--shp-primary)_16%,transparent)] border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]";
  if (status === "failed") return "text-rose-300 bg-rose-500/15 border-rose-400/35";
  if (status === "running")
    return "text-[var(--shp-secondary)] bg-[color-mix(in_oklab,var(--shp-secondary)_14%,transparent)] border-[color-mix(in_oklab,var(--shp-secondary)_40%,transparent)]";
  return "text-amber-300 bg-amber-500/15 border-amber-400/35";
}

function formatVersionLabel(updatedAt?: number): string {
  if (!updatedAt) return "v1.0.0";
  const d = new Date(updatedAt);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `v${yy}.${mm}.${dd}`;
}

function formatAssetFileSize(value: number): string {
  const size = Math.max(0, Number(value || 0));
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function cleanEventValue(value: unknown): string {
  return String(value || "").trim();
}

function friendlyFileLabel(filePath?: string, locale: RequirementFormLocale = "en"): string {
  const copy = CHAT_CARD_COPY[locale];
  const normalized = cleanEventValue(filePath).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  const fileName = normalized.split("/").filter(Boolean).pop() || normalized;
  if (/(^|\/)index\.html$/.test(lower)) return copy.homePage;
  if (lower.endsWith("styles.css")) return copy.globalStyles;
  if (lower.endsWith("script.js")) return copy.interactionScript;
  if (lower.endsWith("task_plan.md")) return copy.taskPlan;
  if (lower.endsWith("findings.md")) return copy.findings;
  if (lower.endsWith("design.md")) return copy.design;
  if (lower.endsWith("qa_report.md")) return copy.qaReport;
  return fileName.replace(/\.(html|md|css|js)$/i, "");
}

function progressTitleFromStage(
  stage?: string | null,
  payload?: TaskEventPayload | null,
  locale: RequirementFormLocale = "en",
): string {
  const copy = CHAT_CARD_COPY[locale];
  const normalized = cleanEventValue(stage).replace(/\\/g, "/").toLowerCase();
  const filePath = cleanEventValue(payload?.filePath || payload?.path);
  const fileLabel = friendlyFileLabel(filePath || normalized.replace(/^generating:/, ""), locale);
  if (!normalized) return copy.processingTask;
  if (normalized === "queued") return copy.queuedTitle;
  if (normalized === "worker:claimed" || normalized === "running") return copy.startedTitle;
  if (normalized === "done" || normalized === "succeeded") return copy.completedTitle;
  if (normalized === "failed") return copy.failedTitle;
  if (normalized === "deployed") return copy.deployedTitle;
  if (normalized === "refined") return copy.refinedTitle;
  if (normalized.includes("design_confirm")) return copy.designDirection;
  if (normalized.includes("task_plan")) return copy.planning;
  if (normalized.includes("findings")) return copy.analyzing;
  if (normalized.includes("design")) return copy.styling;
  if (normalized.includes("styles")) return copy.generatingStyles;
  if (normalized.includes("script")) return copy.generatingScript;
  if (normalized.includes("index")) return copy.generatingHome;
  if (normalized.includes("pages")) return copy.generatingPages;
  if (normalized.includes("qa_report") || normalized.includes("qa")) return copy.checkingQa;
  if (normalized.includes("repair")) return copy.repairing;
  if (normalized.startsWith("deploy")) return copy.deploying;
  if (normalized.startsWith("generating:") && fileLabel) return `${copy.generatingPrefix}${fileLabel}`;
  if (fileLabel) return `${copy.processingPrefix}${fileLabel}`;
  return copy.processingTask;
}

function progressDetailFromEvent(event: TaskEvent, locale: RequirementFormLocale = "en"): string {
  const payload = event.payload || {};
  const filePath = cleanEventValue(payload.filePath || payload.path);
  const error = cleanEventValue(payload.error);
  const message = cleanEventValue(payload.message || payload.text);
  const fileLabel = friendlyFileLabel(filePath, locale);
  if (error) return error;
  if (message && !/^task_[a-z_]+\b/i.test(message)) return message;
  if (fileLabel) return `${CHAT_CARD_COPY[locale].currentProcessing}: ${fileLabel}`;
  return "";
}

function progressTone(eventType?: string, stage?: string | null) {
  const normalizedEvent = cleanEventValue(eventType).toLowerCase();
  const normalizedStage = cleanEventValue(stage).toLowerCase();
  if (normalizedEvent.includes("failed") || normalizedStage === "failed") return "error";
  if (normalizedEvent.includes("succeeded") || ["done", "succeeded", "deployed", "refined"].includes(normalizedStage)) return "done";
  if (normalizedStage === "queued" || normalizedEvent.includes("created")) return "pending";
  return "active";
}

function statusLabel(status?: TaskStatus | null, locale: RequirementFormLocale = "en"): string {
  const copy = CHAT_CARD_COPY[locale];
  if (status === "queued") return copy.queued;
  if (status === "running") return copy.running;
  if (status === "succeeded") return copy.succeeded;
  if (status === "failed") return copy.failed;
  return copy.waiting;
}

function formatProgressTime(value: string | number | undefined): string {
  if (!value) return "";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString();
}

function appendPreviewRefreshParam(url: string, nonce: number): string {
  const normalized = String(url || "").trim();
  if (!normalized || !nonce) return normalized;
  const hashIndex = normalized.indexOf("#");
  const beforeHash = hashIndex >= 0 ? normalized.slice(0, hashIndex) : normalized;
  const hash = hashIndex >= 0 ? normalized.slice(hashIndex) : "";
  const separator = beforeHash.includes("?") ? "&" : "?";
  return `${beforeHash}${separator}refresh=${nonce}${hash}`;
}

function hostFromUrl(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  try {
    return new URL(normalized).host;
  } catch {
    return normalized.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  }
}

function asSlotList(value: unknown): RequirementSlotCard[] {
  return Array.isArray(value) ? (value as RequirementSlotCard[]) : [];
}

function optionLabel(options: RequirementSlotOption[], value?: string): string {
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
    multilingual_switch: "Language switch",
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
  };
  return promptLabels[value || ""] || options.find((item) => item.value === value)?.label || value || "";
}

function optionDisplayLabel(option: RequirementSlotOption, locale: RequirementFormLocale, slotKey?: string): string {
  if (option.i18n?.[locale]) return option.i18n[locale] || option.label;
  if (slotKey === "brand-logo" && option.value === "none") {
    return locale === "zh" ? "不展示 Logo" : "Do not show a logo";
  }
  return OPTION_I18N_FALLBACKS[option.value]?.[locale] || option.label;
}

function optionLabels(options: RequirementSlotOption[], values: string[], locale?: RequirementFormLocale, slotKey?: string): string {
  return values
    .map((value) => {
      const option = options.find((item) => item.value === value);
      if (option && locale) return optionDisplayLabel(option, locale, slotKey);
      return optionLabel(options, value);
    })
    .filter(Boolean)
    .join(", ");
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return [];
}

function currentSpecFromMetadata(metadata: Record<string, unknown>): Record<string, any> {
  const fromCurrent = metadata.currentValues;
  if (fromCurrent && typeof fromCurrent === "object") return fromCurrent as Record<string, any>;
  const fromSpec = metadata.requirementSpec;
  if (fromSpec && typeof fromSpec === "object") return fromSpec as Record<string, any>;
  return {};
}

function initialRequirementFormValues(metadata: Record<string, unknown>): RequirementFormValues {
  const spec = currentSpecFromMetadata(metadata);
  const pageStructure = spec.pageStructure && typeof spec.pageStructure === "object" ? spec.pageStructure : {};
  const brandLogo = spec.brandLogo && typeof spec.brandLogo === "object" ? spec.brandLogo : {};
  return {
    siteType: String(spec.siteType || ""),
    targetAudience: stringArray(spec.targetAudience),
    contentSources: stringArray(spec.contentSources),
    designTheme: stringArray(spec.visualStyle),
    pageStructure: {
      mode: pageStructure.mode === "single" ? "single" : "multi",
      planning: pageStructure.planning === "auto" || pageStructure.mode === "auto" ? "auto" : "manual",
      pages: stringArray(pageStructure.pages || spec.pages),
    },
    functionalRequirements: stringArray(spec.functionalRequirements),
    primaryGoal: stringArray(spec.primaryGoal?.length ? spec.primaryGoal : spec.ctas),
    language: String(spec.locale || ""),
    brandLogo: {
      mode: ["uploaded", "text_mark", "generated_placeholder", "none"].includes(String(brandLogo.mode || ""))
        ? brandLogo.mode
        : undefined,
      assetKey: String(brandLogo.assetKey || ""),
      assetName: String(brandLogo.assetName || brandLogo.fileName || ""),
      referenceText: String(brandLogo.referenceText || ""),
      altText: String(brandLogo.altText || ""),
    },
    customNotes: String(spec.customNotes || spec.businessContext || ""),
  };
}

function buildRequirementFormMessage(
  values: RequirementFormValues,
  slots: RequirementSlotCard[],
  locale: RequirementFormLocale = "en",
): string {
  const copy = REQUIREMENT_FORM_COPY[locale];
  const getOptions = (key: string) => slots.find((slot) => slot.key === key)?.options || [];
  const pageOptions = getOptions("sitemap-pages");
  const logoOptions = getOptions("brand-logo");
  const pageSummary =
    values.pageStructure.mode === "single"
      ? copy.singlePage
      : values.pageStructure.planning === "auto"
        ? `${copy.multiPage}: ${copy.autoPlanPages}`
        : `${copy.multiPage}: ${optionLabels(pageOptions, values.pageStructure.pages, locale, "sitemap-pages") || values.pageStructure.pages.join(", ")}`;
  const logoOption = logoOptions.find((item) => item.value === values.brandLogo.mode);
  const logoSummary =
    values.brandLogo.mode === "none"
      ? optionDisplayLabel({ value: "none", label: "None" }, locale, "brand-logo")
      : logoOption
        ? optionDisplayLabel(logoOption, locale, "brand-logo")
        : optionLabel(logoOptions, values.brandLogo.mode);
  const summary = [
    locale === "zh" ? "生成前必填信息已提交：" : "Requirement form submitted:",
    `- ${copy.websiteType}: ${optionLabels(getOptions("site-type"), [values.siteType || ""], locale, "site-type")}`,
    `- ${copy.contentSources}: ${optionLabels(getOptions("content-source"), values.contentSources, locale, "content-source")}`,
    values.customNotes ? `- ${copy.contentNotes}: ${values.customNotes}` : "",
    `- ${copy.targetAudience}: ${optionLabels(getOptions("target-audience"), values.targetAudience, locale, "target-audience")}`,
    `- ${copy.designTheme}: ${optionLabels(getOptions("visual-system"), values.designTheme, locale, "visual-system")}`,
    `- ${copy.pageStructure}: ${pageSummary}`,
    `- ${copy.functionalRequirements}: ${optionLabels(getOptions("functional-requirements"), values.functionalRequirements, locale, "functional-requirements")}`,
    `- ${copy.primaryGoal}: ${optionLabels(getOptions("interaction-cta"), values.primaryGoal, locale, "interaction-cta")}`,
    `- ${copy.websiteLanguage}: ${optionLabels(getOptions("language-and-tone"), [values.language || ""], locale, "language-and-tone")}`,
    `- ${copy.logoStrategy}: ${logoSummary}${values.brandLogo.assetName ? ` (${values.brandLogo.assetName})` : ""}`,
  ].filter(Boolean).join("\n");
  return [
    summary,
    "",
    REQUIREMENT_FORM_HEADER,
    "```json",
    JSON.stringify(values, null, 2),
    "```",
  ].join("\n");
}

function hasRequirementFormMinimum(values: RequirementFormValues): boolean {
  const pageOk =
    values.pageStructure.mode === "single" ||
    (values.pageStructure.mode === "multi" &&
      (values.pageStructure.planning === "auto" || values.pageStructure.pages.length > 0));
  const logoOk =
    values.brandLogo.mode &&
    (values.brandLogo.mode !== "uploaded" || Boolean(values.brandLogo.assetKey || values.brandLogo.referenceText));
  return Boolean(
    values.siteType &&
      values.contentSources.length > 0 &&
      values.targetAudience.length > 0 &&
      values.designTheme.length > 0 &&
      pageOk &&
      values.functionalRequirements.length > 0 &&
      values.primaryGoal.length > 0 &&
      values.language &&
      logoOk,
  );
}

function RequirementFormCard({
  metadata,
  submitting,
  availableAssets,
  onLoadAssets,
  onUploadLogo,
  onSubmit,
}: {
  metadata: Record<string, unknown>;
  submitting: boolean;
  availableAssets: ProjectAsset[];
  onLoadAssets: () => Promise<void>;
  onUploadLogo: (files: FileList | File[]) => Promise<ProjectAsset[]>;
  onSubmit: (payload: string) => Promise<void>;
}) {
  const slots = asSlotList(metadata.slots);
  const [values, setValues] = useState<RequirementFormValues>(() => initialRequirementFormValues(metadata));
  const [customAudience, setCustomAudience] = useState("");
  const [customTheme, setCustomTheme] = useState("");
  const [customPage, setCustomPage] = useState("");
  const [customGoal, setCustomGoal] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [formError, setFormError] = useState("");
  const [formLocale, setFormLocale] = useState<RequirementFormLocale>(() =>
    String(metadata.locale || metadata.displayLocale || "").trim() === "zh" ||
    String(metadata.locale || metadata.displayLocale || "").trim() === "en"
      ? (String(metadata.locale || metadata.displayLocale).trim() as RequirementFormLocale)
      : typeof document !== "undefined"
      ? normalizeLocale(
          document.cookie
            .split(";")
            .map((part) => part.trim())
            .find((part) => part.startsWith(`${LOCALE_COOKIE_NAME}=`))
            ?.split("=")[1] || navigator.language,
        )
      : "en",
  );
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const t = REQUIREMENT_FORM_COPY[formLocale];

  useEffect(() => {
    void onLoadAssets();
  }, [onLoadAssets]);

  const getSlot = (key: string) => slots.find((slot) => slot.key === key);
  const selectedValuesForSlot = (key: string): string[] => {
    if (key === "target-audience") return values.targetAudience;
    if (key === "content-source") return values.contentSources;
    if (key === "visual-system") return values.designTheme;
    if (key === "sitemap-pages") return values.pageStructure.pages;
    if (key === "interaction-cta") return values.primaryGoal;
    return [];
  };
  const getOptions = (key: string) => {
    const baseOptions = getSlot(key)?.options || [];
    const seen = new Set(baseOptions.map((option) => option.value.toLowerCase()));
    const customOptions = selectedValuesForSlot(key)
      .filter((value) => {
        const normalized = String(value || "").trim();
        if (!normalized) return false;
        const optionKey = normalized.toLowerCase();
        if (seen.has(optionKey)) return false;
        seen.add(optionKey);
        return true;
      })
      .map((value) => ({ value, label: value }));
    return [...baseOptions, ...customOptions];
  };
  const toggleArrayValue = (field: "targetAudience" | "contentSources" | "designTheme" | "functionalRequirements" | "primaryGoal", value: string) => {
    setValues((prev) => {
      let existing = new Set(prev[field]);
      if (field === "functionalRequirements" && value === "none") {
        existing = new Set(existing.has("none") ? [] : ["none"]);
        return { ...prev, [field]: Array.from(existing) };
      }
      if (field === "functionalRequirements" && value !== "none") {
        existing.delete("none");
      }
      if (existing.has(value)) existing.delete(value);
      else existing.add(value);
      return { ...prev, [field]: Array.from(existing) };
    });
  };
  const addCustomValue = (field: "targetAudience" | "designTheme" | "primaryGoal" | "pages", value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setValues((prev) => {
      if (field === "pages") {
        if (prev.pageStructure.pages.includes(normalized)) return prev;
        return { ...prev, pageStructure: { ...prev.pageStructure, planning: "manual", pages: [...prev.pageStructure.pages, normalized] } };
      }
      const current = prev[field];
      if (current.includes(normalized)) return prev;
      return { ...prev, [field]: [...current, normalized] };
    });
  };
  const togglePage = (value: string) => {
    setValues((prev) => {
      const existing = new Set(prev.pageStructure.pages);
      if (existing.has(value)) existing.delete(value);
      else existing.add(value);
      return { ...prev, pageStructure: { ...prev.pageStructure, planning: "manual", pages: Array.from(existing) } };
    });
  };
  const toggleAutoPagePlanning = () => {
    setValues((prev) => ({
      ...prev,
      pageStructure: {
        ...prev.pageStructure,
        mode: "multi",
        planning: prev.pageStructure.planning === "auto" ? "manual" : "auto",
        pages: prev.pageStructure.planning === "auto" ? prev.pageStructure.pages : [],
      },
    }));
  };
  const setLogoAsset = (asset: ProjectAsset) => {
    setValues((prev) => ({
      ...prev,
      brandLogo: {
        ...prev.brandLogo,
        mode: "uploaded",
        assetKey: asset.key,
        assetName: asset.name,
        referenceText: asset.referenceText,
        altText: asset.name,
      },
    }));
  };
  const submitDisabled = submitting || uploadingLogo || !hasRequirementFormMinimum(values);
  const imageAssets = availableAssets.filter((asset) => asset.category === "image").slice(0, 6);

  async function handleLogoUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploadingLogo(true);
    setFormError("");
    try {
      const uploaded = await onUploadLogo(files);
      const image = uploaded.find((asset) => asset.category === "image") || uploaded[0];
      if (!image) throw new Error("No uploaded logo asset returned.");
      setLogoAsset(image);
    } catch (err: any) {
      setFormError(String(err?.message || err || "Logo upload failed."));
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleSubmitForm() {
    if (!hasRequirementFormMinimum(values)) {
      setFormError(t.incomplete);
      return;
    }
    setFormError("");
    await onSubmit(buildRequirementFormMessage(values, slots, formLocale));
  }

  const renderChoiceGroup = (key: string, value: string | undefined, onChange: (value: string) => void) => (
    <div className="mt-2 flex flex-wrap gap-2">
      {getOptions(key).map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={[
            "rounded-md border px-2.5 py-1.5 text-xs",
            value === option.value
              ? "border-[color-mix(in_oklab,var(--shp-primary)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_22%,transparent)] text-[var(--shp-text)]"
              : "border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] text-[var(--shp-muted)] hover:text-[var(--shp-text)]",
          ].join(" ")}
        >
          {optionDisplayLabel(option, formLocale, key)}
        </button>
      ))}
    </div>
  );

  const renderMultiGroup = (key: string, selected: string[], field: "targetAudience" | "contentSources" | "designTheme" | "functionalRequirements" | "primaryGoal") => (
    <div className="mt-2 flex flex-wrap gap-2">
      {getOptions(key).map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggleArrayValue(field, option.value)}
            className={[
              "rounded-md border px-2.5 py-1.5 text-xs",
              active
                ? "border-[color-mix(in_oklab,var(--shp-primary)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_22%,transparent)] text-[var(--shp-text)]"
                : "border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] text-[var(--shp-muted)] hover:text-[var(--shp-text)]",
            ].join(" ")}
          >
            {optionDisplayLabel(option, formLocale, key)}
          </button>
        );
      })}
    </div>
  );

  return (
    <div lang={formLocale === "zh" ? "zh-CN" : "en"} className="mt-3 rounded-xl border border-[color-mix(in_oklab,var(--shp-primary)_35%,var(--shp-border)_65%)] bg-[color-mix(in_oklab,var(--shp-surface)_62%,transparent)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--shp-text)]">{t.title}</p>
          <p className="mt-1 text-xs text-[var(--shp-muted)]">{t.description}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-md border border-amber-400/35 bg-amber-500/15 px-2 py-1 text-[10px] text-amber-200">{t.required}</span>
          <div className="inline-flex items-center rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] p-0.5" aria-label={t.uiLanguage}>
            {(["zh", "en"] as const).map((locale) => (
              <button
                key={locale}
                type="button"
                onClick={() => setFormLocale(locale)}
                className={[
                  "rounded px-2 py-1 text-[10px]",
                  formLocale === locale
                    ? "bg-[color-mix(in_oklab,var(--shp-primary)_22%,transparent)] text-[var(--shp-text)]"
                    : "text-[var(--shp-muted)] hover:text-[var(--shp-text)]",
                ].join(" ")}
              >
                {locale === "zh" ? "中文" : "EN"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <section>
          <p className="text-xs font-medium text-[var(--shp-text)]">{t.websiteType}</p>
          {renderChoiceGroup("site-type", values.siteType, (siteType) => setValues((prev) => ({ ...prev, siteType })))}
        </section>

        <section>
          <p className="text-xs font-medium text-[var(--shp-text)]">{t.contentSources}</p>
          {renderMultiGroup("content-source", values.contentSources, "contentSources")}
          <textarea
            value={values.customNotes}
            onChange={(event) => setValues((prev) => ({ ...prev, customNotes: event.target.value }))}
            placeholder={t.contentNotes}
            rows={3}
            className="mt-2 min-h-[72px] w-full resize-none rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-transparent px-2 py-1.5 text-xs outline-none"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--shp-muted)]">{t.contentSourceHint}</p>
        </section>

        <section>
          <p className="text-xs font-medium text-[var(--shp-text)]">{t.targetAudience}</p>
          {renderMultiGroup("target-audience", values.targetAudience, "targetAudience")}
          <div className="mt-2 flex gap-2">
            <input value={customAudience} onChange={(event) => setCustomAudience(event.target.value)} placeholder={t.customAudience} className="min-w-0 flex-1 rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-transparent px-2 py-1.5 text-xs outline-none" />
            <button type="button" onClick={() => { addCustomValue("targetAudience", customAudience); setCustomAudience(""); }} className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] px-2 text-xs">{t.add}</button>
          </div>
        </section>

        <section>
          <p className="text-xs font-medium text-[var(--shp-text)]">{t.designTheme}</p>
          {renderMultiGroup("visual-system", values.designTheme, "designTheme")}
          <div className="mt-2 flex gap-2">
            <input value={customTheme} onChange={(event) => setCustomTheme(event.target.value)} placeholder={t.customTheme} className="min-w-0 flex-1 rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-transparent px-2 py-1.5 text-xs outline-none" />
            <button type="button" onClick={() => { addCustomValue("designTheme", customTheme); setCustomTheme(""); }} className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] px-2 text-xs">{t.add}</button>
          </div>
        </section>

        <section>
          <p className="text-xs font-medium text-[var(--shp-text)]">{t.pageStructure}</p>
          <div className="mt-2 flex gap-2">
            {(["single", "multi"] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => setValues((prev) => ({ ...prev, pageStructure: { ...prev.pageStructure, mode, planning: mode === "single" ? "manual" : prev.pageStructure.planning } }))} className={["rounded-md border px-2.5 py-1.5 text-xs", values.pageStructure.mode === mode ? "border-[color-mix(in_oklab,var(--shp-primary)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_22%,transparent)]" : "border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] text-[var(--shp-muted)]"].join(" ")}>
                {mode === "single" ? t.singlePage : t.multiPage}
              </button>
            ))}
          </div>
          {values.pageStructure.mode === "multi" ? (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={toggleAutoPagePlanning} className={["rounded-md border px-2.5 py-1.5 text-xs", values.pageStructure.planning === "auto" ? "border-[color-mix(in_oklab,var(--shp-primary)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_22%,transparent)]" : "border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] text-[var(--shp-muted)]"].join(" ")}>
                  {t.autoPlanPages}
                </button>
                {getOptions("sitemap-pages").map((option) => {
                  const active = values.pageStructure.pages.includes(option.value);
                  return (
                    <button key={option.value} type="button" onClick={() => togglePage(option.value)} disabled={values.pageStructure.planning === "auto"} className={["rounded-md border px-2.5 py-1.5 text-xs", active ? "border-[color-mix(in_oklab,var(--shp-primary)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_22%,transparent)]" : "border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] text-[var(--shp-muted)]", values.pageStructure.planning === "auto" ? "cursor-not-allowed opacity-55" : ""].join(" ")}>
                      {optionDisplayLabel(option, formLocale, "sitemap-pages")}
                    </button>
                  );
                })}
              </div>
              {values.pageStructure.planning === "auto" ? (
                <p className="mt-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_32%,var(--shp-border)_68%)] bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)] px-3 py-2 text-[11px] leading-relaxed text-[var(--shp-muted)]">
                  {t.autoPlanDescription}
                </p>
              ) : null}
              <div className="mt-2 flex gap-2">
                <input value={customPage} onChange={(event) => setCustomPage(event.target.value)} placeholder={t.customPage} disabled={values.pageStructure.planning === "auto"} className="min-w-0 flex-1 rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-transparent px-2 py-1.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-55" />
                <button type="button" onClick={() => { addCustomValue("pages", customPage); setCustomPage(""); }} disabled={values.pageStructure.planning === "auto"} className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] px-2 text-xs disabled:cursor-not-allowed disabled:opacity-55">{t.add}</button>
              </div>
            </>
          ) : null}
        </section>

        <section>
          <p className="text-xs font-medium text-[var(--shp-text)]">{t.functionalRequirements}</p>
          {renderMultiGroup("functional-requirements", values.functionalRequirements, "functionalRequirements")}
          <p className="mt-2 text-[11px] text-[var(--shp-muted)]">{t.supportedFunctionHint}</p>
        </section>

        <section>
          <p className="text-xs font-medium text-[var(--shp-text)]">{t.primaryGoal}</p>
          {renderMultiGroup("interaction-cta", values.primaryGoal, "primaryGoal")}
          <div className="mt-2 flex gap-2">
            <input value={customGoal} onChange={(event) => setCustomGoal(event.target.value)} placeholder={t.customGoal} className="min-w-0 flex-1 rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-transparent px-2 py-1.5 text-xs outline-none" />
            <button type="button" onClick={() => { addCustomValue("primaryGoal", customGoal); setCustomGoal(""); }} className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] px-2 text-xs">{t.add}</button>
          </div>
        </section>

        <section>
          <p className="text-xs font-medium text-[var(--shp-text)]">{t.websiteLanguage}</p>
          {renderChoiceGroup("language-and-tone", values.language, (language) => setValues((prev) => ({ ...prev, language })))}
        </section>

        <section>
          <p className="text-xs font-medium text-[var(--shp-text)]">{t.logoStrategy}</p>
          {renderChoiceGroup("brand-logo", values.brandLogo.mode, (mode) => setValues((prev) => ({ ...prev, brandLogo: { ...prev.brandLogo, mode: mode as RequirementFormValues["brandLogo"]["mode"] } })))}
          {values.brandLogo.mode === "uploaded" ? (
            <div className="mt-2 space-y-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] p-2">
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handleLogoUpload(event.target.files)} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)] px-2 py-1 text-xs">
                  {uploadingLogo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {t.uploadLogo}
                </button>
                {values.brandLogo.assetName ? <span className="text-xs text-[var(--shp-muted)]">{values.brandLogo.assetName}</span> : <span className="text-xs text-amber-200">{t.logoRequired}</span>}
              </div>
              {imageAssets.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {imageAssets.map((asset) => (
                    <button key={asset.key} type="button" onClick={() => setLogoAsset(asset)} className={["rounded-md border px-2 py-1 text-left text-[11px]", values.brandLogo.assetKey === asset.key ? "border-[color-mix(in_oklab,var(--shp-primary)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)]" : "border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] text-[var(--shp-muted)]"].join(" ")}>
                      {asset.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {formError ? <p className="mt-3 text-xs text-rose-300">{formError}</p> : null}
      <button
        type="button"
        onClick={() => void handleSubmitForm()}
        disabled={submitDisabled}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_52%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_26%,transparent)] disabled:cursor-not-allowed disabled:opacity-55"
      >
        {t.submit}
      </button>
    </div>
  );
}

export function ProjectChatWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const initialPrompt = useMemo(() => String(searchParams.get("prompt") || "").trim(), [searchParams]);
  const initialDraft = useMemo(() => String(searchParams.get("draft") || "").trim(), [searchParams]);

  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [projectTitle, setProjectTitle] = useState("Current Project");
  const [projectUpdatedAt, setProjectUpdatedAt] = useState<number | undefined>(undefined);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [submitting, setSubmitting] = useState(false);
  const [loadingTask, setLoadingTask] = useState(false);
  const [error, setError] = useState("");
  const [task, setTask] = useState<TaskPayload | null>(null);
  const [taskEvents, setTaskEvents] = useState<TaskEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftPreviewOpen, setDraftPreviewOpen] = useState(false);
  const [draftPreviewText, setDraftPreviewText] = useState("");
  const [historyReady, setHistoryReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(CHAT_PANEL_DEFAULT_WIDTH);
  const [resizingChatPanel, setResizingChatPanel] = useState(false);
  const [projects, setProjects] = useState<SessionPayload[]>([]);
  const [creatingProject, setCreatingProject] = useState(false);
  const [pendingAssetRefs, setPendingAssetRefs] = useState<ProjectAsset[]>([]);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerLoading, setAssetPickerLoading] = useState(false);
  const [assetPickerQuery, setAssetPickerQuery] = useState("");
  const [availableAssets, setAvailableAssets] = useState<ProjectAsset[]>([]);
  const [previewRefreshNonce, setPreviewRefreshNonce] = useState(0);

  const pollTimerRef = useRef<number | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const autoSubmittedInitialPrompt = useRef(false);
  const appliedInitialDraft = useRef(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const chatId = projectId;
  const workspaceGridStyle = useMemo(
    () =>
      ({
        "--chat-panel-width": `${chatPanelWidth}px`,
      }) as CSSProperties,
    [chatPanelWidth],
  );
  const browserLocale = useMemo<RequirementFormLocale>(() => {
    if (typeof document === "undefined") return "en";
    return normalizeLocale(
      document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${LOCALE_COOKIE_NAME}=`))
        ?.split("=")[1] || navigator.language,
    );
  }, []);
  const conversationLocale = useMemo<RequirementFormLocale>(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== "user") continue;
      return localeFromMetadata(message.metadata, message.text);
    }
    return browserLocale;
  }, [browserLocale, messages]);

  const appendMessage = useCallback((role: ChatMessage["role"], text: string, metadata?: Record<string, unknown>) => {
    const normalized = text.trim();
    if (!normalized) return;
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role,
        text: normalized,
        metadata,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CHAT_PANEL_WIDTH_STORAGE_KEY);
      if (!stored) return;
      const parsed = Number(stored);
      if (!Number.isFinite(parsed)) return;
      setChatPanelWidth(clampChatPanelWidth(parsed));
    } catch {
      // Keep the default width if storage is unavailable.
    }
  }, []);

  const handleChatPanelResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (typeof window === "undefined" || window.innerWidth < 1280) return;
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = chatPanelWidth;
      setResizingChatPanel(true);

      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      let latestWidth = startWidth;
      const handlePointerMove = (moveEvent: PointerEvent) => {
        latestWidth = clampChatPanelWidth(startWidth + moveEvent.clientX - startX);
        setChatPanelWidth(latestWidth);
      };
      const handlePointerUp = () => {
        setResizingChatPanel(false);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
        try {
          window.localStorage.setItem(CHAT_PANEL_WIDTH_STORAGE_KEY, String(latestWidth));
        } catch {
          // Best-effort layout preference persistence.
        }
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [chatPanelWidth],
  );

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const toTimelineMessage = useCallback((item: HistoryMessage): ChatMessage => {
    const text = String(item.text || "").trim();
    return {
      id: String(item.id || crypto.randomUUID()),
      role: item.role,
      text,
      metadata: item.metadata || undefined,
      timestamp: Number(item.createdAt || Date.now()),
    };
  }, []);

  const fetchProjectMeta = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/chat/sessions?limit=200", { cache: "no-store" });
      const data = (await res.json()) as SessionsResponse;
      if (!res.ok || !data.ok || !Array.isArray(data.sessions)) return;
      setProjects(data.sessions.filter((session) => !session.archived));
      const hit = data.sessions.find((session) => session.id === chatId);
      if (!hit) return;
      setProjectTitle(String(hit.title || "Current Project"));
      setProjectUpdatedAt(Number(hit.updatedAt || Date.now()));
    } catch {
      // best-effort project metadata
    }
  }, [chatId, userId]);

  const fetchProjectAssetsForPicker = useCallback(async () => {
    if (!chatId.trim()) return;
    setAssetPickerLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(chatId)}/assets`, {
        cache: "no-store",
      });
      const data = (await res.json()) as AssetListResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load project assets.");
      }
      setAvailableAssets(Array.isArray(data.assets) ? data.assets : []);
    } catch {
      // best-effort; picker can still upload local files
    } finally {
      setAssetPickerLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUserEmail(String(data.user?.email || "").trim());
      setUserId(String(data.user?.id || "").trim());
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(String(session?.user?.email || "").trim());
      setUserId(String(session?.user?.id || "").trim());
    });

    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    void fetchProjectMeta();
  }, [fetchProjectMeta]);

  useEffect(() => {
    if (!assetPickerOpen) return;
    void fetchProjectAssetsForPicker();
  }, [assetPickerOpen, fetchProjectAssetsForPicker]);

  useEffect(() => {
    return () => clearPollTimer();
  }, [clearPollTimer]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, task?.status, task?.updatedAt, taskEvents.length]);

  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = "0px";
    const style = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(style.lineHeight || "20") || 20;
    const paddingTop = Number.parseFloat(style.paddingTop || "0") || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom || "0") || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth || "0") || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth || "0") || 0;
    const maxHeight = lineHeight * 5 + paddingTop + paddingBottom + borderTop + borderBottom;
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [prompt]);

  const fetchHistoryByChatId = useCallback(async (targetChatId: string): Promise<HistoryResponse> => {
    const res = await fetch(`/api/chat/history?chatId=${encodeURIComponent(targetChatId)}`, { cache: "no-store" });
    const data = (await res.json()) as HistoryResponse;
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Failed to get chat history for chatId: ${targetChatId}`);
    }
    return data;
  }, []);

  const fetchTask = useCallback(
    async (taskId: string, retryCount = 0): Promise<void> => {
      try {
        const res = await fetch(`/api/chat/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
        const data = (await res.json()) as TaskResponse;
        if (!res.ok || !data.ok || !data.task) {
          throw new Error(data.error || `Failed to get task: ${taskId}`);
        }

        setTask(data.task);
        setTaskEvents(Array.isArray(data.events) ? data.events : []);
        try {
          const history = await fetchHistoryByChatId(data.task.chatId);
          setTaskEvents(Array.isArray(history.events) ? history.events : Array.isArray(data.events) ? data.events : []);
          const historyMessages = Array.isArray(history.messages) ? history.messages : [];
          const normalizedMessages = historyMessages
            .filter((item) => !isTaskEventTimelineMessage(item))
            .map((item) => toTimelineMessage(item))
            .filter((item) => item.text);
          if (normalizedMessages.length > 0) {
            setMessages(normalizedMessages);
          }
        } catch {
          // best-effort history refresh
        }
        setLoadingTask(false);

        clearPollTimer();
        if (data.task.status === "queued" || data.task.status === "running") {
          pollTimerRef.current = window.setTimeout(() => {
            void fetchTask(taskId).catch((err) => setError(String(err?.message || err)));
          }, 2500);
        }
      } catch (err: any) {
        if (retryCount < 3) {
          pollTimerRef.current = window.setTimeout(() => {
            void fetchTask(taskId, retryCount + 1).catch((innerErr) => setError(String(innerErr?.message || innerErr)));
          }, 1200);
          return;
        }
        setLoadingTask(false);
        setError(String(err?.message || err || "Failed to poll task status"));
      }
    },
    [clearPollTimer, fetchHistoryByChatId, toTimelineMessage],
  );

  useEffect(() => {
    if (!chatId.trim()) return;
    let cancelled = false;
    setLoadingTask(true);
    setError("");
    setTask(null);
    setTaskEvents([]);
    setHistoryReady(false);

    void (async () => {
      try {
        const history = await fetchHistoryByChatId(chatId);
        if (cancelled) return;
        setTaskEvents(Array.isArray(history.events) ? history.events : []);
        const historyMessages = Array.isArray(history.messages) ? history.messages : [];
        const normalizedMessages = historyMessages
          .filter((item) => !isTaskEventTimelineMessage(item))
          .map((item) => toTimelineMessage(item))
          .filter((item) => item.text);
        if (normalizedMessages.length > 0) {
          setMessages(normalizedMessages);
        } else {
          setMessages([
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: DEFAULT_ASSISTANT_GREETING,
              timestamp: Date.now(),
            },
          ]);
        }

        const latestTask = history.task || null;
        if (!latestTask) {
          setLoadingTask(false);
          setHistoryReady(true);
          return;
        }
        setTask(latestTask);
        await fetchTask(latestTask.id);
        setHistoryReady(true);
      } catch (err: any) {
        if (cancelled) return;
        setLoadingTask(false);
        setMessages((prev) =>
          prev.length > 0
            ? prev
            : [
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  text: DEFAULT_ASSISTANT_GREETING,
                  timestamp: Date.now(),
                },
              ],
        );
        setHistoryReady(true);
        setError(String(err?.message || err || "Failed to load chat history"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, fetchHistoryByChatId, fetchTask, toTimelineMessage]);

  const generatedFiles = useMemo(() => {
    return task?.result?.progress?.generatedFiles || [];
  }, [task]);

  const hasGeneratedHtml = useMemo(() => {
    return generatedFiles.some((filePath) => /(^|\/)index\.html$/i.test(String(filePath || "").trim()));
  }, [generatedFiles]);

  const previewUrl = useMemo(() => {
    if (!task?.id) return "";
    const deployedUrl = String(task.result?.deployedUrl || "").trim();
    if (deployedUrl) return deployedUrl;
    if (!hasGeneratedHtml && task.status !== "succeeded") return "";
    return `/api/chat/tasks/${encodeURIComponent(task.id)}/preview/index.html`;
  }, [task, hasGeneratedHtml]);

  const deployedUrl = useMemo(() => String(task?.result?.deployedUrl || "").trim(), [task]);
  const deployedHost = useMemo(() => hostFromUrl(deployedUrl), [deployedUrl]);
  const isDeploying = useMemo(() => {
    const stage = String(task?.result?.progress?.stage || "").toLowerCase();
    return Boolean(task && (task.status === "queued" || task.status === "running") && stage.includes("deploy"));
  }, [task]);
  const deployDisabled = submitting || loadingTask || !previewUrl || isDeploying || (task?.status !== "succeeded" && !deployedUrl);

  const previewFrameUrl = useMemo(() => {
    return appendPreviewRefreshParam(previewUrl, previewRefreshNonce);
  }, [previewUrl, previewRefreshNonce]);

  const stageText = useMemo(() => {
    return task?.result?.progress?.stageMessage || toReadableStage(task?.result?.progress?.stage, conversationLocale) || task?.status || "-";
  }, [conversationLocale, task]);

  const progressEvents = useMemo(() => {
    const sourceEvents = taskEvents.length > 0 ? taskEvents : [];
    const syntheticEvents: TaskEvent[] =
      sourceEvents.length === 0 && task
        ? [
            {
              id: `${task.id}:current`,
              eventType: task.status === "failed" ? "task_failed" : task.status === "succeeded" ? "task_succeeded" : "task_progress",
              stage: task.result?.progress?.stage || task.status,
              payload: {
                filePath: task.result?.progress?.generatedFiles?.slice(-1)[0],
                error: task.result?.error,
              },
              createdAt: new Date(task.updatedAt || Date.now()).toISOString(),
            },
          ]
        : [];

    return [...sourceEvents, ...syntheticEvents]
      .map((event) => ({
        ...event,
        title:
          cleanEventValue(event.eventType).toLowerCase() === "task_created"
            ? CHAT_CARD_COPY[conversationLocale].taskSubmitted
            : cleanEventValue(event.eventType).toLowerCase() === "task_claimed"
              ? CHAT_CARD_COPY[conversationLocale].workerStarted
              : progressTitleFromStage(event.stage, event.payload, conversationLocale),
        detail: progressDetailFromEvent(event, conversationLocale),
        tone: progressTone(event.eventType, event.stage),
      }))
      .filter((event) => event.title)
      .slice(-10);
  }, [conversationLocale, task, taskEvents]);

  const progressSummary = useMemo(() => {
    const progress = task?.result?.progress || {};
    const files = Number(progress.fileCount || progress.generatedFiles?.length || 0);
    const pages = Number(progress.pageCount || 0);
    const parts: string[] = [];
    const copy = CHAT_CARD_COPY[conversationLocale];
    if (pages > 0) parts.push(`${pages} ${copy.pagesUnit}`);
    if (files > 0) parts.push(`${files} ${copy.filesUnit}`);
    if (task?.status === "queued") parts.push(copy.waitingWorker);
    if ((task?.status === "running" || task?.status === "queued") && task.updatedAt) {
      const lastUpdated = formatProgressTime(task.updatedAt);
      if (lastUpdated) parts.push(`${copy.lastUpdated} ${lastUpdated}`);
    }
    return parts.join(" · ");
  }, [conversationLocale, task]);

  const showProgressCard = Boolean(task && (task.status === "queued" || task.status === "running" || progressEvents.length > 0));

  const filteredAvailableAssets = useMemo(() => {
    const query = assetPickerQuery.trim().toLowerCase();
    const pendingKeys = new Set(pendingAssetRefs.map((item) => item.key));
    return availableAssets
      .filter((asset) => {
        if (query) {
          const hay = `${asset.name} ${asset.key} ${asset.source}`.toLowerCase();
          if (!hay.includes(query)) return false;
        }
        return true;
      })
      .map((asset) => ({
        ...asset,
        alreadySelected: pendingKeys.has(asset.key),
      }));
  }, [assetPickerQuery, availableAssets, pendingAssetRefs]);

  function toLocalPreviewHref(generatedPath: string): string {
    if (!task?.id) return "#";
    const normalized = String(generatedPath || "").trim();
    if (!normalized || normalized === "/" || normalized === "/index.html" || normalized === "index.html") {
      return `/api/chat/tasks/${encodeURIComponent(task.id)}/preview/index.html`;
    }

    let target = normalized.replace(/^\/+/, "");
    if (target.endsWith("index.html")) {
      target = target.slice(0, -("index.html".length));
    }
    return `/api/chat/tasks/${encodeURIComponent(task.id)}/preview/${target}`;
  }

  const submitPromptText = useCallback(
    async (nextText: string) => {
      const finalPrompt = String(nextText || "").trim();
      if (!chatId.trim()) return;
      const submitLocale = detectMessageLocale(finalPrompt);
      const submitCopy = CHAT_CARD_COPY[submitLocale];
      if (!finalPrompt) {
        setError(submitCopy.noPrompt);
        return;
      }

      setError("");
      setSubmitting(true);
      setLoadingTask(true);
      setAssetPickerOpen(false);
      setPrompt("");
      clearPollTimer();
      const currentAssetRefs = [...pendingAssetRefs];
      const assetReferenceBlock =
        currentAssetRefs.length > 0
          ? [
              "",
              "[Referenced Assets]",
              ...currentAssetRefs.map((asset) => {
                const base = String(asset.referenceText || `Asset "${asset.name}"`).trim();
                return `- ${base}${base.includes(" key: ") ? "" : ` key: ${asset.key}`}`;
              }),
            ].join("\n")
          : "";
      const runtimePrompt = `${finalPrompt}${assetReferenceBlock}`.trim();
      setPendingAssetRefs([]);
      appendMessage("user", runtimePrompt);
      appendMessage("assistant", submitCopy.received, { locale: submitLocale });

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              id: chatId,
              user_id: userId || undefined,
              async: true,
              skill_id: "website-generation-workflow",
              messages: [createUserMessage(runtimePrompt)],
            }),
          });

        await res.text();
        if (!res.ok && res.status !== 202 && res.status !== 200) {
          throw new Error(`Chat API request failed with status ${res.status}`);
        }

        const latestHistory = await fetchHistoryByChatId(chatId);
        setTaskEvents(Array.isArray(latestHistory.events) ? latestHistory.events : []);
        const historyMessages = Array.isArray(latestHistory.messages) ? latestHistory.messages : [];
        const normalizedMessages = historyMessages.map((item) => toTimelineMessage(item)).filter((item) => item.text);
        if (normalizedMessages.length > 0) {
          setMessages(normalizedMessages);
        }
        const latest = latestHistory.task;
        if (!latest?.id) {
          setLoadingTask(false);
          void fetchProjectMeta();
          return;
        }

        setTask(latest);
        await fetchTask(latest.id);
        void fetchProjectMeta();
      } catch (err: any) {
        setLoadingTask(false);
        const message = String(err?.message || err || "Submit failed");
        setError(message);
        setPendingAssetRefs((prev) => {
          const map = new Map<string, ProjectAsset>();
          for (const item of currentAssetRefs) map.set(item.key, item);
          for (const item of prev) map.set(item.key, item);
          return Array.from(map.values());
        });
        appendMessage("assistant", `${submitCopy.submitFailed}: ${message}`, { locale: submitLocale });
      } finally {
        setSubmitting(false);
      }
    },
    [appendMessage, chatId, clearPollTimer, fetchHistoryByChatId, fetchProjectMeta, fetchTask, pendingAssetRefs, toTimelineMessage, userId],
  );

  useEffect(() => {
    if (!historyReady || !initialPrompt || autoSubmittedInitialPrompt.current) return;
    autoSubmittedInitialPrompt.current = true;
    setPrompt(initialPrompt);
    void submitPromptText(initialPrompt);
    router.replace(`/projects/${encodeURIComponent(projectId)}/chat`);
  }, [historyReady, initialPrompt, projectId, router, submitPromptText]);

  useEffect(() => {
    if (!historyReady || !initialDraft || appliedInitialDraft.current) return;
    appliedInitialDraft.current = true;
    setPrompt(initialDraft);
    router.replace(`/projects/${encodeURIComponent(projectId)}/chat`);
  }, [historyReady, initialDraft, projectId, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submitPromptText(prompt);
  }

  async function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (submitting) return;
    await submitPromptText(prompt);
  }

  async function handleTimelineAction(payload: string) {
    const normalized = String(payload || "").trim();
    if (!normalized) return;
    if (/^https?:\/\//i.test(normalized)) {
      window.open(normalized, "_blank", "noopener,noreferrer");
      return;
    }
    await submitPromptText(normalized);
  }

  async function handleCreateProject() {
    if (creatingProject) return;
    setCreatingProject(true);
    setError("");
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Project" }),
      });
      const data = (await res.json()) as { ok: boolean; session?: SessionPayload; error?: string };
      if (!res.ok || !data.ok || !data.session?.id) {
        throw new Error(data.error || "Failed to create project.");
      }
      await fetchProjectMeta();
      router.push(`/projects/${encodeURIComponent(data.session.id)}/chat`);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to create project."));
      setCreatingProject(false);
      return;
    }
    setCreatingProject(false);
  }

  function handleBackToPreviousPage() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/launch-center");
  }

  function handleProjectSelect(nextProjectId: string) {
    const normalized = String(nextProjectId || "").trim();
    if (!normalized || normalized === chatId) return;
    router.push(`/projects/${encodeURIComponent(normalized)}/chat`);
  }

  function addPendingAssetRef(asset: ProjectAsset) {
    setPendingAssetRefs((prev) => {
      if (prev.some((item) => item.key === asset.key)) return prev;
      return [...prev, asset];
    });
  }

  function toggleAssetPicker() {
    setAssetPickerOpen((prev) => !prev);
  }

  async function uploadAssetsFromChat(files: FileList | File[], addToPending = true): Promise<ProjectAsset[]> {
    const selected = Array.from(files || []).filter(Boolean);
    if (!selected.length) return [];
    if (addToPending) setAssetPickerOpen(true);
    setError("");
    try {
      const form = new FormData();
      form.append("source", "chat_upload");
      for (const file of selected) {
        form.append("files", file, file.name);
      }
      const res = await fetch(`/api/projects/${encodeURIComponent(chatId)}/assets`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as AssetUploadResponse;
      if (!res.ok || !data.ok || !Array.isArray(data.uploaded)) {
        throw new Error(data.error || "Failed to upload files to project assets.");
      }
      setAvailableAssets((prev) => {
        const map = new Map<string, ProjectAsset>();
        for (const item of prev) map.set(item.key, item);
        for (const item of data.uploaded || []) map.set(item.key, item);
        return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      });
      if (addToPending) {
        for (const item of data.uploaded || []) {
          addPendingAssetRef(item);
        }
        appendMessage(
          "system",
          CHAT_CARD_COPY[conversationLocale].uploadedFiles.replace("{count}", String(data.uploaded.length)),
          { locale: conversationLocale },
        );
      }
      return data.uploaded || [];
    } catch (err: any) {
      const message = String(err?.message || err || "Failed to upload files.");
      setError(message);
      appendMessage("assistant", `${CHAT_CARD_COPY[conversationLocale].uploadFailed}: ${message}`, {
        locale: conversationLocale,
      });
      throw err;
    } finally {
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  const navItems: Array<{
    label: string;
    icon: typeof MessageSquare;
    href?: string;
    active: boolean;
  }> = [
    { label: "Chat", icon: MessageSquare, href: `/projects/${encodeURIComponent(chatId)}/chat`, active: true },
    { label: "Analytics", icon: BarChart3, href: `/projects/${encodeURIComponent(chatId)}/analysis`, active: false },
    { label: "Assets", icon: FolderOpen, href: `/projects/${encodeURIComponent(chatId)}/assets`, active: false },
    { label: "Data", icon: Database, href: `/projects/${encodeURIComponent(chatId)}/data`, active: false },
    { label: "Settings", icon: Settings, active: false },
  ];

  return (
    <main className="chat-ui min-h-screen bg-[radial-gradient(720px_360px_at_10%_-5%,color-mix(in_oklab,var(--shp-primary)_14%,transparent),transparent_70%),radial-gradient(760px_340px_at_90%_-15%,color-mix(in_oklab,var(--shp-warm)_14%,transparent),transparent_75%),linear-gradient(180deg,var(--shp-bg),#050505)] text-[var(--shp-text)]">
      <input
        ref={attachmentInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (!event.target.files?.length) return;
          void uploadAssetsFromChat(event.target.files);
        }}
      />
      <div className="mx-auto max-w-[1920px] px-5 py-5 sm:px-6 sm:py-6">
        <header className="mb-4 flex items-center gap-3">
          <div className="flex shrink-0 cursor-default items-center gap-2 rounded-md px-1 py-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--shp-primary)] text-sm font-black text-black">
              S
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--shp-text)]">Shpitto Studio</h1>
          </div>

          <nav className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_42%,transparent)] px-2 py-2">
            <button
              type="button"
              onClick={handleBackToPreviousPage}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--shp-muted)] hover:border-[var(--shp-primary)] hover:text-[var(--shp-primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="ml-auto flex items-center">
              {projects.length === 0 ? (
                <span className="px-2 text-xs text-[var(--shp-muted)]">No projects</span>
              ) : (
                <label className="relative flex items-center">
                  <select
                    value={chatId}
                    onChange={(event) => handleProjectSelect(event.target.value)}
                    className="h-9 w-[220px] max-w-[42vw] appearance-none rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_54%,black_46%)] px-3 pr-8 text-xs font-medium text-[var(--shp-text)] outline-none transition-colors focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] focus:bg-[color-mix(in_oklab,var(--shp-surface)_62%,black_38%)]"
                    aria-label="Select project"
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--shp-muted)]" />
                </label>
              )}
            </div>
          </nav>
        </header>

        <section
          className={`grid gap-4 ${sidebarCollapsed ? "xl:grid-cols-[88px_var(--chat-panel-width)_minmax(0,1fr)]" : "xl:grid-cols-[260px_var(--chat-panel-width)_minmax(0,1fr)]"}`}
          style={workspaceGridStyle}
        >
          <aside className="shp-shell flex h-[calc(100vh-120px)] min-h-[700px] flex-col rounded-xl p-4">
            <div
              className={[
                "rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_48%,transparent)] p-3.5",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--shp-primary)_20%,transparent)] text-[var(--shp-primary)]">
                  <Sparkles className="h-5 w-5" />
                </div>
                {!sidebarCollapsed ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold text-[var(--shp-text)]">{projectTitle}</p>
                    <p className="text-xs text-[var(--shp-muted)]">{formatVersionLabel(projectUpdatedAt)}-stable</p>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((prev) => !prev)}
                  className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] p-1.5 text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_60%,transparent)] hover:text-[var(--shp-text)]"
                  title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {navItems.map((item) => {
                const classes = [
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-base",
                  sidebarCollapsed ? "justify-center px-2" : "",
                  item.active
                    ? "border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] text-[var(--shp-text)]"
                    : "border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] text-[var(--shp-muted)]",
                ].join(" ");
                if (item.href) {
                  return (
                    <Link key={item.label} href={item.href} className={classes} title={sidebarCollapsed ? item.label : undefined}>
                      <item.icon className="h-5 w-5" />
                      {!sidebarCollapsed ? <span>{item.label}</span> : null}
                    </Link>
                  );
                }
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled
                    className={classes}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <item.icon className="h-5 w-5" />
                    {!sidebarCollapsed ? <span>{item.label}</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto pt-4">
              <button
                type="button"
                onClick={() => void handleCreateProject()}
                disabled={creatingProject}
                className={[
                  "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_16%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] disabled:cursor-not-allowed disabled:opacity-60",
                  sidebarCollapsed ? "px-2" : "",
                ].join(" ")}
                title="New project"
              >
                {creatingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {!sidebarCollapsed ? <span>New Project</span> : null}
              </button>
              <div
                className={[
                  "mt-2 flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_35%,transparent)] px-3 py-2",
                  sidebarCollapsed ? "justify-center px-2" : "",
                ].join(" ")}
                title={userEmail || "Guest"}
              >
                <User2 className="h-4 w-4 shrink-0 text-[var(--shp-muted)]" />
                {!sidebarCollapsed ? (
                  <span className="max-w-[190px] truncate text-sm text-[var(--shp-text)]">{userEmail || "Guest"}</span>
                ) : null}
              </div>
              {userEmail ? (
                <SignOutButton
                  className={[
                    "mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] px-3 py-2 text-sm text-[var(--shp-muted)] hover:border-[var(--shp-primary)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)] hover:text-[var(--shp-primary)]",
                    sidebarCollapsed ? "px-2" : "",
                  ].join(" ")}
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  {!sidebarCollapsed ? <span>Sign out</span> : null}
                </SignOutButton>
              ) : null}
            </div>
          </aside>

          <aside className="shp-shell relative flex h-[calc(100vh-120px)] min-h-[700px] flex-col overflow-hidden rounded-xl">
            <button
              type="button"
              onPointerDown={handleChatPanelResizeStart}
              className={[
                "group absolute right-0 top-4 z-20 hidden h-[calc(100%-32px)] w-3 cursor-col-resize items-center justify-center rounded-full outline-none xl:flex",
                resizingChatPanel ? "bg-[color-mix(in_oklab,var(--shp-primary)_16%,transparent)]" : "",
              ].join(" ")}
              aria-label="Resize chat panel"
              title="Resize chat panel"
            >
              <span
                className={[
                  "h-12 w-1 rounded-full border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-muted)_38%,transparent)] transition-colors",
                  resizingChatPanel ? "bg-[var(--shp-primary)] shadow-[0_0_18px_color-mix(in_oklab,var(--shp-primary)_45%,transparent)]" : "group-hover:bg-[var(--shp-primary)]",
                ].join(" ")}
              />
            </button>
            <div ref={messagesScrollRef} className="no-scrollbar flex-1 space-y-3 overflow-auto px-4 py-4">
              {messages.map((message) => {
                const isUser = message.role === "user";
                const isSystem = message.role === "system";
                const metadata = (message.metadata || {}) as Record<string, unknown>;
                const cardType = String(metadata.cardType || "").trim();
                const previewText = String(metadata.canonicalPrompt || "").trim();
                const confirmPayload = String(metadata.payload || "").trim();
                const messageLocale = localeFromMetadata(metadata, message.text);
                if (cardType === "intent_decision" && String(metadata.reason || "") === "required-slots-incomplete") {
                  return null;
                }
                const showMessageText = cardType !== "requirement_form";
                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className={[
                        "max-w-[88%] rounded-xl border px-3 py-2.5 text-sm leading-relaxed",
                        isUser
                          ? "border-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_18%,var(--shp-surface)_82%)] text-[color-mix(in_oklab,var(--shp-text)_95%,white_5%)]"
                          : isSystem
                            ? "border-[color-mix(in_oklab,var(--shp-border)_60%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_42%,transparent)] text-[var(--shp-muted)]"
                        : "border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_56%,transparent)] text-[var(--shp-text)]",
                      ].join(" ")}
                    >
                      {showMessageText ? <p>{message.text}</p> : null}
                      {cardType === "requirement_form" ? (
                        <RequirementFormCard
                          metadata={metadata}
                          submitting={submitting || loadingTask}
                          availableAssets={availableAssets}
                          onLoadAssets={fetchProjectAssetsForPicker}
                          onUploadLogo={(files) => uploadAssetsFromChat(files, false)}
                          onSubmit={submitPromptText}
                        />
                      ) : null}
                      {cardType === "prompt_draft" && previewText ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftPreviewText(previewText);
                            setDraftPreviewOpen(true);
                          }}
                          className="mt-3 w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_76%,black_24%)] px-3 py-2 text-left text-xs text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_72%,transparent)]"
                        >
                          <p className="font-medium">{CHAT_CARD_COPY[messageLocale].promptDraftExpand}</p>
                          <div className="mt-2 max-h-40 overflow-hidden">
                            <MarkdownDraftView content={previewText} compact />
                          </div>
                        </button>
                      ) : null}
                      {cardType === "confirm_generate" && confirmPayload ? (
                        <button
                          type="button"
                          onClick={() => void handleTimelineAction(confirmPayload)}
                          disabled={submitting || loadingTask}
                          className="mt-3 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_55%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_20%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_30%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {String(metadata.label || CHAT_CARD_COPY[messageLocale].confirmAndGenerate)}
                        </button>
                      ) : null}
                      <p className="mt-1 text-[10px] text-[color-mix(in_oklab,var(--shp-muted)_72%,transparent)]">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })}
              {showProgressCard ? (
                <div className="flex justify-start">
                  <div className="max-w-[92%] rounded-xl border border-[color-mix(in_oklab,var(--shp-secondary)_38%,var(--shp-border)_62%)] bg-[color-mix(in_oklab,var(--shp-surface)_58%,transparent)] px-3 py-3 text-sm text-[var(--shp-text)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{CHAT_CARD_COPY[conversationLocale].progressTitle}</p>
                        <p className="mt-1 text-xs text-[var(--shp-muted)]">{progressEvents[progressEvents.length - 1]?.title || stageText}</p>
                      </div>
                      <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] ${statusTone(task?.status || null)}`}>
                        {statusLabel(task?.status || null, conversationLocale)}
                      </span>
                    </div>
                    {progressSummary ? <p className="mt-2 text-xs text-[var(--shp-muted)]">{progressSummary}</p> : null}
                    <ol className="mt-3 space-y-2">
                      {progressEvents.map((event) => {
                        const dotClass =
                          event.tone === "error"
                            ? "bg-rose-400"
                            : event.tone === "done"
                              ? "bg-[var(--shp-primary)]"
                              : event.tone === "pending"
                                ? "bg-amber-300"
                                : "bg-[var(--shp-secondary)]";
                        return (
                          <li key={event.id} className="grid grid-cols-[14px_minmax(0,1fr)] gap-2">
                            <span className={`mt-1.5 h-2 w-2 rounded-full ${dotClass}`} />
                            <span className="min-w-0">
                              <span className="block text-xs font-medium text-[var(--shp-text)]">{event.title}</span>
                              {event.detail ? (
                                <span className="mt-0.5 block truncate text-[11px] text-[var(--shp-muted)]" title={event.detail}>
                                  {event.detail}
                                </span>
                              ) : null}
                              <span className="mt-0.5 block text-[10px] text-[color-mix(in_oklab,var(--shp-muted)_70%,transparent)]">
                                {formatProgressTime(event.createdAt)}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                    {task?.status === "queued" || task?.status === "running" ? (
                      <p className="mt-3 text-[11px] text-[var(--shp-muted)]">{CHAT_CARD_COPY[conversationLocale].runningNote}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 border-t border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] px-4 py-3.5">
              {pendingAssetRefs.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {pendingAssetRefs.map((asset) => (
                    <span
                      key={asset.key}
                      className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,transparent)] px-2 py-1 text-[11px] text-[var(--shp-text)]"
                      title={asset.referenceText}
                    >
                      {asset.name}
                      <button
                        type="button"
                        onClick={() => setPendingAssetRefs((prev) => prev.filter((item) => item.key !== asset.key))}
                        className="rounded-sm px-0.5 text-[var(--shp-muted)] hover:text-[var(--shp-text)]"
                        aria-label={`Remove ${asset.name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              {assetPickerOpen ? (
                <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_42%,transparent)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[var(--shp-text)]">Add Files To Chat</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => attachmentInputRef.current?.click()}
                        disabled={submitting}
                        className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_16%,transparent)] px-2 py-1 text-[11px] text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)]"
                      >
                        <Upload className="h-3 w-3" />
                        Upload Local
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssetPickerOpen(false)}
                        className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] px-2 py-1 text-[11px] text-[var(--shp-muted)] hover:text-[var(--shp-text)]"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--shp-muted)]" />
                    <input
                      value={assetPickerQuery}
                      onChange={(event) => setAssetPickerQuery(event.target.value)}
                      placeholder="Search existing assets..."
                      className="h-8 w-full rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_56%,black_44%)] pl-8 pr-2 text-xs text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)]"
                    />
                  </div>

                  <div className="no-scrollbar mt-2 max-h-44 space-y-1 overflow-auto pr-1">
                    {assetPickerLoading ? (
                      <div className="flex items-center gap-2 px-2 py-2 text-xs text-[var(--shp-muted)]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading assets...
                      </div>
                    ) : filteredAvailableAssets.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-[var(--shp-muted)]">
                        No matching assets. Upload local files to continue.
                      </div>
                    ) : (
                      filteredAvailableAssets.map((asset) => (
                        <div
                          key={asset.key}
                          className="flex items-center justify-between gap-2 rounded-md border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_38%,transparent)] px-2 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs text-[var(--shp-text)]">{asset.name}</p>
                            <p className="text-[10px] text-[var(--shp-muted)]">
                              {formatAssetFileSize(asset.size)} • {asset.source}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => addPendingAssetRef(asset)}
                            disabled={asset.alreadySelected}
                            className="shrink-0 rounded-md border border-[color-mix(in_oklab,var(--shp-primary)_45%,transparent)] px-2 py-1 text-[10px] text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {asset.alreadySelected ? "Added" : "Add"}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={toggleAssetPicker}
                  disabled={submitting}
                  className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] p-2 text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_60%,transparent)] hover:text-[var(--shp-text)]"
                  title="Attach"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => void handlePromptKeyDown(e)}
                  rows={1}
                  className="no-scrollbar w-full resize-none overflow-y-auto rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_60%,black_40%)] px-3 py-2.5 text-sm leading-6 text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_40%,var(--shp-border)_60%)]"
                  placeholder={`Describe changes for ${projectTitle}...`}
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="shp-btn-primary inline-flex h-11 w-11 items-center justify-center rounded-lg text-black disabled:cursor-not-allowed disabled:opacity-60"
                  title="Send"
                >
                  <SendHorizontal className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[11px] text-[var(--shp-muted)]">Press Enter to send, Shift+Enter for new line.</p>
              {loadingTask ? <p className="text-xs text-[var(--shp-primary)]">Syncing task progress...</p> : null}
              {error ? <p className="text-xs text-rose-300">{error}</p> : null}
            </form>
          </aside>

          <div className="shp-shell flex h-[calc(100vh-120px)] min-h-[700px] flex-col overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] p-1.5 text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_60%,transparent)] hover:text-[var(--shp-text)]"
                  title="Preview"
                >
                  <MessageSquare className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-[var(--shp-muted)]">
                <span className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] px-2 py-1 text-[var(--shp-text)]">
                  Latest
                </span>
                <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] ${statusTone(task?.status || null)}`}>
                  {stageText}
                </span>
                <button
                  type="button"
                  onClick={() => void submitPromptText(conversationLocale === "zh" ? "部署到 Cloudflare" : "deploy to cloudflare")}
                  disabled={deployDisabled}
                  className={[
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium",
                    deployDisabled
                      ? "cursor-not-allowed border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] text-[color-mix(in_oklab,var(--shp-muted)_64%,transparent)] opacity-70"
                      : "border-[color-mix(in_oklab,var(--shp-primary)_56%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_18%,transparent)] text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_28%,transparent)]",
                  ].join(" ")}
                  title={deployedUrl ? "Redeploy latest site to Cloudflare Pages" : "Deploy latest preview to Cloudflare Pages"}
                >
                  {isDeploying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  <span>{isDeploying ? "Deploying" : deployedUrl ? "Redeploy" : "Deploy"}</span>
                </button>
                {previewUrl ? (
                  <button
                    type="button"
                    onClick={() => setPreviewRefreshNonce(Date.now())}
                    className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] px-2 py-1 text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_70%,transparent)]"
                    title="Refresh preview"
                    aria-label="Refresh preview"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Refresh</span>
                  </button>
                ) : null}
                {previewUrl ? (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] px-2 py-1 text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_70%,transparent)]"
                  >
                    Open
                  </a>
                ) : null}
              </div>
            </div>

            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  {generatedFiles.length === 0 ? (
                    <span className="text-xs text-[var(--shp-muted)]">Waiting for generated files...</span>
                  ) : (
                    generatedFiles.slice(-8).map((filePath) => (
                      <a
                        key={filePath}
                        href={toLocalPreviewHref(filePath)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] px-2 py-1 text-xs text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_58%,transparent)]"
                      >
                        {filePath}
                      </a>
                    ))
                  )}
                </div>
              </div>

              {deployedUrl ? (
                <div className="border-b border-[color-mix(in_oklab,var(--shp-primary)_24%,var(--shp-border)_76%)] bg-[color-mix(in_oklab,var(--shp-primary)_8%,transparent)] px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Globe2 className="h-4 w-4 text-[var(--shp-primary)]" />
                        <p className="text-sm font-semibold text-[var(--shp-text)]">域名配置指导</p>
                      </div>
                      <p className="mt-1 text-xs text-[var(--shp-muted)]">
                        当前已部署到{" "}
                        <a href={deployedUrl} target="_blank" rel="noreferrer" className="text-[var(--shp-primary)] hover:underline">
                          {deployedHost || deployedUrl}
                        </a>
                        ，绑定自定义域名时将 DNS 指向该 Pages 地址。
                      </p>
                    </div>
                    <a
                      href="https://developers.cloudflare.com/pages/configuration/custom-domains/"
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-md border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] px-2 py-1 text-xs text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_70%,transparent)]"
                    >
                      Cloudflare Docs
                    </a>
                  </div>
                  <ol className="mt-3 grid gap-2 text-xs leading-relaxed text-[var(--shp-muted)] md:grid-cols-2">
                    <li className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_36%,transparent)] px-3 py-2">
                      1. 在 Cloudflare Pages 项目中进入 Custom domains，添加你的域名或 www 子域名。
                    </li>
                    <li className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_36%,transparent)] px-3 py-2">
                      2. 如域名 DNS 托管在 Cloudflare，按提示让 Pages 自动创建记录并签发证书。
                    </li>
                    <li className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_36%,transparent)] px-3 py-2">
                      3. 如使用外部 DNS，为 www 或子域名创建 CNAME，目标填写 {deployedHost || "your-project.pages.dev"}。
                    </li>
                    <li className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_36%,transparent)] px-3 py-2">
                      4. 根域名使用 Cloudflare nameservers 的 CNAME flattening，或使用 DNS 服务商支持的 ALIAS/ANAME。
                    </li>
                  </ol>
                </div>
              ) : null}

              {previewUrl ? (
                <iframe
                  key={previewFrameUrl}
                  src={previewFrameUrl}
                  className="h-full w-full bg-white"
                  title="Generated Website Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-[var(--shp-muted)]">
                  <p>Your live preview will appear here once the first HTML page is generated.</p>
                  <p className="text-xs">Current stage: {stageText}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {draftPreviewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="shp-shell relative flex h-[min(86vh,980px)] w-[min(92vw,980px)] flex-col rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)]">
            <div className="flex items-center justify-between border-b border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] px-4 py-3">
              <p className="text-sm font-semibold text-[var(--shp-text)]">Prompt Draft</p>
              <button
                type="button"
                onClick={() => setDraftPreviewOpen(false)}
                className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_64%,transparent)] p-1.5 text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_58%,transparent)] hover:text-[var(--shp-text)]"
                aria-label="Close prompt preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-auto px-4 py-4">
              <MarkdownDraftView content={draftPreviewText} />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
