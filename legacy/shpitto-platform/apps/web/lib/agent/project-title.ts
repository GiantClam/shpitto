function collapseWhitespace(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function projectTitleSuffix(projectId?: string): string {
  const normalized = collapseWhitespace(projectId);
  if (!normalized) return "";
  const segments = normalized.split("-").filter(Boolean);
  const candidate = String(segments[segments.length - 1] || "").trim();
  if (candidate && /^[a-z0-9]{4,}$/i.test(candidate)) return candidate.slice(-6);
  return normalized.replace(/[^a-z0-9]/gi, "").slice(-6);
}

export function fallbackProjectTitle(projectId?: string): string {
  const suffix = projectTitleSuffix(projectId);
  return suffix ? `Project ${suffix}` : "Project";
}

function isPlaceholderProjectTitle(title: string, projectId?: string): boolean {
  const normalized = collapseWhitespace(title);
  if (!normalized) return true;
  const lower = normalized.toLowerCase();
  if (
    [
      "unknown",
      "untitled project",
      "untitled session",
      "new project",
      "new session",
      "current project",
      "project",
      "session",
    ].includes(lower)
  ) {
    return true;
  }
  if (projectId && normalized === collapseWhitespace(projectId)) return true;
  return /^chat-\d{10,}(?:-[a-z0-9]+)+$/i.test(normalized);
}

function isPromptLikeProjectTitle(rawTitle: unknown): boolean {
  const raw = String(rawTitle || "").trim();
  if (!raw) return false;
  const normalized = collapseWhitespace(raw);
  const lower = normalized.toLowerCase();

  if (lower.includes("canonical website generation prompt")) return true;
  if (/^\s*#{1,6}\s+\S/m.test(raw) && raw.length > 24) return true;
  if (/^\s*```/m.test(raw) || /^\s*[-*]\s+\S/m.test(raw)) return true;
  if (
    normalized.length >= 32 &&
    /^(build|create|generate|design|develop|make|need|please|help me|帮我|想要|生成|创建|设计|做一个)\b/i.test(normalized)
  ) {
    return true;
  }
  return false;
}

export function isUsableProjectTitle(rawTitle: unknown, projectId?: string): boolean {
  const normalized = collapseWhitespace(rawTitle);
  if (!normalized) return false;
  if (isPlaceholderProjectTitle(normalized, projectId)) return false;
  if (isPromptLikeProjectTitle(rawTitle)) return false;
  return true;
}

export function normalizeProjectTitleForDisplay(rawTitle: unknown, projectId?: string): string {
  const normalized = collapseWhitespace(rawTitle);
  if (isUsableProjectTitle(normalized, projectId)) return normalized.slice(0, 80);
  return fallbackProjectTitle(projectId);
}

export function selectProjectTitleForStorage(params: {
  rawTitle?: unknown;
  projectId?: string;
  existingTitle?: unknown;
}): string {
  if (isUsableProjectTitle(params.rawTitle, params.projectId)) {
    return collapseWhitespace(params.rawTitle).slice(0, 80);
  }
  if (isUsableProjectTitle(params.existingTitle, params.projectId)) {
    return collapseWhitespace(params.existingTitle).slice(0, 80);
  }
  return fallbackProjectTitle(params.projectId);
}
