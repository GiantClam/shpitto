import { ProjectAssetsWorkspace } from "@/components/chat/ProjectAssetsWorkspace";
import { getServerLocale } from "@/lib/i18n-server";

export default async function ProjectAssetsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const locale = await getServerLocale();
  return <ProjectAssetsWorkspace projectId={decodeURIComponent(String(projectId || "").trim())} locale={locale} />;
}
