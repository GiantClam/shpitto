import { ProjectChatWorkspace } from "@/components/chat/ProjectChatWorkspace";
import { getServerLocale } from "@/lib/i18n-server";
import { normalizePreferredWorkspaceProjectRouteId } from "@/lib/project-route-id";

export default async function ProjectChatPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const locale = await getServerLocale();
  return <ProjectChatWorkspace projectId={normalizePreferredWorkspaceProjectRouteId(projectId)} locale={locale} />;
}
