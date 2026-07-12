import { describe, expect, it } from "vitest";
import { buildPreparedWorkspaceBundle } from "./nextjs-baseline";

describe("nextjs baseline workspace", () => {
  it("creates a multi-route Next.js workspace and static preview bundle", () => {
    const bundle = buildPreparedWorkspaceBundle({
      workspaceRoot: "D:/tmp/shpitto-opencode-job",
      request: {
        skillId: "build-marketing-site",
        taskClass: "baseline_generation",
        projectRoot: "D:/tmp/shpitto-opencode-job",
        userIntentSummary: "Launch a marketing site with home, pricing, and contact routes.",
        executionScope: "full-baseline",
        successCriteria: ["all required routes exist", "shared shell is preserved"],
        structuredInputs: {
          companyName: "Northstar",
          targetAudience: ["founders", "operators"],
          primaryGoal: ["launch-ready website baseline"],
          locale: "en",
          routes: ["/", "/pricing", "/contact"],
        },
        templateContext: {
          templateId: "marketing-landing-site",
          siteType: "marketing-landing-site",
          templateFamily: "marketing-launch",
          foundations: ["studio-editorial"],
          seeds: ["campaign-hero-seed"],
        },
      },
      templateManifest: {
        templateId: "marketing-landing-site",
        templateVersion: "v1",
        templateFamily: "marketing-launch",
        siteType: "marketing-landing-site",
        templateRoutes: ["/", "/pricing", "/contact"],
      },
      routeContract: {
        requiredRoutes: ["/", "/pricing", "/contact"],
        optionalRoutes: [],
        sharedShellContract: ["preserve shared nav", "preserve shared footer"],
        routeOwnershipNotes: [],
      },
      selectedFoundations: {
        designSystemName: "Studio Editorial",
      },
      selectedSeeds: {
        selected: [{ id: "campaign-hero-seed", source: "shpitto" }],
      },
      deploymentTarget: {
        target: "vercel",
        staticFirst: true,
        framework: "nextjs-app-router",
      },
    });

    const workspacePaths = bundle.workspaceFiles.map((file) => file.path);
    const staticPaths = bundle.staticSiteFiles.map((file) => file.path);

    expect(workspacePaths).toEqual(
      expect.arrayContaining([
        "package.json",
        "app/layout.tsx",
        "app/page.tsx",
        "app/pricing/page.tsx",
        "app/contact/page.tsx",
        "components/shell/site-header.tsx",
        "components/sections/landing/hero.tsx",
        "components/sections/landing/logo-cloud.tsx",
        "content/site.ts",
        "content/collections/logos.ts",
        "content/collections/plans.ts",
        ".shpitto/request.json",
      ]),
    );
    expect(staticPaths).toEqual(expect.arrayContaining(["/index.html", "/pricing/index.html", "/contact/index.html"]));
    expect(bundle.staticSiteFiles.find((file) => file.path === "/index.html")?.content).toContain("Launch-ready marketing baseline");
    expect(bundle.staticSiteFiles.find((file) => file.path === "/index.html")?.content).toContain("Clear positioning");
    expect(bundle.staticSiteFiles.find((file) => file.path === "/pricing/index.html")?.content).toContain("Choose a plan that matches how fast your team wants to ship.");
    expect((bundle.projectArtifact as any)?.staticSite?.mode).toBe("shpitto-opencode-nextjs-baseline");
  });

  it("creates a B2B-flavored baseline with content and enterprise sections", () => {
    const bundle = buildPreparedWorkspaceBundle({
      workspaceRoot: "D:/tmp/shpitto-opencode-job-b2b",
      request: {
        skillId: "build-b2b-site",
        taskClass: "baseline_generation",
        projectRoot: "D:/tmp/shpitto-opencode-job-b2b",
        userIntentSummary: "Build a B2B site with product families, proof, and inquiry routes.",
        executionScope: "full-baseline",
        successCriteria: ["all required routes exist", "shared shell is preserved"],
        structuredInputs: {
          companyName: "Meridian Supply",
          targetAudience: ["procurement teams", "distributors"],
          primaryGoal: ["lead generation"],
          locale: "en",
          routes: ["/", "/products", "/custom-solutions", "/cases", "/about", "/contact"],
        },
        templateContext: {
          templateId: "b2b-lead-gen-site",
          siteType: "corporate-b2b-site",
          templateFamily: "b2b-lead-generation",
          foundations: ["industrial-b2b-foundation"],
          seeds: ["precision-catalog-template"],
        },
      },
      templateManifest: {
        templateId: "b2b-lead-gen-site",
        templateVersion: "v1",
        templateFamily: "b2b-lead-generation",
        siteType: "corporate-b2b-site",
        templateRoutes: ["/", "/products", "/custom-solutions", "/cases", "/about", "/contact"],
      },
      routeContract: {
        requiredRoutes: ["/", "/products", "/custom-solutions", "/cases", "/about", "/contact"],
        optionalRoutes: [],
        sharedShellContract: ["preserve shared nav", "preserve shared footer"],
        routeOwnershipNotes: [],
      },
      selectedFoundations: {
        designSystemName: "Industrial B2B Foundation",
      },
      selectedSeeds: {
        selected: [{ id: "precision-catalog-template", source: "shpitto" }],
      },
      deploymentTarget: {
        target: "vercel",
        staticFirst: true,
        framework: "nextjs-app-router",
      },
    });

    const workspacePaths = bundle.workspaceFiles.map((file) => file.path);

    expect(workspacePaths).toEqual(
      expect.arrayContaining([
        "app/products/page.tsx",
        "app/custom-solutions/page.tsx",
        "app/cases/page.tsx",
        "app/about/page.tsx",
        "components/sections/enterprise/enterprise-hero.tsx",
        "components/sections/enterprise/product-family-grid.tsx",
        "components/sections/enterprise/solution-process.tsx",
        "components/sections/enterprise/cases-ledger.tsx",
        "components/sections/enterprise/company-profile-intro.tsx",
        "content/collections/product-groups.ts",
        "content/collections/trust-signals.ts",
        "content/collections/capabilities.ts",
      ]),
    );
    expect(bundle.staticSiteFiles.find((file) => file.path === "/index.html")?.content).toContain("Enterprise-ready company baseline");
    expect(bundle.staticSiteFiles.find((file) => file.path === "/products/index.html")?.content).toContain("Core Components");
    expect(bundle.staticSiteFiles.find((file) => file.path === "/custom-solutions/index.html")?.content).toContain(
      "Show how the team supports buyer-specific requirements and delivery conditions.",
    );
  });

  it("creates an AI image tool product baseline with generation and gallery routes", () => {
    const bundle = buildPreparedWorkspaceBundle({
      workspaceRoot: "D:/tmp/shpitto-opencode-ai-tool",
      request: {
        skillId: "build-ai-image-tool",
        taskClass: "baseline_generation",
        projectRoot: "D:/tmp/shpitto-opencode-ai-tool",
        userIntentSummary: "Launch an AI image tool product with generator, gallery, pricing, and FAQ routes.",
        executionScope: "full-baseline",
        successCriteria: ["all required routes exist", "shared shell is preserved"],
        structuredInputs: {
          productName: "FluxKrea Free",
          industry: "AI image generation or creative tooling",
          targetAudience: ["creators", "AI makers"],
          primaryGoal: ["launch an AI image tool baseline"],
          locale: "en",
          routes: [
            "/",
            "/flux-ai",
            "/flux-schnell",
            "/krea-alternative",
            "/pricing",
            "/flux-prompt-generator",
            "/blog",
            "/sign-in",
            "/signin",
            "/sign-up",
            "/app",
            "/app/generate",
            "/app/history",
            "/app/giftcode",
            "/app/order",
            "/privacy-policy",
            "/terms-of-use",
          ],
        },
        templateContext: {
          templateId: "ai-image-tool-starter",
          siteType: "ai-image-tool-site",
          templateFamily: "ai-image-tool-platform",
          defaultRoutes: [
            "/",
            "/flux-ai",
            "/flux-schnell",
            "/krea-alternative",
            "/pricing",
            "/flux-prompt-generator",
            "/blog",
            "/sign-in",
            "/signin",
            "/sign-up",
            "/app",
            "/app/generate",
            "/app/history",
            "/app/giftcode",
            "/app/order",
            "/privacy-policy",
            "/terms-of-use",
          ],
          foundations: ["ai-tool-product-foundation"],
          seeds: ["fluxkreafree-product-template"],
        },
      },
      templateManifest: {
        templateId: "ai-image-tool-starter",
        templateVersion: "v1",
        templateFamily: "ai-image-tool-platform",
        siteType: "ai-image-tool-site",
        templateRoutes: [
          "/",
          "/flux-ai",
          "/flux-schnell",
          "/krea-alternative",
          "/pricing",
          "/flux-prompt-generator",
          "/blog",
          "/sign-in",
          "/signin",
          "/sign-up",
          "/app",
          "/app/generate",
          "/app/history",
          "/app/giftcode",
          "/app/order",
          "/privacy-policy",
          "/terms-of-use",
        ],
      },
      routeContract: {
        requiredRoutes: [
          "/",
          "/flux-ai",
          "/flux-schnell",
          "/krea-alternative",
          "/pricing",
          "/flux-prompt-generator",
          "/blog",
          "/sign-in",
          "/signin",
          "/sign-up",
          "/app",
          "/app/generate",
          "/app/history",
          "/app/giftcode",
          "/app/order",
          "/privacy-policy",
          "/terms-of-use",
        ],
        optionalRoutes: [],
        sharedShellContract: ["preserve shared nav", "preserve shared footer"],
        routeOwnershipNotes: [],
      },
      selectedFoundations: {
        designSystemName: "AI Tool Product Foundation",
      },
      selectedSeeds: {
        selected: [{ id: "fluxkreafree-product-template", source: "shpitto" }],
      },
      deploymentTarget: {
        target: "vercel",
        staticFirst: true,
        framework: "nextjs-app-router",
      },
    });

    const workspacePaths = bundle.workspaceFiles.map((file) => file.path);
    const staticPaths = bundle.staticSiteFiles.map((file) => file.path);

    expect(workspacePaths).toEqual(
      expect.arrayContaining([
        "app/app/page.tsx",
        "app/app/generate/page.tsx",
        "app/app/history/page.tsx",
        "app/app/giftcode/page.tsx",
        "app/app/order/page.tsx",
        "app/flux-ai/page.tsx",
        "app/flux-schnell/page.tsx",
        "app/krea-alternative/page.tsx",
        "app/blog/page.tsx",
        "app/flux-prompt-generator/page.tsx",
        "app/sign-in/page.tsx",
        "app/signin/page.tsx",
        "app/sign-up/page.tsx",
        "app/privacy-policy/page.tsx",
        "app/terms-of-use/page.tsx",
        "content/pages/dashboard.ts",
        "content/pages/generate.ts",
        "content/pages/prompt-generator.ts",
        "content/pages/giftcode.ts",
        "content/pages/order.ts",
        "components/sections/ai-image-tool/app-workspace.tsx",
        "components/sections/ai-image-tool/dashboard-hub.tsx",
        "components/sections/ai-image-tool/prompt-generator-surface.tsx",
        "components/sections/ai-image-tool/history-timeline.tsx",
        "components/sections/ai-image-tool/gift-code-panel.tsx",
        "components/sections/ai-image-tool/order-panel.tsx",
        "components/sections/ai-image-tool/sign-in-gate.tsx",
        "components/sections/ai-image-tool/tool-faq-section.tsx",
        "components/sections/ai-image-tool/tool-pricing-section.tsx",
        "components/sections/ai-image-tool/schnell-intro-panel.tsx",
        "components/sections/ai-image-tool/tool-hero.tsx",
        "content/pages/app.ts",
        "content/pages/history.ts",
        "content/pages/sign-in.ts",
        "content/collections/workflow-cards.ts",
        "content/collections/examples.ts",
        "content/collections/faq.ts",
      ]),
    );
    expect(staticPaths).toEqual(
      expect.arrayContaining([
        "/index.html",
        "/flux-ai/index.html",
        "/flux-schnell/index.html",
        "/krea-alternative/index.html",
        "/pricing/index.html",
        "/flux-prompt-generator/index.html",
        "/blog/index.html",
        "/sign-in/index.html",
        "/signin/index.html",
        "/sign-up/index.html",
        "/app/index.html",
        "/app/generate/index.html",
        "/app/history/index.html",
        "/app/giftcode/index.html",
        "/app/order/index.html",
        "/privacy-policy/index.html",
        "/terms-of-use/index.html",
      ]),
    );
    expect(bundle.staticSiteFiles.find((file) => file.path === "/index.html")?.content).toContain("fluxkreafree-derived product baseline");
    expect(bundle.staticSiteFiles.find((file) => file.path === "/index.html")?.content).toContain("Krea FLUX.1");
    expect(bundle.staticSiteFiles.find((file) => file.path === "/app/index.html")?.content).toContain("Use the product hub");
    expect(bundle.staticSiteFiles.find((file) => file.path === "/app/generate/index.html")?.content).toContain("cinematic portrait of a ceramic astronaut");
    expect(bundle.staticSiteFiles.find((file) => file.path === "/app/history/index.html")?.content).toContain("Replay this run");
    expect(bundle.staticSiteFiles.find((file) => file.path === "/flux-prompt-generator/index.html")?.content).toContain("Prompt shaping");
    expect(staticPaths).not.toContain("/products/index.html");
    expect(staticPaths).not.toContain("/gallery/index.html");
    expect(bundle.projectArtifact).toMatchObject({
      templateBlueprint: {
        sourceTemplate: "fluxkreafree",
        sharedShell: {
          marketingNav: expect.arrayContaining([
            expect.objectContaining({ title: "FLUX1", href: "/flux-ai" }),
          ]),
          appNav: expect.arrayContaining([
            expect.objectContaining({ title: "Generate", href: "/app/generate" }),
          ]),
        },
      },
    });
  });

  it("documents explicit template preview auth fallback for generated workspaces", () => {
    const bundle = buildPreparedWorkspaceBundle({
      workspaceRoot: "D:/tmp/shpitto-opencode-ai-tool-preview",
      request: {
        skillId: "build-ai-image-tool",
        taskClass: "baseline_generation",
        projectRoot: "D:/tmp/shpitto-opencode-ai-tool-preview",
        userIntentSummary: "Preview the canonical AI image template baseline.",
        executionScope: "full-baseline",
        successCriteria: ["preview login remains available under next start"],
        structuredInputs: {
          productName: "FluxKrea Free",
          industry: "AI image generation or creative tooling",
          targetAudience: ["creators"],
          primaryGoal: ["launch an AI image tool baseline"],
          locale: "en",
          routes: ["/", "/sign-in", "/app"],
        },
        templateContext: {
          templateId: "ai-image-tool-starter",
          siteType: "ai-image-tool-site",
          templateFamily: "ai-image-tool-platform",
          foundations: ["ai-tool-product-foundation"],
          seeds: ["fluxkreafree-product-template"],
        },
      },
      templateManifest: {
        templateId: "ai-image-tool-starter",
        templateVersion: "v1",
        templateFamily: "ai-image-tool-platform",
        siteType: "ai-image-tool-site",
        templateRoutes: ["/", "/sign-in", "/app"],
      },
      routeContract: {
        requiredRoutes: ["/", "/sign-in", "/app"],
        optionalRoutes: [],
        sharedShellContract: ["preserve shared nav", "preserve shared footer"],
        routeOwnershipNotes: [],
      },
      selectedFoundations: {
        designSystemName: "AI Tool Product Foundation",
      },
      selectedSeeds: {
        selected: [{ id: "fluxkreafree-product-template", source: "shpitto" }],
      },
      deploymentTarget: {
        target: "vercel",
        staticFirst: true,
        framework: "nextjs-app-router",
      },
    });

    const authFile = bundle.workspaceFiles.find((file) => file.path === "lib/auth.ts");
    const readmeFile = bundle.workspaceFiles.find((file) => file.path === "README.md");

    expect(authFile?.content).toContain("process.env.SHPITTO_TEMPLATE_PREVIEW === 'true'");
    expect(readmeFile?.content).toContain("SHPITTO_TEMPLATE_PREVIEW=1 NEXTAUTH_URL=http://127.0.0.1:4173 pnpm start --hostname 127.0.0.1 --port 4173");
  });
});
