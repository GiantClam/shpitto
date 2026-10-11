import { describe, expect, it } from "vitest";
import { resolveWebsiteChatActionWithClassifierForTesting } from "../../skills/website-generation-workflow/routing-policy.ts";

describe("website generation workflow routing policy", () => {
  it("accepts LLM-classified blog content actions before generic selector-bound refine", async () => {
    const action = await resolveWebsiteChatActionWithClassifierForTesting(
      {
        userText: "blog文章内容主要是与ai、出海相关的内容，准备3篇",
        stage: "previewing",
      },
      async () => ({
        actionDomain: "blog_content",
        action: "regenerate_posts",
        intent: "refine_preview",
        confidence: 0.94,
        reason: "semantic_blog_topic_and_count_update",
        evidence: ["blog article content", "AI", "global expansion", "3 posts"],
      }),
    );

    expect(action?.intent).toBe("refine_preview");
    expect(action?.refineScope).toBe("structural");
    expect(action?.actionDomain).toBe("blog_content");
    expect(action?.action).toBe("regenerate_posts");
    expect(action?.rejected?.some((item) => item.action === "site_refine.patch")).toBe(true);
  });

  it("accepts LLM-classified shpitto deployment actions before generic refine", async () => {
    const action = await resolveWebsiteChatActionWithClassifierForTesting(
      {
        userText: "部署到 shpitto 服务器",
        stage: "previewing",
      },
      async () => ({
        actionDomain: "deploy",
        action: "deploy_site",
        intent: "deploy",
        confidence: 0.96,
        reason: "semantic_deploy_request",
        evidence: ["publish site to server"],
      }),
    );

    expect(action?.intent).toBe("deploy");
    expect(action?.actionDomain).toBe("deploy");
    expect(action?.action).toBe("deploy_site");
  });

  it("rejects low-confidence LLM classifications", async () => {
    const action = await resolveWebsiteChatActionWithClassifierForTesting(
      {
        userText: "调整一下页面感觉",
        stage: "previewing",
      },
      async () => ({
        actionDomain: "blog_content",
        action: "regenerate_posts",
        intent: "refine_preview",
        confidence: 0.42,
        reason: "ambiguous",
      }),
    );

    expect(action).toBeUndefined();
  });
});
