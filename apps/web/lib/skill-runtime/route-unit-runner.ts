import type { AgentState } from "../agent/graph.ts";
import type { SkillRuntimeExecutionSummary, SkillRuntimeStepSnapshot } from "./executor.ts";
import { GenerationContractViolationError, type ContractVerificationResult } from "./contract-violation.ts";
import { verifyRouteUnitArtifacts } from "./contract-verifier.ts";
import type { ImmutableGenerationContract } from "./generation-contract.ts";
import { normalizeWebsiteGenerationContract } from "./generation-contract.ts";
import {
  buildGenerationUnitInputFromRouteContract,
  type GenerationWorkerAdapter,
  type GenerationRuntimeWorker,
  type GenerationUnitInput,
} from "./generation-worker-adapter.ts";
import {
  readAllRouteUnitVerificationCheckpoints,
  readGeneratedProjectCheckpoint,
  readGenerationContractCheckpoint,
  readGenerationExecutionCheckpoint,
  readGenerationVerificationCheckpoint,
  recoverGeneratedProjectCheckpoint,
  writeGeneratedProjectCheckpoint,
  writeGenerationContractCheckpoint,
  writeGenerationExecutionCheckpoint,
  writeGenerationVerificationCheckpoint,
  writeRouteUnitInputCheckpoint,
  writeRouteUnitVerificationCheckpoint,
} from "./route-unit-checkpoint.ts";

export type V2RouteUnitRuntimeParams = {
  state: AgentState;
  timeoutMs: number;
  checkpointDir: string;
  contract: ImmutableGenerationContract;
  unitWorker?: GenerationWorkerAdapter;
  worker?: GenerationRuntimeWorker;
  generate?: (params: {
    state: AgentState;
    timeoutMs: number;
    onStep?: (snapshot: SkillRuntimeStepSnapshot) => Promise<void> | void;
  }) => Promise<SkillRuntimeExecutionSummary>;
  onStep?: (snapshot: SkillRuntimeStepSnapshot) => Promise<void> | void;
  resumeFromCheckpoint?: boolean;
  baselineProject?: any;
};

export type V2RouteUnitRuntimeResult = {
  contract: ImmutableGenerationContract;
  routeInputs: GenerationUnitInput[];
  execution: SkillRuntimeExecutionSummary;
  verification: ContractVerificationResult;
  project: any;
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function normalizePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  const normalized = (raw.startsWith("/") ? raw : `/${raw}`).replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  return normalized === "/" ? "/" : normalized.replace(/\/+$/g, "") || "/";
}

function resolveGeneratedProject(execution: SkillRuntimeExecutionSummary) {
  return (execution.state as any)?.site_artifacts || null;
}

function resolveGeneratedFiles(project: any): Array<{ path?: string; content?: string; type?: string }> {
  return Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
}

function mergeSavedRouteArtifacts(params: {
  contract: ImmutableGenerationContract;
  currentProject: any;
  savedProject?: any;
  savedRouteVerifications: Array<{ route?: string; htmlPath?: string; status?: string }>;
}) {
  if (!params.savedProject || params.savedRouteVerifications.length === 0) return params.currentProject;
  const nextProject = cloneJson(
    params.currentProject || {
      projectId: "recovered-partial-site",
      pages: [],
      staticSite: { mode: "skill-direct", files: [] },
    },
  );
  const currentFiles = Array.isArray(nextProject?.staticSite?.files) ? nextProject.staticSite.files : [];
  const savedFiles = Array.isArray(params.savedProject?.staticSite?.files) ? params.savedProject.staticSite.files : [];
  const currentByPath = new Map<string, any>(
    currentFiles.map((file: any) => [normalizePath(String(file?.path || "")), file]),
  );
  const savedByPath = new Map<string, any>(
    savedFiles.map((file: any) => [normalizePath(String(file?.path || "")), file]),
  );

  for (const sharedPath of ["/styles.css", "/script.js", "/i18n/messages.en.json", "/i18n/messages.zh-CN.json"]) {
    if (!currentByPath.has(sharedPath) && savedByPath.has(sharedPath)) {
      currentByPath.set(sharedPath, cloneJson(savedByPath.get(sharedPath)));
    }
  }

  const recoverableRoutes = new Set(
    params.savedRouteVerifications
      .filter((entry) => entry.status === "passed")
      .map((entry) => String(entry.route || "").trim())
      .filter(Boolean),
  );
  for (const routeUnit of params.contract.routeUnitContracts) {
    if (!recoverableRoutes.has(routeUnit.route)) continue;
    if (currentByPath.has(routeUnit.htmlPath)) continue;
    const savedHtml = savedByPath.get(routeUnit.htmlPath);
    if (savedHtml) {
      currentByPath.set(routeUnit.htmlPath, cloneJson(savedHtml));
    }
  }

  nextProject.staticSite = {
    ...(nextProject.staticSite || {}),
    mode: String(nextProject?.staticSite?.mode || params.savedProject?.staticSite?.mode || "skill-direct"),
    files: Array.from(currentByPath.values()),
  };

  const currentPages = Array.isArray(nextProject?.pages) ? nextProject.pages : [];
  const savedPages = Array.isArray(params.savedProject?.pages) ? params.savedProject.pages : [];
  const currentPagesByPath = new Map<string, any>(currentPages.map((page: any) => [normalizePath(String(page?.path || "")), page]));
  const savedPagesByPath = new Map<string, any>(savedPages.map((page: any) => [normalizePath(String(page?.path || "")), page]));
  for (const routeUnit of params.contract.routeUnitContracts) {
    if (!recoverableRoutes.has(routeUnit.route)) continue;
    if (currentPagesByPath.has(routeUnit.route)) continue;
    const savedPage = savedPagesByPath.get(routeUnit.route);
    if (savedPage) currentPagesByPath.set(routeUnit.route, cloneJson(savedPage));
  }
  nextProject.pages = Array.from(currentPagesByPath.values());
  return nextProject;
}

function createEmptyGeneratedProject() {
  return {
    projectId: "v2-route-unit-site",
    pages: [],
    staticSite: {
      mode: "route-unit-v2",
      files: [],
    },
  };
}

function normalizeLocaleToggleMarkup(content: string) {
  return String(content || "").replace(
    /<(button|a)(?![^>]*\bdata-locale-toggle\b)([^>]*\bdata-locale=["'][^"']+["'][^>]*)>/gi,
    (_match, tagName, attrs) => `<${tagName} data-locale-toggle${attrs}>`,
  );
}

function normalizeGeneratedFileContent(params: {
  path: string;
  content: string;
  contract?: ImmutableGenerationContract;
}) {
  const normalizedPath = normalizePath(params.path);
  let content = String(params.content || "");
  const localeMode = String(
    (params.contract?.discoveryBrief as any)?.localeMode ||
      (params.contract?.promptControlManifest as any)?.localeMode ||
      "",
  )
    .trim()
    .toLowerCase();
  if (normalizedPath.endsWith(".html") && (localeMode === "bilingual" || localeMode === "multilingual")) {
    content = normalizeLocaleToggleMarkup(content);
  }
  return content;
}

function mergeGeneratedFilesIntoProject(params: {
  project: any;
  files: Array<{ path?: string; content?: string; type?: string }>;
  contract?: ImmutableGenerationContract;
}) {
  const nextProject = cloneJson(params.project || createEmptyGeneratedProject());
  const currentFiles = Array.isArray(nextProject?.staticSite?.files) ? nextProject.staticSite.files : [];
  const filesByPath = new Map<string, any>(currentFiles.map((file: any) => [normalizePath(String(file?.path || "")), file]));
  for (const file of params.files || []) {
    const normalizedPath = normalizePath(String(file?.path || ""));
    if (!normalizedPath || normalizedPath === "/") continue;
    filesByPath.set(normalizedPath, {
      path: normalizedPath,
      content: normalizeGeneratedFileContent({
        path: normalizedPath,
        content: String(file?.content || ""),
        contract: params.contract,
      }),
      type: String(file?.type || ""),
    });
  }
  nextProject.staticSite = {
    ...(nextProject.staticSite || {}),
    mode: String(nextProject?.staticSite?.mode || "route-unit-v2"),
    files: Array.from(filesByPath.values()),
  };

  const currentPages = Array.isArray(nextProject?.pages) ? nextProject.pages : [];
  const pagesByPath = new Map<string, any>(currentPages.map((page: any) => [normalizePath(String(page?.path || "")), page]));
  for (const file of params.files || []) {
    const normalizedPath = normalizePath(String(file?.path || ""));
    if (!normalizedPath.endsWith(".html")) continue;
      const route =
        normalizedPath === "/index.html"
          ? "/"
          : normalizedPath.replace(/\/index\.html$/i, "") || "/";
      pagesByPath.set(route, {
        path: route,
        html: normalizeGeneratedFileContent({
          path: normalizedPath,
          content: String(file?.content || ""),
          contract: params.contract,
        }),
      });
    }
  nextProject.pages = Array.from(pagesByPath.values());
  return nextProject;
}

function resolveRouteScopedTargetFiles(contract: ImmutableGenerationContract, route: string, htmlPath: string): string[] {
  const normalizedRoute = normalizePath(route);
  const sharedTargets = normalizedRoute === "/" ? ["/styles.css", "/script.js"] : [];
  const localeMode = String(
    (contract.discoveryBrief as any)?.localeMode ||
      (contract.discoveryBrief as any)?.preferredLocale ||
      (contract.promptControlManifest as any)?.localeMode ||
      "",
  )
    .trim()
    .toLowerCase();
  if (normalizedRoute === "/" && localeMode === "bilingual") {
    sharedTargets.push("/i18n/messages.en.json", "/i18n/messages.zh-CN.json");
  }
  return [htmlPath, ...sharedTargets];
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function buildRepairHints(record: { violationCode?: string; evidence?: string[]; route?: string }) {
  const hints: string[] = [];
  if (record.violationCode === "homepage_topology_mismatch") {
    hints.push("Remove generic split-hero geometry from the homepage opening.");
    hints.push("Do not use hero-grid, equal-column copy/media shell, right-side visual rail, or proof image figure inside the masthead.");
    hints.push("Use a route-owned stacked or asymmetrical institutional masthead before the capability overview shelves.");
    hints.push("Lead with brand overview copy, then capability shelves, then standards/research proof, then consultation or route CTA.");
  }
  if (record.violationCode === "homepage_semantic_mismatch") {
    hints.push("Do not describe the homepage as a gateway, entry point, route map, or site organization explainer.");
    hints.push("Rewrite the first screen as an official institutional overview with concrete public value.");
  }
  if (record.violationCode === "shared_shell_drift") {
    hints.push("Preserve the shared shell exactly: header, nav route set, and footer must match the baseline route.");
  }
  if (record.violationCode === "locale_shell_mismatch") {
    hints.push("Preserve the locale shell exactly and emit the required locale controls/catalogs.");
  }
  for (const evidence of normalizeStringList(record.evidence).slice(0, 2)) {
    hints.push(`Verifier evidence: ${evidence}`);
  }
  if (record.route) {
    hints.push(`Repair only route ${record.route}; do not widen scope to other routes.`);
  }
  return Array.from(new Set(hints));
}

function buildRepairInput(input: GenerationUnitInput, record: { violationCode?: string; evidence?: string[]; route?: string }) {
  const repairHints = buildRepairHints(record);
  return {
    ...input,
    prompt: [
      String(input.prompt || "").trim(),
      "Repair this route unit to satisfy the verifier.",
      ...repairHints.map((hint) => `- ${hint}`),
    ]
      .filter(Boolean)
      .join("\n"),
    context: {
      ...(input.context || {}),
      repairAttempt: true,
      repairViolationCode: String(record.violationCode || "").trim() || undefined,
      repairHints,
    },
  } satisfies GenerationUnitInput;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function runV2RouteUnitRuntime(params: V2RouteUnitRuntimeParams): Promise<V2RouteUnitRuntimeResult> {
  const contract = normalizeWebsiteGenerationContract(params.contract);
  const routeInputs = contract.routeUnitContracts.map((summary) =>
    buildGenerationUnitInputFromRouteContract({
      summary,
      targetFiles: resolveRouteScopedTargetFiles(contract, summary.route, summary.htmlPath),
      context: {
        contractHash: contract.contractHash,
        websiteSurfaceMode: contract.websiteSurfaceMode,
        generationLane: contract.generationLane,
      },
    }),
  );

  const [savedContract, savedVerification, savedExecution, savedProjectFromCheckpoint, recoveredProjectFromSnapshots] = await Promise.all([
    readGenerationContractCheckpoint(params.checkpointDir),
    readGenerationVerificationCheckpoint(params.checkpointDir),
    readGenerationExecutionCheckpoint(params.checkpointDir),
    readGeneratedProjectCheckpoint(params.checkpointDir),
    recoverGeneratedProjectCheckpoint(params.checkpointDir),
  ]);
  const savedProject: any =
    Array.isArray((savedProjectFromCheckpoint as any)?.staticSite?.files) &&
    ((savedProjectFromCheckpoint as any).staticSite.files as any[]).length > 0
      ? savedProjectFromCheckpoint
      : recoveredProjectFromSnapshots;
  const savedRouteVerifications = await readAllRouteUnitVerificationCheckpoints(
    params.checkpointDir,
    contract.routeUnitContracts.map((item) => item.route),
  );

  if (params.resumeFromCheckpoint !== false) {
    if (
      savedContract?.contractHash === contract.contractHash &&
      savedVerification?.status === "passed" &&
      savedRouteVerifications.length === contract.routeUnitContracts.length &&
      savedExecution &&
      savedProject
    ) {
      return {
        contract,
        routeInputs,
        execution: savedExecution,
        verification: savedVerification,
        project: savedProject,
      };
    }
  }

  await writeGenerationContractCheckpoint(params.checkpointDir, contract);
  for (const input of routeInputs) {
    await writeRouteUnitInputCheckpoint(params.checkpointDir, input.route || input.unitId, input);
  }

  if (params.unitWorker) {
    const matchingSavedContract = savedContract?.contractHash === contract.contractHash;
    const savedProjectFiles = Array.isArray(savedProject?.staticSite?.files) ? savedProject.staticSite.files : [];
    const savedProjectPaths = new Set(
      savedProjectFiles.map((file: any) => normalizePath(String(file?.path || ""))).filter(Boolean),
    );
    const recoverableRoutes = new Set(
      (matchingSavedContract ? savedRouteVerifications : [])
        .filter(
          (entry) =>
            entry.status === "passed" &&
            savedProjectPaths.has(normalizePath(String(entry.htmlPath || ""))),
        )
        .map((entry) => String(entry.route || "").trim())
        .filter(Boolean),
    );
    const pendingInputs = routeInputs.filter((input) => !recoverableRoutes.has(String(input.route || "").trim()));
    let project: any = mergeSavedRouteArtifacts({
      contract,
      currentProject: createEmptyGeneratedProject(),
      savedProject: matchingSavedContract ? savedProject : undefined,
      savedRouteVerifications: matchingSavedContract ? savedRouteVerifications : [],
    });
    let completedUnits = 0;
    const concurrency = Math.max(1, Number(process.env.SHPITTO_ROUTE_UNIT_CONCURRENCY || 3));
    for (const inputChunk of chunkArray(pendingInputs, concurrency)) {
      const results = await Promise.all(
        inputChunk.map(async (input) => ({
          input,
          result: await params.unitWorker!.runUnit(input),
        })),
      );
      for (const { input, result } of results) {
        if (result.status !== "passed") {
          throw new Error(result.issues?.join("; ") || result.summary || `Route unit ${input.unitId} failed.`);
        }
        project = mergeGeneratedFilesIntoProject({
          project,
          files: result.files,
          contract,
        });
        completedUnits += 1;
        await params.onStep?.({
          stepKey: String(input.route || input.unitId),
          stepIndex: completedUnits,
          totalSteps: Math.max(1, pendingInputs.length),
          status: "generated",
          files: Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [],
          workflowArtifacts: [],
          pages: Array.isArray(project?.pages) ? project.pages : [],
          preferredLocale:
            String(((params.state.workflow_context || {}) as any)?.preferredLocale || "").trim().toLowerCase() === "zh-cn"
              ? "zh-CN"
              : "en",
        });
      }
    }

    const generatedFiles = resolveGeneratedFiles(project).map((file) => String(file?.path || ""));
    const execution: SkillRuntimeExecutionSummary = {
      state: {
        ...(params.state as any),
        phase: "end",
        site_artifacts: project,
        project_json: project,
      } as any,
      assistantText:
        pendingInputs.length === 0
          ? "Reused verified route-unit artifacts from checkpoint."
          : `Generated ${pendingInputs.length} route units and merged them into the V2 site artifact.`,
      actions: [],
      pageCount: Array.isArray(project?.pages) ? project.pages.length : 0,
      fileCount: generatedFiles.length,
      generatedFiles,
      phase: "end",
      completedPhases: [],
    };
    await writeGenerationExecutionCheckpoint(params.checkpointDir, execution);
    await writeGeneratedProjectCheckpoint(params.checkpointDir, project);
    let verification = verifyRouteUnitArtifacts({
      contract,
      files: resolveGeneratedFiles(project),
      baselineFiles: resolveGeneratedFiles(params.baselineProject),
    });
    if (verification.status !== "passed" && Array.isArray(verification.routeResults) && verification.routeResults.length > 0) {
      const retryableRecords = verification.routeResults.filter(
        (record) =>
          record.status === "contract_violation" &&
          ["homepage_topology_mismatch", "homepage_semantic_mismatch", "shared_shell_drift", "locale_shell_mismatch"].includes(
            String(record.violationCode || ""),
          ),
      );
      if (retryableRecords.length > 0) {
        const inputByRoute = new Map(routeInputs.map((input) => [String(input.route || "").trim(), input]));
        let repairedProject = project;
        let repairedAnyRoute = false;
        for (const record of retryableRecords) {
          const route = String(record.route || "").trim();
          const baseInput = inputByRoute.get(route);
          if (!baseInput) continue;
          const repairResult = await params.unitWorker.runUnit(buildRepairInput(baseInput, record));
          if (repairResult.status !== "passed") continue;
          repairedProject = mergeGeneratedFilesIntoProject({
            project: repairedProject,
            files: repairResult.files,
            contract,
          });
          repairedAnyRoute = true;
        }
        if (repairedAnyRoute) {
          project = repairedProject;
          execution.state = {
            ...(execution.state as any),
            site_artifacts: project,
            project_json: project,
          } as any;
          execution.generatedFiles = resolveGeneratedFiles(project).map((file) => String(file?.path || ""));
          execution.fileCount = execution.generatedFiles.length;
          execution.assistantText = `${String(execution.assistantText || "").trim()}\nApplied targeted route-unit repair after verifier feedback.`
            .trim();
          await writeGenerationExecutionCheckpoint(params.checkpointDir, execution);
          await writeGeneratedProjectCheckpoint(params.checkpointDir, project);
          verification = verifyRouteUnitArtifacts({
            contract,
            files: resolveGeneratedFiles(project),
            baselineFiles: resolveGeneratedFiles(params.baselineProject),
          });
        }
      }
    }
    await writeGenerationVerificationCheckpoint(params.checkpointDir, verification);
    for (const record of verification.routeResults || []) {
      await writeRouteUnitVerificationCheckpoint(params.checkpointDir, record);
    }
    if (verification.status !== "passed") {
      throw new GenerationContractViolationError(verification);
    }
    return {
      contract,
      routeInputs,
      execution,
      verification,
      project,
    };
  }

  const generationWorker = params.worker;
  const generateFn =
    generationWorker?.runGeneration ||
    params.generate ||
    null;
  if (!generateFn) {
    throw new Error("runV2RouteUnitRuntime requires either a generation worker or a generate function.");
  }

  const execution = await generateFn({
    state: params.state,
    timeoutMs: params.timeoutMs,
    onStep: params.onStep,
  });
  await writeGenerationExecutionCheckpoint(params.checkpointDir, execution);
  const project = mergeSavedRouteArtifacts({
    contract,
    currentProject: resolveGeneratedProject(execution),
    savedProject: savedContract?.contractHash === contract.contractHash ? savedProject : undefined,
    savedRouteVerifications: savedContract?.contractHash === contract.contractHash ? savedRouteVerifications : [],
  });
  await writeGeneratedProjectCheckpoint(params.checkpointDir, project);
  const files = resolveGeneratedFiles(project);
  const verification = verifyRouteUnitArtifacts({
    contract,
    files,
    baselineFiles: resolveGeneratedFiles(params.baselineProject),
  });

  await writeGenerationVerificationCheckpoint(params.checkpointDir, verification);
  for (const record of verification.routeResults || []) {
    await writeRouteUnitVerificationCheckpoint(params.checkpointDir, record);
  }

  if (verification.status !== "passed") {
    throw new GenerationContractViolationError(verification);
  }

  return {
    contract,
    routeInputs,
    execution,
    verification,
    project,
  };
}
