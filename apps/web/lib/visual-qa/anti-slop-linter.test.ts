import { describe, expect, it } from "vitest";

import { lintGeneratedWebsiteHtml, renderAntiSlopFeedback } from "./anti-slop-linter";

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
});
