import { describe, expect, it } from "vitest";
import { getLatestChatTaskForChat, listChatTimelineMessages } from "./chat-task-store";

const replayMessages = [
  "我想做个网站，关于个人blog，主要是介绍ai实践经验的",
  [
    "生成前必填信息已提交：",
    "- 网站类型: 作品集",
    "- 内容来源: 新建站，无现成内容",
    "- 目标受众: 海外客户",
    "- 设计主题: 科技感, 极简现代",
    "- 页面数与页面结构: 多页网站: 博客",
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
        designTheme: ["tech", "minimal"],
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

describe("canonical prompt replay", () => {
  it("replays chat-1777295743941-6q000n messages without legacy prompt fields or product routes", async () => {
    const chatId = `replay-chat-1777295743941-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");

    for (const text of replayMessages) {
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
    const confirm = timeline.find((message) => String(message.metadata?.cardType || "") === "confirm_generate");
    const metadata = (promptCard?.metadata || {}) as Record<string, any>;
    const canonicalPrompt = String(metadata.canonicalPrompt || "");
    const manifest = metadata.promptControlManifest || {};

    expect(canonicalPrompt).toContain("Canonical Website Generation Prompt");
    expect(manifest.routes).toEqual(["/", "/blog"]);
    expect(metadata.promptDraft).toBeUndefined();
    expect(metadata.generationRoutingContract).toBeUndefined();
    expect(canonicalPrompt).not.toContain("/custom-solutions");
    expect(canonicalPrompt).not.toContain("Page-Level Module Blueprint");
    expect(canonicalPrompt).not.toContain("product-grid");
    expect(canonicalPrompt).not.toContain("quote-form");
    expect(canonicalPrompt).toMatch(/blog|博客|AI 实践|ai实践/i);

    const confirmRes = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: chatId,
          messages: [{ role: "user", parts: [{ type: "text", text: String(confirm?.metadata?.payload || "") }] }],
        }),
      }),
    );
    expect(confirmRes.status).toBe(202);

    const task = await getLatestChatTaskForChat(chatId);
    const workflow = (task?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(workflow.canonicalPrompt).toContain("Canonical Website Generation Prompt");
    expect(workflow.promptControlManifest?.routes).toEqual(["/", "/blog"]);
    expect(workflow.requirementDraft).toBeUndefined();
    expect(workflow.generationRoutingContract).toBeUndefined();
  });
});
