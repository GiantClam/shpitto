import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { buildLocalDecisionPlan } from "./decision-layer";

describe("decision-layer", () => {
  it("builds structured page blueprints from prompt and nav", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Generate an industrial site. Nav: Home | 3C Machines | Custom Solutions | Cases | About | Contact",
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.routes.length).toBeGreaterThanOrEqual(6);
    expect(plan.pageBlueprints.length).toBe(plan.routes.length);

    const contact = plan.pageBlueprints.find((page) => page.route === "/contact");
    expect(contact).toBeTruthy();
    expect(contact?.contentSkeleton).toContain("quote-form");
    expect(Number(contact?.componentMix.form || 0)).toBeGreaterThan(20);
  });

  it("derives CASUX routes from Chinese prompt without forcing LC-CNC defaults", () => {
    const state: any = {
      messages: [
        new HumanMessage(`生成 CASUX 官网。
主导航菜单：首页 | CASUX创设 | CASUX建设 | CASUX优标 | CASUX倡导 | CASUX研究中心 | CASUX信息平台 | 资料下载
### CASUX创设页面
### CASUX建设页面
### CASUX优标页面
### CASUX倡导页面
### CASUX研究中心页面
### CASUX信息平台页面
### 资料下载页面
### 用户注册/登录页面`),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(
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
    expect(plan.routes).not.toEqual(expect.arrayContaining(["/3c-machines", "/custom-solutions"]));
  });

  it("extracts requirement from serialized human message payload", () => {
    const state: any = {
      messages: [
        {
          id: ["langchain_core", "messages", "HumanMessage"],
          kwargs: {
            content:
              "Generate a precision components website. Nav: Home | Products | Solutions | Cases | Contact",
          },
          type: "constructor",
        },
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.requirementText).toContain("precision components website");
    expect(plan.routes).toEqual(expect.arrayContaining(["/", "/products", "/custom-solutions", "/cases", "/contact"]));
  });

  it("falls back to workflow requirementDraft when message content is empty", () => {
    const state: any = {
      messages: [{ role: "user", content: "" }],
      phase: "conversation",
      workflow_context: {
        requirementDraft:
          "Build a manufacturing site. Nav: Home | 3C Machines | Custom Solutions | Cases | Contact",
      },
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.requirementText).toContain("manufacturing site");
    expect(plan.routes).toEqual(
      expect.arrayContaining(["/", "/3c-machines", "/custom-solutions", "/cases", "/contact"]),
    );
  });

  it("extracts multi-page routes from comma-separated page list in requirement text", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build a 6-page industrial-style English website for LC-CNC: Home, 3C Machines, Custom Solutions, Cases, About, Contact.",
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.routes).toEqual(
      expect.arrayContaining(["/", "/3c-machines", "/custom-solutions", "/cases", "/about", "/contact"]),
    );
  });

  it("extracts page routes from numbered page lists", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "Please generate these pages:",
            "1) Home (index.html)",
            "2) 3C Machines (3c-machines.html)",
            "3) Custom Solutions (custom-solutions.html)",
            "4) Cases (cases.html)",
            "5) About (about.html)",
            "6) Contact (contact.html)",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.routes).toEqual(
      expect.arrayContaining(["/", "/3c-machines", "/custom-solutions", "/cases", "/about", "/contact"]),
    );
  });

  it("filters control phrases from noisy prompt drafts when deriving routes", () => {
    const state: any = {
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
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.routes).toEqual(
      expect.arrayContaining(["/", "/3c-machines", "/custom-solutions", "/cases", "/about", "/contact"]),
    );
    expect(plan.routes).not.toEqual(
      expect.arrayContaining([
        "/prompt-draft",
        "/shp-confirm-generate",
        "/and-ensure-navigation-links-work",
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

  it("ignores referenced asset url paths when deriving website routes", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "Build a 6-page industrial website.",
            "Nav: Home | 3C Machines | Custom Solutions | Cases | About | Contact",
            "",
            "[Referenced Assets]",
            '- Asset "logo.png" URL: /api/projects/chat-1/assets/file?key=project-assets/u1/chat-1/uploads/123-logo.png',
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.routes).toEqual(
      expect.arrayContaining(["/", "/3c-machines", "/custom-solutions", "/cases", "/about", "/contact"]),
    );
    expect(plan.routes).not.toEqual(expect.arrayContaining(["/api/projects/chat-1/assets/file"]));
    expect(plan.requirementText).not.toContain("[Referenced Assets]");
  });
});
