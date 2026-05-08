import { describe, expect, it } from "vitest";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "scripts/.env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });

const REAL_REPLAY_TASK_ID = process.env.REPLAY_TASK_ID || "7fd74043-5bec-4be9-ac4a-ac8be9031c5a";
const RUN_REAL_ASSET_REPLAY_DEPLOY = process.env.RUN_REAL_ASSET_REPLAY_DEPLOY === "1";

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

function expectProjectAssetCdnUrl(content: string, path: string, segment: "preview" | "release") {
  expect(content).toContain(`/${segment}/`);
  expect(content).toContain(`/files/${path}`);
  expect(content).toContain("https://");
}

async function seedReplayBlogData(projectId: string, marker: string) {
  const { getD1Client } = await import("../d1");
  const d1 = getD1Client();
  await d1.ensureShpittoSchema();
  const now = new Date().toISOString();
  const accountId = `${projectId}-account`;
  const userId = `${projectId}-user`;
  const postId = `${projectId}-post`;
  const title = `Project Asset Replay Blog Verification ${marker}`;
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
    [projectId, accountId, userId, "Project Asset Replay Blog", JSON.stringify({ projectId, marker }), now, now],
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
    VALUES (?, ?, ?, ?, 'shpitto', ?, ?, ?, ?, ?, 'published', 'Replay Tester', 'Replay', ?, '', '', ?, ?, '', '', ?, ?, ?)
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
      "project-asset-replay-blog-verification",
      title,
      `Project asset replay online marker ${marker}`,
      `# ${title}\n\nProject asset replay blog content marker: ${marker}.`,
      `<p>Project asset replay blog content marker: <strong>${marker}</strong>.</p>`,
      JSON.stringify(["project-assets", "replay"]),
      title,
      `Project asset replay online marker ${marker}`,
      now,
      now,
      now,
    ],
  );
  return { accountId, userId, title };
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
      const res = await fetch(url, { headers: { "user-agent": "shpitto-project-assets-replay-deploy/1.0" } });
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
    try {
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
      expectProjectAssetCdnUrl(html, String(imageAsset?.path || ""), "preview");
      expect(html).not.toContain(logicalPath);
      expect(html).not.toContain('src="uploads/"');

      const cssRes = await GET(new Request(`http://localhost/api/chat/tasks/${replayTask.id}/preview/styles.css`), {
        params: Promise.resolve({ taskId: replayTask.id, path: ["styles.css"] }),
      });
      expect(cssRes.status).toBe(200);
      const css = await cssRes.text();
      expectProjectAssetCdnUrl(css, String(imageAsset?.path || ""), "preview");
      expect(css).not.toContain(logicalPath);

      const releaseProject = rewriteProjectAssetLogicalUrlsForRelease(replayProject, { ownerUserId, projectId });
      const releaseHtml = String(releaseProject.staticSite.files[0].content || "");
      const releaseCss = String(releaseProject.staticSite.files[1].content || "");
      expect(releaseHtml).toContain(`${releasePrefix}/${imageAsset?.path}`);
      expect(releaseCss).toContain(`${releasePrefix}/${imageAsset?.path}`);
      expect(releaseHtml).not.toContain(logicalPath);
    } finally {
      if (previousTaskStoreMode === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
      else process.env.CHAT_TASKS_USE_SUPABASE = previousTaskStoreMode;
    }
  }, 120_000);

  it.skipIf(!RUN_REAL_ASSET_REPLAY_DEPLOY)(
    "deploys the replayed asset site and verifies the deployed Blog snapshot",
    async () => {
      expect(Boolean(process.env.CLOUDFLARE_ACCOUNT_ID)).toBe(true);
      expect(Boolean(process.env.CLOUDFLARE_API_TOKEN)).toBe(true);
      expect(Boolean(process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.CLOUDFLARE_D1_DB_ID || process.env.D1_DATABASE_ID)).toBe(true);

      const { getChatTask, createChatTask } = await import("./chat-task-store");
      const {
        listProjectAssets,
        rewriteProjectAssetLogicalUrlsForRelease,
      } = await import("../project-assets");
      const { SkillRuntimeExecutor } = await import("../skill-runtime/executor");

      const previousTaskStoreMode = process.env.CHAT_TASKS_USE_SUPABASE;
      const marker = Date.now().toString(36);
      const deployChatId = safeToken(`asset-replay-${marker}`);
      const keepDeployment = process.env.SHPITTO_REAL_ASSET_REPLAY_KEEP_DEPLOYMENT === "1";
      let seed: Awaited<ReturnType<typeof seedReplayBlogData>> | null = null;
      let projectName = "";
      let liveUrl = "";

      try {
        process.env.CHAT_TASKS_USE_SUPABASE = "1";
        const sourceTask = await getChatTask(REAL_REPLAY_TASK_ID);
        expect(sourceTask).toBeTruthy();
        const ownerUserId = String(sourceTask?.ownerUserId || "").trim();
        const sourceProjectId = String(sourceTask?.chatId || "").trim();
        const assets = await listProjectAssets({ ownerUserId, projectId: sourceProjectId });
        const imageAsset = assets.find((asset) => asset.path === "uploads/file.png") || assets.find((asset) => asset.category === "image");
        expect(imageAsset?.logicalPath).toMatch(/^\/assets\/project\//);

        const logicalPath = String(imageAsset?.logicalPath || "");
        const releaseProject = rewriteProjectAssetLogicalUrlsForRelease(
          {
            projectId: deployChatId,
            branding: { name: "Project Asset Replay Site" },
            pages: [
              { path: "/", seo: { title: "Project Asset Replay Site", description: "Replay asset deployment page." } },
              { path: "/blog", seo: { title: "Blog", description: "Blog snapshot page." } },
            ],
            staticSite: {
              mode: "skill-direct",
              routeToFile: { "/": "/index.html", "/blog": "/blog/index.html" },
              files: [
                {
                  path: "/index.html",
                  type: "text/html",
                  content: `<!doctype html><html><head><title>Project Asset Replay Site</title><link rel="stylesheet" href="/styles.css"></head><body><main><h1>Project Asset Replay Site</h1><img src="${logicalPath}" alt="Replay logo"><p><a href="/blog/">Read Blog</a></p></main></body></html>`,
                },
                {
                  path: "/blog/index.html",
                  type: "text/html",
                  content: "<!doctype html><html><body>Project asset replay mock blog placeholder before deployment snapshot injection.</body></html>",
                },
                {
                  path: "/styles.css",
                  type: "text/css",
                  content: `body{font-family:Georgia,serif;margin:48px;background:#f8fafc;color:#111827}.hero{background-image:url("${logicalPath}")}img{max-width:280px;border-radius:18px}`,
                },
              ],
            },
          },
          { ownerUserId, projectId: sourceProjectId },
        );
        expectProjectAssetCdnUrl(String(releaseProject.staticSite.files[0].content || ""), String(imageAsset?.path || ""), "release");

        seed = await seedReplayBlogData(deployChatId, marker);
        process.env.CHAT_TASKS_USE_SUPABASE = "0";
        const deployTask = await createChatTask(deployChatId);
        let nextState: any;
        await SkillRuntimeExecutor.runTask({
          taskId: deployTask.id,
          chatId: deployChatId,
          workerId: "project-assets-replay-deploy-test",
          inputState: {
            messages: [{ role: "user", content: "deploy to cloudflare" }] as any,
            phase: "end",
            current_page_index: 0,
            attempt_count: 0,
            workflow_context: {
              skillId: "website-generation-workflow",
              executionMode: "deploy",
              deployRequested: true,
              sourceRequirement: "Project assets replay deployment with Blog snapshot.",
              preferredLocale: "en",
            } as any,
            site_artifacts: releaseProject as any,
          } as any,
          setSessionState: (state) => {
            nextState = state;
          },
        });

        liveUrl = String(nextState?.deployed_url || "").replace(/\/+$/, "");
        expect(liveUrl).toContain(".pages.dev");
        projectName = deployedProjectName(liveUrl);
        expect(projectName).toBeTruthy();
        expect(nextState?.workflow_context?.blogRuntimeStatus).toMatch(/^snapshot:/);
        expect(nextState?.workflow_context?.smoke?.preDeploy?.status).toBe("passed");
        expect(nextState?.workflow_context?.smoke?.postDeploy?.status).toBe("passed");

        const home = await fetchTextWithRetry(liveUrl, (text, status) => status === 200 && text.includes("Project Asset Replay Site") && text.includes("/release/current/files"));
        const blog = await fetchTextWithRetry(`${liveUrl}/blog/`, (text, status) => status === 200 && text.includes(seed!.title) && text.includes(`Project asset replay online marker ${marker}`));
        const post = await fetchTextWithRetry(`${liveUrl}/blog/project-asset-replay-blog-verification/`, (text, status) => status === 200 && text.includes("Project asset replay blog content marker") && text.includes(marker));
        const snapshot = await fetchTextWithRetry(`${liveUrl}/shpitto-blog-snapshot.json`, (text, status) => status === 200 && text.includes('"mode": "deployment-d1-static-snapshot"') && text.includes('"postCount": 1'));

        console.log(
          JSON.stringify(
            {
              PROJECT_ASSET_REPLAY_DEPLOY_RESULT: {
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
        if (seed) await cleanupReplayBlogData(deployChatId, seed.accountId, seed.userId);
        if (!keepDeployment && projectName) {
          const { CloudflareClient } = await import("../cloudflare");
          await new CloudflareClient().deletePagesProject(projectName);
        }
        if (previousTaskStoreMode === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
        else process.env.CHAT_TASKS_USE_SUPABASE = previousTaskStoreMode;
      }
    },
    900_000,
  );
});
