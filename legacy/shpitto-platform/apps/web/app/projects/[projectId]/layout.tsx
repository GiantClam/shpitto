import { ProjectWorkspaceMetaProvider } from "@/components/chat/project-workspace-context";
import { normalizePreferredWorkspaceProjectRouteId } from "@/lib/project-route-id";
import type { ReactNode } from "react";

export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const normalizedProjectId = normalizePreferredWorkspaceProjectRouteId(projectId);

  return <ProjectWorkspaceMetaProvider projectId={normalizedProjectId}>{children}</ProjectWorkspaceMetaProvider>;
}
