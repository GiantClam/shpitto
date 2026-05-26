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
