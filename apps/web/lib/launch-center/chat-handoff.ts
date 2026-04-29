export type LaunchCenterChatHandoff = {
  prompt: string;
  files: File[];
  createdAt: number;
};

const HANDOFF_TTL_MS = 5 * 60 * 1000;
const handoffs = new Map<string, LaunchCenterChatHandoff>();

export function storeLaunchCenterChatHandoff(
  projectId: string,
  handoff: Omit<LaunchCenterChatHandoff, "createdAt">,
) {
  const normalizedProjectId = String(projectId || "").trim();
  const prompt = String(handoff.prompt || "").trim();
  if (!normalizedProjectId || !prompt) return;
  handoffs.set(normalizedProjectId, {
    prompt,
    files: Array.from(handoff.files || []).filter(Boolean),
    createdAt: Date.now(),
  });
}

export function takeLaunchCenterChatHandoff(projectId: string): LaunchCenterChatHandoff | undefined {
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId) return undefined;
  const handoff = handoffs.get(normalizedProjectId);
  if (!handoff) return undefined;
  handoffs.delete(normalizedProjectId);
  if (Date.now() - handoff.createdAt > HANDOFF_TTL_MS) return undefined;
  return handoff;
}
