import type { SkillExecutionAdapter } from "./skill-execution-adapter.ts";

export async function getSkillExecutionAdapter(skillId: string): Promise<SkillExecutionAdapter> {
  const normalized = String(skillId || "").trim();
  if (normalized === "website-generation-workflow") {
    const mod = await import("./website-generation-skill-adapter.ts");
    return mod.getWebsiteGenerationSkillAdapter();
  }
  throw new Error(`skill_execution_adapter_missing: ${normalized || "(empty)"}`);
}
