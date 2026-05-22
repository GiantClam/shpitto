import fs from "node:fs/promises";
import path from "node:path";

export function confirmGenerate(text: string) {
  return `__SHP_CONFIRM_GENERATE__\n${text}`;
}

export function normalizePagesUrl(value: string) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function normalizeRoute(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  return `/${raw.replace(/^\/+/, "").replace(/\/+$/, "")}`.replace(/\/{2,}/g, "/") || "/";
}

export function routeToHtmlPath(route: string) {
  const normalized = normalizeRoute(route);
  return normalized === "/" ? "/index.html" : `${normalized}/index.html`;
}

export function escapeRegExp(value: string) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hasHrefToRoute(html: string, route: string) {
  const normalized = normalizeRoute(route);
  const pattern = new RegExp(`href=["']${escapeRegExp(normalized)}(?:/)?["']`, "i");
  return pattern.test(String(html || ""));
}

export function parsePromptControlManifest(prompt: string): { routes: string[]; files: string[] } | null {
  const blocks = Array.from(String(prompt || "").matchAll(/```json\s*([\s\S]*?)```/gi));
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(String(block[1] || "").trim()) as { routes?: unknown; files?: unknown };
      if (!Array.isArray(parsed.routes) || !Array.isArray(parsed.files)) continue;
      const routes = parsed.routes.map((item) => normalizeRoute(String(item || ""))).filter(Boolean);
      const files = parsed.files.map((item) => String(item || "").trim()).filter(Boolean);
      if (routes.length > 0 && files.length > 0) return { routes, files };
    } catch {
      continue;
    }
  }
  return null;
}

export function rewriteCanonicalPromptToHomepageOnly(prompt: string) {
  const normalized = String(prompt || "").trim();
  if (!normalized) return normalized;
  const homepageManifest = {
    schemaVersion: 1,
    promptKind: "canonical_website_prompt",
    routeSource: "prompt_draft_page_plan",
    routes: ["/"],
    navLabels: ["Home"],
    files: ["/styles.css", "/script.js", "/index.html", "/i18n/messages.en.json", "/i18n/messages.zh-CN.json"],
  };

  return normalized.replace(/```json\s*([\s\S]*?)```/i, () => `\`\`\`json\n${JSON.stringify(homepageManifest, null, 2)}\n\`\`\``);
}

export function rewriteCanonicalPromptWithForcedDesignTemplate(prompt: string, templateSlug: string) {
  const normalized = String(prompt || "").trim();
  const slug = String(templateSlug || "").trim().toLowerCase();
  if (!normalized || !slug) return normalized;

  const styleInstructionBySlug: Record<string, { instruction: string; replacements: Array<[RegExp, string]> }> = {
    ibm: {
      instruction: [
        "Visual style override: Use the IBM enterprise technology design language as the primary template reference.",
        "Follow a Carbon-like layout posture: structured enterprise masthead, modular content bands, restrained motion, data-forward hierarchy, and a trustworthy blue/white technology palette.",
        "Do not use editorial, artisan, lifestyle, boutique, or personal-site hero treatments.",
      ].join("\n"),
      replacements: [
        [
          /(^|\n)(-\s*Primary visual direction:\s*).+?(?=\n|$)/i,
          `$1$2IBM enterprise technology / Carbon`,
        ],
        [
          /(^|\n)(-\s*Secondary visual tags:\s*).+?(?=\n|$)/i,
          `$1$2structured, precise, trustworthy, procurement-ready`,
        ],
        [
          /(^|\n)(-\s*Design theme:\s*).+?(?=\n|$)/i,
          `$1$2IBM enterprise technology / Carbon`,
        ],
      ],
    },
  };

  const config = styleInstructionBySlug[slug];
  if (!config) return normalized;

  let rewritten = normalized;
  for (const [pattern, replacement] of config.replacements) {
    rewritten = rewritten.replace(pattern, replacement);
  }
  if (!rewritten.includes(config.instruction)) {
    rewritten = `${rewritten}\n\n## Forced Design Template\n${config.instruction}`;
  }
  return rewritten;
}

export function applyForcedDesignTemplateToReplayInputState(inputState: any, templateSlug: string, canonicalPrompt?: string) {
  const slug = String(templateSlug || "").trim().toLowerCase();
  if (!inputState || !slug) return inputState;

  const nextState = JSON.parse(JSON.stringify(inputState || {}));
  const canonical = String(canonicalPrompt || "").trim();
  const workflow = ((nextState.workflow_context || {}) as Record<string, any>);

  if (slug === "ibm") {
    workflow.templateStyleId = "ibm";
    delete workflow.primaryVisualDirection;
    delete workflow.secondaryVisualTags;
    delete workflow.visualDecisionSource;
    delete workflow.lockPrimaryVisualDirection;

    if (workflow.requirementSpec && typeof workflow.requirementSpec === "object") {
      delete workflow.requirementSpec.primaryVisualDirection;
      delete workflow.requirementSpec.secondaryVisualTags;
      delete workflow.requirementSpec.visualDecisionSource;
    }

    workflow.preferredLocale = "en";
    workflow.latestUserText = String(canonical || workflow.latestUserText || "").trim();
    workflow.latestUserTextRaw = String(canonical || workflow.latestUserTextRaw || "").trim();
    workflow.sourceRequirement = String(canonical || workflow.sourceRequirement || "").trim();
    workflow.canonicalPrompt = String(canonical || workflow.canonicalPrompt || "").trim();
    workflow.requirementAggregatedText = String(canonical || workflow.requirementAggregatedText || "").trim();
    delete workflow.selectionCriteria;
    delete workflow.sequentialWorkflow;
    delete workflow.workflowGuide;
    delete workflow.rulesSummary;
    delete workflow.designMd;
    delete workflow.stylePreset;
    delete workflow.designSystemId;
    delete workflow.designSystemName;
    delete workflow.designSelectionReason;
    delete nextState.design_hit;

    if (canonical) {
      nextState.messages = [
        {
          role: "user",
          content: canonical,
          type: "human",
        },
      ];
    }
  }

  nextState.workflow_context = workflow;
  return nextState;
}

function isPollutedReplayCanonicalPrompt(text: string) {
  const normalized = String(text || "").trim();
  if (!normalized.startsWith("# Canonical Website Generation Prompt")) return false;
  const withoutKnowledgeProfile = normalized.replace(
    /\n## Website Knowledge Profile\b[\s\S]*?(?=\n## |\n# |$)/gi,
    "\n",
  );
  const completion = normalized.match(/Requirement completion:\s*(\d+)\s*\/\s*(\d+)/i);
  const completed = completion ? Number(completion[1]) : NaN;
  const total = completion ? Number(completion[2]) : NaN;
  const isStrongPrompt =
    (Number.isFinite(completed) && Number.isFinite(total) && total > 0 && completed / total >= 0.8) ||
    (normalized.length > 4000 &&
      /Prompt Control Manifest \(Machine Readable\)/i.test(normalized) &&
      /Evidence Brief Contract|Page-Level Intent Contract|##\s*7\.\s*Evidence Brief/i.test(normalized));
  if (isStrongPrompt && !/\[Requirement Form\]/i.test(normalized) && !/(?:^|\n)\s*[-*]?\s*Logo\s+strategy\s*:/i.test(normalized)) {
    return false;
  }
  return (
    /(?:^|\n)[-*\d.\s]*Brand(?:\s+or\s+organization)?\s*:\s*(?:Logo|Requirement|Site|Website|Blog)\b/i.test(
      withoutKnowledgeProfile,
    ) ||
    /\[brand\]\s*Brand(?:\s+or\s+organization)?\s*:\s*(?:Logo|Requirement|Site|Website|Blog)\b/i.test(
      withoutKnowledgeProfile,
    ) ||
    /\[Requirement Form\]/i.test(normalized) ||
    /(?:^|\n)\s*[-*]?\s*Logo\s+strategy\s*:/i.test(normalized)
  );
}

function isWeakReplayCanonicalPrompt(text: string) {
  const normalized = String(text || "").trim();
  if (!normalized.startsWith("# Canonical Website Generation Prompt")) return false;
  const requirementCompletion = normalized.match(/Requirement completion:\s*(\d+)\s*\/\s*(\d+)/i);
  const completed = requirementCompletion ? Number(requirementCompletion[1]) : NaN;
  const total = requirementCompletion ? Number(requirementCompletion[2]) : NaN;
  const hasLowCompletion = Number.isFinite(completed) && Number.isFinite(total) && total > 0 && completed / total < 0.8;
  const lacksBilingualContract = !/Bilingual Experience Contract/i.test(normalized);
  const lacksRichSourceGuidance =
    /No content source strategy was confirmed yet\./i.test(normalized) ||
    !/Evidence Brief Contract|Page-Level Intent Contract/i.test(normalized);
  const genericSinglePageDefault = /Site structure:\s*Single-page website/i.test(normalized);
  return hasLowCompletion || (genericSinglePageDefault && lacksBilingualContract && lacksRichSourceGuidance);
}

export function pickReplayPrompt(messages: Array<{ role: string; text: string; metadata?: Record<string, unknown> }>) {
  const promptDraftCandidates = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const metadata = (messages[index]?.metadata || {}) as Record<string, unknown>;
    if (String(metadata.cardType || "") !== "prompt_draft") continue;
    const canonicalPrompt = String((metadata as any).canonicalPrompt || "").trim();
    if (!canonicalPrompt.startsWith("# Canonical Website Generation Prompt")) continue;
    if (isPollutedReplayCanonicalPrompt(canonicalPrompt)) continue;
    promptDraftCandidates.push(canonicalPrompt);
  }

  const strongestPromptDraft = promptDraftCandidates.find((candidate) => !isWeakReplayCanonicalPrompt(candidate));
  if (strongestPromptDraft) {
    return strongestPromptDraft;
  }

  const users = messages
    .filter((message) => message.role === "user")
    .map((message) => String(message.text || "").trim())
    .filter(Boolean);
  const latestGenerationBrief = [...users]
    .reverse()
    .find((text) => {
      if (text.length < 200) return false;
      if (/^#\s*Canonical Website Generation Prompt/i.test(text)) return false;
      if (/\[Requirement Form\]/i.test(text)) return false;
      if (/^\?{3,}\s*Cloudflare/i.test(text)) return false;
      if (/^deploy\b/i.test(text)) return false;
      return /(网站|建站|blog|博客|首页|路由|Cloudflare Pages|部署|website|pages|contact|products|cases|about)/i.test(text);
    });
  if (latestGenerationBrief) return latestGenerationBrief;
  if (promptDraftCandidates.length > 0) return promptDraftCandidates[0];
  const assetPrompt = users
    .filter((text) => text.includes("CASUX") || text.includes("[Referenced Assets]") || text.toLowerCase().includes(".pdf"))
    .sort((a, b) => b.length - a.length)[0];
  return assetPrompt || users.sort((a, b) => b.length - a.length)[0] || "";
}

export function fileContent(files: Array<{ path?: string; content?: string }>, targetPath: string) {
  return String(files.find((file) => String(file.path || "") === targetPath)?.content || "");
}

export function htmlToVisibleText(html: string) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function loadGeneratedProject(task: any) {
  const checkpointProjectPath = String(task?.result?.progress?.checkpointProjectPath || "").trim();
  if (checkpointProjectPath) {
    try {
      return {
        project: JSON.parse(await fs.readFile(checkpointProjectPath, "utf8")),
        source: "checkpoint-file",
        checkpointProjectPath,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    }
  }

  const internal = (task?.result?.internal || {}) as Record<string, any>;
  const project =
    internal.artifactSnapshot ||
    internal.sessionState?.site_artifacts ||
    internal.sessionState?.project_json ||
    internal.inputState?.site_artifacts ||
    internal.inputState?.project_json;
  if (!project) {
    throw new Error(`Task ${task?.id || "unknown"} has no readable generated project artifact.`);
  }

  return {
    project,
    source: "task-artifact-snapshot",
    checkpointProjectPath,
  };
}

function extractCanonicalPromptFromFindings(text: string) {
  const normalized = String(text || "").trim();
  const marker = "# Canonical Website Generation Prompt";
  const index = normalized.indexOf(marker);
  if (index < 0) return "";
  return normalized.slice(index).trim();
}

export async function loadLatestLocalReplayCanonicalPrompt(prefix: string) {
  const root = path.resolve(process.cwd(), ".tmp", "chat-tasks");
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const candidate of candidates) {
    const candidateRoot = path.join(root, candidate);
    const taskDirs = await fs.readdir(candidateRoot, { withFileTypes: true }).catch(() => []);
    for (const taskDir of taskDirs.filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
      const findingsPath = path.join(candidateRoot, taskDir, "latest", "workflow", "findings.md");
      const findingsText = await fs.readFile(findingsPath, "utf8").catch(() => "");
      const canonicalPrompt = extractCanonicalPromptFromFindings(findingsText);
      if (canonicalPrompt) {
        return {
          canonicalPrompt,
          findingsPath,
          replayRoot: candidateRoot,
          taskId: taskDir,
          source: "local-replay-artifact" as const,
        };
      }
    }
  }

  return null;
}
