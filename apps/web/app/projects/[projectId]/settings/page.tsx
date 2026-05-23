import { ProjectSettingsWorkspace } from "@/components/chat/ProjectSettingsWorkspace";
import { getServerLocale } from "@/lib/i18n-server";
import { normalizePreferredWorkspaceProjectRouteId } from "@/lib/project-route-id";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const locale = await getServerLocale();
  return <ProjectSettingsWorkspace projectId={normalizePreferredWorkspaceProjectRouteId(projectId)} locale={locale} />;
}
