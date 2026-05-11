import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { getChatTask, getLatestChatTaskForChat, listChatTimelineMessages } from "./chat-task-store";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "scripts/.env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false });
process.env.CLOUDFLARE_REQUIRE_REAL = "1";

async function seedFullFlowBlogData(projectId: string, marker: string) {
  const { getD1Client } = await import("../d1");
  const d1 = getD1Client();
  await d1.ensureShpittoSchema();
  const now = new Date().toISOString();
  const accountId = `${projectId}-account`;
  const userId = `${projectId}-user`;
  const postId = `${projectId}-post`;
  const title = `Chat Full Flow Blog Verification ${marker}`;

  await d1.execute(
    `
    INSERT INTO shpitto_accounts (id, account_key, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET account_key = excluded.account_key;
    `,
    [accountId, accountId, now],
  );
  await d1.execute(
    `
    INSERT INTO shpitto_users (id, account_id, email, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at;
    `,
    [userId, accountId, `${userId}@example.test`, now, now],
  );
  await d1.execute(
    `
    INSERT INTO shpitto_projects (id, account_id, owner_user_id, source_app, name, config_json, created_at, updated_at)
    VALUES (?, ?, ?, 'shpitto', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at;
    `,
    [projectId, accountId, userId, "Chat Full Flow Blog", JSON.stringify({ projectId, marker }), now, now],
  );
  await d1.execute(
    `
    INSERT INTO shpitto_blog_settings (
      project_id, account_id, owner_user_id, source_app, enabled, nav_label, home_featured_count,
      default_layout_key, default_theme_key, rss_enabled, sitemap_enabled, created_at, updated_at
    )
    VALUES (?, ?, ?, 'shpitto', 1, 'Blog', 3, '', '', 1, 1, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET enabled = 1, nav_label = 'Blog', updated_at = excluded.updated_at;
    `,
    [projectId, accountId, userId, now, now],
  );
  await d1.execute(
    `
    INSERT INTO shpitto_blog_posts (
      id, project_id, account_id, owner_user_id, source_app, slug, title, excerpt, content_md, content_html,
      status, author_name, category, tags_json, cover_image_url, cover_image_alt, seo_title, seo_description,
      theme_key, layout_key, published_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, 'shpitto', ?, ?, ?, ?, ?, 'published', 'Full Flow Tester', 'Full Flow', ?, '', '', ?, ?, '', '', ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      excerpt = excluded.excerpt,
      content_md = excluded.content_md,
      content_html = excluded.content_html,
      status = excluded.status,
      published_at = excluded.published_at,
      updated_at = excluded.updated_at;
    `,
    [
      postId,
      projectId,
      accountId,
      userId,
      "chat-full-flow-blog-verification",
      title,
      `Chat full flow online marker ${marker}`,
      `# ${title}\n\nChat full flow blog content marker: ${marker}.`,
      `<p>Chat full flow blog content marker: <strong>${marker}</strong>.</p>`,
      JSON.stringify(["chat-full-flow", "deployment"]),
      title,
      `Chat full flow online marker ${marker}`,
      now,
      now,
      now,
    ],
  );

  return { accountId, userId, title };
}

async function cleanupFullFlowBlogData(projectId: string, accountId: string, userId: string) {
  const { getD1Client } = await import("../d1");
  const d1 = getD1Client();
  await d1.execute("DELETE FROM shpitto_blog_post_revisions WHERE project_id = ?;", [projectId]).catch(() => null);
  await d1.execute("DELETE FROM shpitto_blog_assets WHERE project_id = ?;", [projectId]).catch(() => null);
  await d1.execute("DELETE FROM shpitto_blog_posts WHERE project_id = ?;", [projectId]).catch(() => null);
  await d1.execute("DELETE FROM shpitto_blog_settings WHERE project_id = ?;", [projectId]).catch(() => null);
  await d1.execute("DELETE FROM shpitto_projects WHERE id = ?;", [projectId]).catch(() => null);
  await d1.execute("DELETE FROM shpitto_users WHERE id = ?;", [userId]).catch(() => null);
  await d1.execute("DELETE FROM shpitto_accounts WHERE id = ?;", [accountId]).catch(() => null);
}

async function fetchTextWithRetry(url: string, predicate: (text: string, status: number) => boolean) {
  let lastStatus = 0;
  let lastText = "";
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "shpitto-chat-full-flow-blog/1.0" } });
      lastStatus = res.status;
      lastText = await res.text();
      if (predicate(lastText, res.status)) return { status: res.status, text: lastText };
    } catch (error) {
      lastText = String((error as Error)?.message || error || "fetch failed");
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, 1500 * attempt)));
  }
  throw new Error(`Timed out fetching ${url} (last status ${lastStatus || "unknown"}): ${lastText.slice(0, 240)}`);
}

function confirmBlogDeploy() {
  return "__SHP_CONFIRM_BLOG_CONTENT_DEPLOY__";
}

function isDeploymentSnapshotWithMarker(text: string, expectedTitle: string) {
  try {
    const parsed = JSON.parse(text) as {
      mode?: string;
      postCount?: number;
      posts?: Array<{ title?: string; slug?: string }>;
    };
    return (
      parsed?.mode === "deployment-d1-static-snapshot" &&
      Number(parsed?.postCount || 0) >= 1 &&
      Array.isArray(parsed?.posts) &&
      parsed.posts.some((post) => String(post?.title || "") === expectedTitle) &&
      parsed.posts.some((post) => String(post?.slug || "") === "chat-full-flow-blog-verification")
    );
  } catch {
    return false;
  }
}

async function waitForTerminalTask(taskId: string, runWorkerOnce: () => Promise<boolean>) {
  const deadline = Date.now() + 24 * 60 * 1000;
  let lastStatus = "";
  let lastStage = "";

  while (Date.now() < deadline) {
    const task = await getChatTask(taskId);
    lastStatus = String(task?.status || "");
    lastStage = String(task?.result?.progress?.stage || "");

    if (task?.status === "succeeded") return task;
    if (task?.status === "failed") {
      throw new Error(
        `Task ${taskId} failed: ${String(task.result?.assistantText || (task.result as any)?.error || lastStage)}`,
      );
    }

    if (task?.status === "queued") {
      await runWorkerOnce();
      continue;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Timed out waiting for task ${taskId}; lastStatus=${lastStatus}, lastStage=${lastStage}`);
}

describe("chat entry full website flow", () => {
  const confirmPayload = (text: string) => `__SHP_CONFIRM_GENERATE__\n${text}`;
  const blogRequirement = [
    "我想做个网站，关于个人 blog，主要介绍 AI 实践经验。",
    "生成前必填信息已提交：",
    "- 网站类型：作品集",
    "- 内容来源：新建站点，无现成内容",
    "- 目标受众：海外客户",
    "- 设计主题：科技感，极简现代",
    "- 页面结构：多页网站，包含 Home 和 Blog",
    "- 功能需求：中英双语切换",
    "- 核心目标：文章展示",
    "- Logo：先使用文字标识",
    "",
    "[Requirement Form]",
    "```json",
    JSON.stringify(
      {
        siteType: "portfolio",
        targetAudience: ["overseas_customers"],
        contentSources: ["new_site"],
        primaryVisualDirection: "modern-minimal",
        secondaryVisualTags: ["tech"],
        pageStructure: {
          mode: "multi",
          planning: "manual",
          pages: ["home", "blog"],
        },
        functionalRequirements: ["multilingual_switch"],
        primaryGoal: ["文章展示"],
        language: "bilingual",
        brandLogo: {
          mode: "text_mark",
          assetKey: "",
          assetName: "",
          referenceText: "",
          altText: "",
        },
        customNotes: "Focus on AI practice posts and a clear blog entry path.",
      },
      null,
      2,
    ),
    "```",
  ].join("\n");

  it(
    "runs real flow from chat -> generation -> deploy and verifies each stage",
    async () => {
      const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
      const prevAsyncTaskTimeoutMs = process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
      const prevStageBudgetPerFileMs = process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS;
      const prevRoundAbsoluteTimeoutMs = process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS;
      const prevProviderOrder = process.env.LLM_PROVIDER_ORDER;
      let blogSeed: Awaited<ReturnType<typeof seedFullFlowBlogData>> | null = null;
      let chatId = "";

      process.env.CHAT_TASKS_USE_SUPABASE = "0";
      process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = "1800000";
      process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = "300000";
      process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = "480000";
      process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm,crazyrouter";

      try {
        expect(Boolean(process.env.CLOUDFLARE_ACCOUNT_ID)).toBe(true);
        expect(Boolean(process.env.CLOUDFLARE_API_TOKEN)).toBe(true);
        expect(Boolean(process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.CLOUDFLARE_D1_DB_ID || process.env.D1_DATABASE_ID)).toBe(true);

        const marker = Date.now().toString(36);
        chatId = `chat-full-flow-${marker}`;
        const { POST } = await import("../../app/api/chat/route");
        const { GET: getTaskStatus } = await import("../../app/api/chat/tasks/[taskId]/route");
        const { GET: getHistory } = await import("../../app/api/chat/history/route");
        const { GET: getPreviewRoot } = await import("../../app/api/chat/tasks/[taskId]/preview/route");
        const { GET: getPreviewFile } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
        const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");

        // 1) Chat request queues generation task
        const generateReq = new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: confirmPayload(blogRequirement) }] }],
          }),
        });
        const generateRes = await POST(generateReq);
        expect(generateRes.status).toBe(202);

        const queuedGenerateTask = await getLatestChatTaskForChat(chatId);
        expect(queuedGenerateTask).toBeTruthy();
        expect(queuedGenerateTask?.status).toBe("queued");
        expect(queuedGenerateTask?.result?.progress?.stage).toBe("queued");

        // 2) Poll task endpoint before worker execution
        const queuedGenerateStatusRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: queuedGenerateTask!.id }),
        });
        const queuedGenerateStatusJson = await queuedGenerateStatusRes.json();
        expect(queuedGenerateStatusRes.status).toBe(200);
        expect(queuedGenerateStatusJson?.ok).toBe(true);
        expect(queuedGenerateStatusJson?.task?.status).toBe("queued");

        // 3) Run real worker for generation
        const generatedTask = await waitForTerminalTask(queuedGenerateTask!.id, runChatTaskWorkerOnce);
        expect(generatedTask.status).toBe("succeeded");
        expect(generatedTask.result?.progress?.stage).toBe("done");

        const doneGenerateRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: queuedGenerateTask!.id }),
        });
        const doneGenerateJson = await doneGenerateRes.json();
        expect(doneGenerateRes.status).toBe(200);
        expect(doneGenerateJson?.task?.status).toBe("succeeded");
        expect(doneGenerateJson?.task?.result?.progress?.stage).toBe("done");

        const generatedFiles = doneGenerateJson?.task?.result?.progress?.generatedFiles || [];
        expect(generatedFiles).toEqual(expect.arrayContaining(["/index.html", "/styles.css", "/script.js"]));

        const checkpointProjectPath = String(
          doneGenerateJson?.task?.result?.progress?.checkpointProjectPath || "",
        ).trim();
        expect(checkpointProjectPath).toBeTruthy();

        const projectJsonRaw = await fs.readFile(checkpointProjectPath, "utf8");
        const projectJson = JSON.parse(projectJsonRaw);
        expect(projectJson?.staticSite?.mode).toBe("skill-direct");
        expect(Array.isArray(projectJson?.staticSite?.files)).toBe(true);
        expect(
          (projectJson?.staticSite?.files || []).some((f: any) => String(f?.path || "").trim() === "/index.html"),
        ).toBe(true);

        // 4) Verify preview route works for generated checkpoint
        const previewRootRes = await getPreviewRoot(new Request("http://localhost/api/chat/tasks/x/preview"), {
          params: Promise.resolve({ taskId: queuedGenerateTask!.id }),
        });
        expect(previewRootRes.status).toBe(307);
        expect(String(previewRootRes.headers.get("location") || "")).toContain(
          `/api/chat/tasks/${encodeURIComponent(queuedGenerateTask!.id)}/preview/index.html`,
        );

        const previewIndexRes = await getPreviewFile(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: queuedGenerateTask!.id, path: ["index.html"] }),
        });
        expect(previewIndexRes.status).toBe(200);
        const previewHtml = await previewIndexRes.text();
        expect(previewHtml.toLowerCase()).toContain("<!doctype html");
        expect(previewHtml).toContain(`/api/chat/tasks/${encodeURIComponent(queuedGenerateTask!.id)}/preview/`);

        blogSeed = await seedFullFlowBlogData(chatId, marker);

        // 5) Chat request queues deploy task based on generated checkpoint
        const deployReq = new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: "deploy to cloudflare" }] }],
          }),
        });
        const deployQueueRes = await POST(deployReq);
        const deployQueueBody = await deployQueueRes.clone().text();
        expect(deployQueueRes.status, deployQueueBody).toBe(200);

        const deployGateTimeline = await listChatTimelineMessages(chatId, 500);
        const deployConfirm = [...deployGateTimeline]
          .reverse()
          .find((message) => String(message.metadata?.cardType || "") === "confirm_blog_content_deploy");
        expect(deployConfirm).toBeTruthy();
        expect(Array.isArray((deployConfirm?.metadata as any)?.posts)).toBe(true);
        expect((((deployConfirm?.metadata as any)?.posts || []) as unknown[]).length).toBeGreaterThan(0);

        const confirmDeployReq = new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: chatId,
            messages: [{ role: "user", parts: [{ type: "text", text: confirmBlogDeploy() }] }],
          }),
        });
        const confirmDeployRes = await POST(confirmDeployReq);
        const confirmDeployBody = await confirmDeployRes.clone().text();
        expect(confirmDeployRes.status, confirmDeployBody).toBe(202);

        const queuedDeployTask = await getLatestChatTaskForChat(chatId);
        expect(queuedDeployTask).toBeTruthy();
        expect(queuedDeployTask?.id).not.toBe(queuedGenerateTask?.id);
        expect(queuedDeployTask?.status).toBe("queued");
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.deployRequested).toBe(true);
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.deploySourceTaskId).toBe(
          queuedGenerateTask?.id,
        );
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.deploySourceProjectPath).toBe(
          checkpointProjectPath,
        );
        expect((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.blogContentConfirmed).toBe(true);
        expect(Array.isArray((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.blogContentPreviewPosts)).toBe(true);
        expect((((queuedDeployTask?.result?.internal?.inputState as any)?.workflow_context?.blogContentPreviewPosts || []) as unknown[]).length)
          .toBeGreaterThan(0);

        // 6) Run real worker for deploy
        const deployedTask = await waitForTerminalTask(queuedDeployTask!.id, runChatTaskWorkerOnce);
        expect(deployedTask.status).toBe("succeeded");
        expect(deployedTask.result?.progress?.stage).toBe("deployed");

        const doneDeployRes = await getTaskStatus(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: queuedDeployTask!.id }),
        });
        const doneDeployJson = await doneDeployRes.json();
        expect(doneDeployRes.status).toBe(200);
        expect(doneDeployJson?.task?.status).toBe("succeeded");
        expect(doneDeployJson?.task?.result?.progress?.stage).toBe("deployed");
        const deployedUrl = String(doneDeployJson?.task?.result?.deployedUrl || "").replace(/\/+$/, "");
        expect(deployedUrl).toContain(".pages.dev");
        expect(doneDeployJson?.task?.result?.progress?.blogRuntimeStatus).toMatch(/^snapshot:/);
        expect(doneDeployJson?.task?.result?.actions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              text: "View Live Site",
              type: "url",
            }),
          ]),
        );

        // 7) Verify history points to deploy result and contains completion messages
        const historyRes = await getHistory(
          new Request(`http://localhost/api/chat/history?chatId=${encodeURIComponent(chatId)}`),
        );
        const historyJson = await historyRes.json();
        expect(historyRes.status).toBe(200);
        expect(historyJson?.ok).toBe(true);
        expect(historyJson?.task?.id).toBe(queuedDeployTask?.id);
        expect(historyJson?.task?.status).toBe("succeeded");
        expect(String(historyJson?.task?.result?.deployedUrl || "")).toContain(".pages.dev");
        expect(Array.isArray(historyJson?.messages)).toBe(true);
        expect((historyJson?.messages || []).filter((item: any) => item.role === "user").length).toBeGreaterThanOrEqual(1);
        expect((historyJson?.messages || []).filter((item: any) => item.role === "assistant").length).toBeGreaterThanOrEqual(1);

        const home = await fetchTextWithRetry(
          deployedUrl,
          (text, status) => status === 200 && text.toLowerCase().includes("<!doctype html") && text.includes('href="/blog/"'),
        );
        const blog = await fetchTextWithRetry(
          `${deployedUrl}/blog/`,
          (text, status) =>
            status === 200 &&
            text.includes(blogSeed!.title) &&
            text.includes(`Chat full flow online marker ${marker}`) &&
            text.includes("/styles.css"),
        );
        const post = await fetchTextWithRetry(
          `${deployedUrl}/blog/chat-full-flow-blog-verification/`,
          (text, status) => status === 200 && text.includes("Chat full flow blog content marker") && text.includes(marker),
        );
        const snapshot = await fetchTextWithRetry(
          `${deployedUrl}/shpitto-blog-snapshot.json`,
          (text, status) => status === 200 && isDeploymentSnapshotWithMarker(text, blogSeed!.title),
        );

        console.log(
          JSON.stringify(
            {
              CHAT_ENTRY_FULL_FLOW_BLOG_RESULT: {
                deployedUrl,
                homeStatus: home.status,
                blogStatus: blog.status,
                postStatus: post.status,
                snapshotStatus: snapshot.status,
                blogRuntimeStatus: doneDeployJson?.task?.result?.progress?.blogRuntimeStatus,
              },
            },
            null,
            2,
          ),
        );
      } finally {
        if (blogSeed && chatId) {
          await cleanupFullFlowBlogData(chatId, blogSeed.accountId, blogSeed.userId);
        }
        if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
        else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
        if (prevAsyncTaskTimeoutMs === undefined) delete process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
        else process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = prevAsyncTaskTimeoutMs;
        if (prevStageBudgetPerFileMs === undefined) delete process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS;
        else process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = prevStageBudgetPerFileMs;
        if (prevRoundAbsoluteTimeoutMs === undefined) delete process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS;
        else process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = prevRoundAbsoluteTimeoutMs;
        if (prevProviderOrder === undefined) delete process.env.LLM_PROVIDER_ORDER;
        else process.env.LLM_PROVIDER_ORDER = prevProviderOrder;
      }
    },
    900_000,
  );
});
