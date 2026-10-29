import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChatTask, completeChatTask } from "./chat-task-store";

const mocks = vi.hoisted(() => ({
  getAuthenticatedRouteUserId: vi.fn(),
}));

vi.mock("@/lib/supabase/route-user", () => ({
  getAuthenticatedRouteUserId: mocks.getAuthenticatedRouteUserId,
}));

describe("chat task export route", () => {
  beforeEach(() => {
    mocks.getAuthenticatedRouteUserId.mockReset();
  });

  it("exports the prepared OpenCode workspace as a zip", async () => {
    const chatId = `chat-export-${Date.now()}`;
    const root = path.resolve(process.cwd(), ".tmp", "chat-tests", chatId);
    const projectPath = path.join(root, "project.json");
    const workspaceRoot = path.join(root, "opencode-workspace");
    await fs.mkdir(path.join(workspaceRoot, "app"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, ".shpitto"), { recursive: true });
    await fs.writeFile(projectPath, JSON.stringify({ ok: true }), "utf8");
    await fs.writeFile(path.join(workspaceRoot, "package.json"), JSON.stringify({ name: "exportable-site" }, null, 2), "utf8");
    await fs.writeFile(path.join(workspaceRoot, "app", "page.tsx"), "export default function Page(){return <main>ok</main>;}\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, ".shpitto", "request.json"), JSON.stringify({ skillId: "build-marketing-site" }, null, 2), "utf8");

    const ownerUserId = `user-${Date.now()}`;
    const task = await createChatTask(chatId, ownerUserId, {
      assistantText: "done",
      phase: "end",
      progress: {
        stage: "done",
        checkpointProjectPath: projectPath,
      } as any,
      internal: {
        sessionState: {
          workflow_context: {
            opencodeWorkspaceRoot: workspaceRoot,
          },
        },
      },
    });
    await completeChatTask(task.id, {
      assistantText: "done",
      phase: "end",
      progress: {
        stage: "done",
        checkpointProjectPath: projectPath,
      } as any,
      internal: {
        sessionState: {
          workflow_context: {
            opencodeWorkspaceRoot: workspaceRoot,
          },
        },
      },
    });

    mocks.getAuthenticatedRouteUserId.mockResolvedValue(ownerUserId);
    const { GET } = await import("../../app/api/chat/tasks/[taskId]/export/route");
    const res = await GET(new Request("http://localhost/api/chat/tasks/x/export"), {
      params: Promise.resolve({ taskId: task.id }),
    });

    expect(res.status).toBe(200);
    expect(String(res.headers.get("content-type") || "")).toContain("application/zip");
    const zipBuffer = Buffer.from(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(zipBuffer);
    const entries = Object.keys(zip.files).sort();
    expect(entries).toContain(".shpitto/request.json");
    expect(entries).toContain("app/page.tsx");
    expect(entries).toContain("package.json");
    expect(await zip.file("package.json")?.async("string")).toContain("exportable-site");
  });

  it("returns 401 when the task has an owner and the request is unauthenticated", async () => {
    const chatId = `chat-export-auth-${Date.now()}`;
    const root = path.resolve(process.cwd(), ".tmp", "chat-tests", chatId);
    const projectPath = path.join(root, "project.json");
    const workspaceRoot = path.join(root, "opencode-workspace");
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(projectPath, JSON.stringify({ ok: true }), "utf8");
    await fs.writeFile(path.join(workspaceRoot, "package.json"), JSON.stringify({ name: "locked-site" }, null, 2), "utf8");

    const ownerUserId = `user-${Date.now()}`;
    const task = await createChatTask(chatId, ownerUserId, {
      assistantText: "done",
      phase: "end",
      progress: {
        stage: "done",
        checkpointProjectPath: projectPath,
      } as any,
      internal: {
        sessionState: {
          workflow_context: {
            opencodeWorkspaceRoot: workspaceRoot,
          },
        },
      },
    });
    await completeChatTask(task.id, {
      assistantText: "done",
      phase: "end",
      progress: {
        stage: "done",
        checkpointProjectPath: projectPath,
      } as any,
      internal: {
        sessionState: {
          workflow_context: {
            opencodeWorkspaceRoot: workspaceRoot,
          },
        },
      },
    });

    mocks.getAuthenticatedRouteUserId.mockResolvedValue(undefined);
    const { GET } = await import("../../app/api/chat/tasks/[taskId]/export/route");
    const res = await GET(new Request("http://localhost/api/chat/tasks/x/export"), {
      params: Promise.resolve({ taskId: task.id }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: "Unauthorized" });
  });
});
