import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createChatTask, getChatTask } from "../agent/chat-task-store";
import {
  buildBlogContentWorkflowPreview,
  buildGeneratedBlogSeedPostsForTesting,
  finalizeGeneratedProjectArtifactForTesting,
  materializeGeneratedBlogDetailPagesForTesting,
  runPostDeploySmoke,
  SkillRuntimeExecutor,
} from "./executor";

function buildStaticSiteProject() {
  return {
    projectId: "deploy-flow-test",
    pages: [{ path: "/", html: "<!doctype html><html><head></head><body>ok</body></html>" }],
    staticSite: {
      mode: "skill-direct",
      files: [
        {
          path: "/index.html",
          type: "text/html",
          content: "<!doctype html><html><head><title>test</title></head><body>ok</body></html>",
        },
      ],
    },
  };
}

describe("SkillRuntimeExecutor deploy-only path", () => {
  it("builds three source-derived Blog seed posts from the provided website content", () => {
    const posts = buildGeneratedBlogSeedPostsForTesting({
      locale: "zh-CN",
      sourceText: [
        "URL：https://example.com/casux",
        "source: requirement_spec, route: /casux-research-center, navLabel: CASUX研究中心, purpose: 查询目录页。",
        "CASUX 信息平台汇聚政策法规、标准文件、研究报告、案例库与产品数据库。",
        "CASUX 适儿化改造标准体系服务儿童友好空间建设、认证查询和资料下载。",
        "研究中心提供环境健康、空间体验和实践案例的证据支持。",
      ].join("\n"),
    });

    expect(posts).toHaveLength(3);
    expect(posts.map((post) => post.status)).toEqual(["published", "published", "published"]);
    expect(posts.every((post) => String(post.slug || "").trim().length > 0)).toBe(true);
    expect(posts.map((post) => post.slug).join(" ")).toMatch(/casux/i);
    const combined = posts.map((post) => `${post.title} ${post.excerpt} ${post.contentMd}`).join("\n");
    expect(combined).toMatch(/CASUX|适儿化|儿童友好|标准文件|研究报告|案例库|认证查询|资料下载/);
    expect(combined).not.toMatch(/Specific Replay|marker|lorem ipsum|template news|requirement_spec|navLabel|route:/i);
  });

  it("prioritizes concrete source document titles when seeding Blog posts", () => {
    const posts = buildGeneratedBlogSeedPostsForTesting({
      locale: "zh-CN",
      sourceText: [
        "CASUX 信息平台展示用户资料中的具体内容。",
        "《儿童友好城市建设相关政策汇编》",
        "该政策汇编用于整理儿童友好城市建设、社区空间改造和适儿化服务相关法规政策。",
        "《适儿化空间建设标准指南》",
        "该标准指南说明空间安全、环保材料、无障碍、采光通风和儿童参与设计。",
        "《儿童友好空间实践案例研究报告》",
        "该研究报告用于归纳案例库中的实践路径、评估方法和项目经验。",
      ].join("\n"),
    });

    expect(posts).toHaveLength(3);
    expect(posts.map((post) => post.title)).toEqual([
      "儿童友好城市建设相关政策汇编",
      "适儿化空间建设标准指南",
      "儿童友好空间实践案例研究报告",
    ]);
    expect(posts[0]?.category).toBe("政策法规");
    expect(String(posts[0]?.slug || "")).toMatch(/post-1|children|policy|friendly|city/i);
    const combined = posts.map((post) => `${post.title} ${post.excerpt} ${post.contentMd}`).join("\n");
    expect(combined).toContain("儿童友好城市建设相关政策汇编");
    expect(combined).not.toMatch(/Blog backend|Blog API|runtime|fallback/i);
  });

  it("does not treat page planning labels as source document titles", () => {
    const posts = buildGeneratedBlogSeedPostsForTesting({
      locale: "zh-CN",
      sourceText: [
        "route: /casux-certification, navLabel: CASUX优标, purpose: 查询目录页。提供检索、筛选、结果展示与下一步引导的闭环。",
        "CASUX研究中心",
        "如何从零创立一个符合 CASUX 标准的适儿化空间",
        "CASUX 信息平台汇聚政策法规、标准文件、研究报告、案例库与产品数据库。",
      ].join("\n"),
    });

    const titles = posts.map((post) => post.title).join("\n");
    expect(titles).not.toContain("查询目录页");
    expect(titles).not.toContain("CASUX研究中心");
    expect(titles).not.toContain("如何从零创立");
  });

  it("does not treat requirement form JSON values as source document titles", () => {
    const posts = buildGeneratedBlogSeedPostsForTesting({
      locale: "zh-CN",
      sourceText: [
        "我要一个个人blog，主要是ai blog，帮我生成3篇文章",
        "[Requirement Form]",
        "```json",
        '{"siteType":"portfolio","targetAudience":["consumers"],"contentSources":["new_site"],"primaryVisualDirection":"warm-soft","secondaryVisualTags":["playful","minimal"],"pageStructure":{"mode":"multi","planning":"manual","pages":["blog"]},"functionalRequirements":["none"],"primaryGoal":["brand_trust"],"language":"bilingual","brandLogo":{"mode":"text_mark"},"customNotes":""}',
        "```",
        "这个个人 AI blog 面向普通读者，使用温暖柔和的视觉风格，围绕 AI 写作、日常工具和理性判断生成三篇完整文章。",
      ].join("\n"),
    });

    const combined = posts.map((post) => `${post.slug} ${post.title} ${post.excerpt} ${post.contentMd}`).join("\n");
    expect(combined).not.toMatch(/\b(manual|portfolio|bilingual|new_site|brand_trust|warm-soft|text_mark)\b/i);
  });

  it("builds source-aligned Blog posts from provided resume material", () => {
    const posts = buildGeneratedBlogSeedPostsForTesting({
      locale: "zh-CN",
      sourceText: [
        "bays wong",
        "职业履历亮点",
        "华为研发体系变革专家，作为部门级敏捷转型首席教练，推动组织级 DevOps 落地与效能提升工程。",
        "微信全球化进程奠基者，作为微信创始团队核心成员，主导实时音视频技术架构演进，建设覆盖全球50+国家的基础设施。",
        "云领天下 CTO，为 K12 提供全场景解决方案，覆盖全国 5000+ 家学校。",
        "来画科技 CTO，完成 AI 技术从实验室到商业化的关键跨越，打造 AI 数字人创作 SaaS 平台。",
        "HelloTalk CTO，构建高可用技术架构、数据智能中台及 AI 创新应用体系。",
      ].join("\n"),
    });

    expect(posts).toHaveLength(3);
    expect(posts.every((post) => String(post.slug || "").trim().length > 0)).toBe(true);
    expect(posts.every((post) => post.contentMd.length > 120)).toBe(true);
    const combined = posts.map((post) => `${post.title} ${post.excerpt} ${post.contentMd}`).join("\n");
    expect(combined).toMatch(/Bays Wong|华为|微信|HelloTalk|来画科技|云领天下|DevOps|SaaS/);
    expect(combined).not.toMatch(/lorem ipsum|template news|metadata-only|Blog backend|runtime/i);
  });

  it("does not turn requirement form or refine instructions into blog titles or Logo authors", () => {
    const preview = buildBlogContentWorkflowPreview({
      locale: "zh-CN",
      inputState: {
        messages: [
          {
            role: "user",
            content: [
              "我想做个个人简历网站，我的个人经历如下，做AI方向，需要3篇blog体现我的价值。",
              "beihuang。",
              "华为研发体系变革专家，微信全球化进程奠基者，HelloTalk CTO，来画科技 CTO，云领天下 CTO。",
            ].join("\n"),
          },
          {
            role: "user",
            content: "个人blog，首页应着重突出我的经历，具备极强的个人属性，请修改",
          },
        ] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          sourceRequirement: [
            "生成前必填信息已提交：",
            "- 网站类型: 作品集",
            "- 页面数与页面结构: 多页网站: 博客",
            "- 网站语言: 中英双语",
            "- Logo 策略: 暂无 Logo，使用品牌文字标识",
            "- 业务/内容补充: 我想做个个人简历网站，我的个人经历如下",
          ].join("\n"),
          requirementAggregatedText: [
            "我想做个个人简历网站，我的个人经历如下，做AI方向，需要3篇blog体现我的价值。",
            "beihuang。",
            "华为研发体系变革专家，微信全球化进程奠基者，HelloTalk CTO，来画科技 CTO，云领天下 CTO。",
            "[Requirement Form]",
            "```json",
            '{"siteType":"portfolio","language":"bilingual","brandLogo":{"mode":"text_mark"}}',
            "```",
          ].join("\n"),
          latestUserText: "个人blog，首页应着重突出我的经历，具备极强的个人属性，请修改",
        } as any,
      } as any,
      project: {
        branding: { name: "Logo" },
        staticSite: {
          files: [
            {
              path: "/blog/index.html",
              content:
                '<!doctype html><html><body><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h1>博客</h1><div data-shpitto-blog-list></div></section></body></html>',
            },
          ],
        },
      } as any,
    });

    const combined = preview.posts.map((post) => `${post.authorName} ${post.title} ${post.excerpt} ${post.contentMd}`).join("\n");
    expect(preview.posts.length).toBeGreaterThan(0);
    expect(combined).not.toMatch(/业务\/内容补充|页面数与页面结构|Logo 策略|text_mark|Requirement Form/i);
    expect(preview.posts.some((post) => String(post.authorName || "").trim() === "Logo")).toBe(false);
    expect(combined).toMatch(/华为|微信|HelloTalk|来画科技|云领天下|beihuang/i);
  });

  it("builds a pending Blog workflow preview from generated site artifacts", () => {
    const preview = buildBlogContentWorkflowPreview({
      locale: "zh-CN",
      inputState: {
        messages: [] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          sourceRequirement: "bays wong 华为 微信 HelloTalk 来画科技 云领天下 DevOps 实时音视频 AI SaaS",
        },
      } as any,
      project: {
        staticSite: {
          files: [
            {
              path: "/blog/index.html",
              content:
                '<!doctype html><html><body><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h1>博客</h1><div data-shpitto-blog-list></div></section></body></html>',
            },
          ],
        },
      },
    });

    expect(preview.required).toBe(true);
    expect(preview.reason).toBe("ready");
    expect(preview.navLabel).toBeTruthy();
    expect(preview.posts).toHaveLength(3);
  });

  it("does not synthesize blog posts from generated site html when explicit source text is missing", () => {
    const preview = buildBlogContentWorkflowPreview({
      locale: "zh-CN",
      inputState: {
        messages: [] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {},
      } as any,
      project: {
        staticSite: {
          files: [
            {
              path: "/index.html",
              content:
                "<!doctype html><html><body><main><section><h2>阅读入口</h2><p>从首页开始，循序进入深内容。接下来看博客，内容会更具体。</p></section></main></body></html>",
            },
            {
              path: "/blog/index.html",
              content: [
                "<!doctype html><html><body><main>",
                '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts">',
                "<h1>博客</h1>",
                "<p>如果你想看更具体的内容，可以从文章页开始。</p>",
                '<div data-shpitto-blog-list></div>',
                "</section></main></body></html>",
              ].join(""),
            },
          ],
        },
      },
    });

    expect(preview.required).toBe(false);
    expect(preview.reason).toBe("no_source");
    expect(preview.posts).toHaveLength(0);
  });

  it("keeps current static blog detail pages when explicit source text is missing", () => {
    const preview = buildBlogContentWorkflowPreview({
      locale: "zh-CN",
      inputState: {
        messages: [] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {},
      } as any,
      project: {
        staticSite: {
          files: [
            {
              path: "/blog/index.html",
              content: [
                "<!doctype html><html><body><main>",
                '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><h1>博客</h1><div data-shpitto-blog-list>',
                '<article><a href="/blog/first-note/">A</a></article>',
                '<article><a href="/blog/second-note/">B</a></article>',
                '<article><a href="/blog/third-note/">C</a></article>',
                "</div></section></main></body></html>",
              ].join(""),
            },
            {
              path: "/blog/first-note/index.html",
              content:
                '<!doctype html><html><head><title>第一篇文章｜站点</title><meta name="description" content="第一篇文章摘要，长度足够提取并且明确说明文章讨论判断框架与内容组织方式。" /></head><body><main><article><h1>第一篇文章</h1><div class="article-meta"><span>2025-01-01</span><span>观点</span><span>判断</span></div><p class="section-lead">第一篇文章摘要，长度足够提取并且明确说明文章讨论判断框架与内容组织方式。</p><h2>正文</h2><p>第一段正文足够长，用于模拟已有静态文章内容，并且包含完整句子来满足正文提取规则。</p><p>第二段正文继续展开主题与判断，说明这篇文章为什么值得保留在当前站点中继续呈现。</p><p>第三段正文补足完整内容，避免因为字数太短而在静态提取阶段被误判为空内容。</p></article></main></body></html>',
            },
            {
              path: "/blog/second-note/index.html",
              content:
                '<!doctype html><html><head><title>第二篇文章｜站点</title><meta name="description" content="第二篇文章摘要，长度足够提取并且明确说明文章讨论方法结构与执行节奏。" /></head><body><main><article><h1>第二篇文章</h1><div class="article-meta"><span>2025-01-02</span><span>方法</span><span>结构</span></div><p class="section-lead">第二篇文章摘要，长度足够提取并且明确说明文章讨论方法结构与执行节奏。</p><h2>正文</h2><p>第一段正文足够长，用于模拟已有静态文章内容，并且包含完整句子来满足正文提取规则。</p><p>第二段正文继续展开主题与判断，说明这篇文章为什么值得保留在当前站点中继续呈现。</p><p>第三段正文补足完整内容，避免因为字数太短而在静态提取阶段被误判为空内容。</p></article></main></body></html>',
            },
            {
              path: "/blog/third-note/index.html",
              content:
                '<!doctype html><html><head><title>第三篇文章｜站点</title><meta name="description" content="第三篇文章摘要，长度足够提取并且明确说明文章讨论实践节奏与交付方式。" /></head><body><main><article><h1>第三篇文章</h1><div class="article-meta"><span>2025-01-03</span><span>实践</span><span>节奏</span></div><p class="section-lead">第三篇文章摘要，长度足够提取并且明确说明文章讨论实践节奏与交付方式。</p><h2>正文</h2><p>第一段正文足够长，用于模拟已有静态文章内容，并且包含完整句子来满足正文提取规则。</p><p>第二段正文继续展开主题与判断，说明这篇文章为什么值得保留在当前站点中继续呈现。</p><p>第三段正文补足完整内容，避免因为字数太短而在静态提取阶段被误判为空内容。</p></article></main></body></html>',
            },
          ],
        },
      },
    });

    expect(preview.required).toBe(true);
    expect(preview.reason).toBe("ready");
    expect(preview.posts.map((post) => post.title)).toEqual(["第一篇文章", "第二篇文章", "第三篇文章"]);
  });

  it("materializes missing static blog detail pages for native generation artifacts", () => {
    const project = materializeGeneratedBlogDetailPagesForTesting({
      locale: "zh-CN",
      inputState: {
        messages: [] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          sourceRequirement:
            "Bays Wong 华为 微信 HelloTalk 来画科技 云领天下 DevOps 实时音视频 AI SaaS，需要 3 篇博客文章展示技术判断与商业化价值。",
        },
      } as any,
      project: {
        branding: { name: "Bays Wong" },
        pages: [
          { path: "/", html: "<!doctype html><html><head></head><body><h1>Home</h1></body></html>" },
          {
            path: "/blog",
            html: [
              '<!doctype html><html><head></head><body><main>',
              '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list>',
              '<article><a href="/blog/agile-devops-system-design/">A</a></article>',
              '<article><a href="/blog/wechat-real-time-media-global/">B</a></article>',
              '<article><a href="/blog/ai-saas-commercialization-cto-practice/">C</a></article>',
              "</div></section></main></body></html>",
            ].join(""),
          },
        ],
        staticSite: {
          mode: "skill-direct",
          files: [
            {
              path: "/index.html",
              type: "text/html",
              content: "<!doctype html><html><head></head><body><h1>Home</h1></body></html>",
            },
            {
              path: "/blog/index.html",
              type: "text/html",
              content: [
                '<!doctype html><html><head></head><body><main>',
                '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list>',
                '<article><a href="/blog/agile-devops-system-design/">A</a></article>',
                '<article><a href="/blog/wechat-real-time-media-global/">B</a></article>',
                '<article><a href="/blog/ai-saas-commercialization-cto-practice/">C</a></article>',
                "</div></section></main></body></html>",
              ].join(""),
            },
            {
              path: "/styles.css",
              type: "text/css",
              content: "body{font-family:sans-serif}",
            },
            {
              path: "/script.js",
              type: "text/javascript",
              content: "console.log('ok')",
            },
          ],
        },
      },
    });

    const files = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
    expect(files.map((file: any) => file.path)).toEqual(
      expect.arrayContaining([
        "/blog/agile-devops-system-design/index.html",
        "/blog/wechat-real-time-media-global/index.html",
        "/blog/ai-saas-commercialization-cto-practice/index.html",
      ]),
    );
    const detail = files.find((file: any) => file.path === "/blog/agile-devops-system-design/index.html");
    expect(String(detail?.content || "")).toContain("返回博客");
    expect(String(detail?.content || "")).toContain("../../styles.css");
    expect(String(detail?.content || "")).toContain("华为");
  });

  it("finalizes generated preview artifacts by materializing missing static blog detail pages", () => {
    const project = finalizeGeneratedProjectArtifactForTesting({
      locale: "bilingual",
      inputState: {
        messages: [] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          sourceRequirement:
            "Bays Wong 华为 微信 HelloTalk 来画科技 云领天下 DevOps 实时音视频 AI SaaS，需要中英双语个人博客，并生成 3 篇完整博客文章。",
        },
      } as any,
      project: {
        branding: { name: "Bays Wong" },
        pages: [
          { path: "/", html: "<!doctype html><html><head></head><body><h1>Home</h1></body></html>" },
          {
            path: "/blog",
            html: [
              '<!doctype html><html><head></head><body><main>',
              '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list>',
              '<article><a href="/blog/agile-devops-system-design/">A</a></article>',
              '<article><a href="/blog/wechat-real-time-media-global/">B</a></article>',
              '<article><a href="/blog/ai-saas-commercialization-cto-practice/">C</a></article>',
              "</div></section></main></body></html>",
            ].join(""),
          },
        ],
        staticSite: {
          mode: "skill-direct",
          files: [
            {
              path: "/index.html",
              type: "text/html",
              content: "<!doctype html><html><head></head><body><h1>Home</h1></body></html>",
            },
            {
              path: "/blog/index.html",
              type: "text/html",
              content: [
                '<!doctype html><html><head></head><body><main>',
                '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list>',
                '<article><a href="/blog/agile-devops-system-design/">A</a></article>',
                '<article><a href="/blog/wechat-real-time-media-global/">B</a></article>',
                '<article><a href="/blog/ai-saas-commercialization-cto-practice/">C</a></article>',
                "</div></section></main></body></html>",
              ].join(""),
            },
            {
              path: "/styles.css",
              type: "text/css",
              content: "body{font-family:sans-serif}",
            },
            {
              path: "/script.js",
              type: "text/javascript",
              content: "console.log('ok')",
            },
          ],
        },
      },
    });

    const files = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
    expect(files.map((file: any) => file.path)).toEqual(
      expect.arrayContaining([
        "/blog/agile-devops-system-design/index.html",
        "/blog/wechat-real-time-media-global/index.html",
        "/blog/ai-saas-commercialization-cto-practice/index.html",
      ]),
    );
  });

  it("keeps blog detail generation single-language even when the site locale is bilingual", () => {
    const project = materializeGeneratedBlogDetailPagesForTesting({
      locale: "bilingual",
      inputState: {
        messages: [] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          sourceRequirement:
            "Bays Wong 华为 微信 HelloTalk 来画科技 云领天下 DevOps 实时音视频 AI SaaS，需要中英双语网站，博客详情页必须支持语言切换。",
        },
      } as any,
      project: {
        branding: { name: "Bays Wong" },
        pages: [
          { path: "/", html: "<!doctype html><html><head></head><body><h1>Home</h1></body></html>" },
          {
            path: "/blog",
            html: [
              '<!doctype html><html><head></head><body><main>',
              '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list>',
              '<article><a href="/blog/agile-devops-system-design/">A</a></article>',
              '<article><a href="/blog/wechat-real-time-media-global/">B</a></article>',
              '<article><a href="/blog/ai-saas-commercialization-cto-practice/">C</a></article>',
              "</div></section></main></body></html>",
            ].join(""),
          },
        ],
        staticSite: {
          mode: "skill-direct",
          files: [
            {
              path: "/index.html",
              type: "text/html",
              content: "<!doctype html><html><head></head><body><h1>Home</h1></body></html>",
            },
            {
              path: "/blog/index.html",
              type: "text/html",
              content: [
                '<!doctype html><html><head></head><body><main>',
                '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list>',
                '<article><a href="/blog/agile-devops-system-design/">A</a></article>',
                '<article><a href="/blog/wechat-real-time-media-global/">B</a></article>',
                '<article><a href="/blog/ai-saas-commercialization-cto-practice/">C</a></article>',
                "</div></section></main></body></html>",
              ].join(""),
            },
            {
              path: "/styles.css",
              type: "text/css",
              content: "body{font-family:sans-serif}",
            },
            {
              path: "/script.js",
              type: "text/javascript",
              content: "console.log('ok')",
            },
          ],
        },
      },
    });

    const files = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
    const detail = files.find((file: any) => file.path === "/blog/agile-devops-system-design/index.html");
    const html = String(detail?.content || "");
    expect(html).toContain('lang="zh"');
    expect(html).not.toContain("data-i18n");
    expect(html).not.toContain("data-locale-toggle");
    expect(html).not.toContain("data-article-body-zh");
    expect(html).not.toContain("data-article-body-en");
  });

  it("preserves existing blog detail pages when the site locale is bilingual", () => {
    const project = materializeGeneratedBlogDetailPagesForTesting({
      locale: "bilingual",
      inputState: {
        messages: [] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          sourceRequirement: "Mercury 中英双语博客，需要详情页语言切换。",
        },
      } as any,
      project: {
        branding: { name: "Mercury" },
        staticSite: {
          mode: "skill-direct",
          files: [
            {
              path: "/index.html",
              type: "text/html",
              content: "<!doctype html><html><head></head><body><h1>Home</h1></body></html>",
            },
            {
              path: "/blog/index.html",
              type: "text/html",
              content: [
                '<!doctype html><html><body><main>',
                '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list>',
                '<article><a href="/blog/soft-visual-language/">A</a></article>',
                '<article><a href="/blog/repeatable-method-notes/">B</a></article>',
                '<article><a href="/blog/bilingual-tone-consistency/">C</a></article>',
                "</div></section></main></body></html>",
              ].join(""),
            },
            {
              path: "/blog/soft-visual-language/index.html",
              type: "text/html",
              content:
                '<!doctype html><html lang="zh-CN"><head><title>Old</title></head><body><article><h1>旧详情页</h1><p>仅中文。</p></article></body></html>',
            },
            {
              path: "/styles.css",
              type: "text/css",
              content: "body{font-family:sans-serif}",
            },
            {
              path: "/script.js",
              type: "text/javascript",
              content: "console.log('ok')",
            },
          ],
        },
      },
    });

    const files = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
    const detail = files.find((file: any) => file.path === "/blog/soft-visual-language/index.html");
    const html = String(detail?.content || "");
    expect(html).toContain("旧详情页");
    expect(html).toContain("仅中文");
    expect(html).not.toContain("data-locale-toggle");
  });

  it("sanitizes editorial scaffold wording in an existing blog index page without adding bilingual switch markup", () => {
    const project = materializeGeneratedBlogDetailPagesForTesting({
      locale: "bilingual",
      inputState: {
        messages: [] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          sourceRequirement: "Mercury 中英双语博客，需要博客索引页和详情页都支持语言切换。",
        },
      } as any,
      project: {
        branding: { name: "Mercury" },
        staticSite: {
          mode: "skill-direct",
          files: [
            {
              path: "/index.html",
              type: "text/html",
              content: "<!doctype html><html><head></head><body><h1>Home</h1></body></html>",
            },
            {
              path: "/blog/index.html",
              type: "text/html",
              content: [
                '<!doctype html><html lang="zh-CN"><head><title>博客｜Mercury</title></head><body><main>',
                '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts">',
                '<h1>博客</h1><p>阅读路径：先看第一篇，再看第二篇。</p>',
                '<div data-shpitto-blog-list><article><a href="/blog/soft-visual-language/">A</a></article></div>',
                "</section></main></body></html>",
              ].join(""),
            },
            {
              path: "/styles.css",
              type: "text/css",
              content: "body{font-family:sans-serif}",
            },
            {
              path: "/script.js",
              type: "text/javascript",
              content: "console.log('ok')",
            },
          ],
        },
      },
    });

    const files = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
    const blogIndex = files.find((file: any) => file.path === "/blog/index.html");
    const html = String(blogIndex?.content || "");
    expect(html).not.toContain("阅读路径");
    expect(html).toContain("内容脉络");
    expect(html).not.toContain("data-locale-toggle");
    expect(html).not.toContain("data-i18n");
    expect(html).toContain('data-shpitto-blog-api="/api/blog/posts"');
  });

  it("prefers current static blog detail pages over stale workflow preview posts", () => {
    const preview = buildBlogContentWorkflowPreview({
      locale: "zh-CN",
      inputState: {
        messages: [] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          sourceRequirement: "Bays Wong 华为 微信 HelloTalk 来画科技 云领天下 DevOps 实时音视频 AI SaaS",
          blogContentPreviewPosts: [
            {
              slug: "stale-k12-post",
              title: "K12 Standards And Resource Guide",
              excerpt: "stale",
              contentMd: "# stale",
            },
          ],
        },
      } as any,
      project: {
        staticSite: {
          files: [
            {
              path: "/blog/index.html",
              content: [
                '<!doctype html><html><body><main>',
                '<section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list>',
                '<article><a href="/blog/agile-devops-transformation/">A</a></article>',
                '<article><a href="/blog/wechat-real-time-media-architecture/">B</a></article>',
                '<article><a href="/blog/ai-commercialization-practice/">C</a></article>',
                "</div></section></main></body></html>",
              ].join(""),
            },
            {
              path: "/blog/agile-devops-transformation/index.html",
              content: [
                '<!doctype html><html><head><title>从敏捷到 DevOps：华为研发体系如何真正升级｜Bays Wong</title><meta name="description" content="华为研发体系变革的实践复盘：敏捷转型、DevOps 落地与组织效能升级的关键做法。" /></head><body><main>',
                '<article><h1>从敏捷到 DevOps：华为研发体系如何真正升级</h1><div class="article-meta"><span>2024-12-18</span><span>组织实践</span><span>研发效能</span></div>',
                '<p class="section-lead">大型研发组织的升级，从来不是把一套新名词贴到旧流程上。</p><h2>判断起点</h2><p>第一段正文足够长，用于模拟完整文章内容与部署提取。</p><p>第二段正文继续展开工程实践与组织协同。</p><p>第三段正文说明反馈闭环和持续改进。</p></article>',
                "</main></body></html>",
              ].join(""),
            },
            {
              path: "/blog/wechat-real-time-media-architecture/index.html",
              content: [
                '<!doctype html><html><head><title>微信实时音视频架构：为全球 50+ 国家而设计的弹性底座｜Bays Wong</title><meta name="description" content="微信全球化进程中的实时音视频架构复盘：弹性、覆盖与亿级用户连接能力。" /></head><body><main>',
                '<article><h1>微信实时音视频架构：为全球 50+ 国家而设计的弹性底座</h1><div class="article-meta"><span>2024-11-09</span><span>全球化架构</span><span>实时音视频</span></div>',
                '<p class="section-lead">全球化实时连接能力是一项基础设施工程。</p><h2>基础设施</h2><p>第一段正文足够长，用于模拟完整文章内容与部署提取。</p><p>第二段正文继续展开网络覆盖与调度能力。</p><p>第三段正文说明产品战略与架构协同。</p></article>',
                "</main></body></html>",
              ].join(""),
            },
            {
              path: "/blog/ai-commercialization-practice/index.html",
              content: [
                '<!doctype html><html><head><title>把 AI 从实验室带到商业现场｜Bays Wong</title><meta name="description" content="把 AI 从实验室带到商业现场：来画、HelloTalk 与云领天下的实践复盘。" /></head><body><main>',
                '<article><h1>把 AI 从实验室带到商业现场</h1><div class="article-meta"><span>2024-09-26</span><span>创业实践</span><span>AI 商业化</span></div>',
                '<p class="section-lead">AI 商业化的关键不在演示，而在进入真实业务流程。</p><h2>产品化</h2><p>第一段正文足够长，用于模拟完整文章内容与部署提取。</p><p>第二段正文继续展开平台能力与运营约束。</p><p>第三段正文说明技术价值如何进入商业结果。</p></article>',
                "</main></body></html>",
              ].join(""),
            },
          ],
        },
      },
    });

    expect(preview.required).toBe(true);
    expect(preview.posts.map((post) => post.slug)).toEqual([
      "agile-devops-transformation",
      "wechat-real-time-media-architecture",
      "ai-commercialization-practice",
    ]);
    expect(preview.posts[0]?.title).toContain("华为研发体系");
    expect(preview.posts.map((post) => post.title).join(" ")).not.toContain("K12");
  });

  it("falls back to source-aligned blog posts when static detail pages drift away from a CASUX source", () => {
    const preview = buildBlogContentWorkflowPreview({
      locale: "zh-CN",
      inputState: {
        messages: [] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          sourceRequirement: "CASUX 适儿空间标准 研究报告 认证查询 政策法规 资料下载 信息平台",
        },
      } as any,
      project: {
        staticSite: {
          files: [
            {
              path: "/blog/index.html",
              content: [
                '<!doctype html><html><body><main><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list>',
                '<article><a href="/blog/reading-the-noise-before-it-spreads/">A</a></article>',
                '<article><a href="/blog/what-good-review-discipline-actually-looks-like/">B</a></article>',
                '<article><a href="/blog/how-small-operational-habits-change-outcomes/">C</a></article>',
                "</div></section></main></body></html>",
              ].join(""),
            },
            {
              path: "/blog/reading-the-noise-before-it-spreads/index.html",
              content:
                '<!doctype html><html><head><title>Reading the noise before it spreads | Casux</title><meta name="description" content="Generic operational article." /></head><body><main><article><h1>Reading the noise before it spreads</h1><p>Generic operational article about signal reading.</p><h2>Context</h2><p>Generic content that does not mention the source domain.</p><p>More generic content that still ignores the certification platform.</p><p>Final generic content paragraph for extraction.</p></article></main></body></html>',
            },
            {
              path: "/blog/what-good-review-discipline-actually-looks-like/index.html",
              content:
                '<!doctype html><html><head><title>What good review discipline actually looks like | Casux</title><meta name="description" content="Generic review article." /></head><body><main><article><h1>What good review discipline actually looks like</h1><p>Generic review article with no CASUX topic anchor.</p><h2>Practice</h2><p>Generic content paragraph.</p><p>Generic content paragraph two.</p><p>Generic content paragraph three.</p></article></main></body></html>',
            },
            {
              path: "/blog/how-small-operational-habits-change-outcomes/index.html",
              content:
                '<!doctype html><html><head><title>How small operational habits change outcomes | Casux</title><meta name="description" content="Generic habits article." /></head><body><main><article><h1>How small operational habits change outcomes</h1><p>Generic operations article with no certification or standards domain.</p><h2>Habits</h2><p>Generic content paragraph.</p><p>Generic content paragraph two.</p><p>Generic content paragraph three.</p></article></main></body></html>',
            },
          ],
        },
      },
    });

    expect(preview.required).toBe(true);
    expect(preview.posts).toHaveLength(3);
    expect(preview.posts.map((post) => post.title).join(" ")).toMatch(/CASUX|标准|研究|认证|政策|资料/);
    expect(preview.posts[0]?.title).toContain("CASUX");
    expect(preview.posts.map((post) => post.title).join(" ")).not.toMatch(/reading the noise|review discipline|operational habits/i);
  });

  it("falls back to source-aligned blog posts when static detail pages keep CASUX in the title but drift into signal-house generic content", () => {
    const preview = buildBlogContentWorkflowPreview({
      locale: "zh-CN",
      inputState: {
        messages: [] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          sourceRequirement: "CASUX 适儿空间标准 研究报告 认证查询 政策法规 资料下载 信息平台",
        },
      } as any,
      project: {
        staticSite: {
          files: [
            {
              path: "/blog/index.html",
              content: [
                '<!doctype html><html><body><main><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list>',
                '<article><a href="/blog/casux-standards-resources/">A</a></article>',
                '<article><a href="/blog/casux-research-cases/">B</a></article>',
                '<article><a href="/blog/casux-certification-actions/">C</a></article>',
                "</div></section></main></body></html>",
              ].join(""),
            },
            {
              path: "/blog/casux-standards-resources/index.html",
              content:
                '<!doctype html><html><head><title>CASUX Standards And Resource Guide | Signal House</title><meta name="description" content="Signal House error monitoring editorial notes." /></head><body><main><article><h1>CASUX Standards And Resource Guide</h1><p>Signal House error monitoring editorial notes.</p><h2>Context</h2><p>Turn a noisy signal set into a sharp working view.</p><p>This article summarizes the most relevant material from the provided website brief without inventing unsupported organizations, identifiers, or case details.</p></article></main></body></html>',
            },
            {
              path: "/blog/casux-research-cases/index.html",
              content:
                '<!doctype html><html><head><title>CASUX Research Reports And Case Library Guide | Signal House</title></head><body><main><article><h1>CASUX Research Reports And Case Library Guide</h1><p>Operational context, signals, and clarity built for fast triage.</p><h2>Practice</h2><p>Tool workspace guidance for monitoring insight.</p><p>Generic review language that ignores the source domain.</p></article></main></body></html>',
            },
            {
              path: "/blog/casux-certification-actions/index.html",
              content:
                '<!doctype html><html><head><title>CASUX Certification Lookup And Next Actions | Signal House</title></head><body><main><article><h1>CASUX Certification Lookup And Next Actions</h1><p>The blog surface pairs concise resource cards with durable article links.</p><h2>Habits</h2><p>Monitoring insight and tool workspace language without CASUX specifics.</p><p>Signal systems prose that does not belong to the source platform.</p></article></main></body></html>',
            },
          ],
        },
      },
    });

    expect(preview.required).toBe(true);
    expect(preview.posts).toHaveLength(3);
    const combined = preview.posts.map((post) => `${post.title} ${post.excerpt} ${post.contentMd}`).join(" ");
    expect(combined).toMatch(/CASUX|标准|研究|认证|政策|资料/);
    expect(combined).not.toMatch(/Signal House|signal systems|tool workspace|error monitoring|monitoring insight/i);
  });

  it("treats an explicit /blog route as a deploy-time Blog workflow surface even before the data mount is injected", () => {
    const preview = buildBlogContentWorkflowPreview({
      locale: "zh-CN",
      inputState: {
        messages: [] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          sourceRequirement: "Bays Wong 华为 微信 HelloTalk 来画科技 云领天下 DevOps 实时音视频 AI SaaS",
        },
      } as any,
      project: {
        staticSite: {
          files: [
            {
              path: "/blog/index.html",
              content:
                '<!doctype html><html><body><main><section><h1>Blog</h1><article><a href="/blog/devops/">DevOps 组织落地</a></article></section></main></body></html>',
            },
          ],
        },
      },
    });

    expect(preview.required).toBe(true);
    expect(preview.reason).toBe("ready");
    expect(preview.navLabel).toBeTruthy();
    expect(preview.posts).toHaveLength(3);
    expect(preview.posts.map((post) => `${post.title} ${post.excerpt}`).join(" ")).toMatch(/华为|微信|AI|创业|DevOps/);
  });

  it("retries post-deploy smoke after transient remote fetch failures", async () => {
    const prevFetch = globalThis.fetch;
    const prevAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const prevToken = process.env.CLOUDFLARE_API_TOKEN;
    const prevAttempts = process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
    const prevRetryMs = process.env.DEPLOY_SMOKE_RETRY_MS;
    const prevTimeout = process.env.DEPLOY_SMOKE_TIMEOUT_MS;
    let calls = 0;

    try {
      process.env.CLOUDFLARE_ACCOUNT_ID = "account";
      process.env.CLOUDFLARE_API_TOKEN = "token";
      process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = "3";
      process.env.DEPLOY_SMOKE_RETRY_MS = "1";
      process.env.DEPLOY_SMOKE_TIMEOUT_MS = "2000";
      globalThis.fetch = (async () => {
        calls += 1;
        if (calls === 1) throw new Error("fetch failed");
        return new Response("<!doctype html><html><body>ok</body></html>", { status: 200 });
      }) as typeof fetch;

      const result = await runPostDeploySmoke("https://deploy.example.pages.dev");

      expect(result.status).toBe("passed");
      expect(result.url).toBe("https://deploy.example.pages.dev");
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = prevAccountId;
      if (prevToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = prevToken;
      if (prevAttempts === undefined) delete process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
      else process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = prevAttempts;
      if (prevRetryMs === undefined) delete process.env.DEPLOY_SMOKE_RETRY_MS;
      else process.env.DEPLOY_SMOKE_RETRY_MS = prevRetryMs;
      if (prevTimeout === undefined) delete process.env.DEPLOY_SMOKE_TIMEOUT_MS;
      else process.env.DEPLOY_SMOKE_TIMEOUT_MS = prevTimeout;
    }
  });

  it("uses the production pages.dev URL when the deployment alias is not reachable yet", async () => {
    const prevFetch = globalThis.fetch;
    const prevAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const prevToken = process.env.CLOUDFLARE_API_TOKEN;
    const prevAttempts = process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
    const prevRetryMs = process.env.DEPLOY_SMOKE_RETRY_MS;
    const calls: string[] = [];

    try {
      process.env.CLOUDFLARE_ACCOUNT_ID = "account";
      process.env.CLOUDFLARE_API_TOKEN = "token";
      process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = "1";
      process.env.DEPLOY_SMOKE_RETRY_MS = "1";
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("hash.project.pages.dev")) throw new Error("fetch failed");
        return new Response("<!doctype html><html><body>ok</body></html>", { status: 200 });
      }) as typeof fetch;

      const result = await runPostDeploySmoke("https://hash.project.pages.dev", {
        fallbackUrls: ["https://project.pages.dev"],
      });

      expect(result.status).toBe("passed");
      expect(result.url).toBe("https://project.pages.dev");
      expect(calls).toEqual(["https://hash.project.pages.dev", "https://project.pages.dev"]);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = prevAccountId;
      if (prevToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = prevToken;
      if (prevAttempts === undefined) delete process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
      else process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = prevAttempts;
      if (prevRetryMs === undefined) delete process.env.DEPLOY_SMOKE_RETRY_MS;
      else process.env.DEPLOY_SMOKE_RETRY_MS = prevRetryMs;
    }
  });

  it("runs deploy when confirmation intent is present in workflow context", async () => {
    process.env.CHAT_TASKS_USE_SUPABASE = "0";
    process.env.CLOUDFLARE_ACCOUNT_ID = "";
    process.env.CLOUDFLARE_API_TOKEN = "";

    const chatId = `deploy-chat-${Date.now()}`;
    const task = await createChatTask(chatId);
    let nextState: any;
    await SkillRuntimeExecutor.runTask({
      taskId: task.id,
      chatId,
      workerId: "test-worker",
      inputState: {
        messages: [{ role: "user", content: "deploy to cloudflare" }] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          skillId: "website-generation-workflow",
          deployRequested: true,
        } as any,
        site_artifacts: buildStaticSiteProject() as any,
      } as any,
      setSessionState: (state) => {
        nextState = state;
      },
    });

    expect(String(nextState?.deployed_url || "")).toContain(".pages.dev");
    expect(nextState?.workflow_context?.deployRequested).toBe(false);
    expect(nextState?.workflow_context?.smoke?.preDeploy?.status).toBe("passed");
    expect(nextState?.workflow_context?.smoke?.postDeploy?.status).toBe("skipped");
    const lastMessage = String(nextState?.messages?.[nextState.messages.length - 1]?.content || "");
    expect(lastMessage).toContain("Deployment successful:");
    expect(lastMessage).toContain(".pages.dev");
    expect(lastMessage).toContain("custom domain");
    expect(lastMessage).not.toContain("Domain Configuration Guide");
    expect(lastMessage).not.toContain("Custom domains");
    const completedTask = await getChatTask(task.id);
    expect(completedTask?.result?.timelineMetadata?.cardType).toBe("domain_binding_required");
    expect(completedTask?.result?.timelineMetadata?.summary).toContain("domain");
    expect(completedTask?.result?.timelineMetadata?.propagation).toContain("24 hours");
    expect(completedTask?.result?.timelineMetadata?.steps).toEqual(expect.arrayContaining([expect.stringContaining("card")]));
    expect(JSON.stringify(completedTask?.result?.timelineMetadata || {})).not.toContain("Cloudflare");
    expect(JSON.stringify(completedTask?.result?.timelineMetadata || {})).not.toContain("CLOUDFLARE");
    expect(completedTask?.result?.timelineMetadata?.analyticsStatus).toBeUndefined();
    expect(completedTask?.result?.timelineMetadata?.smoke).toBeUndefined();
    expect(completedTask?.result?.timelineMetadata?.dnsRecords).toBeUndefined();
  });

  it("materializes confirmed Blog preview posts into deployed static snapshot when D1 is unavailable", async () => {
    process.env.CHAT_TASKS_USE_SUPABASE = "0";
    process.env.CLOUDFLARE_ACCOUNT_ID = "";
    process.env.CLOUDFLARE_API_TOKEN = "";

    const chatId = `deploy-blog-static-${Date.now()}`;
    let nextState: any;
    await SkillRuntimeExecutor.runTask({
      taskId: `deploy-blog-static-task-${Date.now()}`,
      chatId,
      workerId: "test-worker",
      inputState: {
        messages: [
          {
            role: "user",
            content: "请部署这个个人 blog，文章围绕 AI 出海准备三篇。",
          },
        ] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          skillId: "website-generation-workflow",
          deployRequested: true,
          blogContentConfirmed: true,
          blogContentPreviewPosts: [
            {
              slug: "ai-global-product-lessons",
              title: "AI 出海产品的第一性原理",
              excerpt: "从用户场景、信任和增长路径拆解 AI 出海。",
              contentMd: "# AI 出海产品的第一性原理\n\nAI 出海要先验证真实用户场景，再建立可信交付。",
              category: "AI 出海",
              tags: ["AI", "出海"],
              authorName: "Shpitto",
            },
            {
              slug: "cross-border-growth-loop",
              title: "跨境增长闭环怎么搭",
              excerpt: "用内容、产品和数据闭环降低获客成本。",
              contentMd: "# 跨境增长闭环怎么搭\n\n增长不是投放模板，而是内容、产品和数据的协同。",
              category: "增长",
              tags: ["增长", "SaaS"],
              authorName: "Shpitto",
            },
            {
              slug: "ai-team-operating-system",
              title: "AI 团队的轻量化操作系统",
              excerpt: "小团队如何用 AI 工作流提升交付密度。",
              contentMd: "# AI 团队的轻量化操作系统\n\n轻量流程要服务决策、交付和复盘，而不是制造额外负担。",
              category: "团队",
              tags: ["AI", "团队"],
              authorName: "Shpitto",
            },
          ],
        } as any,
        site_artifacts: {
          projectId: "deploy-blog-static-project",
          pages: [],
          staticSite: {
            mode: "skill-direct",
            files: [
              {
                path: "/index.html",
                type: "text/html",
                content:
                  '<!doctype html><html><head><title>Home</title></head><body><header><nav><a href="/">Home</a><a href="/blog" data-i18n="nav.blog">Blog</a></nav></header><main>ok</main></body></html>',
              },
              {
                path: "/blog/index.html",
                type: "text/html",
                content:
                  '<!doctype html><html><head><title>Blog</title></head><body><main><section data-shpitto-blog-root data-shpitto-blog-api="/api/blog/posts"><div data-shpitto-blog-list></div></section></main></body></html>',
              },
            ],
          },
        } as any,
      } as any,
      setSessionState: (state) => {
        nextState = state;
      },
    });

    const files = Array.isArray(nextState?.site_artifacts?.staticSite?.files)
      ? nextState.site_artifacts.staticSite.files
      : [];
    const paths = files.map((file: any) => String(file.path || ""));
    expect(paths).toEqual(
      expect.arrayContaining([
        "/shpitto-blog-snapshot.json",
        "/api/blog/posts",
        "/sitemap.xml",
        "/blog/ai-global-product-lessons/index.html",
      ]),
    );
    const snapshot = JSON.parse(String(files.find((file: any) => file.path === "/shpitto-blog-snapshot.json")?.content || "{}"));
    expect(snapshot.postCount).toBe(3);
    expect(snapshot.posts.map((post: any) => post.title)).toContain("AI 出海产品的第一性原理");
    expect(nextState?.workflow_context?.generatedBlogContentStatus).toEqual({ status: "static:no_d1", postCount: 3 });
    const home = String(files.find((file: any) => file.path === "/index.html")?.content || "");
    expect((home.match(/href="\/blog"/g) || []).length).toBe(1);
    expect(home).not.toContain('href="/blog/"');
  });

  it("skips Web Analytics provisioning for pages.dev deployments by default", async () => {
    const prevFetch = globalThis.fetch;
    const prevAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const prevToken = process.env.CLOUDFLARE_API_TOKEN;
    const prevWaPagesDev = process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV;
    const prevSmokeAttempts = process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
    const prevSmokeRetry = process.env.DEPLOY_SMOKE_RETRY_MS;
    const calls: string[] = [];

    try {
      process.env.CHAT_TASKS_USE_SUPABASE = "0";
      process.env.CLOUDFLARE_ACCOUNT_ID = "account";
      process.env.CLOUDFLARE_API_TOKEN = "token";
      delete process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV;
      process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = "1";
      process.env.DEPLOY_SMOKE_RETRY_MS = "1";
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/pages/projects/") && url.endsWith("/upload-token")) {
          return new Response(JSON.stringify({ success: true, result: { jwt: "jwt" } }), { status: 200 });
        }
        if (url.includes("/pages/assets/upload") || url.includes("/pages/assets/upsert-hashes")) {
          return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
        }
        if (url.includes("/deployments/deploy-id")) {
          return new Response(
            JSON.stringify({
              success: true,
              result: {
                id: "deploy-id",
                url: "https://deploy.example.pages.dev",
                latest_stage: { name: "deploy", status: "success" },
                stages: [{ name: "deploy", status: "success" }],
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/deployments")) {
          return new Response(
            JSON.stringify({ success: true, result: { id: "deploy-id", url: "https://deploy.example.pages.dev" } }),
            { status: 200 },
          );
        }
        if (url.includes("/pages/projects/")) {
          return new Response(JSON.stringify({ success: true, result: { name: "deploy-project" } }), { status: 200 });
        }
        if (url.includes(".pages.dev")) {
          return new Response("<!doctype html><html><body>ok</body></html>", { status: 200 });
        }
        return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
      }) as typeof fetch;

      let nextState: any;
      await SkillRuntimeExecutor.runTask({
        taskId: `deploy-task-wa-skip-${Date.now()}`,
        chatId: `deploy-chat-wa-skip-${Date.now()}`,
        workerId: "test-worker",
        inputState: {
          messages: [{ role: "user", content: "deploy to cloudflare" }] as any,
          phase: "end",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {
            skillId: "website-generation-workflow",
            deployRequested: true,
          } as any,
          site_artifacts: buildStaticSiteProject() as any,
        } as any,
        setSessionState: (state) => {
          nextState = state;
        },
      });

      expect(String(nextState?.deployed_url || "")).toContain(".pages.dev");
      expect(nextState?.workflow_context?.analyticsStatus).toBe("pending");
      expect(calls.some((url) => url.includes("/rum/site_info"))).toBe(false);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = prevAccountId;
      if (prevToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = prevToken;
      if (prevWaPagesDev === undefined) delete process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV;
      else process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV = prevWaPagesDev;
      if (prevSmokeAttempts === undefined) delete process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
      else process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = prevSmokeAttempts;
      if (prevSmokeRetry === undefined) delete process.env.DEPLOY_SMOKE_RETRY_MS;
      else process.env.DEPLOY_SMOKE_RETRY_MS = prevSmokeRetry;
    }
  });

  it("redeploys the same chat to one stable Pages project and returns production URL", async () => {
    const prevFetch = globalThis.fetch;
    const prevAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const prevToken = process.env.CLOUDFLARE_API_TOKEN;
    const prevSmokeAttempts = process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
    const prevSmokeRetry = process.env.DEPLOY_SMOKE_RETRY_MS;
    const projectNames: string[] = [];

    try {
      process.env.CHAT_TASKS_USE_SUPABASE = "0";
      process.env.CLOUDFLARE_ACCOUNT_ID = "account";
      process.env.CLOUDFLARE_API_TOKEN = "token";
      process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = "1";
      process.env.DEPLOY_SMOKE_RETRY_MS = "1";
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        const match = url.match(/\/pages\/projects\/([^/]+)/);
        if (match?.[1]) projectNames.push(match[1]);
        if (url.includes("/pages/projects/") && url.endsWith("/upload-token")) {
          return new Response(JSON.stringify({ success: true, result: { jwt: "jwt" } }), { status: 200 });
        }
        if (url.includes("/pages/assets/upload") || url.includes("/pages/assets/upsert-hashes")) {
          return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
        }
        if (url.includes("/deployments/deploy-id")) {
          return new Response(
            JSON.stringify({
              success: true,
              result: {
                id: "deploy-id",
                url: "https://hash.should-not-be-returned.pages.dev",
                latest_stage: { name: "deploy", status: "success" },
                stages: [{ name: "deploy", status: "success" }],
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/deployments")) {
          return new Response(
            JSON.stringify({ success: true, result: { id: "deploy-id", url: "https://hash.should-not-be-returned.pages.dev" } }),
            { status: 200 },
          );
        }
        if (url.includes("/pages/projects/")) {
          return new Response(JSON.stringify({ success: true, result: { name: "stable-project" } }), { status: 200 });
        }
        if (url.includes(".pages.dev")) {
          return new Response("<!doctype html><html><body>ok</body></html>", { status: 200 });
        }
        return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
      }) as typeof fetch;

      const chatId = `stable-deploy-chat-${Date.now()}`;
      const firstProject = buildStaticSiteProject();
      const secondProject = {
        ...buildStaticSiteProject(),
        projectId: "changed-source-project",
        branding: { name: "Changed Brand" },
      };
      let firstState: any;
      let secondState: any;

      await SkillRuntimeExecutor.runTask({
        taskId: `stable-deploy-task-1-${Date.now()}`,
        chatId,
        workerId: "test-worker",
        inputState: {
          messages: [{ role: "user", content: "deploy to cloudflare" }] as any,
          phase: "end",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: { skillId: "website-generation-workflow", deployRequested: true } as any,
          site_artifacts: firstProject as any,
        } as any,
        setSessionState: (state) => {
          firstState = state;
        },
      });

      await SkillRuntimeExecutor.runTask({
        taskId: `stable-deploy-task-2-${Date.now()}`,
        chatId,
        workerId: "test-worker",
        inputState: {
          messages: [{ role: "user", content: "deploy to cloudflare" }] as any,
          phase: "end",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: { skillId: "website-generation-workflow", deployRequested: true } as any,
          site_artifacts: secondProject as any,
        } as any,
        setSessionState: (state) => {
          secondState = state;
        },
      });

      const uniqueProjects = Array.from(new Set(projectNames));
      expect(uniqueProjects).toHaveLength(1);
      expect(uniqueProjects[0]).toContain(chatId.slice(0, 28));
      expect(String(firstState?.deployed_url || "")).toBe(`https://${uniqueProjects[0]}.pages.dev`);
      expect(String(secondState?.deployed_url || "")).toBe(String(firstState?.deployed_url || ""));
      expect(String(secondState?.deployed_url || "")).not.toContain("hash.should-not-be-returned");
    } finally {
      globalThis.fetch = prevFetch;
      if (prevAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = prevAccountId;
      if (prevToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = prevToken;
      if (prevSmokeAttempts === undefined) delete process.env.DEPLOY_SMOKE_MAX_ATTEMPTS;
      else process.env.DEPLOY_SMOKE_MAX_ATTEMPTS = prevSmokeAttempts;
      if (prevSmokeRetry === undefined) delete process.env.DEPLOY_SMOKE_RETRY_MS;
      else process.env.DEPLOY_SMOKE_RETRY_MS = prevSmokeRetry;
    }
  });

  it("runs deploy for Chinese Cloudflare confirmation text", async () => {
    process.env.CHAT_TASKS_USE_SUPABASE = "0";
    process.env.CLOUDFLARE_ACCOUNT_ID = "";
    process.env.CLOUDFLARE_API_TOKEN = "";

    let nextState: any;
    await SkillRuntimeExecutor.runTask({
      taskId: `deploy-task-zh-${Date.now()}`,
      chatId: `deploy-chat-zh-${Date.now()}`,
      workerId: "test-worker",
      inputState: {
        messages: [{ role: "user", content: "部署到 Cloudflare" }] as any,
        phase: "end",
        current_page_index: 0,
        attempt_count: 0,
        workflow_context: {
          skillId: "website-generation-workflow",
        } as any,
        site_artifacts: buildStaticSiteProject() as any,
      } as any,
      setSessionState: (state) => {
        nextState = state;
      },
    });

    expect(String(nextState?.deployed_url || "")).toContain(".pages.dev");
    expect(nextState?.workflow_context?.smoke?.preDeploy?.status).toBe("passed");
    const lastMessage = String(nextState?.messages?.[nextState.messages.length - 1]?.content || "");
    expect(lastMessage).toContain("部署成功：");
  });

  it("writes latest checkpoint plus incremental step deltas during generation", async () => {
    process.env.CHAT_TASKS_USE_SUPABASE = "0";
    const prevForceLocal = process.env.SKILL_TOOL_FORCE_LOCAL;
    process.env.SKILL_TOOL_FORCE_LOCAL = "1";
    const chatId = `checkpoint-chat-${Date.now()}`;
    const taskId = `checkpoint-task-${Date.now()}`;

    try {
      await SkillRuntimeExecutor.runTask({
        taskId,
        chatId,
        workerId: "test-worker",
        inputState: {
          messages: [{ role: "user", content: "Generate a website for Northstar Robotics with Home and Contact pages" }] as any,
          phase: "conversation",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {
            skillId: "website-generation-workflow",
          } as any,
        } as any,
      });

      const taskRoot = path.resolve(process.cwd(), ".tmp", "chat-tasks", chatId, taskId);
      const latestIndex = path.join(taskRoot, "latest", "site", "index.html");
      const latestStat = await fs.stat(latestIndex);
      expect(latestStat.isFile()).toBe(true);

      const stepRoot = path.join(taskRoot, "steps");
      const stepNames = (await fs.readdir(stepRoot)).sort();
      const lastStep = path.join(stepRoot, stepNames[stepNames.length - 1]);
      const delta = JSON.parse(await fs.readFile(path.join(lastStep, "delta.json"), "utf8"));
      expect(Array.isArray(delta.changedFiles)).toBe(true);
      expect(delta.latestSiteDir).toContain(path.join(taskRoot, "latest", "site"));
    } finally {
      if (prevForceLocal === undefined) delete process.env.SKILL_TOOL_FORCE_LOCAL;
      else process.env.SKILL_TOOL_FORCE_LOCAL = prevForceLocal;
    }
  });
});
