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

  it("blocks arbitrary word breaking on major heading styles", () => {
    const result = lintGeneratedWebsiteStyles(`
      .section-title, .hero h1 {
        font-size: clamp(2rem, 4vw, 4rem);
        overflow-wrap: anywhere;
      }
      @media (max-width: 720px) { .section-title { font-size: 2rem; } }
    `);

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("heading-copy-break-risk");
    expect(renderAntiSlopFeedback(result)).toContain("Remove overflow-wrap:anywhere");
  });

  it("blocks negative tracking and automatic hyphenation in generated display text", () => {
    const result = lintGeneratedWebsiteStyles(`
      .hero h1 {
        font-size: clamp(2rem, 4vw, 4rem);
        letter-spacing: -0.03em;
        hyphens: auto;
      }
    `);

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["negative-letter-spacing", "heading-hyphenation-risk"]),
    );
    expect(renderAntiSlopFeedback(result)).toContain("Set letter-spacing to 0");
    expect(renderAntiSlopFeedback(result)).toContain("Remove hyphens:auto");
  });

  it("blocks compressed hero stat grids that create narrow text columns", () => {
    const result = lintGeneratedWebsiteStyles(`
      .hero__rail {
        display: grid;
        gap: 1rem;
      }
      .stat-list {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      @media (max-width: 920px) { .stat-list { grid-template-columns: 1fr; } }
    `);

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("compressed-hero-stat-grid");
    expect(renderAntiSlopFeedback(result)).toContain("roomy horizontal cards");
  });

  it("warns when repeated raw colors bypass root tokens", () => {
    const result = lintGeneratedWebsiteStyles(`
      :root { --bg: #ffffff; --text: #10231f; --accent: #2e8b57; }
      .hero { background: #f7fbf8; color: #10231f; border-color: #d7e7dd; }
      .card { background: #ffffff; box-shadow: 0 10px 24px #d7e7dd; }
    `);

    expect(result.issues.map((issue) => issue.code)).toContain("raw-hex-outside-root");
    expect(renderAntiSlopFeedback(result)).toContain("Move repeated raw colors into :root tokens");
  });

  it("blocks bare tables that can clip on mobile", () => {
    const bare = lintGeneratedWebsiteHtml(`<!doctype html>
<html>
  <head>
    <title>Reference</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main>
      <section><h1>Reference matrix</h1><p>Teams compare ownership, endpoint behavior, and support states before rollout.</p></section>
      <section><h2>Coverage areas</h2><p>The reference keeps platform language aligned across onboarding, implementation, and maintenance.</p></section>
      <section><h2>Matrix</h2><table><tr><th>Zone</th><th>Purpose</th></tr><tr><td>Reference</td><td>Endpoint behavior and usage conventions</td></tr></table></section>
      <section><h2>Next actions</h2><p>Every row maps to concrete documentation destinations and support ownership.</p></section>
    </main>
  </body>
</html>`);
    const wrapped = lintGeneratedWebsiteHtml(`<!doctype html>
<html>
  <head>
    <title>Reference</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main>
      <section><h1>Reference matrix</h1><p>Teams compare ownership, endpoint behavior, and support states before rollout.</p></section>
      <section><h2>Coverage areas</h2><p>The reference keeps platform language aligned across onboarding, implementation, and maintenance.</p></section>
      <section><h2>Matrix</h2><div class="table-wrap"><table><tr><th>Zone</th><th>Purpose</th></tr><tr><td>Reference</td><td>Endpoint behavior and usage conventions</td></tr></table></div></section>
      <section><h2>Next actions</h2><p>Every row maps to concrete documentation destinations and support ownership.</p></section>
    </main>
  </body>
</html>`);

    expect(bare.passed).toBe(false);
    expect(bare.issues.map((issue) => issue.code)).toContain("table-responsive-risk");
    expect(renderAntiSlopFeedback(bare)).toContain("responsive table shell");
    expect(wrapped.issues.map((issue) => issue.code)).not.toContain("table-responsive-risk");
  });

  it("blocks mojibake in visible generated copy", () => {
    const result = lintGeneratedWebsiteHtml(`<!doctype html>
<html>
  <head>
    <title>Meridian API Platform</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main>
      <section><h1>Meridian API Platform</h1><p>Meridian\u9225s knowledge base keeps platform behavior clear for implementation teams.</p></section>
      <section><h2>Reference</h2><p>Stable endpoint language helps teams compare request behavior and response expectations.</p></section>
      <section><h2>Guidance</h2><p>Implementation notes connect overview material with concrete usage patterns.</p></section>
      <section><h2>Support</h2><p>Support paths keep technical reviewers aligned during integration work.</p></section>
    </main>
  </body>
</html>`);

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("mojibake-visible-copy");
  });

  it("warns on generic CTAs and overlong Open Design copy slots", () => {
    const result = lintGeneratedWebsiteHtml(`<!doctype html>
<html>
  <head>
    <title>Meridian API Platform</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main>
      <section>
        <h1>A very long generated headline about Meridian API Platform documentation reference behavior implementation support and technical team confidence</h1>
        <p class="hero-lead">Meridian gives developers a stable place to understand API concepts, endpoint behavior, implementation patterns, release expectations, operational guidance, and support ownership before committing integration work. The docs stay aligned across product teams. Reviewers keep one shared reference.</p>
        <a href="/docs">Learn More</a>
      </section>
      <section><h2>Reference</h2><p>Stable endpoint language helps teams compare request behavior and response expectations.</p></section>
      <section><h2>Guidance</h2><p>Implementation notes connect overview material with concrete usage patterns.</p></section>
      <section><h2>Support</h2><p>Support paths keep technical reviewers aligned during integration work.</p></section>
    </main>
  </body>
</html>`);

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["generic-cta-label", "overlong-headline", "overlong-lead-copy"]),
    );
    expect(renderAntiSlopFeedback(result)).toContain("Replace generic CTA labels");
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

  it("does not treat normal contact-form phrasing about a buyer's company as placeholder copy", () => {
    const result = lintGeneratedWebsiteHtml(`<!doctype html>
<html>
  <head>
    <title>Contact | Vbuy Textile</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main>
      <section><h1>Start an inquiry with the details that matter most.</h1><p>Use the form to share your company, product interest, target market, and timeline so the team can respond with a focused next step.</p></section>
      <section><h2>Channels</h2><p>Choose the contact path that fits your procurement workflow.</p></section>
      <section><h2>Inquiry form</h2><p>A short brief helps the team prepare a useful quotation or follow-up question.</p></section>
      <section><h2>Follow-up</h2><p>The response usually confirms product fit, asks for any missing detail, and outlines the next exchange.</p></section>
    </main>
  </body>
</html>`);

    expect(result.issues.map((issue) => issue.code)).not.toContain("placeholder-copy");
  });

  it("does not treat route-specific buyer copy about a client's brand as placeholder copy", () => {
    const result = lintGeneratedWebsiteHtml(`<!doctype html>
<html>
  <head>
    <title>Custom Solutions | Vbuy Textile</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main>
      <section><h1>Programs shaped around your brand, usage scenario, and delivery plan.</h1><p>For private label, hospitality, and contract buyers, the textile specification aligns with the visual standard, packaging needs, and rollout rhythm of the program.</p></section>
      <section><h2>Audience fit</h2><p>Brand teams, hospitality buyers, and distributors each need different implementation support.</p></section>
      <section><h2>Process</h2><p>A focused first conversation helps determine whether the project needs a minor adaptation or a full program build.</p></section>
      <section><h2>Next step</h2><p>Even a simple outline is enough to identify the most practical development path.</p></section>
    </main>
  </body>
</html>`);

    expect(result.issues.map((issue) => issue.code)).not.toContain("placeholder-copy");
  });

  it("warns on footer and navigation shells that add no real site content", () => {
    const result = lintGeneratedWebsiteHtml(`<!doctype html>
<html>
  <head>
    <title>Product suite</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <nav class="mobile-nav">
      <button type="button">Menu</button>
      <span>Navigation</span>
      <a href="#">Quick Links</a>
    </nav>
    <main>
      <section><h1>Operational planning platform</h1><p>The page explains how teams coordinate schedules, approvals, and execution across actual workflows. It names the decision owners, the handoff moments, and the operational constraints so the copy reads like a real product surface rather than a generic shell.</p></section>
      <section><h2>Scheduling</h2><p>Scheduling uses live capacity, explicit owner assignments, and route-specific context to make each release decision visible. The section explains what changes, who confirms it, and which downstream step begins next.</p></section>
      <section><h2>Approvals</h2><p>Approval paths stay explicit so reviewers know who can sign off and when the next action is due. The copy keeps the operational role clear instead of collapsing the section into generic navigation or shell labels.</p></section>
      <section><h2>Execution</h2><p>Execution notes stay tied to named routes and concrete responsibilities, not generic shells or empty layouts. The body copy describes the actual delivery rhythm, not a marketing summary or structural footer block.</p></section>
      <section><h2>Hand-off</h2><p>The layout also explains the follow-up state, the working review path, and how each user returns to the next decision without relying on generic quick links or filler content.</p></section>
    </main>
    <footer>
      <div>Footer</div>
      <div>Copyright</div>
    </footer>
  </body>
</html>`);

    expect(result.passed).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain("nav-scaffold-copy");
    expect(result.issues.map((issue) => issue.code)).toContain("footer-scaffold-copy");
    expect(renderAntiSlopFeedback(result)).toContain("menu/navigation shells");
  });

  it("blocks placeholder demo imagery from external URLs", () => {
    const result = lintGeneratedWebsiteHtml(`<!doctype html>
<html>
  <head>
    <title>Media page</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main>
      <section>
        <h1>Evidence review workspace</h1>
        <p>This screen shows a concrete workflow with enough content to avoid generic layout noise.</p>
        <img src="https://placehold.co/1200x800/png" alt="Workspace preview" />
      </section>
      <section><h2>Notes</h2><p>Each panel describes an actual operation path, review artifact, or decision state.</p></section>
      <section><h2>Context</h2><p>The page uses project-owned copy for the primary content and keeps the media slot clearly visible.</p></section>
      <section><h2>Flow</h2><p>The page should still read as a purposeful product surface even before runtime data loads.</p></section>
    </main>
  </body>
</html>`);

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("external-placeholder-image");
    expect(renderAntiSlopFeedback(result)).toContain("placeholder/demo image URLs");
  });

  it("blocks unsourced invented metrics but allows source-backed metric context", () => {
    const invented = lintGeneratedWebsiteHtml(`<!doctype html>
<html>
  <head>
    <title>Claims page</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main>
      <section><h1>Launch faster with 10x better growth</h1><p>Teams get 99% conversion lift and 500+ hours saved from a platform that scales effortlessly.</p></section>
      <section><h2>Outcome</h2><p>Each claim reads like a standalone marketing promise without any citation or benchmark context.</p></section>
      <section><h2>Delivery</h2><p>The page intentionally uses concrete route copy, but the numbers are still unsourced and should be removed.</p></section>
      <section><h2>Plan</h2><p>Use measurable proof only when a brief, case study, or benchmark actually supplies it.</p></section>
    </main>
  </body>
</html>`);

    expect(invented.passed).toBe(false);
    expect(invented.issues.map((issue) => issue.code)).toContain("invented-metric-claim");

    const sourced = lintGeneratedWebsiteHtml(`<!doctype html>
<html>
  <head>
    <title>Claims page</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main>
      <section><h1>Launch plan</h1><p>According to the 2025 customer benchmark, the pilot cut review time by 10x in a tightly scoped workflow.</p></section>
      <section><h2>Evidence</h2><p>The claim is grounded in a benchmarked source context, so the linter should not mark it as invented.</p></section>
      <section><h2>Scope</h2><p>The result still needs careful reading, but the metric is accompanied by explicit source language.</p></section>
      <section><h2>Next step</h2><p>Keep citing the report or brief whenever a metric appears in final copy.</p></section>
    </main>
  </body>
</html>`);

    expect(sourced.issues.map((issue) => issue.code)).not.toContain("invented-metric-claim");
  });

  it("blocks homepage semantics that read like a download or certification portal", () => {
    const result = lintGeneratedWebsiteRouteHtml(
      `<!doctype html><html><head><title>CASUX | \u8d44\u6599\u4e0b\u8f7d\u4e0e\u8ba4\u8bc1\u5165\u53e3</title></head><body><h1>\u8d44\u6599\u4e0b\u8f7d\u4e0e\u8ba4\u8bc1\u5165\u53e3</h1></body></html>`,
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
  <head><title>CASUX 妫ｆ牠銆?/title><meta name="description" content="CASUX 娑撹崵鐝幀鏄忣潔" /></head>
  <body>
    <nav><a href="/casux-certification/">CASUX 娴兼ɑ鐖ｇ拋銈堢槈</a><a href="/downloads/">鐠у嫭鏋℃稉瀣祰</a></nav>
    <main><h1>CASUX 妫ｆ牠銆?/h1><p>闂堛垹鎮滈崕璺仮閸欏銈界粚娲？瀵ら缚顔曢惃鍕垼閸戝棔缍嬬化姹団偓浣虹埡缁岃泛鐤勭捄鍏哥瑢閸楀繋缍旈崗銉ュ經閵?/p></main>
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
