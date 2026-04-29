import { describe, expect, it } from "vitest";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

const REAL_REPLAY_TASK_ID = process.env.REPLAY_TASK_ID || "7fd74043-5bec-4be9-ac4a-ac8be9031c5a";

describe.skipIf(process.env.RUN_REAL_ASSET_REPLAY !== "1")("project asset real-session replay", () => {
  it("replays an existing session asset through local preview and release URL rewriting", async () => {
    const { completeChatTask, createChatTask, getChatTask } = await import("./chat-task-store");
    const {
      listProjectAssets,
      resolveProjectAssetPreviewCdnPrefix,
      resolveProjectAssetReleaseCdnPrefix,
      rewriteProjectAssetLogicalUrlsForRelease,
    } = await import("../project-assets");

    const previousTaskStoreMode = process.env.CHAT_TASKS_USE_SUPABASE;
    process.env.CHAT_TASKS_USE_SUPABASE = "1";

    const sourceTask = await getChatTask(REAL_REPLAY_TASK_ID);
    expect(sourceTask).toBeTruthy();

    const ownerUserId = String(sourceTask?.ownerUserId || "").trim();
    const projectId = String(sourceTask?.chatId || "").trim();
    expect(ownerUserId).toBeTruthy();
    expect(projectId).toBeTruthy();

    const assets = await listProjectAssets({ ownerUserId, projectId });
    const imageAsset = assets.find((asset) => asset.path === "uploads/file.png") || assets.find((asset) => asset.category === "image");
    expect(imageAsset?.logicalPath).toMatch(/^\/assets\/project\//);

    const previewPrefix = await resolveProjectAssetPreviewCdnPrefix({ ownerUserId, projectId });
    const releasePrefix = resolveProjectAssetReleaseCdnPrefix({ ownerUserId, projectId });
    expect(previewPrefix).toContain("/preview/");
    expect(releasePrefix).toContain("/release/current/files");

    process.env.CHAT_TASKS_USE_SUPABASE = "0";

    const logicalPath = String(imageAsset?.logicalPath || "");
    const replayProject = {
      staticSite: {
        mode: "skill-direct",
        files: [
          {
            path: "/index.html",
            type: "text/html",
            content: `<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><img src="${logicalPath}" alt="Replay logo"></body></html>`,
          },
          {
            path: "/styles.css",
            type: "text/css",
            content: `.hero{background-image:url("${logicalPath}")}`,
          },
        ],
      },
    };

    const replayTask = await createChatTask(projectId, ownerUserId, {
      assistantText: "replay ready",
      phase: "end",
      internal: {
        sessionState: {
          site_artifacts: replayProject,
        },
      },
      progress: {
        stage: "done",
      },
    });
    await completeChatTask(replayTask.id, {
      assistantText: "replay ready",
      phase: "end",
      internal: {
        sessionState: {
          site_artifacts: replayProject,
        },
      },
      progress: {
        stage: "done",
      },
    });

    const { GET } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");

    const htmlRes = await GET(new Request(`http://localhost/api/chat/tasks/${replayTask.id}/preview/index.html`), {
      params: Promise.resolve({ taskId: replayTask.id, path: ["index.html"] }),
    });
    expect(htmlRes.status).toBe(200);
    const html = await htmlRes.text();
    expect(html).toContain(`${previewPrefix}/${imageAsset?.path}`);
    expect(html).not.toContain(logicalPath);
    expect(html).not.toContain('src="uploads/"');

    const cssRes = await GET(new Request(`http://localhost/api/chat/tasks/${replayTask.id}/preview/styles.css`), {
      params: Promise.resolve({ taskId: replayTask.id, path: ["styles.css"] }),
    });
    expect(cssRes.status).toBe(200);
    const css = await cssRes.text();
    expect(css).toContain(`${previewPrefix}/${imageAsset?.path}`);
    expect(css).not.toContain(logicalPath);

    const releaseProject = rewriteProjectAssetLogicalUrlsForRelease(replayProject, { ownerUserId, projectId });
    const releaseHtml = String(releaseProject.staticSite.files[0].content || "");
    const releaseCss = String(releaseProject.staticSite.files[1].content || "");
    expect(releaseHtml).toContain(`${releasePrefix}/${imageAsset?.path}`);
    expect(releaseCss).toContain(`${releasePrefix}/${imageAsset?.path}`);
    expect(releaseHtml).not.toContain(logicalPath);

    if (previousTaskStoreMode === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
    else process.env.CHAT_TASKS_USE_SUPABASE = previousTaskStoreMode;
  }, 120_000);
});
