import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

export function extractTaskGenerationTrace(task: any) {
  const result = (task?.result || {}) as Record<string, any>;
  const workflow =
    ((result?.internal?.inputState?.workflow_context ||
      result?.internal?.sessionState?.workflow_context ||
      {}) as Record<string, any>);
  const generationContract =
    workflow.generationContract && typeof workflow.generationContract === "object"
      ? (workflow.generationContract as Record<string, any>)
      : null;
  const selectedSeedSkillManifest =
    workflow.selectedSeedSkillManifest && typeof workflow.selectedSeedSkillManifest === "object"
      ? (workflow.selectedSeedSkillManifest as Record<string, any>)
      : null;
  const selectedSeedContracts = Array.isArray(workflow.selectedSeedContracts)
    ? (workflow.selectedSeedContracts as unknown[])
    : [];
  const routeUnitContracts = Array.isArray(workflow.routeUnitContracts) ? (workflow.routeUnitContracts as unknown[]) : [];
  const promptControlManifest =
    workflow.promptControlManifest && typeof workflow.promptControlManifest === "object"
      ? (workflow.promptControlManifest as Record<string, any>)
      : null;
  const qaSummary =
    result?.progress?.qaSummary && typeof result.progress.qaSummary === "object"
      ? (result.progress.qaSummary as Record<string, any>)
      : null;
  const shadowVisualEvaluation =
    qaSummary?.shadowVisualEvaluation && typeof qaSummary.shadowVisualEvaluation === "object"
      ? (qaSummary.shadowVisualEvaluation as Record<string, any>)
      : null;
  const generatedProject =
    internalProjectSnapshot(task) ||
    workflow.generatedProject ||
    workflow.siteArtifacts ||
    null;
  const staticFiles = Array.isArray((generatedProject as any)?.staticSite?.files)
    ? ((generatedProject as any).staticSite.files as unknown[])
    : [];

  return {
    taskId: String(task?.id || "").trim() || null,
    contractHash: String(result.contractHash || workflow.contractHash || generationContract?.contractHash || "").trim() || null,
    generationLane: String(result.generationLane || workflow.generationLane || generationContract?.generationLane || "").trim() || null,
    websiteSurfaceMode:
      String(result.websiteSurfaceMode || workflow.websiteSurfaceMode || generationContract?.websiteSurfaceMode || "").trim() || null,
    routeCount: routeUnitContracts.length,
    routes: routeUnitContracts
      .map((entry) => String((entry as any)?.route || "").trim())
      .filter(Boolean),
    selectedSeedSkillIds: Array.isArray((selectedSeedSkillManifest as any)?.selected)
      ? ((selectedSeedSkillManifest as any).selected as unknown[])
          .map((entry) => String((entry as any)?.id || "").trim())
          .filter(Boolean)
      : [],
    selectedSeedContractIds: selectedSeedContracts
      .map((entry) => String((entry as any)?.id || "").trim())
      .filter(Boolean),
    selectedSeedContractSources: Array.from(
      new Set(
        selectedSeedContracts
          .map((entry) => String((entry as any)?.source || "").trim())
          .filter(Boolean),
      ),
    ).sort(),
    promptManifestRoutes: Array.isArray(promptControlManifest?.routes)
      ? (promptControlManifest.routes as unknown[]).map((entry) => normalizeRoute(String(entry || ""))).filter(Boolean)
      : [],
    generatedFiles: staticFiles
      .map((entry) => String((entry as any)?.path || "").trim())
      .filter(Boolean)
      .sort(),
    promptManifestFiles: Array.isArray(promptControlManifest?.files)
      ? (promptControlManifest.files as unknown[]).map((entry) => String(entry || "").trim()).filter(Boolean).sort()
      : [],
    shadowVisualEvaluationScore: Number(shadowVisualEvaluation?.score || 0) || null,
    shadowVisualEvaluationSignals: Array.isArray(shadowVisualEvaluation?.signals)
      ? (shadowVisualEvaluation.signals as unknown[])
          .map((entry) => String((entry as any)?.code || "").trim())
          .filter(Boolean)
      : [],
  };
}

function internalProjectSnapshot(task: any) {
  return (
    task?.result?.internal?.artifactSnapshot ||
    task?.result?.internal?.sessionState?.site_artifacts ||
    task?.result?.internal?.sessionState?.project_json ||
    task?.result?.internal?.inputState?.site_artifacts ||
    task?.result?.internal?.inputState?.project_json ||
    null
  );
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

export type PreviewScreenshotArtifact = {
  device: string;
  path: string;
  fullPage: boolean;
};

export type GenerationTraceSnapshot = ReturnType<typeof extractTaskGenerationTrace>;
export type GenerationTraceLike = Partial<GenerationTraceSnapshot> & { taskId?: string | null };

export function compareGenerationTraces(
  baseline: GenerationTraceLike | null | undefined,
  candidate: GenerationTraceLike | null | undefined,
  options?: {
    ignoreGenerationLane?: boolean;
  },
) {
  const baselineRoutes = Array.from(new Set((baseline?.routes || []).map((item) => normalizeRoute(item)).filter(Boolean))).sort();
  const candidateRoutes = Array.from(new Set((candidate?.routes || []).map((item) => normalizeRoute(item)).filter(Boolean))).sort();
  const baselineSeedSkills = Array.from(new Set((baseline?.selectedSeedSkillIds || []).map((item) => String(item || "").trim()).filter(Boolean))).sort();
  const candidateSeedSkills = Array.from(new Set((candidate?.selectedSeedSkillIds || []).map((item) => String(item || "").trim()).filter(Boolean))).sort();
  const baselineFiles = Array.from(new Set((baseline?.generatedFiles || []).map((item) => String(item || "").trim()).filter(Boolean))).sort();
  const candidateFiles = Array.from(new Set((candidate?.generatedFiles || []).map((item) => String(item || "").trim()).filter(Boolean))).sort();
  const contractHashMatch =
    Boolean(baseline?.contractHash) && Boolean(candidate?.contractHash) && baseline?.contractHash === candidate?.contractHash;
  const generationLaneMatch =
    options?.ignoreGenerationLane
      ? true
      : Boolean(baseline?.generationLane) &&
        Boolean(candidate?.generationLane) &&
        baseline?.generationLane === candidate?.generationLane;
  const websiteSurfaceModeMatch =
    Boolean(baseline?.websiteSurfaceMode) &&
    Boolean(candidate?.websiteSurfaceMode) &&
    baseline?.websiteSurfaceMode === candidate?.websiteSurfaceMode;
  const routeSetMatch = JSON.stringify(baselineRoutes) === JSON.stringify(candidateRoutes);
  const selectedSeedSkillsMatch = JSON.stringify(baselineSeedSkills) === JSON.stringify(candidateSeedSkills);
  const fileSetMatch = JSON.stringify(baselineFiles) === JSON.stringify(candidateFiles);
  const missingRoutes = baselineRoutes.filter((route) => !candidateRoutes.includes(route));
  const extraRoutes = candidateRoutes.filter((route) => !baselineRoutes.includes(route));
  const missingSeedSkills = baselineSeedSkills.filter((item) => !candidateSeedSkills.includes(item));
  const extraSeedSkills = candidateSeedSkills.filter((item) => !baselineSeedSkills.includes(item));
  const missingFiles = baselineFiles.filter((item) => !candidateFiles.includes(item));
  const extraFiles = candidateFiles.filter((item) => !baselineFiles.includes(item));
  const driftReasons = [
    ...(contractHashMatch ? [] : ["contract-hash"]),
    ...(generationLaneMatch ? [] : ["generation-lane"]),
    ...(websiteSurfaceModeMatch ? [] : ["website-surface-mode"]),
    ...(routeSetMatch ? [] : ["route-set"]),
    ...(selectedSeedSkillsMatch ? [] : ["seed-skills"]),
    ...(fileSetMatch ? [] : ["generated-files"]),
  ];
  const matchingAxes = [
    contractHashMatch,
    generationLaneMatch,
    websiteSurfaceModeMatch,
    routeSetMatch,
    selectedSeedSkillsMatch,
    fileSetMatch,
  ].filter(Boolean).length;
  return {
    baselineTaskId: baseline?.taskId || null,
    candidateTaskId: candidate?.taskId || null,
    baselineRoutes,
    candidateRoutes,
    baselineSeedSkills,
    candidateSeedSkills,
    contractHashMatch,
    generationLaneMatch,
    websiteSurfaceModeMatch,
    routeSetMatch,
    selectedSeedSkillsMatch,
    fileSetMatch,
    baselineFiles,
    candidateFiles,
    missingRoutes,
    extraRoutes,
    missingSeedSkills,
    extraSeedSkills,
    missingFiles,
    extraFiles,
    driftReasons,
    verdict:
      contractHashMatch &&
      generationLaneMatch &&
      websiteSurfaceModeMatch &&
      routeSetMatch &&
      selectedSeedSkillsMatch &&
      fileSetMatch
        ? "same_contract"
        : matchingAxes >= 4
          ? "partial_match"
          : "drifted",
  };
}

export type ReplayGenerationSummaryEntry = {
  summaryVersion: 1;
  sourceChatId: string | null;
  replayChatId: string | null;
  replayMode: "local" | "live";
  replayScenario: string;
  status: string | null;
  expectedTrace: GenerationTraceLike | null;
  generatedTrace: GenerationTraceLike | null;
  deployedTrace?: GenerationTraceLike | null;
  expectedToGeneratedComparison?: ReturnType<typeof compareGenerationTraces> | null;
  generatedToDeployedComparison?: ReturnType<typeof compareGenerationTraces> | null;
  updatedAt: string;
};

export function buildReplayGenerationSummaryEntry(params: {
  sourceChatId?: string | null;
  replayChatId?: string | null;
  replayMode: "local" | "live";
  replayScenario: string;
  status?: string | null;
  expectedTrace?: GenerationTraceLike | null;
  generatedTrace?: GenerationTraceLike | null;
  deployedTrace?: GenerationTraceLike | null;
  expectedToGeneratedComparison?: ReturnType<typeof compareGenerationTraces> | null;
  generatedToDeployedComparison?: ReturnType<typeof compareGenerationTraces> | null;
  updatedAt?: string;
}): ReplayGenerationSummaryEntry {
  return {
    summaryVersion: 1,
    sourceChatId: String(params.sourceChatId || "").trim() || null,
    replayChatId: String(params.replayChatId || "").trim() || null,
    replayMode: params.replayMode,
    replayScenario: String(params.replayScenario || "").trim() || "unspecified",
    status: String(params.status || "").trim() || null,
    expectedTrace: params.expectedTrace || null,
    generatedTrace: params.generatedTrace || null,
    deployedTrace: params.deployedTrace || null,
    expectedToGeneratedComparison: params.expectedToGeneratedComparison || null,
    generatedToDeployedComparison: params.generatedToDeployedComparison || null,
    updatedAt: String(params.updatedAt || "").trim() || new Date().toISOString(),
  };
}

export async function appendReplayGenerationSummaryEntry(
  entry: ReplayGenerationSummaryEntry,
  outputPath = path.resolve(process.cwd(), ".tmp", "replay-generation-summary.jsonl"),
) {
  const target = path.resolve(outputPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(entry)}\n`, "utf8");
  return target;
}

export type PreviewScreenshotQaResult = {
  previewUrl: string;
  artifacts: PreviewScreenshotArtifact[];
  executed: boolean;
  skippedReason?: string;
};

function pngLooksNonBlank(buffer: Buffer): boolean {
  if (!Buffer.isBuffer(buffer) || buffer.length < 64) return false;
  let zeroRuns = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0) zeroRuns += 1;
  }
  return zeroRuns / buffer.length < 0.985;
}

async function ensureFileLooksUsable(filePath: string) {
  const stat = await fs.stat(filePath);
  if (stat.size < 4_096) {
    throw new Error(`Screenshot artifact is unexpectedly small: ${filePath} (${stat.size} bytes)`);
  }
  const bytes = await fs.readFile(filePath);
  if (!pngLooksNonBlank(bytes)) {
    throw new Error(`Screenshot artifact appears blank or near-empty: ${filePath}`);
  }
}

export async function captureMobilePreviewScreenshots(params: {
  previewUrl: string;
  outputDir: string;
  devices?: string[];
  waitForTimeoutMs?: number;
  timeoutMs?: number;
}): Promise<PreviewScreenshotQaResult> {
  const previewUrl = String(params.previewUrl || "").trim();
  if (!previewUrl) {
    return {
      previewUrl,
      artifacts: [],
      executed: false,
      skippedReason: "Missing preview URL.",
    };
  }

  const outputDir = path.resolve(params.outputDir);
  const devices = (params.devices || ["iPhone 13", "Pixel 5"]).map((item) => String(item || "").trim()).filter(Boolean);
  const waitForTimeoutMs = Math.max(0, Number(params.waitForTimeoutMs || 2500));
  const timeoutMs = Math.max(5_000, Number(params.timeoutMs || 90_000));

  await fs.mkdir(outputDir, { recursive: true });

  try {
    await execFileAsync("pnpm", ["exec", "playwright", "--version"], {
      cwd: process.cwd(),
      timeout: 15_000,
      windowsHide: true,
      encoding: "utf8",
    });
  } catch (error) {
    return {
      previewUrl,
      artifacts: [],
      executed: false,
      skippedReason: `Playwright CLI unavailable: ${String((error as Error)?.message || error)}`,
    };
  }

  const artifacts: PreviewScreenshotArtifact[] = [];
  for (const device of devices) {
    const deviceSlug = device.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    for (const fullPage of [false, true]) {
      const filePath = path.join(outputDir, `${deviceSlug}${fullPage ? "-full" : "-viewport"}.png`);
      const args = [
        "exec",
        "playwright",
        "screenshot",
        previewUrl,
        filePath,
        "--browser",
        "chromium",
        "--device",
        device,
        "--timeout",
        String(timeoutMs),
        "--wait-for-timeout",
        String(waitForTimeoutMs),
      ];
      if (fullPage) args.push("--full-page");

      await execFileAsync("pnpm", args, {
        cwd: process.cwd(),
        timeout: timeoutMs + waitForTimeoutMs + 30_000,
        windowsHide: true,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      });

      await ensureFileLooksUsable(filePath);
      artifacts.push({ device, path: filePath, fullPage });
    }
  }

  return {
    previewUrl,
    artifacts,
    executed: true,
  };
}
