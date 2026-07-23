import path from "node:path";

export type ShpittoSkillCapability =
  | "inspect"
  | "modify"
  | "validate"
  | "preview"
  | "deploy";

export type ShpittoSkillMutationScope =
  | "content"
  | "visual"
  | "routes"
  | "template-runtime"
  | "cms"
  | "billing"
  | "provider"
  | "deployment";

export type ShpittoOpenCodeWorkspacePolicy = {
  allowAutoApproval: boolean;
  requireSkillResult: boolean;
  allowProductionMutation: boolean;
  allowedPaths: string[];
  deniedPaths: string[];
  environmentAllowlist: string[];
};

export type ShpittoSkillManifest = {
  skillId: string;
  skillVersion: string;
  sourcePath: string;
  capabilities: ShpittoSkillCapability[];
  mutationScopes: ShpittoSkillMutationScope[];
  validationCommands: string[];
  resultPath: string;
  workspacePolicy: ShpittoOpenCodeWorkspacePolicy;
};

export type ShpittoSkillResult = {
  status: "succeeded" | "failed" | "blocked";
  skillId: string;
  templateId?: string;
  templateVersion?: string;
  changedFiles: string[];
  checks: unknown[];
  previewUrl: string | null;
  deployment: unknown | null;
  auditId?: string;
  rollback: unknown | null;
  summary: string;
  errors: unknown[];
};

export const OPENCODE_SKILL_RESULT_PATH = ".shpitto/skill-result.json";

export const OPENCODE_SAFE_ENVIRONMENT_KEYS = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "CI",
  "NO_COLOR",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_STATE_HOME",
  "SHPITTO_OPENCODE_MODEL",
  "SHPITTO_OPENCODE_VARIANT",
] as const;

const PRODUCTIZED_SKILL_SOURCE_PATHS: Record<string, string> = {
  "build-ai-image-tool": "product-baselines/ai-image-tool-baseline",
  "build-b2b-site": "corporate-b2b-site",
  "build-marketing-site": "marketing-landing-site",
  "build-docs-site": "docs-knowledge-site",
  "build-content-hub": "content-hub-site",
  "template-inspect": "template-operations/template-inspect",
  "template-modify": "template-operations/template-modify",
  "template-validate": "template-operations/template-validate",
  "template-preview": "template-operations/template-preview",
  "template-deploy": "template-operations/template-deploy",
};

function normalizeSkillId(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export function resolveSkillSourceRelativePath(skillId: string): string | undefined {
  return PRODUCTIZED_SKILL_SOURCE_PATHS[normalizeSkillId(skillId)];
}

export function resolveSkillManifest(skillId: string): ShpittoSkillManifest {
  const normalizedSkillId = normalizeSkillId(skillId);
  const sourcePath = resolveSkillSourceRelativePath(normalizedSkillId);
  if (!sourcePath) {
    throw new Error(`No Shpitto skill source is registered for ${normalizedSkillId || "empty skill id"}.`);
  }

  const isAiImageTool = normalizedSkillId === "build-ai-image-tool";
  return {
    skillId: normalizedSkillId,
    skillVersion: "1.0.0",
    sourcePath: `apps/web/skills/${sourcePath}`,
    capabilities: ["inspect", "modify", "validate", "preview", "deploy"],
    mutationScopes: isAiImageTool
      ? ["content", "visual", "routes", "template-runtime", "cms", "billing", "provider", "deployment"]
      : ["content", "visual", "routes", "deployment"],
    validationCommands: ["pnpm build"],
    resultPath: OPENCODE_SKILL_RESULT_PATH,
    workspacePolicy: {
      allowAutoApproval: true,
      requireSkillResult: true,
      allowProductionMutation: false,
      allowedPaths: [".", ".opencode", ".shpitto"],
      deniedPaths: [".env", ".env.*", ".git", "node_modules", "../*"],
      environmentAllowlist: [...OPENCODE_SAFE_ENVIRONMENT_KEYS],
    },
  };
}

export function buildWorkspaceAgentsPolicy(manifest: ShpittoSkillManifest): string {
  return [
    "# Shpitto OpenCode Workspace Policy",
    "",
    `This workspace is controlled by skill \`${manifest.skillId}\` version \`${manifest.skillVersion}\`.`,
    "",
    "## Required execution order",
    "",
    "1. Read `.shpitto/request.json`, `.shpitto/template-manifest.json`, `.shpitto/skill-manifest.json`, and the selected skill under `.opencode/skills/`.",
    "2. Inspect the existing workspace before editing.",
    "3. Keep changes within the declared mutation scopes and preserve the template manifest contract.",
    "4. Run the declared validation commands when dependencies are available.",
    `5. Write a JSON result to \`${manifest.resultPath}\` before finishing.`,
    "",
    "## Safety",
    "",
    "- Never read, print, or copy secret values from environment files.",
    "- Never edit `.git`, `node_modules`, parent directories, or files outside the workspace.",
    "- Never claim deployment success without a deployment URL and smoke evidence.",
    "- Never replace a real provider, CMS, billing, or persistence implementation with a mock unless the request explicitly selects test mode.",
    "- Keep production mutation disabled in this workspace.",
    "",
    "## Result contract",
    "",
    "The result file must contain `status`, `skillId`, `changedFiles`, `checks`, `errors`, and a truthful summary.",
    "",
  ].join("\n");
}

export function normalizeWorkspaceRelativePath(value: string): string {
  const normalized = String(value || "").trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../") || normalized === "..") {
    throw new Error(`Unsafe workspace-relative path: ${value}`);
  }
  return normalized.replace(/^\.\//, "");
}

export function resolveSkillDestinationPath(workspaceRoot: string, relativePath: string): string {
  const safeRelativePath = normalizeWorkspaceRelativePath(relativePath);
  const target = path.resolve(workspaceRoot, safeRelativePath);
  const root = path.resolve(workspaceRoot);
  const relativeToRoot = path.relative(root, target);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Skill destination escapes workspace: ${relativePath}`);
  }
  return target;
}
