import { ProjectAnalyticsWorkspace } from "@/components/chat/ProjectAnalyticsWorkspace";
import { getServerLocale } from "@/lib/i18n-server";

export default async function ProjectAnalyticsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const locale = await getServerLocale();
  return <ProjectAnalyticsWorkspace projectId={decodeURIComponent(String(projectId || "").trim())} locale={locale} />;
}
