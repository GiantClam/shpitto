import { ProjectAnalyticsWorkspace } from "@/components/chat/ProjectAnalyticsWorkspace";

export default async function ProjectAnalyticsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectAnalyticsWorkspace projectId={decodeURIComponent(String(projectId || "").trim())} />;
}
