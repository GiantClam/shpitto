import { getOwnedProjectSummary } from "@/lib/agent/db";
import { listChatSessionsForOwner } from "@/lib/agent/chat-task-store";
import { normalizeProjectTitleForDisplay } from "@/lib/agent/project-title";

export type ProjectRuntimeSummary = {
  projectId: string;
  projectName: string;
  deploymentHost: string | null;
  latestDeploymentUrl: string | null;
  source: "d1" | "chat-session";
};

function toHost(value: string | null | undefined): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) {
    return text.replace(/^\/+|\/+$/g, "").toLowerCase() || null;
  }
  try {
    return new URL(text).host.toLowerCase();
  } catch {
    return null;
  }
}

export async function resolveOwnedProjectRuntimeSummary(
  projectId: string,
  userId: string,
): Promise<ProjectRuntimeSummary | null> {
  const d1Summary = await getOwnedProjectSummary(projectId, userId);
  if (d1Summary) {
    return {
      ...d1Summary,
      source: "d1",
    };
  }

  const sessions = await listChatSessionsForOwner(userId, {
    includeArchived: true,
    includeLegacyBackfill: true,
    limit: 200,
  });
  const session = sessions.find((item) => item.id === projectId);
  if (!session) return null;

  const latestDeploymentUrl = String(session.lastDeployedUrl || "").trim() || null;
  return {
    projectId: session.id,
    projectName: normalizeProjectTitleForDisplay(session.title, session.id),
    deploymentHost: toHost(latestDeploymentUrl),
    latestDeploymentUrl,
    source: "chat-session",
  };
}
