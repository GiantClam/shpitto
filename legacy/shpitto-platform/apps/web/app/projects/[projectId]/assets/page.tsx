import { ProjectAssetsWorkspace } from "@/components/chat/ProjectAssetsWorkspace";
import { getServerLocale } from "@/lib/i18n-server";
import { normalizePreferredWorkspaceProjectRouteId } from "@/lib/project-route-id";

export default async function ProjectAssetsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const locale = await getServerLocale();
  return <ProjectAssetsWorkspace projectId={normalizePreferredWorkspaceProjectRouteId(projectId)} locale={locale} />;
}
