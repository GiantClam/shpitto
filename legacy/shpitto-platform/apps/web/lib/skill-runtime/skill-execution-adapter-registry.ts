import type { SkillExecutionAdapter } from "./skill-execution-adapter.ts";
import { WEBSITE_GENERATION_TYPE_SKILL_IDS } from "./project-skill-loader.ts";

export async function getSkillExecutionAdapter(skillId: string): Promise<SkillExecutionAdapter> {
  const normalized = String(skillId || "").trim();
  if (normalized === "website-generation-workflow") {
    const mod = await import("./website-generation-skill-adapter.ts");
    return mod.getWebsiteGenerationSkillAdapter();
  }
  if (normalized === "corporate-b2b-site") {
    const mod = await import("./corporate-b2b-skill-adapter.ts");
    return mod.getCorporateB2bSkillAdapter();
  }
  if (WEBSITE_GENERATION_TYPE_SKILL_IDS.includes(normalized as any)) {
    const mod = await import("./website-generation-skill-adapter.ts");
    return mod.createWebsiteGenerationSkillAdapter(normalized);
  }
  throw new Error(`skill_execution_adapter_missing: ${normalized || "(empty)"}`);
}
