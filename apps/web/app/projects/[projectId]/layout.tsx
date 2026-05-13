import { ProjectWorkspaceMetaProvider } from "@/components/chat/project-workspace-context";
import type { ReactNode } from "react";

export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const normalizedProjectId = decodeURIComponent(String(projectId || "").trim());

  return <ProjectWorkspaceMetaProvider projectId={normalizedProjectId}>{children}</ProjectWorkspaceMetaProvider>;
}
