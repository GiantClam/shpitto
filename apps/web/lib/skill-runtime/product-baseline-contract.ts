import type {
  BillingCatalogItem,
  BillingMode,
} from "../billing/billing-rule-engine.ts";
import {
  FLUXKREAFREE_SOURCE_BILLING_ENTITIES,
  getFluxKreaFreeBillingCatalog,
} from "../billing/fluxkreafree-billing-model.ts";
import type { PaymentProviderId } from "../billing/payment-provider-adapter.ts";

export type ProductRouteOwner = "product" | "brand" | "shared";

export type ProductBaselineType =
  | "ai-image-tool"
  | "ai-video-tool"
  | "ai-chat-tool"
  | "ai-audio-tool"
  | "ai-agent-tool";

export type ProductRouteKind =
  | "marketing-home"
  | "marketing-tool"
  | "prompt-generator"
  | "app-dashboard"
  | "app-workspace"
  | "history"
  | "pricing"
  | "docs"
  | "auth"
  | "redeem"
  | "billing"
  | "account"
  | "legal"
  | "shared-shell";

export type ProductBaselineRoute = {
  route: string;
  kind: ProductRouteKind;
  required: boolean;
  owner: ProductRouteOwner;
  purpose: string;
};

export type ProductBaselineTemplateNavItem = {
  title: string;
  href: string;
  external?: boolean;
  scope: ProductRouteOwner;
};

export type ProductBaselineTemplateBlueprint = {
  sourceTemplate: string;
  sourceFiles: string[];
  sharedShell: {
    providers: string[];
    rootLayoutImports: string[];
    bodyClassName: string;
    marketingNav: ProductBaselineTemplateNavItem[];
    appNav: ProductBaselineTemplateNavItem[];
    footerNav: ProductBaselineTemplateNavItem[];
    legalRoutes: string[];
    supportEmail: string;
    shellRules: string[];
  };
  designTokens: {
    sourceFiles: string[];
    cssVariables: {
      light: Record<string, string>;
      dark: Record<string, string>;
    };
    fontStacks: {
      sans: string[];
      urban: string[];
      heading: string[];
    };
    container: {
      maxWidth: string;
      padding: string;
    };
    borderRadius: {
      base: string;
      lg: string;
      md: string;
      sm: string;
    };
    typographyScale: Array<{
      name: string;
      size: string;
      lineHeight: string;
    }>;
    utilityClasses: string[];
    authSurfaceNotes: string[];
    codeSurfaceNotes: string[];
  };
};

export type ProductBaselineI18nRouteStrategy =
  | "shared-structure-with-locale-catalogs"
  | "route-prefixed"
  | "domain-mapped";

export type ProductBaselinePayloadAdminContract = {
  mode: "none" | "optional" | "required";
  globals: string[];
  collections: string[];
  localizedGlobals: string[];
  localizedCollections: string[];
  configKeys: string[];
  forbiddenDataDomains: string[];
};

export type ProductBaselineBillingProviderContract = {
  id: PaymentProviderId;
  label: string;
  role: "default" | "optional" | "planned";
  enabledByDefault: boolean;
  capabilities: string[];
  secretEnv: string[];
  publicEnv: string[];
  notes: string[];
};

export type ProductBaselineBillingRuntimeContract = {
  sourceModel: string;
  supportedBillingModes: BillingMode[];
  defaultProvider: PaymentProviderId;
  providers: ProductBaselineBillingProviderContract[];
  preservedEntities: string[];
  catalog: BillingCatalogItem[];
  rules: string[];
  payloadConfigKeys: string[];
  webhookIdempotencyKeys: string[];
};

export type ProductBaselineContract = {
  contractVersion: 1;
  baselineId: string;
  baselineType: ProductBaselineType;
  sourceTemplate?: string;
  immutable: {
    productCore: {
      primaryJob: string;
      inputModality: string[];
      outputModality: string[];
      generationFlow: string[];
    };
    appRoutes: ProductBaselineRoute[];
    requiredFeatures: string[];
    forbiddenFeatureDrift: string[];
    inputSchemaSummary: string[];
    outputSchemaSummary: string[];
    integrationContract: string[];
    authContract?: string[];
    billingContract?: string[];
    i18nContract: {
      supportedLocales?: string[];
      defaultLocale?: string;
      keyNamespaces: string[];
      immutableKeys?: string[];
      routeStrategy?: ProductBaselineI18nRouteStrategy;
      localeCatalogPaths?: string[];
    };
    envContract: string[];
    templateBlueprint?: ProductBaselineTemplateBlueprint;
    payloadAdminContract?: ProductBaselinePayloadAdminContract;
    billingRuntimeContract?: ProductBaselineBillingRuntimeContract;
  };
  mutable: {
    brand: {
      name?: string;
      category?: string;
      positioning?: string;
      tone?: string[];
    };
    visual: {
      directionId?: string;
      designSystemId?: string;
      accentStyle?: string;
    };
    websiteSurface: {
      homepageArchetype?: string;
      allowedMarketingRoutes: string[];
      allowedContentModules: string[];
    };
  };
};

export type ProductBaselineSelection = {
  baselineId: string;
  baselineType: ProductBaselineType;
  sourceTemplate?: string;
  contract: ProductBaselineContract;
  routeOwnership: Record<string, ProductRouteOwner>;
};

function normalizeRouteOwner(value: unknown): ProductRouteOwner {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "product") return "product";
  if (normalized === "shared") return "shared";
  return "brand";
}

function normalizeRouteKind(value: unknown): ProductRouteKind {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "marketing-home" ||
    normalized === "marketing-tool" ||
    normalized === "prompt-generator" ||
    normalized === "app-dashboard" ||
    normalized === "app-workspace" ||
    normalized === "history" ||
    normalized === "pricing" ||
    normalized === "docs" ||
    normalized === "auth" ||
    normalized === "redeem" ||
    normalized === "billing" ||
    normalized === "account" ||
    normalized === "legal" ||
    normalized === "shared-shell"
  ) {
    return normalized;
  }
  return "shared-shell";
}

function normalizeBaselineType(value: unknown): ProductBaselineType {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "ai-image-tool" ||
    normalized === "ai-video-tool" ||
    normalized === "ai-chat-tool" ||
    normalized === "ai-audio-tool" ||
    normalized === "ai-agent-tool"
  ) {
    return normalized;
  }
  return "ai-image-tool";
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [String(key || "").trim(), String(item || "").trim()] as const)
      .filter(([key, item]) => Boolean(key) && Boolean(item)),
  );
}

function normalizeI18nRouteStrategy(value: unknown): ProductBaselineI18nRouteStrategy {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "shared-structure-with-locale-catalogs" ||
    normalized === "route-prefixed" ||
    normalized === "domain-mapped"
  ) {
    return normalized;
  }
  return "shared-structure-with-locale-catalogs";
}

function normalizeBillingModes(value: unknown): BillingMode[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(
      (item): item is BillingMode =>
        item === "subscription" || item === "credits" || item === "hybrid",
    );
}

function normalizePayloadAdminContract(
  value: unknown,
): ProductBaselinePayloadAdminContract | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const mode = String(record.mode || "").trim().toLowerCase();
  return {
    mode: mode === "none" || mode === "required" ? mode : "optional",
    globals: normalizeStringList(record.globals),
    collections: normalizeStringList(record.collections),
    localizedGlobals: normalizeStringList(record.localizedGlobals),
    localizedCollections: normalizeStringList(record.localizedCollections),
    configKeys: normalizeStringList(record.configKeys),
    forbiddenDataDomains: normalizeStringList(record.forbiddenDataDomains),
  };
}

function normalizeBillingProviderContracts(
  value: unknown,
): ProductBaselineBillingProviderContract[] {
  if (!Array.isArray(value)) return [];
  const items: ProductBaselineBillingProviderContract[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = String(record.id || "").trim().toLowerCase() as PaymentProviderId;
    if (
      id !== "stripe" &&
      id !== "paypal" &&
      id !== "polar" &&
      id !== "alipay" &&
      id !== "wechatpay" &&
      id !== "hupijiao" &&
      id !== "custom"
    ) {
      continue;
    }
    const role = String(record.role || "").trim().toLowerCase();
    items.push({
      id,
      label: String(record.label || "").trim() || id,
      role: role === "planned" || role === "optional" ? role : "default",
      enabledByDefault: record.enabledByDefault !== false,
      capabilities: normalizeStringList(record.capabilities),
      secretEnv: normalizeStringList(record.secretEnv),
      publicEnv: normalizeStringList(record.publicEnv),
      notes: normalizeStringList(record.notes),
    });
  }
  return items;
}

function normalizeBillingCatalogItems(value: unknown): BillingCatalogItem[] {
  if (!Array.isArray(value)) return [];
  const items: BillingCatalogItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = String(record.id || "").trim();
    if (!id) continue;
    const billingMode = String(record.billingMode || "").trim().toLowerCase();
    const kind = String(record.kind || "").trim().toLowerCase();
    if (
      (billingMode !== "subscription" && billingMode !== "credits" && billingMode !== "hybrid") ||
      (kind !== "plan" && kind !== "credit-pack")
    ) {
      continue;
    }
    items.push({
      id,
      title: String(record.title || "").trim() || id,
      amountMinor: Number(record.amountMinor || 0),
      originalAmountMinor: Number(record.originalAmountMinor || 0),
      creditDelta: Number(record.creditDelta || 0),
      currency: String(record.currency || "USD").trim().toUpperCase() as "USD",
      kind,
      billingMode,
      message: String(record.message || "").trim(),
      localeTitles: normalizeStringRecord(record.localeTitles),
      providerDefaults: normalizeStringList(record.providerDefaults).filter(
        (provider): provider is PaymentProviderId =>
          provider === "stripe" ||
          provider === "paypal" ||
          provider === "polar" ||
          provider === "alipay" ||
          provider === "wechatpay" ||
          provider === "hupijiao" ||
          provider === "custom",
      ),
    });
  }
  return items;
}

function normalizeBillingRuntimeContract(
  value: unknown,
): ProductBaselineBillingRuntimeContract | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const defaultProvider = String(record.defaultProvider || "").trim().toLowerCase() as PaymentProviderId;
  return {
    sourceModel: String(record.sourceModel || "fluxkreafree").trim() || "fluxkreafree",
    supportedBillingModes: normalizeBillingModes(record.supportedBillingModes),
    defaultProvider:
      defaultProvider === "paypal" ||
      defaultProvider === "polar" ||
      defaultProvider === "alipay" ||
      defaultProvider === "wechatpay" ||
      defaultProvider === "hupijiao" ||
      defaultProvider === "custom"
        ? defaultProvider
        : "stripe",
    providers: normalizeBillingProviderContracts(record.providers),
    preservedEntities: normalizeStringList(record.preservedEntities),
    catalog: normalizeBillingCatalogItems(record.catalog),
    rules: normalizeStringList(record.rules),
    payloadConfigKeys: normalizeStringList(record.payloadConfigKeys),
    webhookIdempotencyKeys: normalizeStringList(record.webhookIdempotencyKeys),
  };
}

function normalizeTemplateNavItems(value: unknown): ProductBaselineTemplateNavItem[] {
  if (!Array.isArray(value)) return [];
  const items: ProductBaselineTemplateNavItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const title = String(record.title || "").trim();
    const href = String(record.href || "").trim();
    if (!title || !href) continue;
    items.push({
      title,
      href,
      ...(record.external === true ? { external: true } : {}),
      scope: normalizeRouteOwner(record.scope),
    });
  }
  return items;
}

function normalizeTemplateBlueprint(value: unknown): ProductBaselineTemplateBlueprint | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const sharedShell =
    record.sharedShell && typeof record.sharedShell === "object" && !Array.isArray(record.sharedShell)
      ? (record.sharedShell as Record<string, unknown>)
      : {};
  const designTokens =
    record.designTokens && typeof record.designTokens === "object" && !Array.isArray(record.designTokens)
      ? (record.designTokens as Record<string, unknown>)
      : {};
  const cssVariables =
    designTokens.cssVariables && typeof designTokens.cssVariables === "object" && !Array.isArray(designTokens.cssVariables)
      ? (designTokens.cssVariables as Record<string, unknown>)
      : {};
  const fontStacks =
    designTokens.fontStacks && typeof designTokens.fontStacks === "object" && !Array.isArray(designTokens.fontStacks)
      ? (designTokens.fontStacks as Record<string, unknown>)
      : {};
  const container =
    designTokens.container && typeof designTokens.container === "object" && !Array.isArray(designTokens.container)
      ? (designTokens.container as Record<string, unknown>)
      : {};
  const borderRadius =
    designTokens.borderRadius && typeof designTokens.borderRadius === "object" && !Array.isArray(designTokens.borderRadius)
      ? (designTokens.borderRadius as Record<string, unknown>)
      : {};

  return {
    sourceTemplate: String(record.sourceTemplate || "fluxkreafree").trim() || "fluxkreafree",
    sourceFiles: normalizeStringList(record.sourceFiles),
    sharedShell: {
      providers: normalizeStringList(sharedShell.providers),
      rootLayoutImports: normalizeStringList(sharedShell.rootLayoutImports),
      bodyClassName: String(sharedShell.bodyClassName || "").trim(),
      marketingNav: normalizeTemplateNavItems(sharedShell.marketingNav),
      appNav: normalizeTemplateNavItems(sharedShell.appNav),
      footerNav: normalizeTemplateNavItems(sharedShell.footerNav),
      legalRoutes: normalizeStringList(sharedShell.legalRoutes),
      supportEmail: String(sharedShell.supportEmail || "").trim(),
      shellRules: normalizeStringList(sharedShell.shellRules),
    },
    designTokens: {
      sourceFiles: normalizeStringList(designTokens.sourceFiles),
      cssVariables: {
        light: normalizeStringRecord(cssVariables.light),
        dark: normalizeStringRecord(cssVariables.dark),
      },
      fontStacks: {
        sans: normalizeStringList(fontStacks.sans),
        urban: normalizeStringList(fontStacks.urban),
        heading: normalizeStringList(fontStacks.heading),
      },
      container: {
        maxWidth: String(container.maxWidth || "").trim(),
        padding: String(container.padding || "").trim(),
      },
      borderRadius: {
        base: String(borderRadius.base || "").trim(),
        lg: String(borderRadius.lg || "").trim(),
        md: String(borderRadius.md || "").trim(),
        sm: String(borderRadius.sm || "").trim(),
      },
      typographyScale: Array.isArray(designTokens.typographyScale)
        ? designTokens.typographyScale
            .map((item) => {
              if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
              const scale = item as Record<string, unknown>;
              const name = String(scale.name || "").trim();
              const size = String(scale.size || "").trim();
              const lineHeight = String(scale.lineHeight || "").trim();
              if (!name || !size || !lineHeight) return undefined;
              return { name, size, lineHeight };
            })
            .filter((item): item is { name: string; size: string; lineHeight: string } => Boolean(item))
        : [],
      utilityClasses: normalizeStringList(designTokens.utilityClasses),
      authSurfaceNotes: normalizeStringList(designTokens.authSurfaceNotes),
      codeSurfaceNotes: normalizeStringList(designTokens.codeSurfaceNotes),
    },
  };
}

const AI_IMAGE_TOOL_TEMPLATE_BLUEPRINT: ProductBaselineTemplateBlueprint = {
  sourceTemplate: "fluxkreafree",
  sourceFiles: [
    ".tmp/upstream-research/fluxkreafree/app/[locale]/layout.tsx",
    ".tmp/upstream-research/fluxkreafree/components/layout/navbar.tsx",
    ".tmp/upstream-research/fluxkreafree/components/layout/dashboard-sidebar.tsx",
    ".tmp/upstream-research/fluxkreafree/components/layout/site-footer.tsx",
    ".tmp/upstream-research/fluxkreafree/config/marketing.ts",
    ".tmp/upstream-research/fluxkreafree/config/dashboard.ts",
    ".tmp/upstream-research/fluxkreafree/styles/globals.css",
    ".tmp/upstream-research/fluxkreafree/tailwind.config.ts",
    ".tmp/upstream-research/fluxkreafree/app/clerk.css",
    ".tmp/upstream-research/fluxkreafree/app/prism.css",
    ".tmp/upstream-research/fluxkreafree/assets/fonts/index.ts",
  ],
  sharedShell: {
    providers: ["ClientSessionProvider", "NextIntlClientProvider", "ThemeProvider", "QueryProvider", "Analytics", "Toaster"],
    rootLayoutImports: ["@/styles/globals.css", "../prism.css"],
    bodyClassName: "min-h-screen bg-background font-sans antialiased",
    marketingNav: [
      { title: "Generate", href: "/app/generate", scope: "product" },
      { title: "FLUX1", href: "/flux-ai", scope: "brand" },
      { title: "Krea Alternative", href: "/krea-alternative", scope: "brand" },
      { title: "Prompt Generator", href: "/flux-prompt-generator", scope: "brand" },
      { title: "Blog", href: "/blog", scope: "brand" },
      { title: "CMS", href: "/cms", scope: "product" },
    ],
    appNav: [
      { title: "Index", href: "/app", scope: "product" },
      { title: "Generate", href: "/app/generate", scope: "product" },
      { title: "History", href: "/app/history", scope: "product" },
      { title: "GiftCode", href: "/app/giftcode", scope: "product" },
      { title: "ChargeOrder", href: "/app/order", scope: "product" },
      { title: "CMS", href: "/cms", scope: "product" },
    ],
    footerNav: [
      { title: "Terms of Use", href: "/terms-of-use", scope: "shared" },
      { title: "Privacy Policy", href: "/privacy-policy", scope: "shared" },
      { title: "Krea FLUX.1", href: "https://www.krea.ai/blog/flux-krea-open-source-release", external: true, scope: "shared" },
      { title: "GitHub", href: "https://github.com/krea-ai/flux", external: true, scope: "shared" },
      { title: "Hugging Face", href: "https://huggingface.co/krea-ai", external: true, scope: "shared" },
    ],
    legalRoutes: ["/terms-of-use", "/privacy-policy"],
    supportEmail: "contact@fluxkreafree.com",
    shellRules: [
      "Marketing header must follow config/marketing.ts instead of exposing every declared route.",
      "App shell navigation must follow config/dashboard.ts and stay separate from visitor-facing marketing navigation.",
      "Footer must preserve legal routes plus external ecosystem links without leaking implementation/debug labels.",
      "Shared shell owns navbar, footer, locale/theme/provider posture, while product routes own workspace semantics.",
    ],
  },
  designTokens: {
    sourceFiles: [
      ".tmp/upstream-research/fluxkreafree/styles/globals.css",
      ".tmp/upstream-research/fluxkreafree/tailwind.config.ts",
      ".tmp/upstream-research/fluxkreafree/app/clerk.css",
      ".tmp/upstream-research/fluxkreafree/app/prism.css",
      ".tmp/upstream-research/fluxkreafree/assets/fonts/index.ts",
    ],
    cssVariables: {
      light: {
        background: "0 0% 100%",
        foreground: "0 0% 3.9%",
        card: "0 0% 100%",
        "card-foreground": "0 0% 3.9%",
        popover: "0 0% 100%",
        "popover-foreground": "0 0% 3.9%",
        primary: "0 0% 9%",
        "primary-foreground": "0 0% 98%",
        secondary: "0 0% 96.1%",
        "secondary-foreground": "0 0% 9%",
        muted: "0 0% 96.1%",
        "muted-foreground": "0 0% 45.1%",
        accent: "0 0% 96.1%",
        "accent-foreground": "0 0% 9%",
        destructive: "0 84.2% 60.2%",
        "destructive-foreground": "0 0% 98%",
        border: "0 0% 89.8%",
        input: "0 0% 89.8%",
        ring: "0 0% 3.9%",
        radius: "0.5rem",
        "surface-alpha-strong": "rgba(97,97,97,.1)",
        "stop-color": "white",
      },
      dark: {
        background: "0 0% 3.9%",
        foreground: "0 0% 98%",
        card: "0 0% 3.9%",
        "card-foreground": "0 0% 98%",
        popover: "0 0% 3.9%",
        "popover-foreground": "0 0% 98%",
        primary: "0 0% 98%",
        "primary-foreground": "0 0% 9%",
        secondary: "0 0% 14.9%",
        "secondary-foreground": "0 0% 98%",
        muted: "0 0% 14.9%",
        "muted-foreground": "0 0% 63.9%",
        accent: "0 0% 14.9%",
        "accent-foreground": "0 0% 98%",
        destructive: "0 62.8% 30.6%",
        "destructive-foreground": "0 0% 98%",
        border: "0 0% 14.9%",
        input: "0 0% 14.9%",
        ring: "0 0% 83.1%",
        "surface-alpha-strong": "hsla(0,0%,100%,.08)",
        "stop-color": "black",
      },
    },
    fontStacks: {
      sans: ["Inter", "system-ui", "sans-serif"],
      urban: ["Urbanist", "Inter", "system-ui", "sans-serif"],
      heading: ["Cal Sans", "Urbanist", "Inter", "system-ui", "sans-serif"],
    },
    container: {
      maxWidth: "72rem",
      padding: ".8rem",
    },
    borderRadius: {
      base: "0.5rem",
      lg: "var(--radius)",
      md: "calc(var(--radius) - 2px)",
      sm: "calc(var(--radius) - 4px)",
    },
    typographyScale: [
      { name: "xs", size: "0.8125rem", lineHeight: "1.5rem" },
      { name: "sm", size: "0.875rem", lineHeight: "1.5rem" },
      { name: "base", size: "1rem", lineHeight: "1.75rem" },
      { name: "lg", size: "1.125rem", lineHeight: "1.75rem" },
      { name: "xl", size: "1.25rem", lineHeight: "2rem" },
      { name: "2xl", size: "1.5rem", lineHeight: "2rem" },
      { name: "3xl", size: "1.875rem", lineHeight: "2.25rem" },
      { name: "4xl", size: "2rem", lineHeight: "2.5rem" },
      { name: "5xl", size: "3rem", lineHeight: "3.5rem" },
      { name: "6xl", size: "3.75rem", lineHeight: "1" },
    ],
    utilityClasses: ["checkerboard", "apple-tag", "bg-surface-alpha-strong", "bg-pattern", "masonry-grid", "masonry-grid-item", "text-gradient_indigo-purple"],
    authSurfaceNotes: [
      "Auth surfaces use zinc-based translucent cards, blurred modal backdrops, and minimal accent overrides from app/clerk.css.",
      "Auth chrome should stay shell-consistent and must not be rewritten as a separate marketing hero.",
    ],
    codeSurfaceNotes: [
      "Code/doc surfaces use prism.css with zinc neutrals plus blue/orange/sky token accents.",
      "Documentation/blog code styling is part of the shared visual system, not a separate theme.",
    ],
  },
};

const AI_IMAGE_TOOL_PAYLOAD_ADMIN_CONTRACT: ProductBaselinePayloadAdminContract = {
  mode: "optional",
  globals: [
    "SiteSettings",
    "SeoSettings",
    "NavigationSettings",
    "GenerationSettings",
    "BillingSettings",
  ],
  collections: [
    "Pages",
    "BlogPosts",
    "Media",
    "ModelProfiles",
    "ProviderConfigs",
    "WorkflowConfigs",
    "PromptPresets",
    "DashboardWidgets",
    "AnalyticsSnapshots",
    "PaymentProviders",
    "ChinaPaymentChannelSettings",
    "PricingPlans",
    "CreditPacks",
    "Entitlements",
    "UsageMeters",
    "BillingRules",
    "Coupons",
    "CheckoutSettings",
    "WebhookEndpointStatus",
  ],
  localizedGlobals: ["SiteSettings", "SeoSettings", "NavigationSettings"],
  localizedCollections: ["Pages", "BlogPosts", "Media", "ModelProfiles", "PromptPresets", "PricingPlans", "CreditPacks", "Entitlements"],
  configKeys: [
    "site.defaultLocale",
    "site.supportedLocales",
    "billing.defaultPaymentProvider",
    "billing.billingMode",
    "billing.defaultPlan",
    "generation.defaultModelProfile",
    "generation.enabledProviders",
  ],
  forbiddenDataDomains: [
    "raw webhook payload store",
    "immutable payment event ledger",
    "provider secrets in plaintext",
    "high-frequency usage events",
    "generation task queues",
  ],
};

const AI_IMAGE_TOOL_BILLING_RUNTIME_CONTRACT: ProductBaselineBillingRuntimeContract = {
  sourceModel: "fluxkreafree",
  supportedBillingModes: ["credits", "subscription", "hybrid"],
  defaultProvider: "stripe",
  providers: [
    {
      id: "stripe",
      label: "Stripe",
      role: "default",
      enabledByDefault: true,
      capabilities: ["one_time", "subscription", "refund", "billing_portal", "webhook_signature"],
      secretEnv: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      publicEnv: ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
      notes: ["First adapter for ai-image-tool-baseline-v1.", "Route handlers must call the adapter instead of embedding provider branching."],
    },
    {
      id: "paypal",
      label: "PayPal",
      role: "optional",
      enabledByDefault: false,
      capabilities: ["one_time", "refund", "webhook_signature"],
      secretEnv: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"],
      publicEnv: [],
      notes: ["Allowed as an adapter extension.", "May require settlement-currency normalization outside the public bundle."],
    },
    {
      id: "alipay",
      label: "Alipay",
      role: "planned",
      enabledByDefault: false,
      capabilities: ["one_time", "refund", "webhook_signature"],
      secretEnv: ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY_SECRET_REF", "ALIPAY_WEBHOOK_SECRET_REF"],
      publicEnv: [],
      notes: ["Server-only adapter.", "No client-side secrets."],
    },
    {
      id: "wechatpay",
      label: "WeChat Pay",
      role: "planned",
      enabledByDefault: false,
      capabilities: ["one_time", "refund", "webhook_signature"],
      secretEnv: ["WECHATPAY_APP_ID", "WECHATPAY_MCH_ID", "WECHATPAY_API_SECRET_REF", "WECHATPAY_CERTIFICATE_REF"],
      publicEnv: [],
      notes: ["Server-only adapter.", "Trade type selection stays in provider config metadata."],
    },
    {
      id: "hupijiao",
      label: "Hupijiao",
      role: "planned",
      enabledByDefault: false,
      capabilities: ["one_time", "webhook_signature"],
      secretEnv: ["HUPIJIAO_MERCHANT_ID", "HUPIJIAO_SECRET_REF", "HUPIJIAO_WEBHOOK_SECRET_REF"],
      publicEnv: [],
      notes: ["Prefer first-party adapter wrapper.", "Do not store raw keys in Payload."],
    },
  ],
  preservedEntities: [...FLUXKREAFREE_SOURCE_BILLING_ENTITIES],
  catalog: getFluxKreaFreeBillingCatalog(),
  rules: [
    "ChargeOrder remains the payment order root.",
    "UserCredit remains the balance root.",
    "UserCreditTransaction remains the credit application history.",
    "UserPaymentInfo remains the provider-customer profile root.",
    "Payment providers are integrated through adapters, not per-route branching.",
    "Webhook application must be idempotent before credit mutation.",
  ],
  payloadConfigKeys: [
    "BillingSettings",
    "PaymentProviders",
    "ChinaPaymentChannelSettings",
    "PricingPlans",
    "CreditPacks",
    "Entitlements",
    "BillingRules",
    "CheckoutSettings",
  ],
  webhookIdempotencyKeys: [
    "provider",
    "eventType",
    "providerEventId",
    "providerOrderId",
    "orderId",
  ],
};

export function getAiImageToolTemplateBlueprint(): ProductBaselineTemplateBlueprint {
  return AI_IMAGE_TOOL_TEMPLATE_BLUEPRINT;
}

export function buildAiImageToolBaselineContract(): ProductBaselineContract {
  return {
    contractVersion: 1,
    baselineId: "ai-image-tool-baseline-v1",
    baselineType: "ai-image-tool",
    sourceTemplate: "fluxkreafree",
    immutable: {
      productCore: {
        primaryJob: "Generate, edit, and organize AI images without changing the core creation workflow.",
        inputModality: ["text prompt", "reference image", "image history", "model controls"],
        outputModality: ["generated image", "variation set", "history entry", "shareable result"],
        generationFlow: ["prompt entry", "optional reference selection", "render request", "result review", "history replay"],
      },
      appRoutes: [
        { route: "/", kind: "marketing-home", required: true, owner: "shared", purpose: "Visitor-facing marketing and product framing." },
        { route: "/flux-ai", kind: "marketing-tool", required: false, owner: "brand", purpose: "Brand-facing product marketing page for FLUX.1." },
        { route: "/flux-schnell", kind: "marketing-tool", required: false, owner: "brand", purpose: "Brand-facing product marketing page for FLUX.1 Schnell." },
        { route: "/krea-alternative", kind: "marketing-tool", required: false, owner: "brand", purpose: "Brand-facing comparison page for Krea alternative positioning." },
        { route: "/pricing", kind: "pricing", required: true, owner: "brand", purpose: "Pricing and packaging." },
        { route: "/flux-prompt-generator", kind: "prompt-generator", required: true, owner: "brand", purpose: "Public prompt ideation and prompt-to-workspace handoff." },
        { route: "/blog", kind: "docs", required: false, owner: "brand", purpose: "Brand blog and updates." },
        { route: "/sign-in", kind: "auth", required: true, owner: "product", purpose: "Authentication entry." },
        { route: "/signin", kind: "auth", required: false, owner: "product", purpose: "Authentication entry alias." },
        { route: "/sign-up", kind: "auth", required: false, owner: "product", purpose: "Registration entry alias." },
        { route: "/cms", kind: "account", required: true, owner: "product", purpose: "User-owned task, project, and generated asset management surface." },
        { route: "/cms/tasks", kind: "account", required: true, owner: "product", purpose: "Generation task state and product task-service handoff." },
        { route: "/cms/projects", kind: "account", required: true, owner: "product", purpose: "Saved projects, prompt systems, and low-frequency project metadata." },
        { route: "/cms/assets", kind: "account", required: true, owner: "product", purpose: "Generated asset review, metadata, and publish readiness." },
        { route: "/cms/settings", kind: "account", required: true, owner: "product", purpose: "Payload-backed site, generation, billing, SEO, and provider settings." },
        { route: "/app", kind: "app-dashboard", required: true, owner: "product", purpose: "Product hub that routes users into generator, history, redemption, and billing surfaces." },
        { route: "/app/generate", kind: "app-workspace", required: true, owner: "product", purpose: "Primary image generation workspace." },
        { route: "/app/history", kind: "history", required: true, owner: "product", purpose: "Generation history and replay surface." },
        { route: "/app/giftcode", kind: "redeem", required: true, owner: "product", purpose: "Gift code and promo redemption inside the app shell." },
        { route: "/app/order", kind: "billing", required: true, owner: "product", purpose: "Charge order and credit management surface." },
        { route: "/privacy-policy", kind: "legal", required: true, owner: "shared", purpose: "Privacy notice." },
        { route: "/terms-of-use", kind: "legal", required: true, owner: "shared", purpose: "Terms of use and policy notices." },
      ],
      requiredFeatures: [
        "prompt input",
        "image generation",
        "public prompt generator",
        "image history",
        "replay",
        "task and asset management",
        "auth",
        "gift code redemption",
        "charge order management",
        "share/export",
      ],
      forbiddenFeatureDrift: [
        "replace the workspace with a brochure site",
        "remove generation history",
        "hide prompt input behind brand pages",
        "collapse /app/generate into the public homepage",
        "turn /cms into a generic site-settings placeholder",
        "move billing or gift-code actions into generic marketing content",
        "remove the public marketing route layer",
      ],
      inputSchemaSummary: [
        "text prompt is required for generation",
        "reference images are optional",
        "model controls are product-owned",
        "public prompt generator may hand off prompt text but must not replace the actual generation console",
      ],
      outputSchemaSummary: ["generated images", "variations", "history items", "share links", "credit and order state"],
      integrationContract: [
        "provider settings remain product-owned",
        "image rendering pipeline remains stable",
        "storage/history wiring remains stable",
        "prompt generator handoff should populate the generator workspace instead of replacing it",
      ],
      authContract: ["sign-in is required for workspace access", "guest browsing is allowed only on brand pages"],
      billingContract: ["pricing may be branded, but plan boundaries cannot rewrite product workflow", "credits, gift codes, and charge orders remain app-owned surfaces"],
      i18nContract: {
        supportedLocales: ["en"],
        defaultLocale: "en",
        keyNamespaces: ["product", "app", "history", "auth", "billing", "prompt-generator"],
        immutableKeys: [
          "product.workspace.title",
          "product.history.title",
          "product.billing.title",
          "product.promptGenerator.title",
          "auth.signIn.cta",
        ],
        routeStrategy: "shared-structure-with-locale-catalogs",
        localeCatalogPaths: [
          "messages/en/product.json",
          "messages/en/app.json",
          "messages/en/history.json",
          "messages/en/auth.json",
          "messages/en/billing.json",
          "messages/en/prompt-generator.json",
        ],
      },
      envContract: ["provider env vars", "storage env vars", "auth env vars", "analytics env vars"],
      templateBlueprint: getAiImageToolTemplateBlueprint(),
      payloadAdminContract: AI_IMAGE_TOOL_PAYLOAD_ADMIN_CONTRACT,
      billingRuntimeContract: AI_IMAGE_TOOL_BILLING_RUNTIME_CONTRACT,
    },
    mutable: {
      brand: {
        name: "fluxkreafree",
        category: "AI image tool",
        positioning: "Brand-safe visitor-facing framing for an image generation product.",
        tone: ["confident", "clear", "visitor-facing"],
      },
      visual: {
        directionId: "prompt-adaptive",
        designSystemId: "runtime-selected-style",
        accentStyle: "visitor-facing accent treatment only",
      },
      websiteSurface: {
        homepageArchetype: "product marketing home",
        allowedMarketingRoutes: ["/", "/pricing", "/flux-prompt-generator", "/flux-ai", "/flux-schnell", "/krea-alternative", "/blog", "/privacy-policy", "/terms-of-use"],
        allowedContentModules: ["hero", "feature", "proof", "pricing", "prompt-generator", "marketing-tool", "blog", "faq"],
      },
    },
  };
}

export function getAiImageToolBaselineTemplateBlueprint(): ProductBaselineTemplateBlueprint {
  return getAiImageToolTemplateBlueprint();
}

export function getAiImageToolBaselineRouteOwners(): Record<string, ProductRouteOwner> {
  return Object.fromEntries(
    buildAiImageToolBaselineContract().immutable.appRoutes.map((item) => [item.route, item.owner] as const),
  );
}

export function selectAiImageToolBaselineSelection(): ProductBaselineSelection {
  const contract = buildAiImageToolBaselineContract();
  return {
    baselineId: contract.baselineId,
    baselineType: contract.baselineType,
    sourceTemplate: contract.sourceTemplate,
    contract,
    routeOwnership: Object.fromEntries(contract.immutable.appRoutes.map((item) => [item.route, item.owner] as const)),
  };
}

export function normalizeProductBaselineSelection(value: unknown): ProductBaselineSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const contractRecord = record.contract && typeof record.contract === "object" && !Array.isArray(record.contract) ? (record.contract as Record<string, unknown>) : {};
  const contract = {
    ...buildAiImageToolBaselineContract(),
    baselineId: String(record.baselineId || contractRecord.baselineId || "ai-image-tool-baseline-v1").trim() || "ai-image-tool-baseline-v1",
    baselineType: normalizeBaselineType(record.baselineType || contractRecord.baselineType || "ai-image-tool"),
    sourceTemplate: String(record.sourceTemplate || contractRecord.sourceTemplate || "fluxkreafree").trim() || "fluxkreafree",
    immutable: {
      ...buildAiImageToolBaselineContract().immutable,
      productCore: {
        primaryJob:
          String(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).productCore?.primaryJob : "").trim() ||
          buildAiImageToolBaselineContract().immutable.productCore.primaryJob,
        inputModality: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).productCore?.inputModality : []),
        outputModality: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).productCore?.outputModality : []),
        generationFlow: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).productCore?.generationFlow : []),
      },
      appRoutes: Array.isArray(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).appRoutes : [])
        ? ((contractRecord.immutable as any).appRoutes as Array<Record<string, unknown>>)
            .map((item) => {
              const route = String(item.route || "").trim();
              if (!route) return undefined;
              return {
                route,
                kind: normalizeRouteKind(item.kind),
                required: item.required !== false,
                owner: normalizeRouteOwner(item.owner),
                purpose: String(item.purpose || "").trim() || "",
              };
            })
            .filter(Boolean) as any
        : buildAiImageToolBaselineContract().immutable.appRoutes,
      requiredFeatures: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).requiredFeatures : []),
      forbiddenFeatureDrift: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).forbiddenFeatureDrift : []),
      inputSchemaSummary: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).inputSchemaSummary : []),
      outputSchemaSummary: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).outputSchemaSummary : []),
      integrationContract: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).integrationContract : []),
      authContract: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).authContract : []),
      billingContract: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).billingContract : []),
      i18nContract: {
        supportedLocales: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).i18nContract?.supportedLocales : []),
        defaultLocale: String(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).i18nContract?.defaultLocale : "").trim() || "en",
        keyNamespaces: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).i18nContract?.keyNamespaces : []),
        immutableKeys: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).i18nContract?.immutableKeys : []),
        routeStrategy: normalizeI18nRouteStrategy(
          contractRecord.immutable && typeof contractRecord.immutable === "object"
            ? (contractRecord.immutable as any).i18nContract?.routeStrategy
            : undefined,
        ),
        localeCatalogPaths: normalizeStringList(
          contractRecord.immutable && typeof contractRecord.immutable === "object"
            ? (contractRecord.immutable as any).i18nContract?.localeCatalogPaths
            : [],
        ),
      },
      envContract: normalizeStringList(contractRecord.immutable && typeof contractRecord.immutable === "object" ? (contractRecord.immutable as any).envContract : []),
      templateBlueprint:
        normalizeTemplateBlueprint(
          contractRecord.immutable && typeof contractRecord.immutable === "object"
            ? (contractRecord.immutable as any).templateBlueprint
            : undefined,
        ) || buildAiImageToolBaselineContract().immutable.templateBlueprint,
      payloadAdminContract:
        normalizePayloadAdminContract(
          contractRecord.immutable && typeof contractRecord.immutable === "object"
            ? (contractRecord.immutable as any).payloadAdminContract
            : undefined,
        ) || buildAiImageToolBaselineContract().immutable.payloadAdminContract,
      billingRuntimeContract:
        normalizeBillingRuntimeContract(
          contractRecord.immutable && typeof contractRecord.immutable === "object"
            ? (contractRecord.immutable as any).billingRuntimeContract
            : undefined,
        ) || buildAiImageToolBaselineContract().immutable.billingRuntimeContract,
    },
    mutable: {
      brand: {
        name: String(contractRecord.mutable && typeof contractRecord.mutable === "object" ? (contractRecord.mutable as any).brand?.name : "").trim() || "fluxkreafree",
        category: String(contractRecord.mutable && typeof contractRecord.mutable === "object" ? (contractRecord.mutable as any).brand?.category : "").trim() || "AI image tool",
        positioning: String(contractRecord.mutable && typeof contractRecord.mutable === "object" ? (contractRecord.mutable as any).brand?.positioning : "").trim() || undefined,
        tone: normalizeStringList(contractRecord.mutable && typeof contractRecord.mutable === "object" ? (contractRecord.mutable as any).brand?.tone : []),
      },
      visual: {
        directionId: String(contractRecord.mutable && typeof contractRecord.mutable === "object" ? (contractRecord.mutable as any).visual?.directionId : "").trim() || "prompt-adaptive",
        designSystemId: String(contractRecord.mutable && typeof contractRecord.mutable === "object" ? (contractRecord.mutable as any).visual?.designSystemId : "").trim() || "runtime-selected-style",
        accentStyle: String(contractRecord.mutable && typeof contractRecord.mutable === "object" ? (contractRecord.mutable as any).visual?.accentStyle : "").trim() || undefined,
      },
      websiteSurface: {
        homepageArchetype: String(contractRecord.mutable && typeof contractRecord.mutable === "object" ? (contractRecord.mutable as any).websiteSurface?.homepageArchetype : "").trim() || "product marketing home",
        allowedMarketingRoutes: normalizeStringList(contractRecord.mutable && typeof contractRecord.mutable === "object" ? (contractRecord.mutable as any).websiteSurface?.allowedMarketingRoutes : []),
        allowedContentModules: normalizeStringList(contractRecord.mutable && typeof contractRecord.mutable === "object" ? (contractRecord.mutable as any).websiteSurface?.allowedContentModules : []),
      },
    },
  } satisfies ProductBaselineContract;
  return {
    baselineId: String(record.baselineId || contract.baselineId).trim() || contract.baselineId,
    baselineType: contract.baselineType,
    sourceTemplate: String(record.sourceTemplate || contract.sourceTemplate || "").trim() || contract.sourceTemplate,
    contract,
    routeOwnership: Array.isArray(record.routeOwnership)
      ? Object.fromEntries(
          (record.routeOwnership as Array<{ route?: string; owner?: string }>)
            .map((item) => {
              const route = String(item.route || "").trim();
              if (!route) return undefined;
              return [route, normalizeRouteOwner(item.owner)] as const;
            })
            .filter(
              (item: readonly [string, ProductRouteOwner] | undefined): item is readonly [string, ProductRouteOwner] =>
                Boolean(item),
            )
            .map((item: readonly [string, ProductRouteOwner]) => [item[0], item[1]] as [string, ProductRouteOwner]),
        )
      : Object.fromEntries(
          contract.immutable.appRoutes.map((item: ProductBaselineRoute) => [item.route, item.owner] as const),
        ),
  };
}
