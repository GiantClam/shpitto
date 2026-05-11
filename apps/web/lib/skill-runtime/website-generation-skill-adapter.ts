import type {
  RuntimeWorkflowFile,
  SkillExecutionAdapter,
  SkillExecutionRoundObjective,
  SkillExecutionRoundPromptParams,
  SkillExecutionValidationResult,
} from "./skill-execution-adapter.ts";
import type { LocalDecisionPlan } from "./decision-layer.ts";
import {
  buildWebsiteSkillToolRoundPromptForAdapter,
  formatWebsiteTargetPageContractForAdapter,
  planWebsiteSkillRoundObjectiveForAdapter,
  requiredWebsiteFileChecklistForAdapter,
  resolveWebsiteSkillMaxToolRoundsForAdapter,
  sanitizeWebsiteSkillHtmlOutputForAdapter,
  validateWebsiteRequiredFilesWithQaForAdapter,
} from "./skill-tool-executor.ts";

const WEBSITE_GENERATION_ADAPTER: SkillExecutionAdapter = {
  skillId: "website-generation-workflow",
  buildRequiredFileChecklist(
    decision: LocalDecisionPlan,
    params: { files?: RuntimeWorkflowFile[]; requirementText?: string } = {},
  ): string[] {
    return requiredWebsiteFileChecklistForAdapter(decision, params);
  },
  resolveMaxToolRounds(decision: LocalDecisionPlan, requirementText = ""): number {
    return resolveWebsiteSkillMaxToolRoundsForAdapter(decision, requirementText);
  },
  sanitizeEmittedHtml(filePath: string, html: string, requirementText: string): string {
    return sanitizeWebsiteSkillHtmlOutputForAdapter(filePath, html, requirementText);
  },
  planRoundObjective(round: number, missingFiles: string[]): SkillExecutionRoundObjective {
    return planWebsiteSkillRoundObjectiveForAdapter(round, missingFiles);
  },
  formatTargetPageContract(plan: LocalDecisionPlan, targetFile: string, requirementText = ""): string {
    return formatWebsiteTargetPageContractForAdapter(plan, targetFile, requirementText);
  },
  buildToolRoundPrompt(params: SkillExecutionRoundPromptParams): string {
    return buildWebsiteSkillToolRoundPromptForAdapter(params);
  },
  validateAndNormalizeRequiredFilesWithQa(params: {
    decision: LocalDecisionPlan;
    files: RuntimeWorkflowFile[];
    requirementText?: string;
  }): SkillExecutionValidationResult {
    return validateWebsiteRequiredFilesWithQaForAdapter(params);
  },
};

export function getWebsiteGenerationSkillAdapter(): SkillExecutionAdapter {
  return WEBSITE_GENERATION_ADAPTER;
}
