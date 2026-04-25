import { ProjectAssetsWorkspace } from "@/components/chat/ProjectAssetsWorkspace";

export default async function ProjectAssetsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectAssetsWorkspace projectId={decodeURIComponent(String(projectId || "").trim())} />;
}

