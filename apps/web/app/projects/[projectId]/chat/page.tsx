import { ProjectChatWorkspace } from "@/components/chat/ProjectChatWorkspace";

export default async function ProjectChatPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectChatWorkspace projectId={decodeURIComponent(String(projectId || "").trim())} />;
}
