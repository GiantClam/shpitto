import { ProjectChatWorkspace } from "@/components/chat/ProjectChatWorkspace";
import { getServerLocale } from "@/lib/i18n-server";

export default async function ProjectChatPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const locale = await getServerLocale();
  return <ProjectChatWorkspace projectId={decodeURIComponent(String(projectId || "").trim())} locale={locale} />;
}
