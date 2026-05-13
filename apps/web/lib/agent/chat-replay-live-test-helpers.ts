import fs from "node:fs/promises";

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
