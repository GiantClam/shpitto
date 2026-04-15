import { describe, expect, it } from "vitest";
import { buildProjectFromExtractedSite, extractPageMetadata, selectMainLinks, type ExtractedSite } from "./site-extractor";

describe("site-extractor metadata", () => {
  it("extracts title/description/keywords from html", () => {
    const html = `
      <html>
        <head>
          <title>LC-CNC Official Site</title>
          <meta name="description" content="Precision CNC and engraving systems." />
          <meta name="keywords" content="cnc,engraving,automation" />
        </head>
      </html>
    `;

    const meta = extractPageMetadata(html);
    expect(meta.title).toBe("LC-CNC Official Site");
    expect(meta.description).toContain("Precision CNC");
    expect(meta.keywords).toContain("automation");
  });
});

describe("site-extractor link selection", () => {
  it("selects six main links in expected order", () => {
    const links = [
      { label: "网站首页", href: "http://example.com/", path: "/" },
      { label: "公司概况", href: "http://example.com/list-200.html", path: "/list-200.html" },
      { label: "产品展示", href: "http://example.com/list-205.html", path: "/list-205.html" },
      { label: "新闻中心", href: "http://example.com/list-211.html", path: "/list-211.html" },
      { label: "应用案例", href: "http://example.com/list-215.html", path: "/list-215.html" },
      { label: "联系我们", href: "http://example.com/list-225.html", path: "/list-225.html" },
      { label: "人才招聘", href: "http://example.com/list-300.html", path: "/list-300.html" },
    ];

    const main = selectMainLinks(links);
    expect(main).toHaveLength(6);
    expect(main.map((l) => l.label)).toEqual(["网站首页", "公司概况", "产品展示", "新闻中心", "应用案例", "联系我们"]);
  });
});

describe("buildProjectFromExtractedSite", () => {
  it("keeps extracted images and maps six target routes", () => {
    const extracted: ExtractedSite = {
      sourceUrl: "http://example.com/",
      siteName: "LC-CNC",
      logo: "http://example.com/static/logo.png",
      phone: "0755-23426677",
      pages: [
        {
          label: "网站首页",
          sourceUrl: "http://example.com/",
          sourcePath: "/",
          targetPath: "/",
          title: "网站首页",
          description: "desc",
          keywords: "cnc,engraving",
          images: ["http://example.com/a.jpg", "http://example.com/b.jpg"],
        },
        {
          label: "公司概况",
          sourceUrl: "http://example.com/list-200.html",
          sourcePath: "/list-200.html",
          targetPath: "/company",
          title: "公司概况",
          description: "desc",
          keywords: "company",
          images: ["http://example.com/c.jpg"],
        },
        {
          label: "产品展示",
          sourceUrl: "http://example.com/list-205.html",
          sourcePath: "/list-205.html",
          targetPath: "/products",
          title: "产品展示",
          description: "desc",
          keywords: "product",
          images: ["http://example.com/d.jpg"],
        },
        {
          label: "新闻中心",
          sourceUrl: "http://example.com/list-211.html",
          sourcePath: "/list-211.html",
          targetPath: "/news",
          title: "新闻中心",
          description: "desc",
          keywords: "news",
          images: ["http://example.com/e.jpg"],
        },
        {
          label: "应用案例",
          sourceUrl: "http://example.com/list-215.html",
          sourcePath: "/list-215.html",
          targetPath: "/cases",
          title: "应用案例",
          description: "desc",
          keywords: "cases",
          images: ["http://example.com/f.jpg"],
        },
        {
          label: "联系我们",
          sourceUrl: "http://example.com/list-225.html",
          sourcePath: "/list-225.html",
          targetPath: "/contact",
          title: "联系我们",
          description: "desc",
          keywords: "contact",
          images: ["http://example.com/g.jpg"],
        },
      ],
    };

    const project = buildProjectFromExtractedSite(extracted);
    expect(project.pages).toHaveLength(6);
    expect(project.pages.map((p) => p.path)).toEqual(["/", "/company", "/products", "/news", "/cases", "/contact"]);
    expect(project.branding.logo).toBe("http://example.com/static/logo.png");

    const homeHero = project.pages[0].puckData.content.find((c: any) => c.type === "Hero");
    expect(homeHero.props.image).toBe("http://example.com/a.jpg");
  });

  it("de-genericizes repeated descriptions", () => {
    const extracted: ExtractedSite = {
      sourceUrl: "http://example.com/",
      siteName: "LC-CNC",
      pages: [
        {
          label: "公司概况",
          sourceUrl: "http://example.com/about",
          sourcePath: "/about",
          targetPath: "/company",
          title: "公司概况",
          description: "同一条描述",
          keywords: "company",
          images: ["http://example.com/a.jpg"],
        },
        {
          label: "产品展示",
          sourceUrl: "http://example.com/products",
          sourcePath: "/products",
          targetPath: "/products",
          title: "产品展示",
          description: "同一条描述",
          keywords: "product",
          images: ["http://example.com/b.jpg"],
        },
      ],
    };

    const project = buildProjectFromExtractedSite(extracted);
    const hero1 = project.pages[0].puckData.content.find((c: any) => c.type === "Hero");
    const hero2 = project.pages[1].puckData.content.find((c: any) => c.type === "Hero");

    expect(hero1.props.subtitle).toContain("公司概况页面信息");
    expect(hero2.props.subtitle).toContain("产品展示页面信息");
    expect(hero1.props.subtitle).not.toBe(hero2.props.subtitle);
  });

  it("prefers non-ui assets for hero image", () => {
    const extracted: ExtractedSite = {
      sourceUrl: "http://example.com/",
      siteName: "LC-CNC",
      pages: [
        {
          label: "首页",
          sourceUrl: "http://example.com/",
          sourcePath: "/",
          targetPath: "/",
          title: "首页",
          description: "home",
          keywords: "",
          images: [
            "http://example.com/static/dao_hang/icon.png",
            "http://example.com/upload/file/contents/home.jpg",
          ],
        },
        {
          label: "联系我们",
          sourceUrl: "http://example.com/contact",
          sourcePath: "/contact",
          targetPath: "/contact",
          title: "联系我们",
          description: "contact",
          keywords: "",
          images: ["http://example.com/static/dao_hang/qv_xiao.png"],
        },
      ],
    };

    const project = buildProjectFromExtractedSite(extracted);
    const homeHero = project.pages[0].puckData.content.find((c: any) => c.type === "Hero");
    const contactHero = project.pages[1].puckData.content.find((c: any) => c.type === "Hero");

    expect(homeHero.props.image).toBe("http://example.com/upload/file/contents/home.jpg");
    expect(contactHero.props.image).toBe("http://example.com/upload/file/contents/home.jpg");
  });
});
