import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

const ROUTES = ["/", "/company", "/products", "/news", "/cases", "/contact"];

function baseProjectSkeleton() {
  return {
    projectId: "lc-cnc-problem1-mock",
    branding: {
      name: "LC-CNC",
      logo: "https://images.unsplash.com/photo-1497215842964-222b430dc094?w=120&h=120&fit=crop",
      colors: { primary: "#0B3B66", accent: "#F59E0B" },
      style: { borderRadius: "md", typography: "Inter" },
    },
    pages: ROUTES.map((route) => ({
      path: route,
      seo: {
        title:
          route === "/"
            ? "Home | LC-CNC"
            : `${route.replace("/", "").toUpperCase()} | LC-CNC`,
        description: `SEO description for ${route} page of LC-CNC.`,
      },
      puckData: { content: [] },
    })),
  };
}

function pageHtmlFor(route: string) {
  const titleMap: Record<string, string> = {
    "/": "LC-CNC Precision CNC Solutions",
    "/company": "About LC-CNC Manufacturing Capabilities",
    "/products": "CNC Product Portfolio and Specs",
    "/news": "Latest CNC News and Updates",
    "/cases": "Industrial Application Case Studies",
    "/contact": "Contact LC-CNC Engineering Team",
  };

  const h1 = titleMap[route] || `LC-CNC ${route}`;
  const shared = `
<section class="hero">
  <h1>${h1}</h1>
  <p>LC-CNC delivers engineering-grade CNC capability for ${route} scenarios with measurable throughput and quality control.</p>
  <a href="/contact/index.html">Get Quote</a>
</section>
<section class="highlights">
  <article><h2>Process Stability</h2><p>Controlled production from sample to batch.</p></article>
  <article><h2>Engineering Response</h2><p>Fast DFM and fixture strategy support.</p></article>
  <article><h2>Global Delivery</h2><p>Export-ready quality docs and logistics.</p></article>
</section>
`;

  if (route === "/contact") {
    return `
${shared}
<section class="contact-form">
  <h2>Submit Your CNC Inquiry</h2>
  <form method="post" action="/api/contact">
    <input type="text" name="name" />
    <input type="email" name="email" />
    <textarea name="message"></textarea>
    <button type="submit">Submit</button>
  </form>
</section>
`;
  }

  if (route === "/news") {
    return `
${shared}
<section class="news-categories">
  <h2>News Categories</h2>
  <ul>
    <li>Product Releases</li>
    <li>Events</li>
    <li>Customer Wins</li>
    <li>Technical Articles</li>
  </ul>
</section>
`;
  }

  return shared;
}

function skillDirectPayload() {
  return {
    site: {
      stylesCss: `
:root { --bg:#f8fafc; --ink:#0f172a; --muted:#475569; --brand:#0B3B66; --line:#e2e8f0; --container:1160px; }
*{box-sizing:border-box;} html,body{margin:0;padding:0;} body{font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;}
.container{width:min(var(--container),calc(100% - 2rem));margin:0 auto;}
.topbar{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line);z-index:40;}
.topbar-inner{min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:1rem;}
.brand{text-decoration:none;color:var(--ink);font-weight:700;}
.nav-list{list-style:none;margin:0;padding:0;display:flex;gap:1rem;}
.nav-list a{text-decoration:none;color:var(--muted);font-weight:600;}
.nav-list a.is-active,.nav-list a:hover{color:var(--brand);}
.btn{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;border-radius:999px;padding:.65rem 1.1rem;font-weight:700;}
.btn-primary{background:var(--brand);color:#fff;}
.footer{margin-top:4rem;border-top:1px solid var(--line);background:#fff;padding:2rem 0;color:var(--muted);}
`.trim(),
      scriptJs: `
(() => {
  const btn = document.querySelector("[data-menu-toggle]");
  const list = document.querySelector("[data-nav-list]");
  if (!btn || !list) return;
  btn.addEventListener("click", () => {
    const open = list.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
})();
`.trim(),
      pages: ROUTES.map((route) => {
        const titleMap: Record<string, string> = {
          "/": "Home | LC-CNC",
          "/company": "Company | LC-CNC",
          "/products": "Products | LC-CNC",
          "/news": "News | LC-CNC",
          "/cases": "Cases | LC-CNC",
          "/contact": "Contact | LC-CNC",
        };
        return {
          path: route,
          title: titleMap[route] || `LC-CNC ${route}`,
          description: `SEO description for ${route}.`,
          bodyHtml: pageHtmlFor(route),
        };
      }),
    },
  };
}

class MockChatOpenAI {
  constructor(_opts: any) {}

  withStructuredOutput(_schema: any) {
    return {
      invoke: async (messages: any[]) => {
        const fullPrompt = messages.map((m: any) => String(m?.content || "")).join("\n");
        if (fullPrompt.includes("website-generation-workflow execution engine")) {
          return skillDirectPayload();
        }
        const last = messages[messages.length - 1];
        const userText = (last?.content || "").toString();
        if (userText.includes("确认") || userText.toLowerCase().includes("start")) {
          return {
            intent: "confirm_build",
            message: "Confirmed. Generating now.",
            plan_outline: "LC-CNC 6-page architecture approved.",
          };
        }
        return {
          intent: "propose_plan",
          message: "Plan drafted for LC-CNC 6 pages.",
          plan_outline: "LC-CNC 6-page architecture approved.",
        };
      },
    };
  }

  async invoke(messages: any[]) {
    const prompt = (messages?.[0]?.content || "").toString();
    if (prompt.includes("website-generation-workflow execution engine")) {
      return new AIMessage({ content: JSON.stringify(skillDirectPayload()) });
    }

    if (prompt.includes("SEO_OPTIMIZATION") || prompt.includes("global_keywords")) {
      return new AIMessage({
        content: JSON.stringify({
          global_keywords: ["cnc machine", "precision machining", "industrial automation"],
          pages: ROUTES.map((route) => ({
            path: route,
            seo: {
              title: route === "/" ? "Home | LC-CNC" : `${route.replace("/", "")} | LC-CNC`,
              description: `Refined SEO metadata for ${route}.`,
            },
          })),
        }),
      });
    }

    return new AIMessage({ content: JSON.stringify(baseProjectSkeleton()) });
  }
}

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: MockChatOpenAI,
}));

describe("problem1 flow (mocked llm)", () => {
  it("runs skeleton -> expanding loop and generates a 6-page static site", async () => {
    const { graph } = await import("./graph");
    const { Bundler } = await import("../bundler");

    const outRoot = path.resolve(process.cwd(), ".tmp", "problem1-lc-cnc");
    const outSite = path.join(outRoot, "site");
    await fs.rm(outSite, { recursive: true, force: true });
    await fs.mkdir(outSite, { recursive: true });

    const firstInput: any = {
      messages: [
        new HumanMessage({
          content: [
            "为 LC-CNC 生成完整 6 页面静态站点。",
            "必须包含首页、公司概况、产品展示、新闻中心、应用案例、联系我们。",
            "每页内容要丰富，导航可互相跳转。",
            "请进行 deep research 后扩写页面内容。",
          ].join("\n"),
        }),
      ],
      phase: "conversation",
      current_page_index: 0,
      attempt_count: 0,
    } as any;

    const step1 = (await graph.invoke(firstInput)) as any;
    expect(step1.phase).toBe("conversation");

    const step2 = (await graph.invoke({
      ...step1,
      messages: [...(step1.messages || []), new HumanMessage({ content: "我确认方案，开始生成预览网站。" })],
    })) as any;

    expect(step2.project_json).toBeTruthy();
    expect(step2.phase).toBe("end");

    const project = step2.project_json;
    expect(project.pages.length).toBe(6);
    expect(project.pages.map((p: any) => p.path)).toEqual(ROUTES);
    const designHit = step2.design_hit || project.skillHit;
    expect(designHit).toBeTruthy();
    expect(typeof designHit.id).toBe("string");
    expect(designHit.id.length).toBeGreaterThan(0);
    expect(designHit.source).toBe("website-generation-workflow");
    expect(typeof designHit.design_desc).toBe("string");
    expect(designHit.design_desc.length).toBeGreaterThan(20);
    expect(designHit.style_preset).toBeTruthy();
    expect(designHit.style_preset?.colors?.primary).toMatch(/^#[0-9A-F]{6}$/);

    const heroTitles = project.pages
      .map((p: any) => {
        const rawHtml = String(p?.puckData?.root?.props?.rawHtml || "");
        const match = rawHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        return (match?.[1] || "").replace(/<[^>]+>/g, "").trim();
      })
      .filter(Boolean);
    const uniqueHeroCount = new Set(heroTitles).size;
    expect(uniqueHeroCount).toBeGreaterThanOrEqual(6);

    const contactPage = project.pages.find((p: any) => p.path === "/contact");
    expect(contactPage).toBeTruthy();
    expect(/<form[\s>]/i.test(String(contactPage?.puckData?.root?.props?.rawHtml || ""))).toBe(true);

    const hasPlaceholderText = JSON.stringify(project).includes("Rich page narrative for");
    expect(hasPlaceholderText).toBe(false);

    const bundle = await Bundler.createBundle(project);
    for (const file of bundle.fileEntries) {
      const rel = file.path.replace(/^\/+/, "");
      const abs = path.join(outSite, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, file.content, "utf8");
    }

    const navChecks: Array<{ path: string; missingNavLinks: string[] }> = [];
    for (const p of project.pages || []) {
      const rel = p.path === "/" ? "index.html" : `${p.path.replace(/^\//, "")}/index.html`;
      const abs = path.join(outSite, rel);
      const html = await fs.readFile(abs, "utf8");
      const missing = (project.pages || [])
        .map((x: any) => (x.path === "/" ? "/index.html" : `/${x.path.replace(/^\//, "")}/index.html`))
        .filter((href: string) => !html.includes(`href=\"${href}\"`));
      navChecks.push({ path: p.path, missingNavLinks: missing });
    }

    expect(navChecks.every((c) => c.missingNavLinks.length === 0)).toBe(true);

    const report = {
      generatedAt: new Date().toISOString(),
      finalPhase: step2.phase,
      pageCount: project.pages.length,
      uniqueHeroCount,
      output: {
        projectJson: path.join(outRoot, "project.json"),
        siteDir: outSite,
      },
      pages: project.pages.map((p: any) => ({
        path: p.path,
        seoTitle: p.seo?.title,
        heroTitle: (() => {
          const rawHtml = String(p?.puckData?.root?.props?.rawHtml || "");
          const match = rawHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          return (match?.[1] || "").replace(/<[^>]+>/g, "").trim();
        })(),
      })),
      navChecks,
    };

    await fs.writeFile(path.join(outRoot, "project.json"), JSON.stringify(project, null, 2), "utf8");
    await fs.writeFile(path.join(outRoot, "report.json"), JSON.stringify(report, null, 2), "utf8");

    console.log("PROBLEM1_REPORT=" + JSON.stringify(report));
  });
});
