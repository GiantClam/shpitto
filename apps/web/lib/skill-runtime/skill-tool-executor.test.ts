import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { runSkillToolExecutor } from "./skill-tool-executor";

describe("skill-tool-executor", () => {
  it("generates required static files in local fallback mode", async () => {
    const result = await runSkillToolExecutor({
      state: {
        messages: [new HumanMessage("Generate website routes / and /contact with industrial style.")],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
      } as any,
      timeoutMs: 60_000,
    });

    expect(result.phase).toBe("end");
    expect(result.generatedFiles).toEqual(
      expect.arrayContaining(["/styles.css", "/script.js", "/index.html", "/contact/index.html"]),
    );

    const workflowFiles = ((result.state as any)?.site_artifacts?.workflowArtifacts?.files || []).map((f: any) =>
      String(f?.path || "").toLowerCase(),
    );
    expect(workflowFiles).toEqual(expect.arrayContaining(["/task_plan.md", "/findings.md", "/design.md"]));

    const staticFiles = ((result.state as any)?.site_artifacts?.staticSite?.files || []) as Array<{
      path?: string;
      content?: string;
    }>;
    const rootHtml = String(staticFiles.find((f) => String(f?.path) === "/index.html")?.content || "");
    const contactHtml = String(staticFiles.find((f) => String(f?.path) === "/contact/index.html")?.content || "");
    expect(rootHtml).toContain('href="./styles.css"');
    expect(rootHtml).toContain('src="./script.js"');
    expect(contactHtml).toContain('href="../styles.css"');
    expect(contactHtml).toContain('src="../script.js"');
  });

  it("plans CASUX prompt routes dynamically instead of fixed industrial defaults", async () => {
    const result = await runSkillToolExecutor({
      state: {
        messages: [
          new HumanMessage(
            "生成 CASUX 官网。主导航菜单：首页 | CASUX创设 | CASUX建设 | CASUX优标 | CASUX倡导 | CASUX研究中心 | CASUX信息平台 | 资料下载",
          ),
        ],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
      } as any,
      timeoutMs: 60_000,
    });

    expect(result.phase).toBe("end");
    expect(result.generatedFiles).toEqual(
      expect.arrayContaining([
        "/index.html",
        "/casux-creation/index.html",
        "/casux-construction/index.html",
        "/casux-certification/index.html",
        "/casux-advocacy/index.html",
        "/casux-research-center/index.html",
        "/casux-information-platform/index.html",
        "/downloads/index.html",
      ]),
    );
    expect(result.generatedFiles).not.toEqual(expect.arrayContaining(["/3c-machines/index.html", "/custom-solutions/index.html"]));
  });

  it("extracts requirement from serialized HumanMessage payload", async () => {
    const serializedHumanMessage = {
      id: ["langchain_core", "messages", "HumanMessage"],
      kwargs: { content: "Generate routes / and /pricing with a fintech positioning." },
      type: "human",
    };
    const result = await runSkillToolExecutor({
      state: {
        messages: [serializedHumanMessage as any],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
      } as any,
      timeoutMs: 60_000,
    });

    expect(result.generatedFiles).toEqual(expect.arrayContaining(["/pricing/index.html"]));
    const workflowFiles = ((result.state as any)?.site_artifacts?.workflowArtifacts?.files || []) as Array<{
      path?: string;
      content?: string;
    }>;
    const findings = String(workflowFiles.find((file) => file.path === "/findings.md")?.content || "");
    expect(findings).toContain("Generate routes / and /pricing");
  });

  it("falls back to workflow requirementDraft when user message is missing", async () => {
    const requirementDraft = "Create website routes: Home | About | Contact with premium consulting tone.";
    const result = await runSkillToolExecutor({
      state: {
        messages: [{ type: "ai", content: "assistant-only message" } as any],
        workflow_context: {
          requirementDraft,
        },
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
      } as any,
      timeoutMs: 60_000,
    });

    expect(result.generatedFiles).toEqual(expect.arrayContaining(["/index.html"]));
    const workflowFiles = ((result.state as any)?.site_artifacts?.workflowArtifacts?.files || []) as Array<{
      path?: string;
      content?: string;
    }>;
    const findings = String(workflowFiles.find((file) => file.path === "/findings.md")?.content || "");
    expect(findings).toContain("Home | About | Contact");
  });

  it("does not convert control phrases into bogus routes", async () => {
    const result = await runSkillToolExecutor({
      state: {
        messages: [
          new HumanMessage(
            [
              "Build a 6-page industrial-style English website for LC-CNC: Home, 3C Machines, Custom Solutions, Cases, About, Contact.",
              "__SHP_CONFIRM_GENERATE__ please generate from prompt draft",
              "保留触发词（开始生成 / prompt draft / __SHP_CONFIRM_GENERATE__）",
              "Cases page tags: 3C, Aluminum, High Precision, Automation.",
              "Tags must be available as: 3C / Aluminum / High Precision / Automation.",
              "Each page should contain header/nav/main/footer.",
            ].join("\n"),
          ),
        ],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
      } as any,
      timeoutMs: 60_000,
    });

    expect(result.generatedFiles).toEqual(
      expect.arrayContaining([
        "/index.html",
        "/3c-machines/index.html",
        "/custom-solutions/index.html",
        "/cases/index.html",
        "/about/index.html",
        "/contact/index.html",
      ]),
    );
    expect(result.generatedFiles).not.toEqual(
      expect.arrayContaining([
        "/prompt-draft/index.html",
        "/shp-confirm-generate/index.html",
        "/6/index.html",
        "/3c/index.html",
        "/aluminum/index.html",
        "/high-precision/index.html",
        "/automation/index.html",
        "/aluminum/high/index.html",
        "/nav/main/footer/index.html",
      ]),
    );
  });
});
