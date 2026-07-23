import { describe, expect, it } from "vitest";
import { buildPreparedWorkspaceBundle } from "./nextjs-baseline";

describe("AI image billing template security", () => {
  it("uses the server catalog and stored orders for Stripe settlement", () => {
    const bundle = buildPreparedWorkspaceBundle({
      workspaceRoot: "D:/tmp/shpitto-billing-security-template-test",
      request: {
        skillId: "build-ai-image-tool",
        taskClass: "baseline_generation",
        projectRoot: "D:/tmp/shpitto-billing-security-template-test",
        userIntentSummary: "Launch a commercial AI image product template.",
        executionScope: "full-baseline",
        successCriteria: [],
        structuredInputs: { productName: "Commercial AI Image", industry: "AI image", targetAudience: ["creators"], primaryGoal: ["sell"], locale: "en", routes: ["/", "/pricing", "/sign-in", "/app", "/app/order"] },
        templateContext: { templateId: "ai-image-tool-starter", siteType: "ai-image-tool-site", templateFamily: "ai-image-tool-platform", foundations: [], seeds: [] },
      },
      templateManifest: { templateId: "ai-image-tool-baseline-v1", templateVersion: "v1", templateFamily: "ai-image-tool-platform", siteType: "ai-image-tool-site", templateRoutes: ["/", "/pricing", "/sign-in", "/app", "/app/order"] },
      routeContract: { requiredRoutes: ["/", "/pricing", "/sign-in", "/app", "/app/order"], optionalRoutes: [], sharedShellContract: [], routeOwnershipNotes: [] },
      selectedFoundations: { designSystemName: "AI Tool Product Foundation" },
      selectedSeeds: { selected: [] },
      deploymentTarget: { target: "vercel", staticFirst: false, framework: "nextjs-app-router" },
    });
    const file = (path: string) => bundle.workspaceFiles.find((candidate) => candidate.path === path)?.content || "";
    const checkout = file("app/api/billing/checkout/route.ts");
    const webhook = file("app/api/billing/webhook/route.ts");
    const migration = file("supabase/migrations/001_ai_image_template.sql");

    expect(checkout).toContain("const PRODUCT_CATALOG");
    expect(checkout).not.toContain("amountMinor?: number");
    expect(checkout).not.toContain("creditAmount?: number");
    expect(checkout).toContain("client_reference_id");
    expect(webhook).toContain("findChargeOrderByProviderOrderId");
    expect(webhook).toContain("order.creditAmount");
    expect(webhook).not.toContain("metadata.creditAmount");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on function redeem_template_gift_code");
  });
});
