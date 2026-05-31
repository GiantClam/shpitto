import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import {
  applyForcedDesignTemplateToReplayInputState,
  captureMobilePreviewScreenshots,
  loadGeneratedProject,
  parsePromptControlManifest,
  rewriteCanonicalPromptWithForcedDesignTemplate,
  rewriteCanonicalPromptToHomepageOnly,
} from "./chat-replay-live-test-helpers";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "scripts/.env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });

const runLocalReplay = String(process.env.RUN_LOCAL_VBUY_REPLAY || "").trim() === "1";
const replayHomepageOnly = String(process.env.RUN_LOCAL_VBUY_REPLAY_HOME_ONLY || "1").trim() !== "0";
const replayForcedStyle = String(process.env.RUN_LOCAL_VBUY_REPLAY_STYLE || "").trim().toLowerCase();
const replayOverrideText = String(process.env.RUN_LOCAL_VBUY_REPLAY_OVERRIDE_TEXT || "").trim();
const replayChatId = "chat-1779220706580-re50a1";
const latestReplayInfoPath = path.resolve(process.cwd(), ".tmp", "chat-tasks", "local-vbuy-replay-latest.json");

const vbuyInitialRequirement =
  "提取https://www.vbuytextile.com/网站的信息、页面结构和图片，做一个毛巾的渠道外贸电商公司的官网";

function vbuyRequirementFormPayload() {
  return [
    "生成前必填信息已提交：",
    "- 网站类型: 企业官网",
    "- 内容来源: 已有域名或旧站",
    "- 目标受众: 企业采购",
    "- 设计主题: 传承制造 / 匠心工厂 · 温暖亲和",
    "- 页面数与页面结构: 多页网站: 自动规划页面结构",
    "- 功能需求: 客户询盘表单填写",
    "- 核心转化目标: 展示产品, 获取咨询, 建立品牌信任",
    "- 网站语言: 中英双语",
    "- Logo 策略: 暂无 Logo，使用品牌文字标识",
    "",
    "[Requirement Form]",
    "```json",
    JSON.stringify(
      {
        siteType: "company",
        targetAudience: ["enterprise_buyers"],
        contentSources: ["existing_domain"],
        primaryVisualDirection: "heritage-manufacturing",
        secondaryVisualTags: ["warm"],
        pageStructure: {
          mode: "multi",
          planning: "auto",
          pages: [],
        },
        functionalRequirements: ["customer_inquiry_form"],
        primaryGoal: ["product_showcase", "lead_generation", "brand_trust"],
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
  ].join("\n");
}

process.env.CHAT_TASKS_USE_SUPABASE = "1";

async function persistReplayPreviewFallback(chatId: string, taskId: string, project: any) {
  const files = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
  if (files.length === 0) return { checkpointProjectPath: null as string | null };

  const taskRoot = path.resolve(process.cwd(), ".tmp", "chat-tasks", chatId, taskId);
  const siteRoot = path.join(taskRoot, "latest", "site");
  await fs.mkdir(siteRoot, { recursive: true });

  for (const file of files) {
    const filePath = String(file?.path || "").trim();
    const content = String(file?.content || "");
    if (!filePath || !filePath.startsWith("/")) continue;
    const relative = filePath.replace(/^\/+/, "");
    const outputPath = path.join(siteRoot, relative);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, "utf8");
  }

  const checkpointProjectPath = path.join(taskRoot, "project.json");
  await fs.mkdir(path.dirname(checkpointProjectPath), { recursive: true });
  await fs.writeFile(checkpointProjectPath, JSON.stringify(project, null, 2), "utf8");
  return { checkpointProjectPath };
}

async function persistReplayCheckpointFallback(
  chatId: string,
  taskId: string,
  progress: Record<string, any> | undefined,
) {
  const checkpointDir = String(progress?.checkpointDir || progress?.artifactKey || "").trim();
  const checkpointSiteDir = String(progress?.checkpointSiteDir || "").trim();
  const checkpointProjectPath = String(progress?.checkpointProjectPath || "").trim();
  if (!checkpointDir && !checkpointSiteDir && !checkpointProjectPath) {
    return { checkpointProjectPath: null as string | null };
  }

  const taskRoot = path.resolve(process.cwd(), ".tmp", "chat-tasks", chatId, taskId);
  const latestSiteRoot = path.join(taskRoot, "latest", "site");
  const mergedSiteRoot = path.join(taskRoot, "site");
  const siteCandidates = [checkpointSiteDir, path.join(checkpointDir, "latest", "site"), path.join(checkpointDir, "site")]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  let copiedDirectSite = false;

  for (const siteCandidate of siteCandidates) {
    try {
      await fs.access(path.join(siteCandidate, "index.html"));
      await fs.mkdir(path.dirname(latestSiteRoot), { recursive: true });
      await fs.rm(latestSiteRoot, { recursive: true, force: true }).catch(() => undefined);
      await fs.cp(siteCandidate, latestSiteRoot, { recursive: true });
      await fs.mkdir(path.dirname(mergedSiteRoot), { recursive: true });
      await fs.rm(mergedSiteRoot, { recursive: true, force: true }).catch(() => undefined);
      await fs.cp(siteCandidate, mergedSiteRoot, { recursive: true });
      copiedDirectSite = true;
      break;
    } catch {
      // try next candidate
    }
  }

  if (!copiedDirectSite && checkpointDir) {
    const stepsRoot = path.join(checkpointDir, "steps");
    try {
      const stepEntries = await fs.readdir(stepsRoot, { withFileTypes: true });
      const stepSiteDirs = stepEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
          siteDir: path.join(stepsRoot, entry.name, "site"),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      let mergedAny = false;
      await fs.rm(latestSiteRoot, { recursive: true, force: true }).catch(() => undefined);
      await fs.rm(mergedSiteRoot, { recursive: true, force: true }).catch(() => undefined);
      for (const step of stepSiteDirs) {
        try {
          await fs.access(step.siteDir);
          await fs.mkdir(latestSiteRoot, { recursive: true });
          await fs.mkdir(mergedSiteRoot, { recursive: true });
          await fs.cp(step.siteDir, latestSiteRoot, { recursive: true, force: true });
          await fs.cp(step.siteDir, mergedSiteRoot, { recursive: true, force: true });
          mergedAny = true;
        } catch {
          // ignore missing step site dir
        }
      }
      copiedDirectSite = mergedAny;
    } catch {
      // ignore missing steps directory
    }
  }

  const projectCandidates = [checkpointProjectPath, path.join(checkpointDir, "project.json")]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const replayProjectPath = path.join(taskRoot, "project.json");
  for (const projectCandidate of projectCandidates) {
    try {
      await fs.access(projectCandidate);
      await fs.mkdir(path.dirname(replayProjectPath), { recursive: true });
      await fs.copyFile(projectCandidate, replayProjectPath);
      return { checkpointProjectPath: replayProjectPath };
    } catch {
      // try next candidate
    }
  }

  return { checkpointProjectPath: null as string | null };
}

async function findLatestGeneratedHomepageHtml(taskDir: string): Promise<string> {
  const stepsRoot = path.join(taskDir, "steps");
  const htmlCandidates: Array<{ file: string; order: number }> = [];
  try {
    const stepEntries = await fs.readdir(stepsRoot, { withFileTypes: true });
    for (const entry of stepEntries) {
      if (!entry.isDirectory()) continue;
      const match = entry.name.match(/^(\d+)-/);
      const order = match ? Number(match[1]) : 0;
      const file = path.join(stepsRoot, entry.name, "site", "index.html");
      try {
        await fs.access(file);
        htmlCandidates.push({ file, order });
      } catch {
        // ignore
      }
    }
  } catch {
    return "";
  }
  if (htmlCandidates.length === 0) return "";
  htmlCandidates.sort((a, b) => a.order - b.order);
  return fs.readFile(htmlCandidates[htmlCandidates.length - 1]!.file, "utf8");
}

async function findLatestGeneratedStylesCss(taskDir: string): Promise<string> {
  const stepsRoot = path.join(taskDir, "steps");
  const cssCandidates: Array<{ file: string; order: number }> = [];
  try {
    const stepEntries = await fs.readdir(stepsRoot, { withFileTypes: true });
    for (const entry of stepEntries) {
      if (!entry.isDirectory()) continue;
      const match = entry.name.match(/^(\d+)-/);
      const order = match ? Number(match[1]) : 0;
      const file = path.join(stepsRoot, entry.name, "site", "styles.css");
      try {
        await fs.access(file);
        cssCandidates.push({ file, order });
      } catch {
        // ignore
      }
    }
  } catch {
    return "";
  }
  if (cssCandidates.length === 0) return "";
  cssCandidates.sort((a, b) => a.order - b.order);
  return fs.readFile(cssCandidates[cssCandidates.length - 1]!.file, "utf8");
}

describe.skipIf(!runLocalReplay)("vbuy replay validation", () => {
  it(
    "replays the VBUY chat without reintroducing undeclared blog detail requirements",
    async () => {
      const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
      const prevSupabaseProxy = process.env.SUPABASE_TASK_PROXY_URL;
      const prevAsyncTaskTimeoutMs = process.env.CHAT_ASYNC_TASK_TIMEOUT_MS;
      const prevStageBudgetPerFileMs = process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS;
      const prevRoundAbsoluteTimeoutMs = process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS;
      const prevRoundIdleTimeoutMs = process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS;
      const prevProvider = process.env.LLM_PROVIDER;
      const prevProviderOrder = process.env.LLM_PROVIDER_ORDER;
      const replayLocalChatId = [
        "local-vbuy-replay",
        replayHomepageOnly ? "home" : "full",
        replayForcedStyle || "default",
        replayOverrideText ? "override" : "base",
        String(Date.now()),
      ].join("-");
      let replayOwnerUserId: string | undefined;

      try {
        process.env.SUPABASE_TASK_PROXY_URL = "direct";
        process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = "1800000";
        process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = "420000";
        process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS = "420000";
        process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = "480000";

        const { getLatestChatTaskForChat, listChatTimelineMessages } = await import("./chat-task-store");
        let ownerUserId: string | undefined;
        try {
          const beforeLatest = await getLatestChatTaskForChat(replayChatId);
          ownerUserId = String(beforeLatest?.ownerUserId || "").trim() || undefined;
        } catch {
          ownerUserId = undefined;
        }
        replayOwnerUserId = ownerUserId;

        process.env.CHAT_TASKS_USE_SUPABASE = "0";
        (globalThis as any).__shpittoChatTaskStore = undefined;

        const { POST } = await import("../../app/api/chat/route");
        const { SkillRuntimeExecutor } = await import("../skill-runtime/executor");

        const firstRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: replayLocalChatId,
              user_id: ownerUserId,
              messages: [{ role: "user", parts: [{ type: "text", text: vbuyInitialRequirement }] }],
            }),
          }),
        );
        const firstBody = await firstRes.clone().text();
        expect(firstRes.status, firstBody).toBe(200);

        const secondRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: replayLocalChatId,
              user_id: ownerUserId,
              messages: [{ role: "user", parts: [{ type: "text", text: vbuyRequirementFormPayload() }] }],
            }),
          }),
        );
        const secondBody = await secondRes.clone().text();
        expect(secondRes.status, secondBody).toBe(200);

        if (replayOverrideText) {
          const overrideRes = await POST(
            new Request("http://localhost/api/chat", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                id: replayLocalChatId,
                user_id: ownerUserId,
                messages: [{ role: "user", parts: [{ type: "text", text: replayOverrideText }] }],
              }),
            }),
          );
          const overrideBody = await overrideRes.clone().text();
          expect(overrideRes.status, overrideBody).toBe(200);
        }

        const draftTimeline = await listChatTimelineMessages(replayLocalChatId, 100);
        const promptDraftCard = [...draftTimeline]
          .reverse()
          .find((message) => String(message.metadata?.cardType || "") === "prompt_draft");
        const confirmCard = [...draftTimeline]
          .reverse()
          .find((message) => String(message.metadata?.cardType || "") === "confirm_generate");
        const replayPrompt = String((promptDraftCard?.metadata as any)?.canonicalPrompt || "").trim();
        const promptManifest = parsePromptControlManifest(replayPrompt);
        const confirmPayload = String((confirmCard?.metadata as any)?.payload || "").trim();
        const replayCanonicalPromptBase = replayHomepageOnly
          ? rewriteCanonicalPromptToHomepageOnly(replayPrompt)
          : replayPrompt;
        const replayCanonicalPrompt = replayForcedStyle
          ? rewriteCanonicalPromptWithForcedDesignTemplate(replayCanonicalPromptBase, replayForcedStyle)
          : replayCanonicalPromptBase;
        const replayCanonicalManifest = parsePromptControlManifest(replayCanonicalPrompt);
        const finalConfirmPayload =
          replayHomepageOnly && replayCanonicalPrompt
            ? `__SHP_CONFIRM_GENERATE__\n${replayCanonicalPrompt}`
            : confirmPayload;

        expect(replayPrompt.length).toBeGreaterThan(40);
        if (replayOverrideText) {
          expect(replayPrompt).toMatch(/IBM|Carbon/i);
        }
        expect(promptManifest?.routes || []).not.toContain("/blog");
        if (replayHomepageOnly) {
          expect(replayCanonicalManifest?.routes || []).toEqual(["/"]);
          expect(replayCanonicalManifest?.files || []).toEqual([
            "/styles.css",
            "/script.js",
            "/index.html",
            "/i18n/messages.en.json",
            "/i18n/messages.zh-CN.json",
          ]);
        }
        expect(finalConfirmPayload.startsWith("__SHP_CONFIRM_GENERATE__")).toBe(true);

        const generateRes = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: replayLocalChatId,
              user_id: ownerUserId,
              messages: [{ role: "user", parts: [{ type: "text", text: finalConfirmPayload }] }],
            }),
          }),
        );
        const generateBody = await generateRes.clone().text();
        expect(generateRes.status, generateBody).toBe(202);

        const queuedGenerate = await getLatestChatTaskForChat(replayLocalChatId);
        expect(queuedGenerate?.id).toBeTruthy();
        const replayInputState = replayForcedStyle
          ? applyForcedDesignTemplateToReplayInputState(
              (queuedGenerate?.result?.internal?.inputState || {}) as any,
              replayForcedStyle,
              replayCanonicalPrompt,
            )
          : ((queuedGenerate?.result?.internal?.inputState || {}) as any);

        await SkillRuntimeExecutor.runTask({
          taskId: queuedGenerate!.id,
          chatId: replayLocalChatId,
          workerId: "vbuy-local-replay-test",
          inputState: replayInputState,
        });

        const generated = await getLatestChatTaskForChat(replayLocalChatId);
        expect(generated?.id).toBeTruthy();
        let persistedCheckpointProjectPath: string | null = null;
        try {
          const generatedProject = await loadGeneratedProject(generated);
          const persisted = await persistReplayPreviewFallback(replayLocalChatId, String(generated?.id || ""), generatedProject.project);
          persistedCheckpointProjectPath = persisted.checkpointProjectPath;
        } catch {
          persistedCheckpointProjectPath = null;
        }
        if (!persistedCheckpointProjectPath) {
          const persistedFromCheckpoint = await persistReplayCheckpointFallback(
            replayLocalChatId,
            String(generated?.id || ""),
            (generated?.result?.progress || {}) as Record<string, any>,
          );
          persistedCheckpointProjectPath = persistedFromCheckpoint.checkpointProjectPath;
        }

        await fs.mkdir(path.dirname(latestReplayInfoPath), { recursive: true });
        const previewUrl = generated?.id
          ? `http://localhost:3000/api/chat/tasks/${generated.id}/preview/index.html`
          : null;
        const shouldRunMobileScreenshotQa =
          String(process.env.RUN_PREVIEW_MOBILE_SCREENSHOT_QA || "").trim() === "1";
        const mobileScreenshotQa =
          shouldRunMobileScreenshotQa && previewUrl
            ? await captureMobilePreviewScreenshots({
                previewUrl,
                outputDir: path.resolve(process.cwd(), ".tmp", "qa-screenshots", replayLocalChatId, String(generated?.id || "")),
              })
            : {
                previewUrl: previewUrl || "",
                artifacts: [],
                executed: false,
                skippedReason: !previewUrl
                  ? "Missing preview URL."
                  : "RUN_PREVIEW_MOBILE_SCREENSHOT_QA != 1",
              };
        if (shouldRunMobileScreenshotQa && previewUrl) {
          expect(mobileScreenshotQa.executed).toBe(true);
          expect(mobileScreenshotQa.artifacts.length).toBeGreaterThanOrEqual(4);
        }
        await fs.writeFile(
          latestReplayInfoPath,
          JSON.stringify(
            {
              sourceChatId: replayChatId,
              replayChatId: replayLocalChatId,
              taskId: generated?.id,
              status: generated?.status,
              previewUrl,
              homepageOnly: replayHomepageOnly,
              forcedStyle: replayForcedStyle || null,
              overrideText: replayOverrideText || null,
              mobileScreenshotQa,
              checkpointProjectPath:
                persistedCheckpointProjectPath || generated?.result?.progress?.checkpointProjectPath || null,
              checkpointDir: generated?.result?.progress?.checkpointDir || generated?.result?.progress?.artifactKey || null,
              checkpointSiteDir: generated?.result?.progress?.checkpointSiteDir || null,
              error: generated?.result?.error || null,
              progress: generated?.result?.progress || null,
              updatedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
          "utf8",
        );

        const finalError = String(generated?.result?.error || "");
        expect(finalError).not.toContain("/blog/gift-box-material-balance/index.html");
        expect(finalError).not.toContain("/blog/towel-handfeel-checklist/index.html");
        expect(finalError).not.toContain("/blog/sports-textile-color-consistency/index.html");

        const generatedTaskDir = path.resolve(process.cwd(), ".tmp", "chat-tasks", replayLocalChatId, String(generated?.id || ""));
        const latestHomepageHtml = await findLatestGeneratedHomepageHtml(generatedTaskDir);
        const latestStylesCss = await findLatestGeneratedStylesCss(generatedTaskDir);
        if (latestHomepageHtml) {
          const expectsIbmHomepage =
            replayForcedStyle === "ibm" || (replayOverrideText && /IBM|Carbon/i.test(replayOverrideText));
          if (expectsIbmHomepage) {
            expect(latestHomepageHtml).toMatch(/\benterprise-hero\b/i);
            expect(latestHomepageHtml).toMatch(/\benterprise-hero__content\b/i);
            expect(latestHomepageHtml).toMatch(/\benterprise-hero__media\b/i);
            expect(latestHomepageHtml).toMatch(
              /\benterprise-hero__media\b[\s\S]*?<img[^>]+images\.unsplash\.com/i,
            );
            expect((latestHomepageHtml.match(/<h1\b/gi) || []).length).toBe(1);
            expect(latestHomepageHtml).toMatch(
              /\benterprise-hero__content\b[\s\S]*?<h1\b/i,
            );
            expect(latestHomepageHtml).not.toMatch(/\bmedia-frame\b/i);
            expect(latestHomepageHtml).not.toMatch(/\bhero(?:__grid|-grid)\b/i);
            expect(latestHomepageHtml).not.toMatch(/\bhero-copy\b/i);
            expect(latestHomepageHtml).not.toMatch(/\bhero__body\b/i);
            expect(latestHomepageHtml).not.toMatch(/\bcontent-band--split\b/i);
            expect(latestHomepageHtml).not.toMatch(/<section\b[^>]*class="[^"]*\bcapabilities\b[\s\S]*?<h1\b/i);
            expect(latestHomepageHtml).not.toMatch(/<aside\b[^>]*class="[^"]*\bdetail\b/i);
            expect(latestHomepageHtml).not.toMatch(/<nav\b[^>]*>[\s\S]*?\bclass="locale-switch"[\s\S]*?<\/nav>/i);
            expect(latestHomepageHtml).not.toMatch(/<\/a><div class="locale-switch"/i);
            expect(latestHomepageHtml).not.toMatch(/<div class="utility language-switch"[^>]*><\/div>/i);
            expect(latestHomepageHtml).not.toMatch(/<div class="section__header" style=/i);
            if (latestStylesCss) {
              expect(latestStylesCss).not.toMatch(/--section-gap:\s*clamp\(2\.5rem,\s*5vw,\s*5rem\)/i);
              expect(latestStylesCss).not.toMatch(
                /\.main-inner\s*\{[\s\S]*padding-block:\s*clamp\(1\.25rem,\s*2vw,\s*2rem\)\s+var\(--section-gap\)/i,
              );
            }
          }
        }

        if (generated?.status === "succeeded") {
          const generatedProject = await loadGeneratedProject(generated);
          const files = (generatedProject.project?.staticSite?.files || []) as Array<{ path?: string }>;
          const paths = files.map((file) => String(file.path || ""));
          if (replayForcedStyle === "ibm" || (replayOverrideText && /IBM|Carbon/i.test(replayOverrideText))) {
            expect(String((generatedProject.project as any)?.skillHit?.id || "")).toBe("ibm");
          }
          if (replayHomepageOnly) {
            expect(paths).toContain("/index.html");
            expect(paths).not.toContain("/products/index.html");
            expect(paths).not.toContain("/custom-solutions/index.html");
            expect(paths).not.toContain("/cases/index.html");
            expect(paths).not.toContain("/contact/index.html");
            expect(paths).not.toContain("/about/index.html");
          }
          expect(paths).not.toContain("/blog/index.html");
          expect(paths.filter((item) => /^\/blog\/[^/]+\/index\.html$/i.test(item))).toHaveLength(0);
        }
      } finally {
        if (replayOwnerUserId) {
          try {
            const { releaseCreatedProjectUsageReservation } = await import("../billing/store");
            await releaseCreatedProjectUsageReservation({
              ownerUserId: replayOwnerUserId,
              sourceProjectId: replayLocalChatId,
            });
          } catch {
            // best-effort replay quota cleanup
          }
        }
        process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
        if (prevSupabaseProxy === undefined) delete process.env.SUPABASE_TASK_PROXY_URL;
        else process.env.SUPABASE_TASK_PROXY_URL = prevSupabaseProxy;
        process.env.CHAT_ASYNC_TASK_TIMEOUT_MS = prevAsyncTaskTimeoutMs;
        process.env.SKILL_TOOL_STAGE_BUDGET_PER_FILE_MS = prevStageBudgetPerFileMs;
        if (prevRoundIdleTimeoutMs === undefined) delete process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS;
        else process.env.SKILL_TOOL_ROUND_IDLE_TIMEOUT_MS = prevRoundIdleTimeoutMs;
        process.env.SKILL_TOOL_ROUND_ABSOLUTE_TIMEOUT_MS = prevRoundAbsoluteTimeoutMs;
        if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
        else process.env.LLM_PROVIDER = prevProvider;
        if (prevProviderOrder === undefined) delete process.env.LLM_PROVIDER_ORDER;
        else process.env.LLM_PROVIDER_ORDER = prevProviderOrder;
      }
    },
    30 * 60 * 1000,
  );
});
