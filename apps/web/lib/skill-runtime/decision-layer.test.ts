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
    expect(contact?.responsibility).toContain('Contact page for "Contact"');
    expect(contact?.contentSkeleton).toEqual([]);
    expect(contact?.constraints.join(" ")).toContain("Canonical Website Prompt is the authoritative source");
  });

  it("prefers explicit requirement-spec page labels over noisy requirement-form prose", () => {
    const requirementText = [
      "Requirement form submitted:",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify({
        siteType: "company",
        contentSources: ["existing_domain", "industry_research"],
        targetAudience: ["enterprise_buyers", "overseas_customers"],
        primaryVisualDirection: "industrial-b2b",
        pageStructure: {
          mode: "multi",
          planning: "manual",
          pages: [
            "Home",
            "Product Families",
            "Factory Capability",
            "Quality and Certifications",
            "Customized Services",
            "Contact",
          ],
        },
        functionalRequirements: ["customer_inquiry_form", "contact_form"],
        primaryGoal: ["lead_generation"],
        language: "en",
        brandLogo: { mode: "uploaded", referenceText: "Use the uploaded VBUY logo lockup." },
        customNotes:
          "Build an English website for VBUY Textile, a custom towel manufacturer and export supplier. Required pages: Home, Product Families, Factory Capability, Quality and Certifications, Customized Services, Contact. The primary goal is lead generation and contact inquiries.",
      }),
      "```",
    ].join("\n");

    const state: any = {
      messages: [new HumanMessage(requirementText)],
      phase: "conversation",
      workflow_context: {
        requirementSpec: {
          pageStructure: {
            mode: "multi",
            planning: "manual",
            pages: [
              "Home",
              "Product Families",
              "Factory Capability",
              "Quality and Certifications",
              "Customized Services",
              "Contact",
            ],
          },
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual([
      "/",
      "/product-families",
      "/factory-capability",
      "/quality-and-certifications",
      "/customized-services",
      "/contact",
    ]);
    expect(plan.navLabels).toEqual([
      "Home",
      "Product Families",
      "Factory Capability",
      "Quality and Certifications",
      "Customized Services",
      "Contact",
    ]);
    expect(plan.navLabels).not.toContain("Capability");
    expect(plan.navLabels).not.toContain("and");
  });

  it("switches homepage blueprint to enterprise masthead mode when IBM Carbon is explicitly requested", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Generate a bilingual company homepage. Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage. Nav: Home",
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    const home = plan.pageBlueprints.find((page) => page.route === "/");

    expect(home).toBeTruthy();
    expect(home?.contentSkeleton.join(" ")).toContain("Image-backed enterprise hero with overlay copy");
    expect(home?.contentSkeleton.join(" ")).not.toContain("Brand-led hero establishing the site home entry");
    expect(home?.constraints.join(" ")).toContain("enterprise homepage rhythm");
  });

  it("uses official-homepage wording instead of entry-point semantics for the default home blueprint", () => {
    const state: any = {
      messages: [new HumanMessage("Generate a standards and research site. Nav: Home | Research | Contact")],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    const home = plan.pageBlueprints.find((page) => page.route === "/");

    expect(home?.purpose).toContain("official-homepage identity");
    expect(home?.purpose).not.toContain("entry");
    expect(home?.contentSkeleton.join(" ")).toContain("official homepage overview");
    expect(home?.contentSkeleton.join(" ")).not.toContain("site home entry");
  });

  it("extracts brand hints from website-for-brand briefs", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build a documentation and knowledge homepage for Meridian API Platform. Audience: developers and technical leads. Homepage only.",
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.brandHint).toBe("Meridian API Platform");
  });

  it("does not extract prompt prose about class names as a brand hint", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Class names, headings, card types, and interactions should describe the actual route intent and source content, not generic template categories.",
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.brandHint).toBeUndefined();
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
    expect(informationPlatform?.pageKind).toBe("content-collection-index");
    expect(informationPlatform?.constraints.join(" ")).toContain("Content collection route confidence");
    expect(informationPlatform?.contentSkeleton.join(" ")).toContain("data-shpitto-blog-root");
    expect(informationPlatform?.contentSkeleton.join(" ")).toContain("case library");
    expect(informationPlatform?.constraints.join(" ")).toContain("English design jargon");
    expect(informationPlatform?.constraints.join(" ")).not.toContain("Detail links must use /blog/{slug}/");
  });

  it("keeps generic information-platform routes collection-first unless article/news detail pages were explicitly requested", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build a multi-page website for CASUX. The information platform is a standards, research, and download hub.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/casux-information-platform", "/downloads"],
          navLabels: ["Home", "CASUX Information Platform", "Downloads"],
          files: ["/styles.css", "/script.js", "/index.html", "/casux-information-platform/index.html", "/downloads/index.html"],
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);
    const informationPlatform = plan.pageBlueprints.find((page) => page.route === "/casux-information-platform");

    expect(informationPlatform?.pageKind).toBe("content-collection-index");
    expect(informationPlatform?.constraints.join(" ")).not.toContain("Detail links must use /blog/{slug}/");
    expect(informationPlatform?.constraints.join(" ")).toContain("Do not invent /blog/{slug}/ article detail pages");
    expect(informationPlatform?.contentSkeleton.join(" ")).toContain("collection/index surface");
  });

  it("does not attach Blog runtime hooks when a manifest route explicitly forbids blog/archive behavior", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build a multi-page resource and research hub. Generate Home, Research, Standards, Resources, and About with no blog or archive behavior.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/research", "/standards", "/resources", "/about"],
          navLabels: ["Home", "Research", "Standards", "Resources", "About"],
          files: ["/styles.css", "/script.js", "/index.html", "/research/index.html", "/standards/index.html", "/resources/index.html", "/about/index.html"],
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);
    const resources = plan.pageBlueprints.find((page) => page.route === "/resources");

    expect(resources?.pageKind).toBe("search-directory");
    expect(resources?.constraints.join(" ")).toContain("explicitly forbids blog/archive behavior");
    expect(resources?.constraints.join(" ")).toContain("resource-index-header");
    expect(resources?.constraints.join(" ")).toContain("no hero-grid");
    expect(resources?.contentSkeleton.join(" ")).not.toContain("data-shpitto-blog-root");
  });

  it("adds page-mechanics copy firewall rules to content-hub interior routes", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build a multi-page resource and research hub for Civic Standards Lab. Generate Home, Research, Standards, Resources, and About. Use collection-first IA, consistent terminology, varied editorial modules, research/standards/resource navigation, and no blog or archive behavior.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/research", "/standards", "/resources", "/about"],
          navLabels: ["Home", "Research", "Standards", "Resources", "About"],
          files: ["/styles.css", "/script.js", "/index.html", "/research/index.html", "/standards/index.html", "/resources/index.html", "/about/index.html"],
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);
    const standards = plan.pageBlueprints.find((page) => page.route === "/standards");

    expect(standards?.pageKind).toBe("intent");
    expect(standards?.constraints.join(" ")).toContain("Visitor-facing copy must talk about the route subject itself");
    expect(standards?.constraints.join(" ")).toContain("The page groups...");
    expect(standards?.constraints.join(" ")).toContain("How the standards collection is organized");
  });

  it("keeps explicit Blog manifest routes when publishable articles are requested", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build a personal technical blog. The Blog route must publish 3 complete article detail pages. Do not invent archive category routes beyond the Blog route and its three requested detail pages.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog", "/about", "/contact"],
          navLabels: ["Home", "Blog", "About", "Contact"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html", "/about/index.html", "/contact/index.html"],
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);
    const blog = plan.pageBlueprints.find((page) => page.route === "/blog");

    expect(plan.routes).toContain("/blog");
    expect(blog?.pageKind).toBe("blog-data-index");
    expect(blog?.constraints.join(" ")).toContain("Detail links must use /blog/{slug}/");
  });

  it("prefers explicit requirement-spec page labels over noisy requirement-form text", () => {
    const requirementFormText = [
      "Requirement form submitted:",
      "",
      "[Requirement Form]",
      "```json",
      JSON.stringify({
        siteType: "company",
        contentSources: ["existing_domain", "industry_research"],
        targetAudience: ["enterprise_buyers", "overseas_customers"],
        pageStructure: {
          mode: "multi",
          planning: "manual",
          pages: [
            "Home",
            "Product Families",
            "Factory Capability",
            "Quality and Certifications",
            "Customized Services",
            "Contact",
          ],
        },
        functionalRequirements: ["customer_inquiry_form", "contact_form"],
        primaryGoal: ["lead_generation"],
        language: "en",
        customNotes:
          "Build an English website for VBUY Textile, a custom towel manufacturer and export supplier. Required pages: Home, Product Families, Factory Capability, Quality and Certifications, Customized Services, Contact. The primary goal is lead generation and contact inquiries.",
      }),
      "```",
    ].join("\n");

    const state: any = {
      messages: [new HumanMessage(requirementFormText)],
      phase: "conversation",
      workflow_context: {
        requirementSpec: {
          siteType: "company",
          pageStructure: {
            mode: "multi",
            planning: "manual",
            pages: [
              "Home",
              "Product Families",
              "Factory Capability",
              "Quality and Certifications",
              "Customized Services",
              "Contact",
            ],
          },
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual([
      "/",
      "/product-families",
      "/factory-capability",
      "/quality-and-certifications",
      "/customized-services",
      "/contact",
    ]);
    expect(plan.navLabels).toEqual([
      "Home",
      "Product Families",
      "Factory Capability",
      "Quality and Certifications",
      "Customized Services",
      "Contact",
    ]);
    expect(plan.navLabels).not.toContain("Capability");
    expect(plan.navLabels).not.toContain("and");
  });

  it("recovers confirmed routes from website design spec during refine flows when the prompt manifest is missing", () => {
    const state: any = {
      messages: [new HumanMessage("fill blog detail pages now and align the slugs")],
      phase: "conversation",
      workflow_context: {
        executionMode: "refine",
        websiteDesignSpec: [
          "# Website Design Specification",
          "## 3. Shell Contract",
          "- confirmed_routes: /, /blog, /contact, /about",
          "## 5. Route Map",
          "- / (Home)",
          "- /blog (Blog)",
          "- /contact (Contact)",
          "- /about (About)",
        ].join("\n"),
        requirementSpec: {
          pages: ["blog"],
          pageStructure: {
            mode: "single",
            planning: "manual",
            pages: ["blog"],
          },
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/blog", "/contact", "/about"]);
  });

  it("does not force publishable detail pages when a knowledge hub merely mentions articles as source material", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build a multi-page website for CASUX. The information platform collects standards articles, research materials, and policy updates in one searchable hub.",
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/casux-information-platform"],
          navLabels: ["Home", "CASUX Information Platform"],
          files: ["/styles.css", "/script.js", "/index.html", "/casux-information-platform/index.html"],
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);
    const informationPlatform = plan.pageBlueprints.find((page) => page.route === "/casux-information-platform");

    expect(informationPlatform?.constraints.join(" ")).not.toContain("Detail links must use /blog/{slug}/");
    expect(informationPlatform?.contentSkeleton.join(" ")).not.toContain("publishable archive");
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

  it("collapses duplicate and near-synonym page concepts during planning instead of carrying both routes forward", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          "Build a multi-page industrial site. Pages: Home | Products | Product | Services | Custom Solutions | News | Contact | About",
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/products", "/custom-solutions", "/news", "/contact", "/about"]);
    expect(plan.routes).not.toContain("/product");
    expect(plan.routes).not.toContain("/service");
    expect(plan.navLabels).toEqual(["Home", "Products", "Custom Solutions", "News", "Contact", "About"]);
  });

  it("canonicalizes explicit requirement-spec pages before route planning finalizes", () => {
    const state: any = {
      messages: [new HumanMessage("Generate the website from the confirmed requirement form.")],
      phase: "conversation",
      workflow_context: {
        requirementSpec: {
          siteType: "company",
          contentSources: ["existing_domain"],
          targetAudience: ["enterprise_buyers"],
          primaryGoal: ["lead_generation"],
          pageStructure: {
            mode: "multi",
            planning: "manual",
            pages: ["Home", "Products", "Product", "Solutions", "Service", "Downloads", "Download", "Contact"],
          },
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/products", "/custom-solutions", "/downloads", "/contact"]);
    expect(plan.routes).not.toContain("/product");
    expect(plan.routes).not.toContain("/service");
    expect(plan.routes).not.toContain("/solution");
    expect(plan.navLabels).toEqual(["Home", "Products", "Custom Solutions", "Downloads", "Contact"]);
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
    expect(plan.pageBlueprints.find((page) => page.route === "/casux-information-platform")?.pageKind).toBe("content-collection-index");
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

  it("detects explicit Chinese locale contracts even when the planning artifact stays English", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "# Canonical Website Generation Prompt",
            "- Language: Chinese",
            "- Final website locale requirement: Chinese.",
            "Nav: Home | Contact",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.locale).toBe("zh-CN");
    expect(plan.routes).toEqual(["/", "/contact"]);
    expect(plan.pageBlueprints[0]?.route).toBe("/");
  });

  it("keeps Chinese-first bilingual prompts on zh-CN visible locale instead of collapsing to English", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "# Canonical Website Generation Prompt",
            "- Language: Chinese-first bilingual Chinese and English",
            "- Requested site locale: bilingual Chinese and English",
            "Nav: Home | CASUX Information Platform | Downloads | Contact",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.locale).toBe("zh-CN");
    expect(plan.routes).toEqual(["/", "/casux-information-platform", "/downloads", "/contact"]);
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

  it("strips leading conjunctions from authoritative manifest nav labels", () => {
    const state: any = {
      messages: [
        new HumanMessage("# Canonical Website Generation Prompt"),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/blog", "/contact", "/about"],
          navLabels: ["Home", "Blog", "and Contact", "About"],
          files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html", "/contact/index.html", "/about/index.html"],
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.routes).toEqual(["/", "/blog", "/contact", "/about"]);
    expect(plan.navLabels).toEqual(["Home", "Blog", "Contact", "About"]);
    expect(plan.pageBlueprints.find((page) => page.route === "/contact")?.navLabel).toBe("Contact");
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
            "- Site structure: Multi-page website (automatically plan navigation depth and supporting routes from the confirmed audience, goals, and source material)",
            "- Primary goal: Build brand trust, Lead generation",
            "- Language: Chinese",
            "- Content source: Uploaded materials: CASUX_.md.pdf",
            "",
            "Pages and structure: automatically plan navigation depth and supporting routes from website type, target audience, primary goal, and business context.",
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

  it("treats workflow promptControlManifest routes as authoritative and does not auto-inject blog from polluted requirement text", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "# Canonical Website Generation Prompt",
            "- Primary goal: 联系, Quote, Build brand trust",
            "- Page structure notes mention blog and downloads in legacy source text.",
            "### Page-Level Intent Contract",
            '1. Home (/ -> /index.html)',
            '2. Contact (/contact -> /contact/index.html)',
          ].join("\n"),
        ),
      ],
      phase: "conversation",
      workflow_context: {
        promptControlManifest: {
          schemaVersion: 1,
          promptKind: "canonical_website_prompt",
          routeSource: "prompt_draft_page_plan",
          routes: ["/", "/contact"],
          navLabels: ["Home", "Contact"],
          files: ["/styles.css", "/script.js", "/index.html", "/contact/index.html"],
        },
        requirementSpec: {
          pageStructure: {
            mode: "multi",
            planning: "manual",
            pages: ["Contact", "Product", "Home", "downloads", "download", "solution", "service", "blog", "联系"],
          },
        },
      },
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/contact"]);
    expect(plan.navLabels).toEqual(["Home", "Contact"]);
    expect(plan.routes).not.toContain("/blog");
    expect(plan.routes).not.toContain("/downloads");
    expect(plan.routes).not.toContain("/products");
  });

  it("treats inline prompt control manifest routes as authoritative and does not expand them with system routes", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "# Canonical Website Generation Prompt",
            "The source materials mention blog, article archive, and downloadable assets.",
            "### Prompt Control Manifest (Machine Readable)",
            "```json",
            JSON.stringify({
              schemaVersion: 1,
              promptKind: "canonical_website_prompt",
              routeSource: "prompt_draft_page_plan",
              routes: ["/", "/contact"],
              navLabels: ["Home", "Contact"],
              files: ["/styles.css", "/script.js", "/index.html", "/contact/index.html"],
            }),
            "```",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).toEqual(["/", "/contact"]);
    expect(plan.navLabels).toEqual(["Home", "Contact"]);
    expect(plan.routes).not.toContain("/blog");
  });

  it("preserves exact structured manifest routes instead of canonicalizing them to generic aliases", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "# Canonical Website Generation Prompt",
            "Generate a B2B website. The exact route contract uses /solutions, not /custom-solutions.",
            "### Prompt Control Manifest (Machine Readable)",
            "```json",
            JSON.stringify({
              schemaVersion: 1,
              promptKind: "canonical_website_prompt",
              routeSource: "prompt_draft_page_plan",
              routes: ["/", "/solutions", "/cases", "/about", "/contact"],
              navLabels: ["Home", "Solutions", "Cases", "About", "Contact"],
              files: [
                "/styles.css",
                "/script.js",
                "/index.html",
                "/solutions/index.html",
                "/cases/index.html",
                "/about/index.html",
                "/contact/index.html",
              ],
            }),
            "```",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routeAuthorityMode).toBe("prompt_manifest");
    expect(plan.routes).toEqual(["/", "/solutions", "/cases", "/about", "/contact"]);
    expect(plan.navLabels).toEqual(["Home", "Solutions", "Cases", "About", "Contact"]);
    expect(plan.routes).not.toContain("/custom-solutions");
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

  it("does not turn domain URLs inside page-structure prose into explicit /www routes", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "提取https://www.vbuytextile.com/网站的信息、页面结构和图片，做一个毛巾的渠道外贸电商公司的官网。",
            "页面数与页面结构: 多页网站: 自动规划页面结构",
            "目标受众: 企业采购",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routes).not.toContain("/www");
    expect(plan.navLabels).not.toContain("Www");
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

  it("keeps /blog content-backed when the prompt manifest defers detail pages but keeps the archive", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "# Canonical Website Generation Prompt",
            "",
            "Build a polished personal technical blog for an AI consultant with Home, Blog, About, and Contact.",
            "The first pass only needs a strong blog index and a profile-led homepage.",
            "Do not generate blog detail pages yet. Blog details will be filled later by a separate workflow.",
            "",
            "### Prompt Control Manifest (Machine Readable)",
            "```json",
            JSON.stringify({
              schemaVersion: 1,
              promptKind: "canonical_website_prompt",
              routeSource: "prompt_draft_page_plan",
              routes: ["/", "/blog", "/contact", "/about"],
              navLabels: ["Home", "Blog", "Contact", "About"],
              files: ["/styles.css", "/script.js", "/index.html", "/blog/index.html", "/contact/index.html", "/about/index.html"],
            }),
            "```",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);
    expect(plan.routeAuthorityMode).toBe("prompt_manifest");
    expect(plan.routes).toEqual(["/", "/blog", "/contact", "/about"]);
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

  it("parses the actual machine-readable manifest instead of an earlier prose code fence mention", () => {
    const state: any = {
      messages: [
        new HumanMessage(
          [
            "# Canonical Website Generation Prompt",
            "",
            "This section is a thin machine-readable Prompt Control Manifest. It is not the website content plan.",
            "",
            "## 2. Website Overall Positioning Prompt",
            "```",
            "Generate a complete website from this canonical prompt.",
            "```",
            "",
            "### Fixed Pages And File Output",
            "- /styles.css",
            "- /script.js",
            "- /index.html",
            "- /products/index.html",
            "",
            "### Prompt Control Manifest (Machine Readable)",
            "```json",
            JSON.stringify({
              routes: ["/"],
              navLabels: ["Home"],
              files: ["/styles.css", "/script.js", "/index.html"],
            }),
            "```",
          ].join("\n"),
        ),
      ],
      phase: "conversation",
    };

    const plan = buildLocalDecisionPlan(state);

    expect(plan.routeAuthorityMode).toBe("prompt_manifest");
    expect(plan.routes).toEqual(["/"]);
    expect(plan.navLabels).toEqual(["Home"]);
  });
});
