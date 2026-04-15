import { describe, expect, it } from "vitest";
import { Bundler } from "./bundler";
import { TEST_PROJECT_LC_CNC } from "./agent/test_cases";

describe("Bundler.createBundle", () => {
  it("builds a complete 6-page LC-CNC static bundle with full navigation links", async () => {
    const bundle = await Bundler.createBundle(TEST_PROJECT_LC_CNC);

    expect(TEST_PROJECT_LC_CNC.pages).toHaveLength(6);
    expect(bundle.fileEntries).toHaveLength(6);

    const expectedPaths = TEST_PROJECT_LC_CNC.pages.map((page) =>
      page.path === "/" ? "/index.html" : `${page.path}/index.html`,
    );

    for (const expectedPath of expectedPaths) {
      expect(bundle.manifest[expectedPath]).toBeTypeOf("string");
    }

    const homeHtml = bundle.fileEntries.find((entry) => entry.path === "/index.html")?.content || "";
    for (const page of TEST_PROJECT_LC_CNC.pages) {
      const navUrl = page.path === "/" ? "/index.html" : `${page.path}/index.html`;
      expect(homeHtml).toContain(`href="${navUrl}"`);
    }
  });

  it("uses concise nav labels instead of long SEO titles", async () => {
    const bundle = await Bundler.createBundle(TEST_PROJECT_LC_CNC);
    const homeHtml = bundle.fileEntries.find((entry) => entry.path === "/index.html")?.content || "";

    // Long SEO fragments should not be used directly in the top nav.
    expect(homeHtml).not.toContain("汽车/航空/模具/医疗行业解决方案");
    expect(homeHtml).not.toContain("立式/卧式/车铣复合/龙门");

    // Expected concise labels derived from route mapping.
    for (const shortLabel of ["首页", "公司", "产品", "资讯", "案例", "联系"]) {
      expect(homeHtml).toContain(`>${shortLabel}</a>`);
    }
  });

  it("renders contact form site binding fields for deployed static sites", async () => {
    const bundle = await Bundler.createBundle({
      branding: { name: "Binding Demo", colors: { primary: "#2563eb" } },
      pages: [
        {
          path: "/contact",
          seo: { title: "Contact", description: "contact us" },
          puckData: {
            root: {},
            content: [
              {
                type: "ContactForm",
                props: {
                  title: "Contact",
                  actionUrl: "https://app.shpitto.com/api/contact?site_key=sp_demo123",
                  siteKey: "sp_demo123",
                },
              },
            ],
          },
        },
      ],
    });

    const contactHtml = bundle.fileEntries.find((entry) => entry.path === "/contact/index.html")?.content || "";
    expect(contactHtml).toContain('action="https://app.shpitto.com/api/contact?site_key=sp_demo123"');
    expect(contactHtml).toContain('name="_site_key" value="sp_demo123"');
  });

  it("prefers page-level rawHtml over component renderer output", async () => {
    const bundle = await Bundler.createBundle({
      branding: { name: "RawHtml Demo", colors: { primary: "#111827", accent: "#F59E0B" } },
      pages: [
        {
          path: "/",
          seo: { title: "RawHtml", description: "raw html demo" },
          puckData: {
            root: {
              props: {
                rawHtml: '<section id="raw-only"><h1>Raw HTML Path</h1><p>Code-first rendering</p></section>',
              },
            },
            content: [{ type: "Hero", props: { title: "Should Not Render" } }],
          },
        },
      ],
    });

    const html = bundle.fileEntries.find((entry) => entry.path === "/index.html")?.content || "";
    expect(html).toContain('id="raw-only"');
    expect(html).toContain("Raw HTML Path");
    expect(html).not.toContain("Should Not Render");
  });

  it("applies skill-provided style preset in generated HTML", async () => {
    const bundle = await Bundler.createBundle({
      projectId: "bmw-inspired",
      branding: {
        name: "LC-CNC",
        colors: { primary: "#2A72E5", accent: "#9CA3AF" },
        style: { borderRadius: "none", typography: "Inter" },
      },
      skillHit: {
        id: "bmw",
        name: "bmw",
        design_desc: "BMW style",
        style_preset: {
          mode: "dark",
          navVariant: "underline",
          headerVariant: "glass",
          footerVariant: "dark",
          buttonVariant: "solid",
          heroTheme: "dark",
          heroEffect: "none",
          borderRadius: "none",
          typography: "Inter, system-ui, sans-serif",
          navLabelMaxChars: 10,
          colors: {
            primary: "#2A72E5",
            accent: "#9CA3AF",
            background: "#06090F",
            surface: "#0B1120",
            panel: "#111827",
            text: "#F3F4F6",
            muted: "#9CA3AF",
            border: "#1F2937",
          },
        },
      },
      pages: [
        {
          path: "/",
          seo: { title: "Home | LC-CNC", description: "desc" },
          puckData: {
            root: {},
            content: [{ type: "Hero", props: { title: "Hero", align: "text-left" } }],
          },
        },
      ],
    });

    const html = bundle.fileEntries[0]?.content || "";
    expect(html).toContain('data-style-mode="dark"');
    expect(html).toContain("border-b-2 border-primary");
    expect(html).toContain("--brand-bg: #06090F");
  });

  it("passes through staticSite files without wrapping component renderer", async () => {
    const bundle = await Bundler.createBundle({
      projectId: "skill-direct-demo",
      branding: { name: "LC-CNC", colors: { primary: "#0B3B66", accent: "#F59E0B" } },
      pages: [],
      staticSite: {
        mode: "skill-direct",
        files: [
          { path: "/styles.css", content: "body{color:#111}", type: "text/css" },
          { path: "/index.html", content: "<!doctype html><html><body><h1>Skill Direct</h1></body></html>", type: "text/html" },
        ],
      },
    });

    expect(bundle.fileEntries).toHaveLength(2);
    const html = bundle.fileEntries.find((entry) => entry.path === "/index.html")?.content || "";
    expect(html).toContain("<h1>Skill Direct</h1>");
    expect(html).not.toContain("showWebsitePreview");
  });

  it("renders skill-native component aliases and structured content without leaking raw JSON", async () => {
    const bundle = await Bundler.createBundle({
      branding: { name: "LC-CNC", colors: { primary: "#111827", accent: "#DC2626" } },
      pages: [
        {
          path: "/products",
          seo: { title: "Products", description: "desc" },
          puckData: {
            root: {},
            content: [
              {
                type: "ProductGrid",
                props: {
                  sectionTitle: "产品系列",
                  items: [
                    {
                      model: "LC-V850",
                      name: "立式加工中心 LC-V850",
                      specs: [
                        { label: "主轴转速", value: "12000 rpm" },
                        { label: "重复定位", value: "±0.003mm" },
                      ],
                      applications: ["汽车零部件", "通用机械"],
                    },
                  ],
                },
              },
              {
                type: "Content_Block",
                props: {
                  title: "ContactInfo",
                  content: JSON.stringify({
                    columns: [
                      { title: "公司地址", lines: ["深圳宝安区", "LC-CNC产业园"] },
                      { title: "销售热线", lines: ["+86 400-888-0001"] },
                    ],
                  }),
                },
              },
            ],
          },
        },
      ],
    });

    const html = bundle.fileEntries.find((entry) => entry.path === "/products/index.html")?.content || "";
    expect(html).toContain("立式加工中心 LC-V850");
    expect(html).toContain("主轴转速: 12000 rpm");
    expect(html).toContain("应用: 汽车零部件 / 通用机械");
    expect(html).toContain("公司地址");
    expect(html).toContain("LC-CNC产业园");
    expect(html).not.toContain("Component ProductGrid not yet implemented");
    expect(html).not.toContain("{&quot;columns&quot;");
  });
});
