const WORKSPACE_ROUTE_PREFIX_RE = /^(analysis|assets|data|settings)-(.+)$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHAT_ID_RE = /^chat-[a-z0-9-]{6,}$/i;
const TIMESTAMP_ID_RE = /^\d{10,}$/;

function normalizeText(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function looksLikeCanonicalWorkspaceProjectId(value: string): boolean {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  return UUID_RE.test(normalized) || CHAT_ID_RE.test(normalized) || TIMESTAMP_ID_RE.test(normalized);
}

export function getWorkspaceProjectRouteIdCandidates(rawProjectId: unknown): string[] {
  const normalized = normalizeText(rawProjectId);
  if (!normalized) return [];

  const candidates = [normalized];
  const match = normalized.match(WORKSPACE_ROUTE_PREFIX_RE);
  if (match?.[2]) {
    const stripped = String(match[2] || "").trim();
    if (stripped && looksLikeCanonicalWorkspaceProjectId(stripped) && stripped !== normalized) {
      candidates.push(stripped);
    }
  }

  return Array.from(new Set(candidates));
}

export function normalizeWorkspaceProjectRouteId(rawProjectId: unknown): string {
  return getWorkspaceProjectRouteIdCandidates(rawProjectId)[0] || "";
}

export function normalizePreferredWorkspaceProjectRouteId(rawProjectId: unknown): string {
  const candidates = getWorkspaceProjectRouteIdCandidates(rawProjectId);
  return candidates[1] || candidates[0] || "";
}
