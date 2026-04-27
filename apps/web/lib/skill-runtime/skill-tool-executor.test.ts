import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import {
  formatTargetPageContract,
  enforceNavigationOrder,
  htmlPathToRoute,
  invokeModelWithRetry,
  isRetryableProviderError,
  normalizeToolChoiceForProvider,
  resolveToolProtocolForProvider,
  runSkillToolExecutor,
  sanitizeRequirementForGenerationForTesting,
  validateAndNormalizeRequiredFiles,
} from "./skill-tool-executor";
import { buildLocalDecisionPlan } from "./decision-layer";

async function* streamFrom(chunks: any[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function validGeneratedFiles(routes: string[]) {
  return [
    { path: "/styles.css", content: "body { color: #111; }", type: "text/css" },
    { path: "/script.js", content: "document.documentElement.dataset.ready = 'true';", type: "text/javascript" },
    ...routes.map((route) => {
      const path = route === "/" ? "/index.html" : `${route}/index.html`;
      return {
        path,
        type: "text/html",
        content: [
          "<!doctype html>",
          '<html lang="en">',
          "<head>",
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <link rel="stylesheet" href="/styles.css" />',
          "</head>",
          "<body>",
          "  <nav>",
          '    <a href="/">Home</a>',
          '    <a href="/contact/">Contact</a>',
          "  </nav>",
          "  <main>Generated page</main>",
          '  <script src="/script.js"></script>',
          "</body>",
          "</html>",
        ].join("\n"),
      };
    }),
  ];
}

describe("skill-tool-executor", () => {
  it("downgrades named tool choice for Aiberm compatibility", () => {
    const namedFinishChoice = { type: "function", function: { name: "finish" } };

    expect(normalizeToolChoiceForProvider({ provider: "aiberm" }, namedFinishChoice)).toBe("required");
    expect(normalizeToolChoiceForProvider({ provider: "crazyroute" }, namedFinishChoice)).toEqual(namedFinishChoice);
    expect(normalizeToolChoiceForProvider({ provider: "aiberm" }, "required")).toBe("required");
  });

  it("restricts Aiberm tools when named tool choice is downgraded", () => {
    const namedEmitChoice = { type: "function", function: { name: "emit_file" } };

    expect(resolveToolProtocolForProvider({ provider: "aiberm" }, namedEmitChoice)).toEqual({
      toolChoice: "required",
      toolNames: ["emit_file"],
    });
    expect(resolveToolProtocolForProvider({ provider: "crazyroute" }, namedEmitChoice)).toEqual({
      toolChoice: namedEmitChoice,
      toolNames: ["load_skill", "emit_file", "web_search", "finish"],
    });
  });

  it("normalizes generated navigation order with contact before about", () => {
    const state: any = {
      messages: [new HumanMessage("Build site. Nav: Home | About | Products | Cases | Contact")],
      phase: "conversation",
    };
    const decision = buildLocalDecisionPlan(state);
    const html = [
      "<!doctype html><html><body>",
      "<nav>",
      '<a href="/products">Products</a>',
      '<a href="/about">About</a>',
      '<a href="/cases">Cases</a>',
      '<a href="/contact">Contact</a>',
      "</nav>",
      "</body></html>",
    ].join("");

    const normalized = enforceNavigationOrder(html, decision);
    expect(normalized.indexOf('href="/contact"')).toBeLessThan(normalized.indexOf('href="/about"'));
    expect(normalized.indexOf('href="/about"')).toBeGreaterThan(normalized.indexOf('href="/cases"'));
  });

  it("classifies wrapped upstream body timeout errors as retryable", () => {
    const error = new TypeError("terminated") as TypeError & { cause?: Error & { code?: string } };
    error.cause = Object.assign(new Error("Body Timeout Error"), {
      name: "BodyTimeoutError",
      code: "UND_ERR_BODY_TIMEOUT",
    });

    expect(isRetryableProviderError(error)).toBe(true);
  });

  it("retries an upstream timeout with the same message context", async () => {
    const messages = [new HumanMessage("generate current target")];
    const seenMessages: unknown[] = [];
    let calls = 0;
    const timeoutError = new TypeError("terminated") as TypeError & { cause?: Error & { code?: string } };
    timeoutError.cause = Object.assign(new Error("Body Timeout Error"), {
      name: "BodyTimeoutError",
      code: "UND_ERR_BODY_TIMEOUT",
    });
    const model = {
      invoke: async () => ({ content: "" }),
      stream: async (inputMessages: any) => {
        seenMessages.push(inputMessages);
        calls += 1;
        if (calls === 1) throw timeoutError;
        return streamFrom([{ content: "ok" }]);
      },
    };

    const message = await invokeModelWithRetry({
      model,
      messages,
      idleTimeoutMs: 5000,
      absoluteTimeoutMs: 10_000,
      operation: "unit-retry",
      retries: 1,
    });

    expect(String(message.content || "")).toBe("ok");
    expect(calls).toBe(2);
    expect(seenMessages).toEqual([messages, messages]);
  });

  it("builds page-specific contracts for distinct HTML generation", () => {
    const plan = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "Build a 6-page industrial-style English website for LC-CNC: Home, 3C Machines, Custom Solutions, Cases, About, Contact.",
        ),
      ],
      phase: "conversation",
    } as any);

    expect(htmlPathToRoute("/3c-machines/index.html")).toBe("/3c-machines");
    const machinesContract = formatTargetPageContract(plan, "/3c-machines/index.html");
    expect(machinesContract).toContain("Target page contract:");
    expect(machinesContract).toContain("Page intent:");
    expect(machinesContract).toContain("Canonical Website Prompt is authoritative");
    expect(machinesContract).toContain("Do not apply a hardcoded industry skeleton");
    expect(machinesContract).toContain("Shared Shell/Footer Contract");

    const contactContract = formatTargetPageContract(plan, "/contact/index.html");
    expect(contactContract).toContain('Dedicated page for "Contact"');
    expect(contactContract).toContain("Sibling page intents");
  });

  it("strips legacy localized 3.5 module blueprints before generation", () => {
    const sanitized = sanitizeRequirementForGenerationForTesting(
      [
        "# 完整网站生成提示词",
        "## 1. 原始需求",
        "个人 AI 实践 blog。",
        "## 3.5 页面差异化蓝图（必填）",
        "### 生成路由契约（机器可读）",
        "```json",
        JSON.stringify({ routes: ["/", "/blog"], files: ["/index.html", "/blog/index.html"] }),
        "```",
        "- Blog 页必须包含 quote-form。",
        "## 4. 设计方向",
        "科技感与极简现代。",
      ].join("\n"),
    );

    expect(sanitized).toContain("## 1. 原始需求");
    expect(sanitized).toContain("## 4. 设计方向");
    expect(sanitized).not.toContain("页面差异化蓝图");
    expect(sanitized).not.toContain("quote-form");
  });

  it("fails fast without a configured provider key instead of generating local files", async () => {
    await expect(runSkillToolExecutor({
      state: {
        messages: [new HumanMessage("Generate website routes / and /contact with industrial style.")],
        phase: "conversation",
        current_page_index: 0,
        attempt_count: 0,
      } as any,
      timeoutMs: 60_000,
    })).rejects.toThrow("skill_tool_provider_api_key_missing");
  });

  it("does not repair missing pages during final validation", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build routes / and /blog.")],
      phase: "conversation",
    } as any);

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files: validGeneratedFiles(["/"]).filter((file) => file.path !== "/blog/index.html"),
      }),
    ).toThrow("skill_tool_missing_required_files: /blog/index.html");
  });

  it("requires generated pages to reference shared CSS and JS instead of patching them", () => {
    const decision = buildLocalDecisionPlan({
      messages: [new HumanMessage("Build routes / and /contact.")],
      phase: "conversation",
    } as any);
    const files = validGeneratedFiles(["/", "/contact"]).map((file) =>
      file.path === "/contact/index.html"
        ? { ...file, content: String(file.content).replace('  <script src="/script.js"></script>\n', "") }
        : file,
    );

    expect(() =>
      validateAndNormalizeRequiredFiles({
        decision,
        files,
      }),
    ).toThrow("does not reference /script.js");
  });

  it("plans CASUX prompt routes dynamically instead of fixed industrial defaults", async () => {
    const decision = buildLocalDecisionPlan({
      messages: [
        new HumanMessage(
          "生成 CASUX 官网。主导航菜单：首页 | CASUX创设 | CASUX建设 | CASUX优标 | CASUX倡导 | CASUX研究中心 | CASUX信息平台 | 资料下载",
        ),
      ],
      phase: "conversation",
    } as any);

    expect(decision.routes).toEqual(
      expect.arrayContaining([
        "/",
        "/casux-creation",
        "/casux-construction",
        "/casux-certification",
        "/casux-advocacy",
        "/casux-research-center",
        "/casux-information-platform",
        "/downloads",
      ]),
    );
    expect(decision.routes).not.toEqual(expect.arrayContaining(["/3c-machines", "/custom-solutions"]));
  });

  it("extracts requirement from serialized HumanMessage payload", () => {
    const serializedHumanMessage = {
      id: ["langchain_core", "messages", "HumanMessage"],
      kwargs: { content: "Generate routes / and /pricing with a fintech positioning." },
      type: "human",
    };
    const decision = buildLocalDecisionPlan({
      messages: [serializedHumanMessage as any],
      phase: "conversation",
    } as any);

    expect(decision.routes).toEqual(expect.arrayContaining(["/pricing"]));
    expect(decision.requirementText).toContain("Generate routes / and /pricing");
  });

  it("uses workflow canonicalPrompt when user message is missing", () => {
    const canonicalPrompt = "Create website routes /, /about, /contact with premium consulting tone.";
    const decision = buildLocalDecisionPlan({
      messages: [{ type: "ai", content: "assistant-only message" } as any],
      workflow_context: {
        canonicalPrompt,
      },
      phase: "conversation",
    } as any);

    expect(decision.routes).toEqual(expect.arrayContaining(["/", "/about", "/contact"]));
    expect(decision.requirementText).toContain("/about, /contact");
  });

  it("does not convert control phrases into bogus routes", () => {
    const decision = buildLocalDecisionPlan({
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
    } as any);

    expect(decision.routes).toEqual(
      expect.arrayContaining(["/", "/3c-machines", "/custom-solutions", "/cases", "/about", "/contact"]),
    );
    expect(decision.routes).not.toEqual(
      expect.arrayContaining([
        "/prompt-draft",
        "/shp-confirm-generate",
        "/6",
        "/3c",
        "/aluminum",
        "/high-precision",
        "/automation",
        "/aluminum/high",
        "/nav/main/footer",
      ]),
    );
  });
});
