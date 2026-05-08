import { describe, expect, it } from "vitest";

import {
  lintGeneratedWebsiteHtml,
  lintGeneratedWebsiteRouteHtml,
  lintGeneratedWebsiteStyles,
  renderAntiSlopFeedback,
} from "./anti-slop-linter";

describe("anti-slop-linter", () => {
  it("flags placeholders and missing responsive viewport", () => {
    const result = lintGeneratedWebsiteHtml(`<!doctype html><html><body><h1>Your Company</h1></body></html>`);

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("missing-viewport");
    expect(result.issues.map((issue) => issue.code)).toContain("placeholder-copy");
  });

  it("passes a responsive page with concrete content and visual anchors", () => {
    const result = lintGeneratedWebsiteHtml(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { --ink: #101214; --paper: #f9f4ea; --accent: #d94f28; --muted: #746b5f; }
      body { font-family: "Fraunces", "IBM Plex Sans", sans-serif; background: linear-gradient(120deg, var(--paper), #efe0c4); }
      h1 { font-size: clamp(44px, 8vw, 92px); }
      @media (max-width: 720px) { section { padding: 32px 18px; } }
    </style>
  </head>
  <body>
    <main>
      <section><svg aria-hidden="true"></svg><h1>Precision supply chain orchestration for regional manufacturers</h1><p>Production planners get a live command layer that connects forecast changes, supplier constraints, and floor capacity in one operating rhythm.</p></section>
      <section><h2>Capacity Intelligence</h2><p>Each line, work cell, and supplier lane is modeled as a capacity surface so teams can see bottlenecks before purchase orders drift.</p></section>
      <section><h2>Supplier Recovery</h2><p>Recovery playbooks expose substitute components, expedite paths, and approval owners without forcing teams into spreadsheet archaeology.</p></section>
      <section><h2>Executive Traceability</h2><p>Leadership gets weekly risk narratives, not raw exception dumps, with the exact commercial exposure attached to each operational decision. Finance, operations, and commercial owners can trace every red flag back to the underlying supplier lane, affected orders, contractual exposure, and recommended recovery move.</p></section>
      <section><h2>Implementation Rhythm</h2><p>The rollout starts with two high-volatility product families, then expands by supplier lane once the team has validated alert quality, planning cadence, escalation ownership, and measurable reductions in manual expediting. Every module is configured around the customer's operating language rather than generic software labels.</p></section>
    </main>
  </body>
</html>`);

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(84);
    expect(renderAntiSlopFeedback(result)).toBe("");
  });

  it("does not require linked-stylesheet pages to duplicate responsive CSS inline", () => {
    const result = lintGeneratedWebsiteHtml(`<!doctype html>
<html>
  <head>
    <title>Home</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main>
      <section><svg aria-hidden="true"></svg><h1>Home</h1><p>A complete homepage can rely on the shared stylesheet for responsive layout rules while keeping route HTML focused on document structure and content.</p></section>
      <section><h2>Overview</h2><p>The route includes enough specific body copy and a visual anchor to avoid being treated as an empty shell during HTML validation.</p></section>
      <section><h2>Proof</h2><p>Shared CSS is validated separately, so this document should not fail just because it does not inline media queries or clamp rules.</p></section>
      <section><h2>Next step</h2><p>The page still exposes meaningful content, navigation hooks, and semantic structure that the generated website can render across devices.</p></section>
    </main>
  </body>
</html>`);

    expect(result.issues.map((issue) => issue.code)).not.toContain("weak-responsive-css");
    expect(result.issues.map((issue) => issue.code)).not.toContain("flat-visual-system");
  });

  it("does not treat implementation class names as placeholder copy", () => {
    const result = lintGeneratedWebsiteHtml(`<!doctype html>
<html>
  <head>
    <title>Directory</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main>
      <section><h1>Certification directory</h1><p>Teams can search real entries, compare status, and open the next action from one focused directory page.</p></section>
      <section class="chart-placeholder"><h2>Status overview</h2><p>The class name describes a chart region, while the visible copy remains specific and production-ready.</p></section>
      <section><h2>Result rows</h2><p>Readable rows keep criteria, status, owner, and next action visible without compressing the listing.</p></section>
      <section><h2>Application path</h2><p>Applicants can move from lookup to guidance after confirming the relevant result state.</p></section>
    </main>
  </body>
</html>`);

    expect(result.issues.map((issue) => issue.code)).not.toContain("placeholder-copy");
  });

  it("blocks homepage semantics that read like a download or certification portal", () => {
    const result = lintGeneratedWebsiteRouteHtml(
      `<!doctype html><html><head><title>CASUX | 资料下载与认证入口</title></head><body><h1>沉淀标准、研究与实践资料的统一入口</h1></body></html>`,
      { route: "/" },
    );

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("root-route-semantic-mismatch");
    expect(renderAntiSlopFeedback(result)).toContain("Rewrite route /");
  });

  it("allows downstream labels in homepage navigation without treating them as the homepage semantic role", () => {
    const result = lintGeneratedWebsiteRouteHtml(
      `<!doctype html>
<html>
  <head><title>CASUX 首页</title><meta name="description" content="CASUX 主站总览" /></head>
  <body>
    <nav><a href="/casux-certification/">CASUX 优标认证</a><a href="/downloads/">资料下载</a></nav>
    <main><h1>CASUX 首页</h1><p>面向儿童友好空间建设的标准体系、研究实践与协作入口。</p></main>
  </body>
</html>`,
      { route: "/" },
    );

    expect(result.issues.map((issue) => issue.code)).not.toContain("root-route-semantic-mismatch");
  });

  it("blocks hero rails that are tall but empty and dense result lists without full-width spans", () => {
    const visualResult = lintGeneratedWebsiteStyles(`
.page-visual { min-height: 520px; }
.visual-card--main { min-height: 330px; align-content: end; }
`);
    expect(visualResult.passed).toBe(false);
    expect(visualResult.issues.map((issue) => issue.code)).toContain("empty-hero-visual-rail");

    const gridResult = lintGeneratedWebsiteStyles(`
.card-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 18px; }
.search-result { padding: 16px; }
`);
    expect(gridResult.passed).toBe(false);
    expect(gridResult.issues.map((issue) => issue.code)).toContain("search-result-width-mismatch");
  });
});
