import { ProjectAnalyticsWorkspace } from "@/components/chat/ProjectAnalyticsWorkspace";
import { getServerLocale } from "@/lib/i18n-server";
import { normalizePreferredWorkspaceProjectRouteId } from "@/lib/project-route-id";

export default async function ProjectAnalyticsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const locale = await getServerLocale();
  return <ProjectAnalyticsWorkspace projectId={normalizePreferredWorkspaceProjectRouteId(projectId)} locale={locale} />;
}
