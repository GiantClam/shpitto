import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import {
  normalizeGeneratedProjectArtifactPreviewForTesting,
  resolveRuntimeTaskExecutionModeForTesting,
} from "./executor";
import { buildLocalDecisionPlan } from "./decision-layer";

describe("executor task mode routing", () => {
  it("routes explicit translation tasks to the translation lane", () => {
    expect(
      resolveRuntimeTaskExecutionModeForTesting({
        workflow_context: {
          executionMode: "translate",
          translateRequested: true,
        },
        messages: [new HumanMessage("Generate locale catalogs for French and Japanese.")],
      } as any),
    ).toBe("translate");
  });

  it("keeps refine requests on the refine lane", () => {
    expect(
      resolveRuntimeTaskExecutionModeForTesting({
        workflow_context: {
          executionMode: "refine",
          refineRequested: true,
        },
        messages: [new HumanMessage("Tighten the hero spacing and change the CTA copy.")],
      } as any),
    ).toBe("refine");
  });

  it("routes explicit blog-detail-fill actions to the refine lane", () => {
    expect(
      resolveRuntimeTaskExecutionModeForTesting({
        workflow_context: {
          executionMode: "refine",
          refineRequested: true,
          skillActionDomain: "blog_detail",
          skillAction: "fill_details",
          refineSkillId: "blog-detail-fill-workflow",
        },
        messages: [new HumanMessage("Fill the missing blog detail pages now and align the slugs.")],
      } as any),
    ).toBe("refine");
  });

  it("gives deploy confirmation precedence when deploy is requested", () => {
    expect(
      resolveRuntimeTaskExecutionModeForTesting({
        workflow_context: {
          executionMode: "translate",
          translateRequested: true,
          deployRequested: true,
        },
        messages: [new HumanMessage("Deploy now")],
      } as any),
    ).toBe("deploy");
  });

  it("preserves enterprise surface-mode validation during refine preview normalization", () => {
    const requirementText = "Replace the placeholder hero visual with a real enterprise image.";
    const decision = buildLocalDecisionPlan({
      workflow_context: {
        executionMode: "refine",
        refineRequested: true,
        websiteSurfaceMode: "corporate-b2b-site",
      },
      messages: [new HumanMessage(requirementText)],
    } as any);

    expect(() =>
      normalizeGeneratedProjectArtifactPreviewForTesting({
        decision,
        requirementText,
        workflowContext: {
          executionMode: "refine",
          refineRequested: true,
          websiteSurfaceMode: "corporate-b2b-site",
        },
        project: {
          projectId: "enterprise-refine-preview",
          staticSite: {
            mode: "skill-direct",
            files: [
              {
                path: "/index.html",
                type: "text/html",
                content: [
                  "<!doctype html>",
                  '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Build Home</title><link rel="stylesheet" href="/styles.css"></head><body>',
                  '  <main>',
                  '    <section class="hero"><div class="hero__grid"><div class="hero__content"><h1>Build Home for enterprise buyers</h1><p>Home route for enterprise sourcing teams evaluating precision-component suppliers with real proof, specifications, and consultation paths.</p></div><div class="media-frame"><div class="ph-img" role="img" aria-label="Placeholder visual"></div></div></div></section>',
                  '    <section><h2>Capabilities</h2><p>Review dimensional fit, supply readiness, and manufacturing consistency for demanding programs.</p></section>',
                  '    <section><h2>Evidence</h2><p>Inspect product evidence, application context, and route-specific proof before making contact.</p></section>',
                  '    <section><h2>Consultation</h2><p>Share the use case, timeline, and specification needs to start a buyer-ready discussion.</p></section>',
                  '  </main>',
                  '  <script src="/script.js" defer></script>',
                  "</body></html>",
                ].join(""),
              },
              {
                path: "/styles.css",
                type: "text/css",
                content: ".media-frame{border:1px solid #ddd}.ph-img{min-height:280px;background:#eee}",
              },
              {
                path: "/script.js",
                type: "text/javascript",
                content: "document.documentElement.dataset.ready='true';",
              },
            ],
          },
        },
      }),
    ).toThrow(/corporate-b2b homepage contract|placeholder media scaffolding|enterprise-hero markup/i);
  });
});
