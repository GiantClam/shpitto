"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ProjectWorkspaceSessionPayload = {
  id: string;
  title: string;
  updatedAt: number;
  archived?: boolean;
  previewUrl?: string;
};

type SessionsResponse = {
  ok: boolean;
  sessions?: ProjectWorkspaceSessionPayload[];
};

type ProjectWorkspaceMetaContextValue = {
  userEmail: string;
  userId: string;
  projectTitle: string;
  projectUpdatedAt?: number;
  projectPreviewUrl: string;
  projects: ProjectWorkspaceSessionPayload[];
  refreshProjectMeta: () => Promise<void>;
};

const ProjectWorkspaceMetaContext = createContext<ProjectWorkspaceMetaContextValue | null>(null);

export function ProjectWorkspaceMetaProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [projectUpdatedAt, setProjectUpdatedAt] = useState<number | undefined>(undefined);
  const [projectPreviewUrl, setProjectPreviewUrl] = useState("");
  const [projects, setProjects] = useState<ProjectWorkspaceSessionPayload[]>([]);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setProjectTitle("");
    setProjectUpdatedAt(undefined);
    setProjectPreviewUrl("");
  }, [projectId]);

  const refreshProjectMeta = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const [authResult, sessionsResult] = await Promise.allSettled([
      fetch("/api/auth/session", { cache: "no-store" }).then((res) => res.json().catch(() => ({}))),
      fetch("/api/chat/sessions?limit=50", { cache: "no-store" }).then(async (res) => ({
        ok: res.ok,
        data: (await res.json().catch(() => ({}))) as SessionsResponse,
      })),
    ]);

    if (!mountedRef.current || requestId !== requestIdRef.current) return;

    if (authResult.status === "fulfilled") {
      const authData = authResult.value as { user?: { email?: string; id?: string } | null };
      setUserEmail(String(authData.user?.email || "").trim());
      setUserId(String(authData.user?.id || "").trim());
    }

    if (sessionsResult.status === "fulfilled") {
      const payload = sessionsResult.value;
      const sessions = payload.ok && payload.data.ok && Array.isArray(payload.data.sessions) ? payload.data.sessions : [];
      const visibleProjects = sessions.filter((session) => !session.archived);
      setProjects(visibleProjects);
      const hit = sessions.find((session) => session.id === projectId);
      if (hit) {
        setProjectTitle(String(hit.title || "").trim());
        setProjectUpdatedAt(Number(hit.updatedAt || Date.now()));
        setProjectPreviewUrl(String(hit.previewUrl || "").trim());
      }
    }
  }, [projectId]);

  useEffect(() => {
    void refreshProjectMeta();
  }, [refreshProjectMeta]);

  const value = useMemo<ProjectWorkspaceMetaContextValue>(
    () => ({
      userEmail,
      userId,
      projectTitle,
      projectUpdatedAt,
      projectPreviewUrl,
      projects,
      refreshProjectMeta,
    }),
    [projectPreviewUrl, projectTitle, projectUpdatedAt, projects, refreshProjectMeta, userEmail, userId],
  );

  return <ProjectWorkspaceMetaContext.Provider value={value}>{children}</ProjectWorkspaceMetaContext.Provider>;
}

export function useProjectWorkspaceMeta() {
  const context = useContext(ProjectWorkspaceMetaContext);
  if (!context) {
    throw new Error("useProjectWorkspaceMeta must be used within ProjectWorkspaceMetaProvider.");
  }
  return context;
}
