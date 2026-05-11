import type { AgentState } from "../agent/graph.ts";
import type { DesignStylePreset } from "../design-style-preset.ts";
import type { QaSummary } from "./qa-summary.ts";
import type { LocalDecisionPlan } from "./decision-layer.ts";

export type RuntimeWorkflowFile = {
  path: string;
  content: string;
  type: string;
};

export type SkillToolQaRecord = {
  route: string;
  score: number;
  passed: boolean;
  retries: number;
  antiSlopIssues: Array<{ code: string; severity: "error" | "warning" }>;
};

export type SkillExecutionRoundObjective = {
  targetFiles: string[];
  instruction: string;
  strictSingleTarget: boolean;
};

export type SkillExecutionRoundPromptParams = {
  round: number;
  totalRounds: number;
  decision: LocalDecisionPlan;
  stylePreset: DesignStylePreset;
  styleName: string;
  styleReason: string;
  loadedSkillIds: string[];
  emittedFiles: RuntimeWorkflowFile[];
  requiredMissing: string[];
  objective: SkillExecutionRoundObjective;
  requirementText: string;
};

export type SkillExecutionValidationResult = {
  files: RuntimeWorkflowFile[];
  qaSummary: QaSummary;
  qaRecords: SkillToolQaRecord[];
};

export type SkillChatActionIntent = "clarify" | "generate" | "refine_preview" | "refine_deployed" | "deploy";

export type SkillChatActionRefineScope = "patch" | "structural" | "route_regenerate" | "full_regenerate";

export type SkillChatAction = {
  intent: SkillChatActionIntent;
  confidence: number;
  reason: string;
  shouldCreateTask: boolean;
  refineScope?: SkillChatActionRefineScope;
  actionDomain?: string;
  action?: string;
  evidence?: string[];
  rejected?: Array<{ action: string; reason: string }>;
  workflowContext?: Record<string, unknown>;
};

export type SkillExecutionAdapter = {
  skillId: string;
  resolveChatAction?: (params: {
    userText: string;
    stage: "drafting" | "previewing" | "deployed" | "deploying";
    workflowContext?: Record<string, unknown>;
  }) => SkillChatAction | undefined | Promise<SkillChatAction | undefined>;
  buildRequiredFileChecklist: (decision: LocalDecisionPlan, params?: { files?: RuntimeWorkflowFile[]; requirementText?: string }) => string[];
  resolveMaxToolRounds: (decision: LocalDecisionPlan, requirementText?: string) => number;
  sanitizeEmittedHtml?: (filePath: string, html: string, requirementText: string) => string;
  planRoundObjective: (round: number, missingFiles: string[]) => SkillExecutionRoundObjective;
  formatTargetPageContract: (plan: LocalDecisionPlan, targetFile: string, requirementText?: string) => string;
  buildToolRoundPrompt: (params: SkillExecutionRoundPromptParams) => string;
  validateAndNormalizeRequiredFilesWithQa: (params: {
    decision: LocalDecisionPlan;
    files: RuntimeWorkflowFile[];
    requirementText?: string;
  }) => SkillExecutionValidationResult;
};

export type SkillExecutionAdapterFactoryParams = {
  skillId: string;
  state: AgentState;
};
