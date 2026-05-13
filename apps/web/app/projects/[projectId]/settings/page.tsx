import { ProjectSettingsWorkspace } from "@/components/chat/ProjectSettingsWorkspace";
import { getServerLocale } from "@/lib/i18n-server";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const locale = await getServerLocale();
  return <ProjectSettingsWorkspace projectId={decodeURIComponent(String(projectId || "").trim())} locale={locale} />;
}
