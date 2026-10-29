export const SKILL_RUNTIME_FIXED_PHASES = [
  "task_plan",
  "findings",
  "design",
  "styles",
  "script",
  "index",
  "pages",
  "repair",
] as const;

export type SkillRuntimePhase = (typeof SKILL_RUNTIME_FIXED_PHASES)[number];
