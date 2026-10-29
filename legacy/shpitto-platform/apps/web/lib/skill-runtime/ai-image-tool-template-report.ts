import { buildPreparedWorkspaceBundle } from "../opencode-cli/nextjs-baseline.ts";

export type AiImageToolTemplatePerformanceReport = {
  routeCount: number;
  staticHtmlRouteCount: number;
  largestStaticHtmlBytes: number;
  largestStaticHtmlPath?: string;
  cssBytes: number;
  externalScriptReferences: number;
  imageTagCount: number;
  budgets: {
    maxStaticHtmlBytes: number;
    maxExternalScripts: number;
  };
  knownBottlenecks: Array<{
    severity: "low" | "medium" | "high";
    message: string;
  }>;
};

export type AiImageToolTemplateSecurityReport = {
  secretsRemainServerOnly: boolean;
  webhookSignatureVerification: boolean;
  paymentEventIdempotency: boolean;
  unsafeUrlFetchPaths: string[];
  htmlIngestionPaths: string[];
  blockers: string[];
};

function buildCanonicalBundle() {
  return buildPreparedWorkspaceBundle({
    workspaceRoot: "D:/tmp/shpitto-ai-image-tool-report",
    request: {
      skillId: "build-ai-image-tool",
      taskClass: "baseline_generation",
      projectRoot: "D:/tmp/shpitto-ai-image-tool-report",
      userIntentSummary: "Launch the canonical AI image template baseline.",
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
          "/pricing",
          "/flux-prompt-generator",
          "/sign-in",
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
        foundations: ["ai-tool-product-foundation"],
        seeds: ["fluxkreafree-product-template"],
      },
    },
    templateManifest: {
      templateId: "ai-image-tool-baseline-v1",
      templateVersion: "2026-06-29",
      templateFamily: "ai-image-tool-platform",
      siteType: "ai-image-tool-site",
      templateRoutes: [
        "/",
        "/pricing",
        "/flux-prompt-generator",
        "/sign-in",
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
        "/pricing",
        "/flux-prompt-generator",
        "/sign-in",
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
}

export function buildAiImageToolTemplatePerformanceReport(): AiImageToolTemplatePerformanceReport {
  const bundle = buildCanonicalBundle();
  const htmlFiles = bundle.staticSiteFiles.filter((file) => file.type === "text/html");
  const cssFile = bundle.staticSiteFiles.find((file) => file.path === "/styles.css");
  const largest = htmlFiles.reduce<{ path?: string; bytes: number }>(
    (current, file) => {
      const bytes = Buffer.byteLength(file.content, "utf8");
      return bytes > current.bytes ? { path: file.path, bytes } : current;
    },
    { bytes: 0 },
  );

  const htmlContent = htmlFiles.map((file) => file.content).join("\n");
  const externalScriptReferences = (
    htmlContent.match(/<script[^>]+src=["']https?:\/\//gi) || []
  ).length;
  const imageTagCount = (htmlContent.match(/<img\b/gi) || []).length;

  return {
    routeCount: bundle.workspaceFiles.filter((file) => file.path.startsWith("app/") && file.path.endsWith("/page.tsx")).length,
    staticHtmlRouteCount: htmlFiles.length,
    largestStaticHtmlBytes: largest.bytes,
    largestStaticHtmlPath: largest.path,
    cssBytes: Buffer.byteLength(String(cssFile?.content || ""), "utf8"),
    externalScriptReferences,
    imageTagCount,
    budgets: {
      maxStaticHtmlBytes: 32_000,
      maxExternalScripts: 0,
    },
    knownBottlenecks: [
      {
        severity: "low",
        message: "Generated baseline uses gradient placeholders instead of optimized real image components; production templates should switch to managed image delivery when assets become real.",
      },
    ],
  };
}

export function buildAiImageToolTemplateSecurityReport(): AiImageToolTemplateSecurityReport {
  const bundle = buildCanonicalBundle();
  const files = new Map(bundle.workspaceFiles.map((file) => [file.path, file.content]));
  const envExample = String(files.get(".env.example") || "");
  const webhook = String(files.get("app/api/billing/webhook/route.ts") || "");
  const billingStore = String(files.get("lib/billing-store.ts") || "");
  const clientFiles = bundle.workspaceFiles.filter((file) => file.path.endsWith(".tsx") && file.content.includes('"use client"'));
  const unsafeUrlFetchPaths = bundle.workspaceFiles
    .filter((file) => file.path.startsWith("app/") && /fetch\([^)]*\+|fetch\([^)]*request\.url/i.test(file.content))
    .map((file) => file.path);
  const htmlIngestionPaths = bundle.workspaceFiles
    .filter((file) => /dangerouslySetInnerHTML|innerHTML\s*=/.test(file.content))
    .map((file) => file.path);
  const blockers: string[] = [];
  if (/NEXT_PUBLIC_(?:STRIPE_SECRET|SUPABASE_SERVICE_ROLE|REPLICATE_API)/i.test(envExample)) blockers.push("secret-like provider values are exposed through a public env name");
  if (!webhook.includes("timingSafeEqual") || !webhook.includes("STRIPE_WEBHOOK_SECRET")) blockers.push("Stripe webhook signature verification is incomplete");
  if (!billingStore.includes("provider_event_id") || !billingStore.includes("reserveCredits") || !billingStore.includes("releaseReservation")) blockers.push("billing ledger or generation reservation contract is incomplete");
  if (clientFiles.some((file) => /STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|REPLICATE_API_TOKEN/.test(file.content))) blockers.push("a client component references a server-only secret");
  return {
    secretsRemainServerOnly: !blockers.some((item) => item.includes("secret")),
    webhookSignatureVerification: webhook.includes("timingSafeEqual") && webhook.includes("STRIPE_WEBHOOK_SECRET"),
    paymentEventIdempotency: billingStore.includes("provider_event_id") && billingStore.includes("reserveCredits"),
    unsafeUrlFetchPaths,
    htmlIngestionPaths,
    blockers,
  };
}
