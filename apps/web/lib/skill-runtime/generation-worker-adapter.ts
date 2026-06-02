import type { RouteUnitContractSummary } from "./website-design-spec";
import type { RouteUnitContract } from "./route-unit-contract";
import type { DesignStylePreset } from "../design-style-preset";
import type { LocalDecisionPlan } from "./decision-layer";
import type { AgentState } from "../agent/graph";
import type { SkillRuntimeExecutionSummary, SkillRuntimeStepSnapshot } from "./executor";
import type {
  RuntimeWorkflowFile,
  SkillExecutionAdapter,
  SkillExecutionRoundObjective,
} from "./skill-execution-adapter";

export type GenerationUnitInput = {
  unitId: string;
  route?: string;
  targetFiles: string[];
  prompt: string;
  context: Record<string, unknown>;
};

export type GenerationUnitResult = {
  unitId: string;
  status: "passed" | "failed";
  files: Array<{ path: string; content: string; type?: string }>;
  summary?: string;
  issues?: string[];
};

export type GenerationWorkerAdapter = {
  id: "shpitto-llm-runtime" | "shpitto-tool-skill-runtime" | string;
  capabilities: string[];
  runUnit(input: GenerationUnitInput): Promise<GenerationUnitResult>;
};

export type SkillExecutionGenerationRound = {
  input: GenerationUnitInput;
  prompt: string;
  objective: SkillExecutionRoundObjective;
  emittedFiles: RuntimeWorkflowFile[];
};

export type GenerationUnitDispatchReport = {
  adapterId: string;
  capabilities: string[];
  passed: boolean;
  results: GenerationUnitResult[];
  issues: string[];
};

export type GenerationRuntimeRequest = {
  state: AgentState;
  timeoutMs: number;
  onStep?: (snapshot: SkillRuntimeStepSnapshot) => Promise<void> | void;
};

export type GenerationRuntimeWorker = {
  id: string;
  capabilities: string[];
  runGeneration(input: GenerationRuntimeRequest): Promise<SkillRuntimeExecutionSummary>;
};

export function createStaticGenerationWorkerAdapter(params: {
  id: GenerationWorkerAdapter["id"];
  capabilities: string[];
  runUnit: GenerationWorkerAdapter["runUnit"];
}): GenerationWorkerAdapter {
  return {
    id: params.id,
    capabilities: Array.from(new Set(params.capabilities.map((item) => String(item || "").trim()).filter(Boolean))),
    runUnit: params.runUnit,
  };
}

export function createStaticGenerationRuntimeWorker(params: {
  id: string;
  capabilities: string[];
  runGeneration: GenerationRuntimeWorker["runGeneration"];
}): GenerationRuntimeWorker {
  return {
    id: String(params.id || "generation-runtime-worker").trim() || "generation-runtime-worker",
    capabilities: Array.from(new Set(params.capabilities.map((item) => String(item || "").trim()).filter(Boolean))),
    runGeneration: params.runGeneration,
  };
}

function normalizeRoute(route: string): string {
  const trimmed = String(route || "/").trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function routeToHtmlPath(route: string): string {
  const normalized = normalizeRoute(route);
  if (normalized === "/") return "/index.html";
  return `${normalized}/index.html`;
}

function routeToUnitId(route: string): string {
  const normalized = normalizeRoute(route);
  return normalized === "/" ? "route-home" : `route-${normalized.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-")}`;
}

export function buildGenerationUnitInputFromRouteContract(params: {
  summary: RouteUnitContractSummary | RouteUnitContract;
  prompt?: string;
  targetFiles?: string[];
  context?: Record<string, unknown>;
}): GenerationUnitInput {
  const route = normalizeRoute(params.summary.route);
  const targetFiles = params.targetFiles?.length ? params.targetFiles : [routeToHtmlPath(route), "/styles.css", "/script.js"];
  return {
    unitId: routeToUnitId(route),
    route,
    targetFiles,
    prompt:
      params.prompt ||
      [
        `Generate the ${route} route unit.`,
        "Follow the supplied route contract, opening topology, inherited tokens, and media resources.",
        "Return only files listed in targetFiles unless the orchestrator explicitly widens the unit scope.",
      ].join("\n"),
    context: {
      routeContract: params.summary.routeContract,
      navLabel: params.summary.navLabel,
      pageKind: params.summary.pageKind,
      inheritedTerminology: (params.summary as any).inheritedTerminology,
      inheritedTokens: (params.summary as any).inheritedTokens,
      openingFamily: params.summary.openingFamily,
      openingTopology: params.summary.openingTopology,
      mediaPlan: (params.summary as any).mediaPlan,
      mediaResources: (params.summary as any).mediaResources,
      htmlPath: (params.summary as any).htmlPath,
      ...(params.context || {}),
    },
  };
}

function smokeFileContent(path: string, input: GenerationUnitInput): string {
  const normalizedPath = String(path || "").trim();
  if (normalizedPath.endsWith(".html")) {
    return [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '  <meta charset="utf-8">',
      `  <title>${input.route || input.unitId}</title>`,
      '  <link rel="stylesheet" href="/styles.css">',
      "</head>",
      "<body>",
      "  <main>",
      `    <h1>${input.route || input.unitId}</h1>`,
      `    <p>Static route-unit smoke output for ${input.unitId}.</p>`,
      "  </main>",
      '  <script src="/script.js"></script>',
      "</body>",
      "</html>",
    ].join("\n");
  }
  if (normalizedPath.endsWith(".css")) return ":root { color-scheme: light; }\nbody { margin: 0; font-family: system-ui; }\n";
  if (normalizedPath.endsWith(".js")) return "document.documentElement.dataset.routeUnitSmoke = 'ready';\n";
  return `route-unit-smoke:${input.unitId}\n`;
}

export function createRouteUnitSmokeAdapter(): GenerationWorkerAdapter {
  return createStaticGenerationWorkerAdapter({
    id: "shpitto-route-unit-smoke",
    capabilities: ["route-unit", "static-smoke", "html"],
    runUnit: async (input) => ({
      unitId: input.unitId,
      status: "passed",
      files: input.targetFiles.map((targetFile) => ({
        path: targetFile,
        content: smokeFileContent(targetFile, input),
        type: targetFile.endsWith(".html")
          ? "text/html"
          : targetFile.endsWith(".css")
            ? "text/css"
            : targetFile.endsWith(".js")
              ? "application/javascript"
              : "text/plain",
      })),
      summary: `static smoke dispatched ${input.unitId} to ${input.targetFiles.join(", ")}`,
    }),
  });
}

export async function runGenerationUnitsWithAdapter(
  adapter: GenerationWorkerAdapter,
  inputs: GenerationUnitInput[],
): Promise<GenerationUnitDispatchReport> {
  const results = await Promise.all(inputs.map((input) => adapter.runUnit(input)));
  const issues = results.flatMap((result) =>
    result.status === "passed"
      ? []
      : [`${result.unitId}: ${result.issues?.join("; ") || result.summary || "unit failed"}`],
  );
  return {
    adapterId: adapter.id,
    capabilities: adapter.capabilities,
    passed: issues.length === 0 && results.every((result) => result.status === "passed"),
    results,
    issues,
  };
}

export function createSkillExecutionGenerationWorkerAdapter(params: {
  id?: GenerationWorkerAdapter["id"];
  skillAdapter: SkillExecutionAdapter;
  decision: LocalDecisionPlan;
  stylePreset: DesignStylePreset;
  styleName: string;
  styleReason: string;
  requirementText: string;
  totalRounds: number;
  loadedSkillIds?: string[];
  emittedFiles?: RuntimeWorkflowFile[];
  invokeRound: (round: SkillExecutionGenerationRound) => Promise<GenerationUnitResult>;
}): GenerationWorkerAdapter {
  return createStaticGenerationWorkerAdapter({
    id: params.id || `skill-execution:${params.skillAdapter.skillId}`,
    capabilities: ["route-unit", "skill-execution-adapter", params.skillAdapter.skillId],
    runUnit: async (input) => {
      const objective: SkillExecutionRoundObjective = {
        targetFiles: input.targetFiles,
        instruction: `Generate route unit ${input.route || input.unitId} using the adapter-provided route contract.`,
        strictSingleTarget: input.targetFiles.length === 1,
      };
      const emittedFiles = params.emittedFiles || [];
      const prompt = params.skillAdapter.buildToolRoundPrompt({
        round: 0,
        totalRounds: params.totalRounds,
        decision: params.decision,
        stylePreset: params.stylePreset,
        styleName: params.styleName,
        styleReason: params.styleReason,
        loadedSkillIds: params.loadedSkillIds || [],
        emittedFiles,
        requiredMissing: input.targetFiles,
        objective,
        requirementText: params.requirementText,
      });
      return params.invokeRound({ input, prompt, objective, emittedFiles });
    },
  });
}
