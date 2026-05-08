import path from "node:path";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "scripts/.env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });

process.env.CLOUDFLARE_REQUIRE_REAL = "1";

const runLiveReplay = String(process.env.RUN_BLOG_REPLAY_DEPLOY || "").trim() === "1";

const blogReplayMessages = [
  "我想做个网站，关于个人 blog，主要介绍 AI 实践经验。",
  [
    "生成前必填信息已提交：",
    "- 网站类型: 作品集",
    "- 内容来源: 新建站，无现成内容",
    "- 目标受众: 海外客户",
    "- 设计主题: 科技感，极简现代",
    "- 页面数量与页面结构: 多页网站: 博客",
    "- 功能需求: 多语言切换",
    "- 核心转化目标: 文章展示",
    "- 网站语言: 中英双语",
    "- Logo 策略: 暂无 Logo，使用品牌文字标识",
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
          pages: ["blog"],
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
        customNotes: "",
      },
      null,
      2,
    ),
    "```",
  ].join("\n"),
];

function safeToken(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
}

function deployedProjectName(url: string) {
  const host = new URL(url).host.toLowerCase();
  return host.endsWith(".pages.dev") ? host.slice(0, -".pages.dev".length) : "";
}

function buildGeneratedBlogSite(projectId: string, canonicalPrompt: string) {
  return {
    projectId,
    branding: {
      name: "AI Practice Blog",
    },
    pages: [
      { path: "/", seo: { title: "AI Practice Blog", description: "Replay generated home page." } },
      { path: "/blog", seo: { title: "Blog", description: "Replay generated blog page." } },
    ],
    staticSite: {
      mode: "skill-direct",
      routeToFile: {
        "/": "/index.html",
        "/blog": "/blog/index.html",
      },
      files: [
        {
          path: "/index.html",
          type: "text/html",
          content: `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Practice Blog</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main>
    <p class="eyebrow">Replay generated site</p>
    <h1>AI Practice Blog</h1>
    <p>Generated from the canonical blog replay. <a href="/blog/">Read the Blog</a></p>
    <pre data-canonical-prompt>${canonicalPrompt.slice(0, 240)}</pre>
  </main>
</body>
</html>`,
        },
        {
          path: "/blog/index.html",
          type: "text/html",
          content: "<!doctype html><html><body>Replay mock blog placeholder before deployment snapshot injection.</body></html>",
        },
        {
          path: "/styles.css",
          type: "text/css",
          content:
            "body{margin:0;background:#f8fafc;color:#111827;font-family:Georgia,serif}main{width:min(920px,92vw);margin:72px auto}.eyebrow{letter-spacing:.18em;text-transform:uppercase;color:#0f766e}a{color:#0f766e;font-weight:700}pre{white-space:pre-wrap;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:16px}",
        },
      ],
    },
  };
}

async function seedReplayBlogData(projectId: string, marker: string) {
  const { getD1Client } = await import("../d1");
  const d1 = getD1Client();
  await d1.ensureShpittoSchema();
  const now = new Date().toISOString();
  const accountId = `${projectId}-account`;
  const userId = `${projectId}-user`;
  const postId = `${projectId}-post`;
  const title = `Replay Blog Online Verification ${marker}`;
  const contentHtml = `<p>Deployment replay blog content marker: <strong>${marker}</strong>.</p>`;

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
    [projectId, accountId, userId, "AI Practice Blog Replay", JSON.stringify({ projectId, marker }), now, now],
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
    VALUES (?, ?, ?, ?, 'shpitto', ?, ?, ?, ?, ?, 'published', 'Replay Tester', 'AI Practice', ?, '', '', ?, ?, '', '', ?, ?, ?)
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
      "replay-blog-online-verification",
      title,
      `Online verification marker ${marker}`,
      `# ${title}\n\nDeployment replay blog content marker: ${marker}.`,
      contentHtml,
      JSON.stringify(["replay", "deployment"]),
      title,
      `Online verification marker ${marker}`,
      now,
      now,
      now,
    ],
  );

  return { accountId, userId, postId, title };
}

async function cleanupReplayBlogData(projectId: string, accountId: string, userId: string) {
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
      const res = await fetch(url, { headers: { "user-agent": "shpitto-blog-replay-deploy/1.0" } });
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

describe.skipIf(!runLiveReplay)("blog replay live deployment", () => {
  it(
    "generates from the blog replay, deploys to Pages, and verifies the deployed Blog snapshot",
    async () => {
      expect(Boolean(process.env.CLOUDFLARE_ACCOUNT_ID)).toBe(true);
      expect(Boolean(process.env.CLOUDFLARE_API_TOKEN)).toBe(true);
      expect(Boolean(process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.CLOUDFLARE_D1_DB_ID || process.env.D1_DATABASE_ID)).toBe(true);

      const previousTaskStore = process.env.CHAT_TASKS_USE_SUPABASE;
      process.env.CHAT_TASKS_USE_SUPABASE = "0";

      const marker = Date.now().toString(36);
      const chatId = safeToken(`blog-replay-${marker}`);
      const projectId = chatId;
      const keepDeployment = String(process.env.SHPITTO_BLOG_REPLAY_KEEP_DEPLOYMENT || "").trim() === "1";
      let liveUrl = "";
      let projectName = "";
      let seed: Awaited<ReturnType<typeof seedReplayBlogData>> | null = null;

      try {
        const { POST } = await import("../../app/api/chat/route");
        const { createChatTask, getChatTask, listChatTimelineMessages } = await import("./chat-task-store");
        const { SkillRuntimeExecutor } = await import("../skill-runtime/executor");
        for (const text of blogReplayMessages) {
          const res = await POST(
            new Request("http://localhost/api/chat", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                id: chatId,
                messages: [{ role: "user", parts: [{ type: "text", text }] }],
              }),
            }),
          );
          expect(res.status).toBe(200);
        }

        const timeline = await listChatTimelineMessages(chatId, 100);
        const promptCard = timeline.find((message) => String(message.metadata?.cardType || "") === "prompt_draft");
        const metadata = (promptCard?.metadata || {}) as Record<string, any>;
        const canonicalPrompt = String(metadata.canonicalPrompt || "");
        const manifest = metadata.promptControlManifest || {};
        expect(canonicalPrompt).toContain("Canonical Website Generation Prompt");
        expect(manifest.routes).toEqual(["/", "/blog"]);

        seed = await seedReplayBlogData(projectId, marker);

        const task = await createChatTask(chatId);
        let nextState: any;
        await SkillRuntimeExecutor.runTask({
          taskId: task.id,
          chatId,
          workerId: "blog-replay-live-test",
          inputState: {
            messages: [{ role: "user", content: "deploy the replay-generated blog site to cloudflare" }] as any,
            phase: "end",
            current_page_index: 0,
            attempt_count: 0,
            workflow_context: {
              skillId: "website-generation-workflow",
              executionMode: "deploy",
              deployRequested: true,
              sourceRequirement: canonicalPrompt,
              promptControlManifest: manifest,
              preferredLocale: "zh-CN",
            } as any,
            site_artifacts: buildGeneratedBlogSite(projectId, canonicalPrompt) as any,
          } as any,
          setSessionState: (state) => {
            nextState = state;
          },
        });

        const completedTask = await getChatTask(task.id);
        liveUrl = String(nextState?.deployed_url || completedTask?.result?.deployedUrl || "").replace(/\/+$/, "");
        if (!liveUrl) {
          console.log(
            JSON.stringify(
              {
                BLOG_REPLAY_DEPLOY_DEBUG: {
                  taskStatus: completedTask?.status,
                  assistantText: completedTask?.result?.assistantText,
                  error: (completedTask?.result as any)?.error,
                  progress: completedTask?.result?.progress,
                },
              },
              null,
              2,
            ),
          );
        }
        expect(liveUrl).toContain(".pages.dev");
        projectName = deployedProjectName(liveUrl);
        expect(projectName).toBeTruthy();
        expect(nextState?.workflow_context?.blogRuntimeStatus).toMatch(/^snapshot:/);
        expect(nextState?.workflow_context?.smoke?.preDeploy?.status).toBe("passed");
        expect(nextState?.workflow_context?.smoke?.postDeploy?.status).toBe("passed");

        const home = await fetchTextWithRetry(liveUrl, (text, status) => status === 200 && text.includes("AI Practice Blog"));
        const blog = await fetchTextWithRetry(
          `${liveUrl}/blog/`,
          (text, status) => status === 200 && text.includes(seed!.title) && text.includes(`Online verification marker ${marker}`),
        );
        const post = await fetchTextWithRetry(
          `${liveUrl}/blog/replay-blog-online-verification/`,
          (text, status) => status === 200 && text.includes(`Deployment replay blog content marker`) && text.includes(marker),
        );
        const snapshot = await fetchTextWithRetry(
          `${liveUrl}/shpitto-blog-snapshot.json`,
          (text, status) => status === 200 && text.includes('"mode": "deployment-d1-static-snapshot"') && text.includes('"postCount": 1'),
        );

        console.log(
          JSON.stringify(
            {
              BLOG_REPLAY_DEPLOY_RESULT: {
                liveUrl,
                projectName,
                keptDeployment: keepDeployment,
                homeStatus: home.status,
                blogStatus: blog.status,
                postStatus: post.status,
                snapshotStatus: snapshot.status,
                blogRuntimeStatus: nextState?.workflow_context?.blogRuntimeStatus,
              },
            },
            null,
            2,
          ),
        );
      } finally {
        if (seed) {
          await cleanupReplayBlogData(projectId, seed.accountId, seed.userId);
        }
        if (!keepDeployment && projectName) {
          const { CloudflareClient } = await import("../cloudflare");
          await new CloudflareClient().deletePagesProject(projectName);
        }
        if (previousTaskStore === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
        else process.env.CHAT_TASKS_USE_SUPABASE = previousTaskStore;
      }
    },
    900_000,
  );
});
