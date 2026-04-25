import { ProjectDataWorkspace } from "@/components/chat/ProjectDataWorkspace";

export default async function ProjectDataPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectDataWorkspace projectId={decodeURIComponent(String(projectId || "").trim())} />;
}
