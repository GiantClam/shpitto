import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { buildLocalDecisionPlan, extractRouteSourceBrief } from "./decision-layer";

describe("decision-layer", () => {
  it("builds thin page intent contracts from prompt and nav", () => {
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
    expect(contact?.purpose).toContain('Dedicated page for "Contact"');
    expect(contact?.source).toBe("nav_label");
    expect(contact?.contentSkeleton).toEqual([]);
    expect(contact?.constraints.join(" ")).toContain("Canonical Website Prompt is the authoritative source");
  });

  it("treats Blog as a data-source page at the blueprint layer", () => {
    const state: any = {
      messages: [
        new HumanMessage("Build a multi-page website. Nav: Home | Solutions | Blog | Contact"),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    const blog = plan.pageBlueprints.find((page) => page.route === "/blog");

    expect(blog?.pageKind).toBe("blog-data-index");
    expect(blog?.responsibility).toContain("Content collection page");
    expect(blog?.contentSkeleton.join(" ")).toContain("data-shpitto-blog-root");
    expect(blog?.constraints.join(" ")).toContain('data-shpitto-blog-api="/api/blog/posts"');
    expect(blog?.constraints.join(" ")).toContain("/blog/{slug}/");
    expect(blog?.constraints.join(" ")).toContain("Implementation mechanics are invisible infrastructure");
  });

  it("uses an existing semantic content route as the Blog data-source page instead of adding duplicate /blog", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build a multi-page website. The information platform publishes updates, insights, and article content.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/products", "/information-platform", "/contact"],
          navLabels: ["Home", "Products", "Information Platform", "Contact"],
          files: ["/styles.css", "/script.js", "/index.html", "/products/index.html", "/information-platform/index.html", "/contact/index.html"],
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);
    const informationPlatform = plan.pageBlueprints.find((page) => page.route === "/information-platform");

    expect(plan.routes).toEqual(["/", "/products", "/information-platform", "/contact"]);
    expect(plan.routes).not.toContain("/blog");
    expect(informationPlatform?.pageKind).toBe("blog-data-index");
    expect(informationPlatform?.constraints.join(" ")).toContain("Blog backend route confidence");
    expect(informationPlatform?.contentSkeleton.join(" ")).toContain("data-shpitto-blog-root");
    expect(informationPlatform?.contentSkeleton.join(" ")).toContain("case library");
    expect(informationPlatform?.constraints.join(" ")).toContain("English design jargon");
  });

  it("keeps the final comma-delimited page when another sentence follows", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build a 6-page industrial website: Home, 3C Machines, Custom Solutions, Cases, About, Contact. Keep shared styles and script across all pages.",
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual([
      "/",
      "/3c-machines",
      "/custom-solutions",
      "/cases",
      "/contact",
      "/about",
    ]);
  });

  it("orders navigation with contact second-to-last and about last", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build an English site. Nav: Home | About | Products | Cases | Contact | News",
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/products", "/cases", "/news", "/contact", "/about"]);
    expect(plan.navLabels.slice(-2)).toEqual(["Contact", "About"]);
    expect(plan.pageBlueprints.find((page) => page.route === "/news")?.pageKind).toBe("blog-data-index");
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
    expect(plan.routes).not.toContain("/blog");
    expect(plan.pageBlueprints.find((page) => page.route === "/casux-information-platform")?.pageKind).toBe("blog-data-index");
    expect(plan.routes).not.toEqual(expect.arrayContaining(["/3c-machines", "/custom-solutions"]));
  });

  it.skip("keeps internal page purposes in English even when the user input is Chinese", () => {
    const state: any = {
      messages: [
        new HumanMessage("生成一个双语站点。导航：首页 | Blog | 登录"),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    const home = plan.pageBlueprints.find((page) => page.route === "/");
    const blog = plan.pageBlueprints.find((page) => page.route === "/blog");
    const login = plan.pageBlueprints.find((page) => page.route === "/login");

    expect(home?.purpose).toContain("Homepage.");
    expect(blog?.purpose).toContain("Content collection page");
    expect(login?.purpose).toContain("Sign-in page");
    expect(/[^\x00-\x7F]/.test([home?.purpose, blog?.purpose, login?.purpose].join(" "))).toBe(false);
  });

  it("keeps internal page purposes in English for mixed-language prompts", () => {
    const state: any = {
      messages: [new HumanMessage("Generate a bilingual site. 首页语义保留，但内部计划必须是英文。 Nav: Home | Blog | Login")],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    const home = plan.pageBlueprints.find((page) => page.route === "/");
    const blog = plan.pageBlueprints.find((page) => page.route === "/blog");
    const login = plan.pageBlueprints.find((page) => page.route === "/login");

    expect(home?.purpose).toContain("Homepage.");
    expect(blog?.purpose).toContain("Content collection page");
    expect(login?.purpose).toContain("Sign-in page");
    expect(/[^\x00-\x7F]/.test([home?.purpose, blog?.purpose, login?.purpose].join(" "))).toBe(false);
  });

  it("extracts a route-specific source brief from uploaded prompt material", () => {
    const creation = "\u521b\u8bbe";
    const construction = "\u5efa\u8bbe";
    const certification = "\u4f18\u6807";
    const prompt = [
      "## Website Knowledge Profile",
      "- Brand: CASUX",
      "Navigation: \u9996\u9875 | CASUX\u521b\u8bbe | CASUX\u5efa\u8bbe | CASUX\u4f18\u6807",
      "",
      "-- 1 of 3 --",
      `### CASUX${creation}\u9875\u9762`,
      "\u8bf7\u751f\u6210\u9002\u513f\u5316\u7a7a\u95f4\u7684\u521b\u7acb\u8bbe\u8ba1\u6807\u51c6\u9875\u9762\uff0c\u5305\u542b\u521b\u8bbe\u6d41\u7a0b\u3001\u7a7a\u95f4\u7c7b\u578b\u548c\u6848\u4f8b\u7b5b\u9009\u3002",
      "",
      "-- 2 of 3 --",
      `### CASUX${construction}\u9875\u9762`,
      "\u8bf7\u751f\u6210\u5efa\u8bbe\u89c4\u8303\u9875\u9762\uff0c\u5305\u542b\u5efa\u8bbe\u6307\u5357\u4e0b\u8f7d\u3001\u6807\u51c6\u5206\u7ea7\u548c\u6280\u672f\u8981\u7d20\u3002",
      "",
      "-- 3 of 3 --",
      `### CASUX${certification}\u9875\u9762`,
      "\u8bf7\u751f\u6210\u8ba4\u8bc1\u67e5\u8be2\u9875\u9762\uff0c\u5305\u542b\u4ea7\u54c1\u4e0e\u7a7a\u95f4\u8ba4\u8bc1\u67e5\u8be2\u3001\u7b49\u7ea7\u8bf4\u660e\u548c\u7533\u8bf7\u5165\u53e3\u3002",
    ].join("\n");

    const brief = extractRouteSourceBrief(prompt, "/casux-construction", `CASUX${construction}`, 1000);

    expect(brief).toContain(`CASUX${construction}`);
    expect(brief).toContain("\u5efa\u8bbe\u6307\u5357");
    expect(brief).toContain("\u6280\u672f\u8981\u7d20");
    expect(brief).not.toContain("\u521b\u8bbe\u6d41\u7a0b");
    expect(brief).not.toContain("\u8ba4\u8bc1\u67e5\u8be2");
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

  it("preserves confirmed canonical prompt in generate mode even when latest user text is a short refine-like sentence", () => {
    const canonicalPrompt = [
      "# Canonical Website Generation Prompt",
      "",
      "> Requirement completion: 12/12",
      "",
      "## 0. Confirmed Generation Parameters",
      "- Language: Chinese and English",
      "- Business/content details: HelloTalk, DevOps, SaaS, K12, AI.",
      "",
      "## 7.35 Bilingual Experience Contract",
      "- Requested site locale: bilingual EN/ZH",
      "",
      "### Prompt Control Manifest (Machine Readable)",
      "```json",
      JSON.stringify({
        schemaVersion: 1,
        promptKind: "canonical_website_prompt",
        routes: ["/", "/blog"],
        navLabels: ["Home", "Blog"],
        files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
      }),
      "```",
    ].join("\n");

    const state: any = {
      messages: [new HumanMessage("个人blog，首页应着重突出我的经历，具备极强的个人属性，请修改")],
      phase: "conversation",
      workflow_context: {
        executionMode: "generate",
        canonicalPrompt,
        sourceRequirement: canonicalPrompt,
        latestUserText: "个人blog，首页应着重突出我的经历，具备极强的个人属性，请修改",
      },
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.requirementText).toContain("Requirement completion: 12/12");
    expect(plan.requirementText).toContain("Bilingual Experience Contract");
    expect(plan.routes).toEqual(["/", "/blog"]);
  });

  it("still lets refine mode prioritize the latest user instruction over generation baseline", () => {
    const canonicalPrompt = [
      "# Canonical Website Generation Prompt",
      "",
      "### Prompt Control Manifest (Machine Readable)",
      "```json",
      JSON.stringify({
        schemaVersion: 1,
        promptKind: "canonical_website_prompt",
        routes: ["/", "/blog"],
        navLabels: ["Home", "Blog"],
        files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
      }),
      "```",
    ].join("\n");

    const state: any = {
      messages: [new HumanMessage("把首页 AI 观察、工程实践、全球化视角 这三张卡片的内边距增大")],
      phase: "conversation",
      workflow_context: {
        executionMode: "refine",
        canonicalPrompt,
        sourceRequirement: canonicalPrompt,
        latestUserText: "把首页 AI 观察、工程实践、全球化视角 这三张卡片的内边距增大",
      },
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.requirementText.startsWith("把首页 AI 观察")).toBe(true);
  });

  it("falls back to workflow canonicalPrompt when message content is empty", () => {
    const state: any = {
      messages: [{ role: "user", content: "" }],
      phase: "conversation",
      workflow_context: {
        canonicalPrompt:
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

  it("does not derive pages from SEO or shared asset implementation details", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "Build a 6-page industrial-style English website for LC-CNC: Home, 3C Machines, Custom Solutions, Cases, About, Contact.",
            "Site output includes `/index.html`, `/contact.html`, `/assets/styles.css`, and `/assets/script.js`.",
            "Each page includes complete HTML5 structure with head/body/SEO meta/Open Graph fields.",
            "All pages reference one shared CSS/JS bundle.",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.routes).toEqual(
      expect.arrayContaining(["/", "/3c-machines", "/custom-solutions", "/cases", "/about", "/contact"]),
    );
    expect(plan.routes).not.toEqual(expect.arrayContaining(["/open", "/js", "/assets", "/assets/script"]));
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

  it("does not convert prompt-draft requirement slots into website pages", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "# Complete Website Generation Prompt",
            "- Website type: Company website",
            "- Target audience: infer_from_uploaded_materials",
            "- Site structure: Multi-page website (automatically plan first-level navigation, second-level detail pages, and necessary third-level content pages)",
            "- Primary goal: Build brand trust, Lead generation",
            "- Language: Chinese",
            "- Content source: Uploaded materials: CASUX_.md.pdf",
            "",
            "Pages and structure: automatically plan first-level navigation, second-level detail pages, and necessary third-level content pages from website type, target audience, primary goal, and business context.",
            "Generate detailed content and section structure for the relevant pages.",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(expect.arrayContaining(["/", "/about", "/custom-solutions", "/cases", "/contact"]));
    expect(plan.routes).not.toContain("/blog");
    expect(plan.routes.length).toBeLessThanOrEqual(6);
    expect(plan.routes).not.toEqual(
      expect.arrayContaining([
        "/infer-audience",
        "/pages",
        "/content-modules",
        "/conversion-goals",
        "/target-audience",
        "/primary-goal",
        "/and-business-context",
        "/second-level-detail-pages",
        "/navigation",
        "/hero",
        "/core-module-entries",
        "/automatically-plan-first-level-navigation",
      ]),
    );
  });

  it("does not convert form fields, shell regions, or module names into pages", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "Build a multi-page industrial website.",
            "Pages: Home, Products, Custom Solutions, Cases, Contact, Email, Phone, Header, Footer, Spec Cards, Quote Form.",
            "Contact form must include Name, Email, Phone, Message, and Consent.",
            "Every page must include complete header, main, and footer.",
            "Page-Level Module Blueprint:",
            "- Products page must include product-grid, spec-cards, comparison-strip, and faq.",
            "- Contact page must include contact-channels, quote-form, service-commitment, and privacy-consent.",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
      sitemap: ["/", "/products", "/4", "/email", "/phone", "/header", "/footer", "/spec-cards", "/quote-form"],
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(expect.arrayContaining(["/", "/products", "/custom-solutions", "/cases", "/contact"]));
    expect(plan.routes).not.toEqual(
      expect.arrayContaining([
        "/4",
        "/email",
        "/phone",
        "/header",
        "/footer",
        "/main",
        "/name",
        "/message",
        "/consent",
        "/spec-cards",
        "/quote-form",
        "/product-grid",
        "/comparison-strip",
        "/contact-channels",
        "/service-commitment",
        "/privacy-consent",
      ]),
    );
  });

  it("uses the prompt draft generation routing contract instead of parsing module text as pages", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "# Complete Website Generation Prompt",
            "## 3.5 Page Differentiation Blueprint (Mandatory)",
            "### Fixed Pages And File Output",
            "- /styles.css",
            "- /script.js",
            "- /index.html",
            "- /products/index.html",
            "- /custom-solutions/index.html",
            "- /cases/index.html",
            "- /contact/index.html",
            "",
            "### Prompt Control Manifest (Machine Readable)",
            "```json",
            JSON.stringify({
              schemaVersion: 1,
              routeSource: "prompt_draft_page_plan",
              routes: ["/", "/products", "/custom-solutions", "/cases", "/contact"],
              files: [
                "/styles.css",
                "/script.js",
                "/index.html",
                "/products/index.html",
                "/custom-solutions/index.html",
                "/cases/index.html",
                "/contact/index.html",
              ],
            }),
            "```",
            "",
            "### Page-Level Module Blueprint",
            "- Products page must include product-grid, spec-cards, comparison-strip, and faq.",
            "- Contact page must include contact-channels, quote-form, service-commitment, Email, Phone, Message, and privacy-consent.",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/products", "/custom-solutions", "/cases", "/contact"]);
    expect(plan.routes).not.toEqual(expect.arrayContaining(["/email", "/phone", "/spec-cards", "/quote-form"]));
  });

  it("uses structured requirementSpec page structure before text fallback", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "Generate from this prompt draft.",
            "Contact form fields: Name, Email, Phone, Message, Consent.",
            "Page-Level Module Blueprint: header, footer, quote-form, spec-cards.",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
      workflow_context: {
        requirementSpec: {
          pageStructure: {
            mode: "multi",
            planning: "manual",
            pages: ["home", "products", "cases", "contact"],
          },
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/products", "/cases", "/contact"]);
  });

  it("uses workflow promptControlManifest before parsing prompt text", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "# Complete Website Generation Prompt",
            "Contact form fields: Name, Email, Phone, Message, Consent.",
            "Page-Level Module Blueprint: header, footer, product-grid, spec-cards, quote-form.",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/products", "/cases", "/contact"],
          navLabels: ["Home", "Products", "Cases", "Contact"],
          files: ["/styles.css", "/script.js", "/index.html", "/products/index.html", "/cases/index.html", "/contact/index.html"],
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/products", "/cases", "/contact"]);
    expect(plan.navLabels).toEqual(["Home", "Products", "Cases", "Contact"]);
    expect(plan.routes).not.toEqual(expect.arrayContaining(["/email", "/phone", "/spec-cards", "/quote-form"]));
  });

  it("does not inject /blog for a standard multipage site without explicit content-stream intent", () => {
    const state: any = {
      messages: [
        new HumanMessage("Generate an industrial LC-CNC multi-page website. Pages: Home, Products, Cases, Contact, About. English only."),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/products", "/cases", "/contact", "/about"]);
    expect(plan.routes).not.toContain("/blog");
  });

  it("honors explicit one-page prompts instead of extracting service or asset terms as routes", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "Create a small one-page public website for a Railway worker regression test.",
            'Requirements: one homepage only, title "Railway Worker Regression", include a short hero, three status cards, and a footer.',
            "Use lightweight HTML/CSS/JS only. No external services, no login, no forms, no ecommerce.",
            "Design should be clean, light, and simple.",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/"]);
    expect(plan.routes).not.toEqual(expect.arrayContaining(["/services", "/css-js", "/login"]));
  });

  it("maps auth-related page labels to dedicated auth routes and blueprints", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "Pages: Home, Login, Register, Reset Password, Verify Email.",
            "Keep the auth flow branded and consistent with the rest of the site.",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.routes).toEqual(expect.arrayContaining(["/", "/login", "/register", "/reset-password", "/verify-email"]));
    expect(plan.pageBlueprints.find((page) => page.route === "/login")?.pageKind).toBe("auth");
    expect(plan.pageBlueprints.find((page) => page.route === "/reset-password")?.pageKind).toBe("auth");
  });

  it("preserves manifest nav labels when canonical prompt contains page intent prose", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "# Canonical Website Generation Prompt",
            "### Page-Level Intent Contract",
            '1. 首页 (/ -> /index.html)',
            "   - Page intent: Primary landing page.",
            '2. 博客 (/blog -> /blog/index.html)',
            '   - Page intent: Dedicated page for "博客". Derive its content depth, section structure, and interactions from the confirmed Canonical Website Prompt, source content, and route intent.',
          ].join("\n"),
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog"],
          navLabels: ["首页", "Blog"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html"],
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/blog"]);
    expect(plan.navLabels).toEqual(["首页", "Blog"]);
    expect(plan.pageBlueprints.find((page) => page.route === "/blog")?.navLabel).toBe("Blog");
  });

  it("uses explicit route mentions instead of turning prose constraints into pages or nav labels", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "生成个人 Blog 网站。",
            "1. 路由包含首页 `/` 与 `/blog/`，导航一行显示，不允许换行。",
            "2. Blog runtime/snapshot 替换数据后，列表项外层卡片仍必须有 padding/gap。",
            "3. Footer 导航链接超过 3 个时，不要使用窄右列 + flex-wrap + flex-end + pill button。",
            "4. 首页必须优先介绍本人，可以链接到方案能力，但不要新增方案页面。",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
      sitemap: ["/", "/snapshot", "/gap", "/custom-solutions"],
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/blog"]);
    expect(plan.navLabels).toEqual(["首页", "博客"]);
    expect(plan.routes).not.toEqual(expect.arrayContaining(["/snapshot", "/gap", "/custom-solutions"]));
    expect(plan.pageBlueprints.every((page) => page.source === "explicit_route")).toBe(true);
  });

  it("keeps explicit blog route when the prompt says only generate home and blog", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "只生成首页 / 与 /blog/ 两个导航页面，首页必须介绍本人，Blog 页面由 Blog 后端支撑。",
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/blog"]);
    expect(plan.pageBlueprints.every((page) => page.source === "explicit_route")).toBe(true);
  });

  it("adds /blog when natural-language requirement asks for multiple blog posts without structured page planning", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "我想做个个人简历网站，做AI方向，需要3篇blog体现我的价值，包含 beihuang、华为、微信全球化、HelloTalk 和 AI SaaS 经历。",
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/blog"]);
    expect(plan.pageBlueprints.find((page) => page.route === "/blog")?.pageKind).toBe("blog-data-index");
  });

  it("falls back to fixed output files when the embedded prompt control manifest json is malformed", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "# Canonical Website Generation Prompt",
            "",
            "### Fixed Pages And File Output",
            "- /styles.css",
            "- /script.js",
            "- /index.html",
            "- /blog/index.html",
            "",
            "### Prompt Control Manifest (Machine Readable)",
            "```json",
            "{",
            '  "routes": ["/", "/blog"],',
            '  "navLabels": ["Home", "pages\\":[\\"blog\\"]}"]',
            "}",
            "```",
            "",
            "### Workflow Skill Contract (Authoritative Rules)",
            '- Implementation mechanics are invisible infrastructure. Do not expose backend names, API/storage/runtime/hydration/fallback jargon.',
            "- English and zh variants are toggled in place rather than emitted as separate locale-prefixed routes.",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/blog"]);
    expect(plan.routes).not.toEqual(
      expect.arrayContaining(["/english", "/zh", "/resource", "/documents", "/list/database", "/storage/runtime/hydration/fallback"]),
    );
  });
});
