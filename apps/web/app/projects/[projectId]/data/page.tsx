import { ProjectDataWorkspace } from "@/components/chat/ProjectDataWorkspace";
import { getServerLocale } from "@/lib/i18n-server";

export default async function ProjectDataPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const locale = await getServerLocale();
  return <ProjectDataWorkspace projectId={decodeURIComponent(String(projectId || "").trim())} locale={locale} />;
}
