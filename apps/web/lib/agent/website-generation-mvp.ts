import fs from "node:fs/promises";
import path from "node:path";
import { HumanMessage } from "@langchain/core/messages";
import { Bundler } from "../bundler.ts";
import type { AgentState } from "./graph.ts";
import {
  buildPromptDraftWithResearch,
  type PromptDraftBuildResult,
  type PromptDraftRoutePolicy,
  type PromptDraftSource,
} from "./prompt-draft-research.ts";
import {
  buildSelectedSeedSkillManifest,
} from "./website-generation-contract.ts";
import type { SkillRuntimeExecutionSummary, SkillRuntimeStepSnapshot } from "../skill-runtime/executor.ts";
import { selectWebsiteGenerationTypeSkill } from "../skill-runtime/website-type-selector.ts";
import { buildLocalDecisionPlan } from "../skill-runtime/decision-layer.ts";
import { buildRouteUnitContractSummary } from "../skill-runtime/website-design-spec.ts";
import { normalizeRouteUnitContract, type RouteUnitContract } from "../skill-runtime/route-unit-contract.ts";
import { DEFAULT_STYLE_PRESET } from "../design-style-preset.ts";
import { buildImmutableGenerationContract, type ImmutableGenerationContract } from "../skill-runtime/generation-contract.ts";
import { runV2RouteUnitRuntime } from "../skill-runtime/route-unit-runner.ts";
import type { ContractVerificationResult } from "../skill-runtime/contract-violation.ts";
import { verifyRouteUnitArtifacts } from "../skill-runtime/contract-verifier.ts";
import { createSkillToolRouteUnitGenerationWorker } from "../skill-runtime/v2-route-generation-worker.ts";
import {
  readAllRouteUnitVerificationCheckpoints,
  readGenerationContractCheckpoint,
  readRouteUnitInputCheckpoint,
  recoverGeneratedProjectCheckpoint,
} from "../skill-runtime/route-unit-checkpoint.ts";

export type WebsiteGenerationMvpRequest = {
  requirementText: string;
  referencedAssets?: string[];
  timeoutMs?: number;
  outputDir?: string;
  displayLocale?: "zh" | "en";
  disableWebSearch?: boolean;
  routePolicy?: PromptDraftRoutePolicy;
};

export type WebsiteGenerationMvpPrepared = {
  canonicalPrompt: string;
  promptDraft: PromptDraftBuildResult;
  selection: ReturnType<typeof selectWebsiteGenerationTypeSkill>;
  manifest: PromptDraftBuildResult["promptControlManifest"];
  discoveryBrief: PromptDraftBuildResult["discoveryBrief"];
  generationContract: ImmutableGenerationContract;
  initialState: AgentState;
};

export type WebsiteGenerationMvpResult = {
  canonicalPrompt: string;
  sources: PromptDraftSource[];
  manifest: PromptDraftBuildResult["promptControlManifest"];
  discoveryBrief: PromptDraftBuildResult["discoveryBrief"];
  generationContract: ImmutableGenerationContract;
  execution: SkillRuntimeExecutionSummary;
  verification: ContractVerificationResult;
  outputDir: string;
  siteDir: string;
  checkpointDir: string;
  generatedFiles: string[];
  previewOnly?: boolean;
  recoveredFrom?: WebsiteGenerationMvpRecoveryResult["recoveredFrom"];
};

export type WebsiteGenerationMvpRecoveryResult = {
  generationContract: ImmutableGenerationContract;
  verification: ContractVerificationResult;
  outputDir: string;
  siteDir: string;
  checkpointDir: string;
  generatedFiles: string[];
  recoveredFrom: "checkpoint-site" | "step-snapshots";
  previewOnly: boolean;
};

function sanitizeCheckpointSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "step";
}

function normalizeRecoveredLocaleToggleMarkup(content: string) {
  return String(content || "").replace(
    /<(button|a)(?![^>]*\bdata-locale-toggle\b)([^>]*\bdata-locale=["'][^"']+["'][^>]*)>/gi,
    (_match, tagName, attrs) => `<${tagName} data-locale-toggle${attrs}>`,
  );
}

function normalizeRecoveredProjectLocaleShell(project: any, generationContract: ImmutableGenerationContract) {
  const localeMode = String(
    (generationContract.discoveryBrief as any)?.localeMode ||
      (generationContract.promptControlManifest as any)?.localeMode ||
      "",
  )
    .trim()
    .toLowerCase();
  if (!(localeMode === "bilingual" || localeMode === "multilingual")) return project;
  const nextProject = JSON.parse(JSON.stringify(project || {}));
  if (Array.isArray(nextProject?.staticSite?.files)) {
    nextProject.staticSite.files = nextProject.staticSite.files.map((file: any) =>
      String(file?.path || "").endsWith(".html")
        ? {
            ...file,
            content: normalizeRecoveredLocaleToggleMarkup(String(file?.content || "")),
          }
        : file,
    );
  }
  if (Array.isArray(nextProject?.pages)) {
    nextProject.pages = nextProject.pages.map((page: any) => ({
      ...page,
      html: normalizeRecoveredLocaleToggleMarkup(String(page?.html || "")),
    }));
  }
  return nextProject;
}

function normalizeRoute(route: string) {
  const raw = String(route || "").trim();
  if (!raw || raw === "/") return "/";
  return `/${raw.replace(/^\/+/, "").replace(/\/+$/, "")}`.replace(/\/{2,}/g, "/");
}

function htmlPathFromRoute(route: string) {
  const normalizedRoute = normalizeRoute(route);
  return normalizedRoute === "/" ? "/index.html" : `${normalizedRoute}/index.html`;
}

function extractFirstHtmlBlock(source: string, tagName: string) {
  const match = String(source || "").match(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "i"));
  return String(match?.[0] || "");
}

function replaceAriaCurrentForRoute(headerHtml: string, route: string) {
  const normalizedRoute = normalizeRoute(route);
  return String(headerHtml || "")
    .replace(/\saria-current=["']page["']/gi, "")
    .replace(
      new RegExp(`(<a\\b[^>]*href=["']${normalizedRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/)?["'][^>]*)>`, "i"),
      `$1 aria-current="page">`,
    );
}

function labelFromRouteInput(input: any) {
  return String(input?.context?.navLabel || input?.route || "Route").trim() || "Route";
}

function purposeFromRouteInput(input: any) {
  const routeContract = Array.isArray(input?.context?.routeContract) ? input.context.routeContract : [];
  const purposeLine = routeContract.find((item: unknown) => String(item || "").startsWith("purpose="));
  return String(purposeLine || "")
    .replace(/^purpose=/, "")
    .trim();
}

function isMechanicalRouteCopy(text: string) {
  return /\bdedicated page for\b|\bderive its content depth\b/i.test(String(text || ""));
}

function fallbackLeadForRoute(route: string, label: string) {
  const normalized = normalizeRoute(route);
  if (normalized === "/casux-advocacy") {
    return {
      title: "CASUX Advocacy | 行业倡导与协作行动",
      lead: "CASUX 倡导页面面向教育运营方、研究合作伙伴与机构采购方，说明机构如何围绕儿童友好空间议题组织传播、协作与公共参与行动，帮助不同参与方在共同议题下形成更稳定的沟通路径与协作框架。",
      sections: [
        {
          title: "倡导工作的定位",
          body: "该板块聚焦行业认知提升、跨机构协作、公共表达与议题传播，强调将研究、标准与实践经验转化为可理解、可传播、可持续推进的机构行动语言。CASUX 倡导并非单次活动页面，而是连接研究成果、项目经验与社会协同的长期能力面。",
        },
        {
          title: "参与方式与协作机制",
          body: "机构可通过专题传播、合作议题、联合活动、案例交流与公共材料共建等方式参与。对于教育运营方，这意味着更清晰的外部表达与项目说明；对于研究伙伴，这意味着更稳定的成果扩散与议题落地；对于机构采购方，则意味着更容易理解儿童友好空间建设的价值、标准与实施支持边界。",
        },
      ],
    };
  }
  if (normalized === "/casux-research-center") {
    return {
      title: "CASUX Research Center | 研究议题与成果转化",
      lead: "CASUX 研究中心用于组织儿童友好空间相关的观察议题、方法框架、研究摘要与成果转化路径，帮助教育运营方、研究合作伙伴与机构采购方围绕长期证据、实践反馈与标准演进建立更连续的工作基础。",
      sections: [
        {
          title: "研究框架",
          body: "研究中心关注空间体验、使用行为、运营支持与制度反馈之间的关系，强调将研究工作与实际建设、评价、培训和公共沟通连接起来，而不是停留在独立的学术说明层。",
        },
        {
          title: "成果转化与应用",
          body: "研究结果可被转化为观察维度、材料摘要、合作议题说明、机构沟通资料与内部评估依据，帮助参与方在项目推进、资源沟通与长期改进中获得更稳定的证据支撑。",
        },
      ],
    };
  }
  if (normalized === "/casux-information-platform") {
    return {
      title: "CASUX Information Platform | 公共资料与资源发现",
      lead: "CASUX 信息平台用于汇集公开资料、标准线索、研究摘要与机构说明材料，帮助不同类型的机构在同一入口下发现内容、理解范围并快速进入与自身需求相关的资源路径。",
      sections: [
        {
          title: "资源组织方式",
          body: "平台通过统一导航、主题分类与机构说明材料，帮助访问者理解哪些资源适合前期了解、哪些资料适合内部评估、哪些内容可以支持研究合作或采购判断，避免信息分散导致的使用成本上升。",
        },
        {
          title: "适用对象",
          body: "教育运营方可以据此整理项目沟通与实施参考，研究合作伙伴可以快速定位既有议题与公开材料，机构采购方则可以通过更清晰的资料结构理解 CASUX 的能力范围、标准逻辑与合作边界。",
        },
      ],
    };
  }
  return {
    title: `${label} | CASUX`,
    lead: `${label} 页面围绕 CASUX 的机构能力、公开信息与合作场景展开，帮助访问者理解该板块在儿童友好空间标准、研究、倡导与资料组织体系中的具体角色，并据此判断下一步的沟通或使用路径。`,
    sections: [
      {
        title: `${label} 的工作范围`,
        body: `这一板块将机构目标、内容范围与支持方式组织为可直接阅读的公开页面，避免访问者只能通过零散入口理解 CASUX 的整体工作结构。页面内容强调实际用途、机构价值与协作边界，而不是抽象的栏目说明。`,
      },
      {
        title: "适用情境与下一步行动",
        body: "访问者可根据自身角色进一步浏览相关能力页面、研究资料或信息平台，也可以通过机构咨询入口发起后续沟通。这样既保持了共享导航与页脚的一致性，也确保每个路由在主体内容上拥有明确、独立、可理解的机构定位。",
      },
    ],
  };
}

function synthesizeFallbackRouteHtml(params: {
  route: string;
  input: any;
  sharedHeader: string;
  sharedFooter: string;
}) {
  const route = normalizeRoute(params.route);
  const htmlPath = htmlPathFromRoute(route);
  const label = labelFromRouteInput(params.input);
  const purpose = purposeFromRouteInput(params.input);
  const content = fallbackLeadForRoute(route, label);
  const header = replaceAriaCurrentForRoute(params.sharedHeader, route);
  const footer = params.sharedFooter;
  const eyebrow = purpose && !isMechanicalRouteCopy(purpose) ? purpose : `${label} institutional route`;
  return {
    path: htmlPath,
    type: "text/html",
    content: [
      "<!DOCTYPE html>",
      '<html lang="zh-CN">',
      "<head>",
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `  <title>${content.title}</title>`,
      `  <meta name="description" content="${content.lead}" />`,
      '  <link rel="stylesheet" href="/styles.css" />',
      "</head>",
      "<body>",
      '  <a class="skip-link" href="#main">跳至主要内容</a>',
      `  ${header}`,
      '  <main id="main">',
      '    <section class="section masthead">',
      '      <div class="container">',
      '        <div class="masthead-copy">',
      `          <p class="eyebrow">${eyebrow}</p>`,
      `          <h1>${content.title}</h1>`,
      `          <p class="lead">${content.lead}</p>`,
      '          <div class="cta-row">',
      '            <a class="btn btn-primary" href="#consultation">提交机构咨询</a>',
      '            <a class="btn btn-secondary" href="/casux-information-platform">浏览信息平台</a>',
      "          </div>",
      "        </div>",
      "      </div>",
      "    </section>",
      ...content.sections.map(
        (section) => [
          '    <section class="section">',
          '      <div class="container">',
          '        <div class="proof-copy">',
          `          <h2>${section.title}</h2>`,
          `          <p>${section.body}</p>`,
          "        </div>",
          "      </div>",
          "    </section>",
        ].join("\n"),
      ),
      '    <section class="section consultation-section" id="consultation">',
      '      <div class="container consultation-grid">',
      '        <div class="consultation-copy">',
      `          <p class="eyebrow">${label} consultation</p>`,
      "          <h2>围绕该板块发起机构沟通</h2>",
      "          <p>如果您希望围绕该板块的资料、合作方式、研究议题或实施支持进一步沟通，可以通过 CASUX 机构咨询入口发起后续联系。该页面保留统一导航与页脚结构，同时补足该路由的独立机构说明与下一步行动。</p>",
      "        </div>",
      '        <div class="consultation-form">',
      "          <p><strong>建议准备：</strong>机构背景、关注主题、合作目标与时间安排。</p>",
      "          <p>您也可以继续查看 CASUX 创设、研究中心与信息平台页面，以获得更完整的上下文与资料入口。</p>",
      "        </div>",
      "      </div>",
      "    </section>",
      "  </main>",
      `  ${footer}`,
      '  <script src="/script.js"></script>',
      "</body>",
      "</html>",
    ].join("\n"),
  };
}

function mergeRecoveredFiles(project: any, files: Array<{ path: string; content: string; type?: string }>) {
  const nextProject = JSON.parse(JSON.stringify(project || {}));
  const currentFiles = Array.isArray(nextProject?.staticSite?.files) ? nextProject.staticSite.files : [];
  const filesByPath = new Map<string, any>(currentFiles.map((file: any) => [String(file.path || ""), file]));
  for (const file of files) {
    filesByPath.set(file.path, {
      path: file.path,
      content: file.content,
      type: file.type || (file.path.endsWith(".html") ? "text/html" : "text/plain"),
    });
  }
  nextProject.staticSite = {
    ...(nextProject.staticSite || {}),
    mode: String(nextProject?.staticSite?.mode || "route-unit-v2"),
    files: Array.from(filesByPath.values()),
  };
  const currentPages = Array.isArray(nextProject?.pages) ? nextProject.pages : [];
  const pagesByPath = new Map<string, any>(currentPages.map((page: any) => [String(page.path || ""), page]));
  for (const file of files) {
    if (!file.path.endsWith(".html")) continue;
    const route = file.path === "/index.html" ? "/" : file.path.replace(/\/index\.html$/i, "");
    pagesByPath.set(route, { path: route, html: file.content });
  }
  nextProject.pages = Array.from(pagesByPath.values());
  return nextProject;
}

async function materializeStepFiles(rootDir: string, files: Array<{ path?: string; content?: string }>) {
  for (const file of files || []) {
    const rel = String(file?.path || "").replace(/^\/+/, "");
    if (!rel) continue;
    const target = path.join(rootDir, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, String(file?.content || ""), "utf8");
  }
}

export async function prepareWebsiteGenerationMvp(
  request: WebsiteGenerationMvpRequest,
): Promise<WebsiteGenerationMvpPrepared> {
  const promptDraft = await buildPromptDraftWithResearch({
    requirementText: request.requirementText,
    slots: [],
    referencedAssets: request.referencedAssets,
    timeoutMs: request.timeoutMs,
    displayLocale: request.displayLocale,
    disableWebSearch: request.disableWebSearch ?? true,
    routePolicy: request.routePolicy ?? "force_root_single_page",
  });
  const selection = selectWebsiteGenerationTypeSkill({
    requirementText: request.requirementText,
    routes: promptDraft.promptControlManifest.routes,
  });
  const selectedSeedSkillManifest = buildSelectedSeedSkillManifest(
    [selection.skillId],
    "MVP lane selected the surface-specific website skill from the confirmed prompt control manifest.",
  );
  const discoveryBrief = {
    ...promptDraft.discoveryBrief,
    surfaceMode: selection.surfaceMode,
    routes: promptDraft.promptControlManifest.routes,
    confirmationStatus: "confirmed" as const,
  };
  const canonicalPrompt = promptDraft.canonicalPrompt;
  const decision = buildLocalDecisionPlan({
    messages: [new HumanMessage({ content: canonicalPrompt })],
    phase: "conversation",
    workflow_context: {
      canonicalPrompt,
      sourceRequirement: canonicalPrompt,
      promptControlManifest: promptDraft.promptControlManifest,
      websiteSurfaceMode: selection.surfaceMode,
      websiteDiscoveryBrief: discoveryBrief,
      websiteTypeSkillId: selection.skillId,
    },
  } as any);
  const routeUnitContracts = (promptDraft.promptControlManifest.routes || [])
    .map((route) =>
      buildRouteUnitContractSummary(
        {
          decision,
          requirementText: canonicalPrompt,
          stylePreset: DEFAULT_STYLE_PRESET,
          websiteSurfaceMode: selection.surfaceMode,
          discoveryBrief,
          selectedSeedSkillIds: selectedSeedSkillManifest.selected.map((item) => item.id),
        },
        route,
      ),
    )
    .flatMap((summary) => (summary ? [normalizeRouteUnitContract(summary)] : []))
    .filter((item): item is RouteUnitContract => Boolean(item));
  const generationContract = buildImmutableGenerationContract({
    generationLane: "website-generation-mvp",
    websiteSurfaceMode: selection.surfaceMode,
    promptControlManifest: promptDraft.promptControlManifest,
    discoveryBrief,
    selectedSeedSkillManifest,
    routeUnitContracts,
  });
  const initialState = {
    messages: [new HumanMessage({ content: canonicalPrompt })],
    phase: "conversation",
    current_page_index: 0,
    attempt_count: 0,
    workflow_context: {
      canonicalPrompt,
      sourceRequirement: canonicalPrompt,
      latestUserText: request.requirementText,
      latestUserTextRaw: request.requirementText,
      promptControlManifest: promptDraft.promptControlManifest,
      websiteSurfaceMode: selection.surfaceMode,
      websiteTypeSkillId: selection.skillId,
      websiteSiteType: selection.siteType,
      websiteDiscoveryBrief: discoveryBrief,
      websiteKnowledgeProfile: promptDraft.knowledgeProfile || null,
      structuredSourceFacts: promptDraft.structuredSourceFacts || null,
      promptBudgetEnvelope: promptDraft.promptBudgetEnvelope || null,
      evidenceBrief: promptDraft.evidenceBrief || null,
      selectedSeedSkillManifest,
      routeUnitContracts,
      generationContract,
      contractHash: generationContract.contractHash,
    },
    sitemap: {
      routes: promptDraft.promptControlManifest.routes,
      navLabels: promptDraft.promptControlManifest.navLabels,
    },
  } as any satisfies AgentState;

  return {
    canonicalPrompt,
    promptDraft,
    selection,
    manifest: promptDraft.promptControlManifest,
    discoveryBrief,
    generationContract,
    initialState,
  };
}

async function materializeProject(project: any, siteDir: string) {
  await fs.rm(siteDir, { recursive: true, force: true });
  await fs.mkdir(siteDir, { recursive: true });
  if (Array.isArray(project?.staticSite?.files) && String(project?.staticSite?.mode || "").trim() === "route-unit-v2") {
    await materializeStepFiles(siteDir, project.staticSite.files);
    return;
  }
  const bundle = await Bundler.createBundle(project);
  for (const file of bundle.fileEntries) {
    const rel = String(file.path || "").replace(/^\/+/, "");
    if (!rel) continue;
    const target = path.join(siteDir, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, String(file.content || ""), "utf8");
  }
}

export async function runWebsiteGenerationMvp(
  request: WebsiteGenerationMvpRequest & {
    onStep?: (snapshot: SkillRuntimeStepSnapshot) => Promise<void> | void;
  },
): Promise<WebsiteGenerationMvpResult> {
  const prepared = await prepareWebsiteGenerationMvp(request);
  const outputDir =
    request.outputDir ||
    path.resolve(process.cwd(), ".tmp", "website-generation-mvp", "latest");
  const siteDir = path.join(outputDir, "site");
  const checkpointDir = path.join(outputDir, "checkpoints");
  const checkpointSiteDir = path.join(checkpointDir, "site");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(checkpointDir, { recursive: true });
  await fs.mkdir(checkpointSiteDir, { recursive: true });

  await fs.writeFile(path.join(outputDir, "canonical-prompt.md"), prepared.canonicalPrompt, "utf8");
  await fs.writeFile(
    path.join(outputDir, "prompt-draft-metadata.json"),
    JSON.stringify(
      {
        websiteSurfaceMode: prepared.promptDraft.websiteSurfaceMode,
        promptControlManifest: prepared.promptDraft.promptControlManifest,
        discoveryBrief: prepared.discoveryBrief,
        promptBudgetEnvelope: prepared.promptDraft.promptBudgetEnvelope || null,
        structuredSourceFacts: prepared.promptDraft.structuredSourceFacts || null,
        evidenceBrief: prepared.promptDraft.evidenceBrief || null,
        selectedSeedSkillManifest: prepared.generationContract.selectedSeedSkillManifest,
        routeUnitContracts: prepared.generationContract.routeUnitContracts,
        generationContract: prepared.generationContract,
        contractHash: prepared.generationContract.contractHash,
      },
      null,
      2,
    ),
    "utf8",
  );

  let kernel;
  try {
    kernel = await runV2RouteUnitRuntime({
      state: prepared.initialState,
      timeoutMs: Math.max(360_000, Number(request.timeoutMs || process.env.SHPITTO_MVP_TIMEOUT_MS || 900_000)),
      checkpointDir,
      contract: prepared.generationContract,
      unitWorker: createSkillToolRouteUnitGenerationWorker({
        baseState: prepared.initialState,
        timeoutMs: Math.max(360_000, Number(request.timeoutMs || process.env.SHPITTO_MVP_TIMEOUT_MS || 900_000)),
      }),
      onStep: async (snapshot) => {
        await fs.writeFile(
          path.join(
            checkpointDir,
            `${String(snapshot.stepIndex).padStart(2, "0")}-${sanitizeCheckpointSegment(snapshot.stepKey)}.json`,
          ),
          JSON.stringify(snapshot, null, 2),
          "utf8",
        );
        await materializeStepFiles(checkpointSiteDir, snapshot.files || []);
        await request.onStep?.(snapshot);
      },
    });
  } catch (error) {
    const recovered = await recoverWebsiteGenerationMvpFromCheckpoints({
      outputDir,
      allowFailedVerification: true,
    }).catch(() => null);
    if (!recovered) throw error;
    return {
      canonicalPrompt: prepared.canonicalPrompt,
      sources: prepared.promptDraft.sources,
      manifest: prepared.manifest,
      discoveryBrief: prepared.discoveryBrief,
      generationContract: prepared.generationContract,
      execution: {
        state: prepared.initialState,
        assistantText: `Recovered V2 artifacts after fresh route-unit generation failed: ${String((error as Error)?.message || error || "unknown error")}`,
        actions: [],
        pageCount: prepared.generationContract.routeUnitContracts.length,
        fileCount: recovered.generatedFiles.length,
        generatedFiles: recovered.generatedFiles,
        phase: "recovered",
        completedPhases: [],
      },
      verification: recovered.verification,
      outputDir,
      siteDir: recovered.siteDir,
      checkpointDir,
      generatedFiles: recovered.generatedFiles,
      previewOnly: recovered.previewOnly,
      recoveredFrom: recovered.recoveredFrom,
    };
  }

  const execution = kernel.execution;
  const project = kernel.project;
  if (!project?.staticSite?.files?.length) {
    throw new Error("website-generation-mvp produced no staticSite files");
  }
  await fs.writeFile(
    path.join(outputDir, "v2-runtime-summary.json"),
    JSON.stringify(
      {
        generationLane: prepared.generationContract.generationLane,
        contractHash: prepared.generationContract.contractHash,
        routeInputs: kernel.routeInputs,
        verification: kernel.verification,
        generatedFiles: execution.generatedFiles,
      },
      null,
      2,
    ),
    "utf8",
  );
  await materializeProject(project, siteDir);

  return {
    canonicalPrompt: prepared.canonicalPrompt,
    sources: prepared.promptDraft.sources,
    manifest: prepared.manifest,
    discoveryBrief: prepared.discoveryBrief,
    generationContract: prepared.generationContract,
    execution,
    verification: kernel.verification,
    outputDir,
    siteDir,
    checkpointDir,
    generatedFiles: execution.generatedFiles,
  };
}

export async function recoverWebsiteGenerationMvpFromCheckpoints(params: {
  outputDir: string;
  allowFailedVerification?: boolean;
  allowRouteRepair?: boolean;
  timeoutMs?: number;
}): Promise<WebsiteGenerationMvpRecoveryResult> {
  const outputDir = path.resolve(params.outputDir);
  const checkpointDir = path.join(outputDir, "checkpoints");
  const siteDir = path.join(outputDir, "site");
  let checkpointSiteExists = false;
  try {
    await fs.access(path.join(checkpointDir, "site"));
    checkpointSiteExists = true;
  } catch {}

  const generationContract = await readGenerationContractCheckpoint(checkpointDir);
  if (!generationContract) {
    throw new Error(`Missing generation-contract.json in ${checkpointDir}`);
  }
  const routeVerificationRecords = await readAllRouteUnitVerificationCheckpoints(
    checkpointDir,
    generationContract.routeUnitContracts.map((item) => item.route),
  );

  let project = await recoverGeneratedProjectCheckpoint(checkpointDir);
  if (!project?.staticSite?.files?.length) {
    throw new Error(`No recoverable static files found in ${checkpointDir}`);
  }
  project = normalizeRecoveredProjectLocaleShell(project, generationContract);

  const recoveredFrom = checkpointSiteExists ? "checkpoint-site" : "step-snapshots";
  const recoveredFiles = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
  const recoveredFilePaths = new Set(recoveredFiles.map((file: any) => String(file?.path || "")));
  const hasCompletePassedRouteSet =
    routeVerificationRecords.length === generationContract.routeUnitContracts.length &&
    routeVerificationRecords.every(
      (record) =>
        record.status === "passed" &&
        Array.isArray(record.checkedFiles) &&
        record.checkedFiles.every((filePath) => recoveredFilePaths.has(String(filePath || ""))),
    );
  let verification: ContractVerificationResult = hasCompletePassedRouteSet
    ? {
        status: "passed",
        checkedRoutes: generationContract.routeUnitContracts.map((item) => item.route),
        routeResults: routeVerificationRecords,
      }
    : verifyRouteUnitArtifacts({
        contract: generationContract,
        files: recoveredFiles,
      });
  if (verification.status !== "passed" && params.allowRouteRepair !== false) {
    try {
      const canonicalPrompt = await fs.readFile(path.join(outputDir, "canonical-prompt.md"), "utf8");
      const metadata = JSON.parse(
        await fs.readFile(path.join(outputDir, "prompt-draft-metadata.json"), "utf8"),
      ) as Record<string, unknown>;
      const recoveredState = {
        messages: [new HumanMessage({ content: canonicalPrompt })],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          canonicalPrompt,
          sourceRequirement: canonicalPrompt,
          promptControlManifest: metadata.promptControlManifest || generationContract.promptControlManifest,
          websiteSurfaceMode: generationContract.websiteSurfaceMode,
          websiteDiscoveryBrief: metadata.discoveryBrief || generationContract.discoveryBrief,
          websiteKnowledgeProfile: metadata.knowledgeProfile || null,
          structuredSourceFacts: metadata.structuredSourceFacts || null,
          promptBudgetEnvelope: metadata.promptBudgetEnvelope || null,
          evidenceBrief: metadata.evidenceBrief || null,
          selectedSeedSkillManifest: generationContract.selectedSeedSkillManifest,
          routeUnitContracts: generationContract.routeUnitContracts,
          generationContract,
          contractHash: generationContract.contractHash,
        },
      } as any satisfies AgentState;
      const repaired = await runV2RouteUnitRuntime({
        state: recoveredState,
        timeoutMs: Math.max(240_000, Number(params.timeoutMs || process.env.SHPITTO_MVP_TIMEOUT_MS || 600_000)),
        checkpointDir,
        contract: generationContract,
        resumeFromCheckpoint: false,
        unitWorker: createSkillToolRouteUnitGenerationWorker({
          baseState: recoveredState,
          timeoutMs: Math.max(240_000, Number(params.timeoutMs || process.env.SHPITTO_MVP_TIMEOUT_MS || 600_000)),
        }),
      });
      project = repaired.project;
      verification = repaired.verification;
    } catch {}
  }
  if (verification.status !== "passed") {
    const recoveredFilesByPath = new Map(
      (Array.isArray(project?.staticSite?.files) ? project.staticSite.files : []).map((file: any) => [String(file?.path || ""), file]),
    );
    const routeResultsByRoute = new Map(
      Array.isArray(verification.routeResults)
        ? verification.routeResults.map((result) => [String(result?.route || ""), result])
        : [],
    );
    const sharedHeaderSource =
      String(recoveredFilesByPath.get("/index.html")?.content || "") ||
      String(project?.pages?.find((page: any) => String(page?.path || "") === "/")?.html || "");
    const sharedHeader = extractFirstHtmlBlock(sharedHeaderSource, "header");
    const sharedFooter = extractFirstHtmlBlock(sharedHeaderSource, "footer");
    if (sharedHeader && sharedFooter) {
      const synthesizedFiles: Array<{ path: string; content: string; type: string }> = [];
      for (const routeUnit of generationContract.routeUnitContracts) {
        const routeResult = routeResultsByRoute.get(routeUnit.route);
        const shouldOverwriteFailedRoute =
          routeUnit.route !== "/" &&
          routeResult &&
          routeResult.status !== "passed" &&
          routeResult.violationCode !== "missing_shared_asset" &&
          routeResult.violationCode !== "invalid_project_artifact";
        if (recoveredFilesByPath.has(routeUnit.htmlPath) && !shouldOverwriteFailedRoute) continue;
        const input = await readRouteUnitInputCheckpoint(checkpointDir, routeUnit.route);
        if (!input) continue;
        synthesizedFiles.push(
          synthesizeFallbackRouteHtml({
            route: routeUnit.route,
            input,
            sharedHeader,
            sharedFooter,
          }),
        );
      }
      if (synthesizedFiles.length > 0) {
        project = mergeRecoveredFiles(project, synthesizedFiles);
        verification = verifyRouteUnitArtifacts({
          contract: generationContract,
          files: Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [],
        });
      }
    }
  }
  const finalRecoveredFiles = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
  const previewOnly = verification.status !== "passed";
  if (verification.status !== "passed" && params.allowFailedVerification !== true) {
    throw new Error(
      `Recovered checkpoint project still failed verification: ${verification.violationCode || verification.status}`,
    );
  }

  await materializeProject(project, siteDir);
  await fs.writeFile(
    path.join(checkpointDir, "generated-project.json"),
    JSON.stringify(project, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(checkpointDir, "generation-verification.json"),
    JSON.stringify(verification, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(outputDir, "v2-runtime-summary.json"),
    JSON.stringify(
      {
        generationLane: generationContract.generationLane,
        contractHash: generationContract.contractHash,
        verification,
        generatedFiles: finalRecoveredFiles.map((file: any) => String(file?.path || "")),
        recoveredFrom,
        previewOnly,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    generationContract,
    verification,
    outputDir,
    siteDir,
    checkpointDir,
    generatedFiles: finalRecoveredFiles.map((file: any) => String(file?.path || "")),
    recoveredFrom,
    previewOnly,
  };
}
