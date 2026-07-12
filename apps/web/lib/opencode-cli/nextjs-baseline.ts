import fs from "node:fs/promises";
import path from "node:path";
import type {
  ShpittoDeploymentTargetDocument,
  ShpittoOpenCodeRequest,
  ShpittoRouteContractDocument,
  ShpittoSelectedFoundationsDocument,
  ShpittoSelectedSeedsDocument,
  ShpittoTemplateManifest,
} from "./website-contract.ts";
import {
  getAiImageToolTemplateBlueprint,
  type ProductBaselineTemplateBlueprint,
  type ProductBaselineTemplateNavItem,
} from "../skill-runtime/product-baseline-contract.ts";

export type PreparedWorkspaceFile = {
  path: string;
  content: string;
};

export type PreparedStaticSiteFile = {
  path: string;
  type: string;
  content: string;
};

export type PreparedWorkspaceBundle = {
  workspaceFiles: PreparedWorkspaceFile[];
  staticSiteFiles: PreparedStaticSiteFile[];
  projectArtifact: Record<string, unknown>;
};

type BaselineFamily = "marketing-launch" | "b2b-lead-generation" | "ai-image-tool-platform" | "generic";

function normalizeRoute(route: string): string {
  const trimmed = String(route || "/").trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function routeSegments(route: string): string[] {
  const normalized = normalizeRoute(route);
  if (normalized === "/") return [];
  return normalized.replace(/^\/+/, "").split("/").filter(Boolean);
}

function routeLabel(route: string, templateFamily?: string): string {
  const normalized = normalizeRoute(route);
  if (templateFamily === "ai-image-tool-platform") {
    if (normalized === "/") return "Home";
    if (normalized === "/pricing") return "Pricing";
    if (normalized === "/flux-prompt-generator") return "Prompt Generator";
    if (normalized === "/sign-in" || normalized === "/signin" || normalized === "/login") return "Sign in";
    if (normalized === "/app") return "Index";
    if (normalized === "/app/generate" || normalized === "/generate") return "Generate";
    if (normalized === "/app/history" || normalized === "/history" || normalized === "/gallery") return "History";
    if (normalized === "/app/giftcode") return "GiftCode";
    if (normalized === "/app/order") return "ChargeOrder";
    if (normalized === "/privacy-policy") return "Privacy Policy";
    if (normalized === "/terms-of-use") return "Terms of Use";
  }
  if (normalized === "/") return "Home";
  return normalized
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) =>
      segment
        .split(/[-_]+/g)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
    )
    .join(" / ");
}

function routeLead(route: string, request: ShpittoOpenCodeRequest): string {
  const label = routeLabel(route, request.templateContext.templateFamily);
  const company = request.structuredInputs.companyName || request.structuredInputs.productName || "Your team";
  if (route === "/") {
    return `${company} ships a launch-ready website baseline with reusable sections, clear navigation, and deployable code ownership from day one.`;
  }
  if (request.templateContext.templateFamily === "ai-image-tool-platform" && route === "/app") {
    return "Use this product hub to move between the generator, history, gift code redemption, and charge order management without collapsing the app into marketing copy.";
  }
  if (request.templateContext.templateFamily === "ai-image-tool-platform" && (route === "/app/generate" || route === "/generate")) {
    return "Use this generator workspace to enter prompts, tune model controls, review results, and keep generation history tied to the product shell.";
  }
  if (request.templateContext.templateFamily === "ai-image-tool-platform" && route === "/app/history") {
    return "Review prior generations, replay prompts, and move outputs into the next workflow step without leaving the product surface.";
  }
  if (request.templateContext.templateFamily === "ai-image-tool-platform" && route === "/flux-prompt-generator") {
    return "Use the public prompt generator to turn rough ideas into production-ready FLUX prompts before handing them into the real workspace.";
  }
  if (request.templateContext.templateFamily === "ai-image-tool-platform" && route === "/app/giftcode") {
    return "Redeem promotional credits inside the app shell so billing and access mechanics stay product-owned.";
  }
  if (request.templateContext.templateFamily === "ai-image-tool-platform" && route === "/app/order") {
    return "Review credits, purchase state, and charge orders inside the app shell instead of pushing those tasks into marketing pages.";
  }
  if (request.templateContext.templateFamily === "ai-image-tool-platform" && route === "/cms") {
    return "Manage user-owned tasks, saved projects, generated assets, and low-frequency operational settings from a dedicated product route.";
  }
  if (request.templateContext.templateFamily === "ai-image-tool-platform" && route === "/sign-in") {
    return "Sign-in gates the workspace while visitor-facing pages stay open for discovery, pricing, and product context.";
  }
  return `${label} is prepared as a first-pass route in the ${request.templateContext.templateFamily} baseline so the website ships with more than a homepage demo.`;
}

function routeHtmlPath(route: string): string {
  const normalized = normalizeRoute(route);
  if (normalized === "/") return "/index.html";
  return `${normalized}/index.html`;
}

function routePreviewHref(fromRoute: string, toRoute: string): string {
  const fromDir = routeSegments(fromRoute).join("/") || ".";
  const targetPath = routeHtmlPath(toRoute).replace(/^\/+/, "");
  return path.posix.relative(fromDir, targetPath) || "index.html";
}

function previewLinkHref(fromRoute: string, href: string): string {
  const normalized = String(href || "").trim();
  if (!normalized) return normalized;
  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return routePreviewHref(fromRoute, normalized);
  }
  return normalized;
}

function routeAppPagePath(route: string): string {
  const segments = routeSegments(route);
  return segments.length === 0 ? "app/page.tsx" : path.posix.join("app", ...segments, "page.tsx");
}

function templateNavItemsForRoute(
  templateFamily: BaselineFamily | undefined,
  currentRoute: string | undefined,
): ProductBaselineTemplateNavItem[] {
  if (templateFamily !== "ai-image-tool-platform") return [];
  const blueprint = getAiImageToolTemplateBlueprint();
  const normalizedCurrent = normalizeRoute(currentRoute || "/");
  return normalizedCurrent === "/app" || normalizedCurrent.startsWith("/app/")
    ? blueprint.sharedShell.appNav
    : blueprint.sharedShell.marketingNav;
}

function buildNavItems(
  routes: string[],
  templateFamily?: string,
  currentRoute?: string,
): Array<{ route: string; label: string; href: string; external?: boolean }> {
  if (templateFamily === "ai-image-tool-platform") {
    const routeSet = new Set(routes.map((route) => normalizeRoute(route)));
    return templateNavItemsForRoute(templateFamily, currentRoute)
      .filter((item) => item.external || routeSet.has(normalizeRoute(item.href)))
      .map((item) => ({
        route: item.external ? item.href : normalizeRoute(item.href),
        href: item.href,
        label: item.title,
        external: item.external,
      }));
  }
  return routes.map((route) => ({ route: normalizeRoute(route), href: normalizeRoute(route), label: routeLabel(route, templateFamily) }));
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildConstExport(name: string, value: unknown): string {
  return `export const ${name} = ${JSON.stringify(value, null, 2)} as const;\n`;
}

function buildPackageJson(): string {
  return serializeJson({
    name: "shpitto-opencode-site",
    private: true,
    version: "0.1.0",
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "next lint",
    },
    dependencies: {
      next: "16.2.4",
      "next-auth": "^4.24.7",
      react: "18.2.0",
      "react-dom": "18.2.0",
    },
    devDependencies: {
      typescript: "^5.9.3",
      "@types/node": "^20.19.0",
      "@types/react": "^18.3.23",
      "@types/react-dom": "^18.3.7",
    },
  });
}

function escapeForTs(value: string): string {
  return String(value || "").replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}

function resolveBaselineFamily(request: ShpittoOpenCodeRequest): BaselineFamily {
  const family = String(request.templateContext.templateFamily || "").trim().toLowerCase();
  if (family === "ai-image-tool-platform") return "ai-image-tool-platform";
  if (family === "marketing-launch") return "marketing-launch";
  if (family === "b2b-lead-generation") return "b2b-lead-generation";
  return "generic";
}

function buildContentSiteTs(request: ShpittoOpenCodeRequest): string {
  const company = escapeForTs(request.structuredInputs.companyName || request.structuredInputs.productName || "Shpitto Baseline");
  const audience = request.structuredInputs.targetAudience.map((item) => `'${escapeForTs(item)}'`).join(", ");
  const goals = request.structuredInputs.primaryGoal.map((item) => `'${escapeForTs(item)}'`).join(", ");
  return [
    "export const site = {",
    `  name: '${company}',`,
    `  locale: '${escapeForTs(request.structuredInputs.locale || "en")}',`,
    "  supportedLocales: ['en', 'fr'],",
    "  defaultLocale: 'en',",
    `  industry: '${escapeForTs(request.structuredInputs.industry || "software, services, or product marketing")}',`,
    `  audience: [${audience}],`,
    `  primaryGoal: [${goals}],`,
    "} as const;",
    "",
  ].join("\n");
}

function buildLibI18nTs(): string {
  return [
    'import { cookies } from "next/headers";',
    'import { site } from "../content/site";',
    "",
    "export const LOCALE_COOKIE_NAME = 'shpitto-locale';",
    "",
    "export type TemplateLocale = typeof site.supportedLocales[number];",
    "",
    "const dictionaries = {",
    "  en: {",
    "    cms: 'CMS',",
    "    signIn: 'Sign in',",
    "    aiImageTemplate: 'AI image template',",
    "    footerPreparedBy: 'baseline prepared by Shpitto.',",
    "    authGoogleReady: 'Original FluxKrea-style auth is active. Use Google sign-in to enter the workspace.',",
    "    authPreviewFallback: 'Google keys are not configured, so the local preview falls back to a development-only sign-in.',",
    "    authUnconfigured: 'No runtime auth provider is available yet. Configure Google OAuth for production use.',",
    "    authGoogleHint: 'This template uses the original Google-based sign-in flow when OAuth credentials are configured.',",
    "    authContinueWithGoogle: 'Continue with Google',",
    "    authPreviewHint: 'Preview fallback only. Any email plus a password of at least 6 characters will open the local template workspace when Google OAuth is not configured.',",
    "    authPreviewSubmit: 'Open preview workspace',",
    "    authSigningIn: 'Signing in...',",
    "    authBackHome: 'Back to homepage',",
    "    authMisconfigured: 'Authentication is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for the original sign-in flow, or enable local preview credentials in development only.',",
    "  },",
    "  fr: {",
    "    cms: 'CMS',",
    "    signIn: 'Connexion',",
    "    aiImageTemplate: 'Modele image IA',",
    "    footerPreparedBy: 'base preparee par Shpitto.',",
    "    authGoogleReady: 'L auth FluxKrea d origine est active. Utilisez Google pour entrer dans l espace de travail.',",
    "    authPreviewFallback: 'Les cles Google ne sont pas configurees, donc l apercu local utilise une connexion reservee au developpement.',",
    "    authUnconfigured: 'Aucun fournisseur d authentification n est configure. Ajoutez Google OAuth pour un usage de production.',",
    "    authGoogleHint: 'Ce modele utilise le flux de connexion Google d origine lorsque les identifiants OAuth sont configures.',",
    "    authContinueWithGoogle: 'Continuer avec Google',",
    "    authPreviewHint: 'Apercu uniquement. Une adresse email et un mot de passe d au moins 6 caracteres ouvrent l espace local quand Google OAuth n est pas configure.',",
    "    authPreviewSubmit: 'Ouvrir l apercu',",
    "    authSigningIn: 'Connexion en cours...',",
    "    authBackHome: 'Retour a l accueil',",
    "    authMisconfigured: 'L authentification n est pas configuree. Ajoutez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET pour le flux d origine, ou activez le mode apercu en developpement uniquement.',",
    "  },",
    "} as const;",
    "",
    "export type TemplateDictionary = (typeof dictionaries)[TemplateLocale];",
    "",
    "export function isSupportedLocale(value: string): value is TemplateLocale {",
    "  return (site.supportedLocales as readonly string[]).includes(value);",
    "}",
    "",
    "export async function getCurrentLocale(): Promise<TemplateLocale> {",
    "  const store = await cookies();",
    "  const cookieLocale = store.get(LOCALE_COOKIE_NAME)?.value;",
    "  if (cookieLocale && isSupportedLocale(cookieLocale)) return cookieLocale;",
    "  return site.defaultLocale;",
    "}",
    "",
    "export async function getDictionary(locale?: TemplateLocale): Promise<TemplateDictionary> {",
    "  const resolved = locale || (await getCurrentLocale());",
    "  return dictionaries[resolved];",
    "}",
    "",
    "export async function setCurrentLocale(locale: string) {",
    "  if (!isSupportedLocale(locale)) return false;",
    "  const store = await cookies();",
    "  store.set(LOCALE_COOKIE_NAME, locale, { path: '/', sameSite: 'lax' });",
    "  return true;",
    "}",
    "",
    "export function createLocalizedValue<T>(en: T, fr: T) {",
    "  return { en, fr } as const;",
    "}",
    "",
    "export function resolveLocalizedValue<T>(value: T | { en: T; fr: T }, locale: TemplateLocale): T {",
    "  if (value && typeof value === 'object' && 'en' in (value as Record<string, unknown>) && 'fr' in (value as Record<string, unknown>)) {",
    "    return (value as { en: T; fr: T })[locale];",
    "  }",
    "  return value as T;",
    "}",
    "",
  ].join("\n");
}

function buildContentNavigationTs(
  _navItems: Array<{ route: string; label: string }>,
  _appNavItems?: Array<{ route: string; label: string }>,
): string {
  const blueprint = getAiImageToolTemplateBlueprint();
  const marketingEntries = blueprint.sharedShell.marketingNav
    .map((item) => `  { href: '${escapeForTs(item.href)}', title: '${escapeForTs(item.title)}', external: ${item.external === true ? "true" : "false"}, scope: '${escapeForTs(item.scope)}' },`)
    .join("\n");
  const appEntries = blueprint.sharedShell.appNav
    .map((item) => `  { href: '${escapeForTs(item.href)}', title: '${escapeForTs(item.title)}', external: ${item.external === true ? "true" : "false"}, scope: '${escapeForTs(item.scope)}' },`)
    .join("\n");
  const footerEntries = blueprint.sharedShell.footerNav
    .map((item) => `  { href: '${escapeForTs(item.href)}', title: '${escapeForTs(item.title)}', external: ${item.external === true ? "true" : "false"}, scope: '${escapeForTs(item.scope)}' },`)
    .join("\n");
  const ownershipEntries = [
    ...blueprint.sharedShell.marketingNav,
    ...blueprint.sharedShell.appNav,
    ...blueprint.sharedShell.footerNav,
  ]
    .filter((item, index, array) => array.findIndex((candidate) => candidate.href === item.href) === index)
    .map((item) => `  '${escapeForTs(item.href)}': '${escapeForTs(item.scope)}',`)
    .join("\n");
  return [
    "export const sharedShell = {",
    `  sourceTemplate: '${escapeForTs(blueprint.sourceTemplate)}',`,
    "  legalRoutes: [",
    ...blueprint.sharedShell.legalRoutes.map((route) => `    '${escapeForTs(route)}',`),
    "  ],",
    "  supportEmail: 'contact@fluxkreafree.com',",
    "} as const;",
    "",
    "export const marketingNavigation = [",
    marketingEntries,
    "] as const;",
    "",
    "export const appNavigation = [",
    appEntries,
    "] as const;",
    "",
    "export const footerNavigation = [",
    footerEntries,
    "] as const;",
    "",
    "export const routeOwnership = {",
    ownershipEntries,
    "} as const;",
    "",
    "export const navigation = marketingNavigation;",
    "",
  ].join("\n");
}

function buildContentFooterTs(request: ShpittoOpenCodeRequest): string {
  const company = escapeForTs(request.structuredInputs.companyName || request.structuredInputs.productName || "Shpitto Baseline");
  return [
    "export const footer = {",
    `  summary: '${company} baseline prepared by Shpitto with reusable sections and deployable Next.js output.',`,
    "} as const;",
    "",
  ].join("\n");
}

function buildLibRoutesTs(routes: string[]): string {
  const entries = routes.map((route) => `  '${escapeForTs(route)}',`).join("\n");
  return ["export const routes = [", entries, "] as const;", ""].join("\n");
}

function buildLibMetadataTs(): string {
  return [
    'import type { Metadata } from "next";',
    'import { site } from "../content/site";',
    "",
    "export function buildSiteMetadata(title?: string): Metadata {",
    "  return {",
    "    title: title ? `${title} | ${site.name}` : site.name,",
    "    description: `${site.name} ships a launch-ready Shpitto baseline with reusable sections and deployable code.`,",
    "  };",
    "}",
    "",
  ].join("\n");
}

function buildLibSiteConfigTs(request: ShpittoOpenCodeRequest): string {
  return [
    'import { site } from "../content/site";',
    "",
    "export const siteConfig = {",
    "  ...site,",
    `  executionScope: '${escapeForTs(request.executionScope)}',`,
    `  templateFamily: '${escapeForTs(request.templateContext.templateFamily)}',`,
    "} as const;",
    "",
  ].join("\n");
}

function buildLibAuthTs(): string {
  return [
    'import type { NextAuthOptions } from "next-auth";',
    'import { getServerSession } from "next-auth";',
    'import GoogleProvider from "next-auth/providers/google";',
    'import CredentialsProvider from "next-auth/providers/credentials";',
    "",
    "const isProduction = process.env.NODE_ENV === 'production';",
    "const hasGoogleAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);",
    "const isTemplatePreview = process.env.SHPITTO_TEMPLATE_PREVIEW === 'true' || process.env.SHPITTO_TEMPLATE_PREVIEW === '1';",
    "const enablePreviewCredentials = !hasGoogleAuth && (isTemplatePreview || (!isProduction && (process.env.ENABLE_DEV_USER === 'true' || process.env.ENABLE_DEV_USER === '1' || typeof process.env.ENABLE_DEV_USER === 'undefined')));",
    "",
    "export type TemplateAuthMode = 'google' | 'preview-credentials' | 'unconfigured';",
    "",
    "export function getTemplateAuthMode(): TemplateAuthMode {",
    "  if (hasGoogleAuth) return 'google';",
    "  if (enablePreviewCredentials) return 'preview-credentials';",
    "  return 'unconfigured';",
    "}",
    "",
    "export type TemplateSessionUser = {",
    "  id: string;",
    "  email: string;",
    "  name: string;",
    "};",
    "",
    "const providers = [];",
    "",
    "if (hasGoogleAuth) {",
    "  providers.push(",
    "    GoogleProvider({",
    "      clientId: String(process.env.GOOGLE_CLIENT_ID),",
    "      clientSecret: String(process.env.GOOGLE_CLIENT_SECRET),",
    "    }),",
    "  );",
    "}",
    "",
    "if (enablePreviewCredentials) {",
    "  providers.push(",
    "    CredentialsProvider({",
    "      id: 'dev-user',",
    "      name: 'Preview User',",
    "      credentials: {",
    "        email: { label: 'Email', type: 'email' },",
    "        password: { label: 'Password', type: 'password' },",
    "      },",
    "      async authorize(credentials) {",
    "        const email = String(credentials?.email || '').trim().toLowerCase();",
    "        const password = String(credentials?.password || '');",
    "        if (!enablePreviewCredentials) return null;",
    "        if (!email || !email.includes('@') || password.length < 6) return null;",
    "        const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\\b\\w/g, (char) => char.toUpperCase()) || 'Creator';",
    "        return { id: 'dev-user-local', email, name };",
    "      },",
    "    }),",
    "  );",
    "}",
    "",
    "export const authOptions: NextAuthOptions = {",
    "  providers,",
    "  pages: {",
    "    signIn: '/sign-in',",
    "  },",
    "  session: { strategy: 'jwt' },",
    "  callbacks: {",
    "    async jwt({ token, user }) {",
    "      if (user) {",
    "        token.sub = user.id;",
    "        token.email = user.email;",
    "        token.name = user.name;",
    "      }",
    "      return token;",
    "    },",
    "    async session({ session, token }) {",
    "      if (session.user) {",
    "        (session.user as TemplateSessionUser).id = String(token.sub || 'dev-user-local');",
    "        session.user.email = String(token.email || 'demo@fluxkreafree.com');",
    "        session.user.name = String(token.name || 'Creator');",
    "      }",
    "      return session;",
    "    },",
    "  },",
    "  secret: process.env.NEXTAUTH_SECRET || 'shpitto-template-dev-secret',",
    "};",
    "",
    "export async function getTemplateSessionUser(): Promise<TemplateSessionUser | null> {",
    "  const session = await getServerSession(authOptions);",
    "  if (!session?.user?.email || !session.user.name) return null;",
    "  return {",
    "    id: String((session.user as TemplateSessionUser).id || 'dev-user-local'),",
    "    email: String(session.user.email),",
    "    name: String(session.user.name),",
    "  };",
    "}",
    "",
  ].join("\n");
}

function buildLibCmsTs(): string {
  return [
    "export type CmsDataSource = 'payload' | 'product-api' | 'seed';",
    "export type CmsTaskStatus = 'processing' | 'needs-attention' | 'ready';",
    "",
    "export type CmsTask = { id: string; title: string; project: string; status: CmsTaskStatus; model: string; updatedAt: string; outputCount: number };",
    "export type CmsProject = { id: string; name: string; summary: string; promptCount: number; assetCount: number; updatedAt: string };",
    "export type CmsAsset = { id: string; title: string; project: string; status: 'approved' | 'review'; kind: string; altText: string; updatedAt: string };",
    "export type CmsSettings = { siteName: string; defaultModel: string; enabledProviders: string[]; billingMode: string; seoStatus: string; payloadAdminUrl: string };",
    "",
    "const seedTasks: CmsTask[] = [",
    "  { id: 'task-001', title: 'Poster campaign batch', project: 'Campaign launch', status: 'processing', model: 'FLUX.1', updatedAt: '2 min ago', outputCount: 4 },",
    "  { id: 'task-002', title: 'Editorial portrait rerun', project: 'Reusable looks', status: 'needs-attention', model: 'FLUX Schnell', updatedAt: '18 min ago', outputCount: 0 },",
    "  { id: 'task-003', title: 'Homepage hero export', project: 'Campaign launch', status: 'ready', model: 'FLUX.1', updatedAt: '42 min ago', outputCount: 3 },",
    "];",
    "",
    "const seedProjects: CmsProject[] = [",
    "  { id: 'project-001', name: 'Campaign launch', summary: 'Hero renders, social cut-downs, and publish metadata for the next release.', promptCount: 12, assetCount: 18, updatedAt: 'Today' },",
    "  { id: 'project-002', name: 'Reusable looks', summary: 'Portrait, product, and editorial prompt recipes for repeat generation.', promptCount: 9, assetCount: 14, updatedAt: 'Yesterday' },",
    "  { id: 'project-003', name: 'Client review', summary: 'Approved variants grouped for review, export, and handoff.', promptCount: 6, assetCount: 10, updatedAt: '3 days ago' },",
    "];",
    "",
    "const seedAssets: CmsAsset[] = [",
    "  { id: 'asset-001', title: 'Homepage hero', project: 'Campaign launch', status: 'approved', kind: 'Hero render', altText: 'Approved FLUX.1 campaign hero render', updatedAt: '42 min ago' },",
    "  { id: 'asset-002', title: 'Ad variant set', project: 'Campaign launch', status: 'review', kind: 'Social package', altText: 'Square social campaign variants awaiting review', updatedAt: '1 hour ago' },",
    "  { id: 'asset-003', title: 'Portrait study', project: 'Reusable looks', status: 'approved', kind: 'Reference image', altText: 'Editorial portrait study generated with FLUX.1', updatedAt: 'Yesterday' },",
    "];",
    "",
    "const seedSettings: CmsSettings = {",
    "  siteName: 'FluxKrea Free',",
    "  defaultModel: 'FLUX.1',",
    "  enabledProviders: ['Replicate', 'RunningHub', 'Hugging Face'],",
    "  billingMode: 'Hybrid credits + subscription',",
    "  seoStatus: 'Ready for review',",
    "  payloadAdminUrl: String(process.env.PAYLOAD_ADMIN_URL || ''),",
    "};",
    "",
    "const payloadApiUrl = String(process.env.PAYLOAD_API_URL || '').replace(/\\/$/, '');",
    "const productApiUrl = String(process.env.PRODUCT_API_URL || '').replace(/\\/$/, '');",
    "const payloadApiKey = String(process.env.PAYLOAD_API_KEY || '');",
    "",
    "async function readJson<T>(url: string, apiKey = ''): Promise<T | null> {",
    "  try {",
    "    const response = await fetch(url, {",
    "      headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : undefined,",
    "      next: { revalidate: 30 },",
    "    });",
    "    if (!response.ok) return null;",
    "    return (await response.json()) as T;",
    "  } catch {",
    "    return null;",
    "  }",
    "}",
    "",
    "async function readPayloadCollection<T>(slug: string): Promise<T[] | null> {",
    "  if (!payloadApiUrl) return null;",
    "  const response = await readJson<{ docs?: T[] }>(payloadApiUrl + '/api/' + slug + '?limit=100', payloadApiKey);",
    "  return Array.isArray(response?.docs) ? response.docs : null;",
    "}",
    "",
    "async function readProductCollection<T>(slug: string): Promise<T[] | null> {",
    "  if (!productApiUrl) return null;",
    "  const response = await readJson<{ data?: T[] } | T[]>(productApiUrl + '/' + slug);",
    "  if (Array.isArray(response)) return response;",
    "  return Array.isArray(response?.data) ? response.data : null;",
    "}",
    "",
    "export async function getCmsTasks() {",
    "  const remote = await readProductCollection<CmsTask>('tasks');",
    "  return { items: remote || seedTasks, source: remote ? 'product-api' as const : 'seed' as const };",
    "}",
    "",
    "export async function getCmsProjects() {",
    "  const remote = await readPayloadCollection<CmsProject>('projects');",
    "  return { items: remote || seedProjects, source: remote ? 'payload' as const : 'seed' as const };",
    "}",
    "",
    "export async function getCmsAssets() {",
    "  const remote = await readPayloadCollection<CmsAsset>('media');",
    "  return { items: remote || seedAssets, source: remote ? 'payload' as const : 'seed' as const };",
    "}",
    "",
    "export async function getCmsSettings() {",
    "  const [siteSettings, generationSettings, billingSettings] = await Promise.all([",
    "    payloadApiUrl ? readJson<Partial<CmsSettings>>(payloadApiUrl + '/api/globals/site-settings', payloadApiKey) : Promise.resolve(null),",
    "    payloadApiUrl ? readJson<Partial<CmsSettings>>(payloadApiUrl + '/api/globals/generation-settings', payloadApiKey) : Promise.resolve(null),",
    "    payloadApiUrl ? readJson<Partial<CmsSettings>>(payloadApiUrl + '/api/globals/billing-settings', payloadApiKey) : Promise.resolve(null),",
    "  ]);",
    "  const settings = { ...seedSettings, ...siteSettings, ...generationSettings, ...billingSettings, payloadAdminUrl: seedSettings.payloadAdminUrl };",
    "  return { settings, source: siteSettings || generationSettings || billingSettings ? 'payload' as const : 'seed' as const };",
    "}",
    "",
    "export async function getCmsOverview() {",
    "  const [tasks, projects, assets, settings] = await Promise.all([getCmsTasks(), getCmsProjects(), getCmsAssets(), getCmsSettings()]);",
    "  const source = [tasks.source, projects.source, assets.source, settings.source].includes('payload') ? 'payload' as const : [tasks.source, projects.source, assets.source].includes('product-api') ? 'product-api' as const : 'seed' as const;",
    "  return { tasks, projects, assets, settings, source };",
    "}",
    "",
  ].join("\n");
}

function buildSiteHeaderTs(): string {
  return [
    '"use client";',
    "",
    'import Link from "next/link";',
    'import { usePathname } from "next/navigation";',
    'import { appNavigation, marketingNavigation } from "../../content/navigation";',
    'import { site } from "../../content/site";',
    'import type { TemplateDictionary } from "../../lib/i18n";',
    'import { SignedIn } from "../auth/auth-components";',
    'import { UserButton } from "../auth/user-button";',
    "",
    "type SiteHeaderProps = {",
    "  dictionary: TemplateDictionary;",
    "};",
    "",
    "export function SiteHeader({ dictionary }: SiteHeaderProps) {",
    "  const pathname = usePathname() || \"/\";",
    "  const navItems = pathname === \"/app\" || pathname.startsWith(\"/app/\") ? appNavigation : marketingNavigation;",
    "  return (",
    '    <header className="site-header">',
    '      <div className="site-header__inner">',
    '        <div className="site-header__identity">',
    '          <Link href="/" className="brand-mark">{site.name}</Link>',
    '          <span className="shell-badge">{dictionary.aiImageTemplate}</span>',
    "        </div>",
    '        <div className="site-header__controls">',
    '        <nav className="site-nav" aria-label="Primary">',
    '          {navItems.map((item) => (',
    '            <Link key={item.href} href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noreferrer" : undefined} className={item.href === pathname ? "nav-link nav-link--active" : "nav-link"}>',
    '              {item.title}',
    '            </Link>',
    '          ))}',
    "        </nav>",
        '        <div className="header-actions" aria-label="Global actions">',
    '          <Link href="/cms" className={pathname === "/cms" ? "header-action header-action--active" : "header-action"}>{dictionary.cms}</Link>',
    '          <SignedIn><UserButton /></SignedIn>',
    "        </div>",
    "        </div>",
    "      </div>",
    "    </header>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildSiteFooterTs(): string {
  return [
    'import type { TemplateDictionary } from "../../lib/i18n";',
    'import { site } from "../../content/site";',
    'import { footerNavigation, sharedShell } from "../../content/navigation";',
    "",
    "type SiteFooterProps = {",
    "  dictionary: TemplateDictionary;",
    "};",
    "",
    "export function SiteFooter({ dictionary }: SiteFooterProps) {",
    "  return (",
    '    <footer className="site-footer">',
    '      <div className="site-footer__top">',
    '        <div className="site-footer__brand">',
    '          <span className="brand-mark">{site.name}</span>',
    '          <p>{sharedShell.sourceTemplate} {dictionary.footerPreparedBy}</p>',
    '        </div>',
    '        <nav className="site-nav" aria-label="Footer">',
    '          {footerNavigation.map((item) => (',
    '            <a key={item.href} href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noreferrer" : undefined} className="footer-link">',
    '              {item.title}',
    '            </a>',
    '          ))}',
    '        </nav>',
    '      </div>',
    '      <div className="site-footer__bottom">',
    '        <p className="site-footer__copyright">© 2026 {site.name}. Powered by Krea FLUX.1.</p>',
    "      </div>",
    "    </footer>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAuthFormTs(): string {
  return [
    '"use client";',
    "",
    'import { useState } from "react";',
    'import type { TemplateDictionary } from "../../lib/i18n";',
    'import { SignInButton } from "./auth-components";',
    'import { useSearchParams } from "next/navigation";',
    "",
    "type AuthFormMode = 'google' | 'preview-credentials' | 'unconfigured';",
    "",
    "type AuthFormProps = {",
    "  mode: AuthFormMode;",
    "  dictionary: TemplateDictionary;",
    "};",
    "",
    "export function AuthForm({ mode, dictionary }: AuthFormProps) {",
    "  const searchParams = useSearchParams();",
    "  const next = searchParams.get('next') || '/app';",
    "  const [email, setEmail] = useState('demo@fluxkreafree.com');",
    "  const [password, setPassword] = useState('flux-demo');",
    "  const [state, setState] = useState<'idle' | 'submitting'>('idle');",
    "",
    "  if (mode === 'google') {",
    "    return (",
    '      <div className="auth-form">',
    '        <p className="auth-hint">{dictionary.authGoogleHint}</p>',
    '        <div className="auth-form__actions">',
    '          <SignInButton provider="google" callbackUrl={next}>',
    '            <button type="button" className="button-primary button-primary--wide button-google"><span className="button-google__icon">G</span>{dictionary.authContinueWithGoogle}</button>',
    "          </SignInButton>",
    '          <a href="/" className="button-secondary button-secondary--wide">{dictionary.authBackHome}</a>',
    "        </div>",
    "      </div>",
    "    );",
    "  }",
    "",
    "  if (mode === 'unconfigured') {",
    "    return (",
    '      <div className="auth-form">',
    '        <p className="auth-error">{dictionary.authMisconfigured}</p>',
    '        <div className="auth-form__actions">',
    '          <a href="/" className="button-secondary button-secondary--wide">{dictionary.authBackHome}</a>',
    "        </div>",
    "      </div>",
    "    );",
    "  }",
    "",
    "  return (",
    '    <form className="auth-form" onSubmit={(event) => event.preventDefault()}>',
    '      <label className="auth-field">',
    '        <span>Email</span>',
    '        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" name="email" autoComplete="email" required />',
    "      </label>",
    '      <label className="auth-field">',
    '        <span>Password</span>',
    '        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" name="password" autoComplete="current-password" required />',
    "      </label>",
    '      <input type="hidden" name="next" value={next} />',
    '      <p className="auth-hint">{dictionary.authPreviewHint}</p>',
    '      <div className="auth-form__actions">',
    '        <SignInButton provider="dev-user" email={email} password={password} callbackUrl={next} onStart={() => setState("submitting")}><button type="submit" className="button-primary button-primary--wide" disabled={state === "submitting"}>{state === "submitting" ? dictionary.authSigningIn : dictionary.authPreviewSubmit}</button></SignInButton>',
    '        <a href="/" className="button-secondary button-secondary--wide">{dictionary.authBackHome}</a>',
    "      </div>",
    "    </form>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildNextAuthRoute(): string {
  return [
    'import NextAuth from "next-auth";',
    'import { authOptions } from "../../../../lib/auth";',
    "",
    "export const dynamic = 'force-dynamic';",
    "",
    "const handler = NextAuth(authOptions);",
    "",
    "export { handler as GET, handler as POST };",
    "",
  ].join("\n");
}

function buildLocaleApiRoute(): string {
  return [
    'import { NextResponse } from "next/server";',
    'import { setCurrentLocale } from "../../../lib/i18n";',
    "",
    "export async function POST(request: Request) {",
    "  const body = (await request.json().catch(() => ({}))) as { locale?: string };",
    "  const updated = await setCurrentLocale(String(body.locale || ''));",
    "  return NextResponse.json({ ok: updated }, { status: updated ? 200 : 400 });",
    "}",
    "",
  ].join("\n");
}

function buildAuthProviderTs(): string {
  return [
    '"use client";',
    "",
    'import type { ReactNode } from "react";',
    'import { SessionProvider } from "next-auth/react";',
    "",
    "type AuthProviderProps = {",
    "  children: ReactNode;",
    "};",
    "",
    "export function AuthProvider({ children }: AuthProviderProps) {",
    "  return <SessionProvider>{children}</SessionProvider>;",
    "}",
    "",
  ].join("\n");
}

function buildUseAuthTs(): string {
  return [
    '"use client";',
    "",
    'import { useSession } from "next-auth/react";',
    "",
    "export function useAuth() {",
    "  const { data: session, status } = useSession();",
    "  return {",
    "    userId: session?.user ? (session.user as { id?: string }).id || null : null,",
    "    user: session?.user || null,",
    "    isLoaded: status !== 'loading',",
    "    isSignedIn: Boolean(session?.user),",
    "  };",
    "}",
    "",
  ].join("\n");
}

function buildAuthComponentsTs(): string {
  return [
    '"use client";',
    "",
    'import type { ReactNode } from "react";',
    'import { signIn } from "next-auth/react";',
    'import { useAuth } from "../../hooks/use-auth";',
    "",
    "type AuthComponentProps = {",
    "  children: ReactNode;",
    "};",
    "",
    "export function SignedIn({ children }: AuthComponentProps) {",
    "  const { isSignedIn } = useAuth();",
    "  if (!isSignedIn) return null;",
    "  return <>{children}</>;",
    "}",
    "",
    "export function SignedOut({ children }: AuthComponentProps) {",
    "  const { isSignedIn } = useAuth();",
    "  if (isSignedIn) return null;",
    "  return <>{children}</>;",
    "}",
    "",
    "type SignInButtonProps = {",
    "  children: ReactNode;",
    "  provider?: string;",
    "  callbackUrl?: string;",
    "  email?: string;",
    "  password?: string;",
    "  onStart?: () => void;",
    "};",
    "",
    "export function SignInButton({ children, provider = 'google', callbackUrl, email, password, onStart }: SignInButtonProps) {",
    "  const handleClick = async (event: React.MouseEvent) => {",
    "    event.preventDefault();",
    "    onStart?.();",
    "    await signIn(provider, {",
    "      email,",
    "      password,",
    "      callbackUrl: callbackUrl || window.location.href,",
    "      redirect: true,",
    "    });",
    "  };",
    '  return <span onClick={handleClick} style={{ display: "inline-flex", cursor: "pointer" }}>{children}</span>;',
    "}",
    "",
  ].join("\n");
}

function buildUserButtonTs(): string {
  return [
    '"use client";',
    "",
    'import { signOut } from "next-auth/react";',
    'import { useAuth } from "../../hooks/use-auth";',
    "",
    "export function UserButton() {",
    "  const { user } = useAuth();",
    "  const label = user?.name ? `Sign out ${user.name}` : 'Sign out';",
    "  return (",
    '    <button type="button" className="header-action" onClick={() => signOut({ callbackUrl: "/sign-in" })}>',
    "      {label}",
    "    </button>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildTemplateCssVariables(tokens: ProductBaselineTemplateBlueprint["designTokens"]): string {
  const light = Object.entries(tokens.cssVariables.light)
    .map(([key, value]) => `    --${key}: ${value};`)
    .join("\n");
  const dark = Object.entries(tokens.cssVariables.dark)
    .map(([key, value]) => `    --${key}: ${value};`)
    .join("\n");
  return [
    ":root {",
    light,
    "",
    "}",
    "",
    ".dark {",
    dark,
    "",
    "}",
    "",
    "* {",
    "  border-color: hsl(var(--border));",
    "}",
    "",
    "body {",
    "  background: hsl(var(--background));",
    "  color: hsl(var(--foreground));",
    '  font-feature-settings: "rlig" 1, "calt" 1;',
    "}",
    "",
  ].join("\n");
}

function buildStylesTokensCss(family: BaselineFamily): string {
  if (family === "b2b-lead-generation") {
    return [
      ":root {",
      "  --bg: #0b1220;",
      "  --surface: #0f172a;",
      "  --card: #111c33;",
      "  --text: #f8fafc;",
      "  --muted: #c7d2e3;",
      "  --accent: #38bdf8;",
      "  --accent-secondary: #f59e0b;",
      "  --border: rgba(203, 213, 225, 0.16);",
      "}",
      "",
    ].join("\n");
  }
  return [
    ":root {",
    "  --bg: #f5f4ff;",
    "  --surface: rgba(255,255,255,0.82);",
    "  --card: #ffffff;",
    "  --text: #111827;",
    "  --muted: #5b6173;",
    "  --accent: #5b5df0;",
    "  --accent-secondary: #111827;",
    "  --border: rgba(17, 24, 39, 0.09);",
    "}",
    "",
  ].join("\n");
}

function buildStylesUtilitiesCss(): string {
  return [
    ".container { max-width: 1160px; margin: 0 auto; padding: 0 24px; }",
    ".section-stack { display: grid; gap: 20px; }",
    ".card-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 18px; }",
    ".card-grid > * { grid-column: span 4; }",
    "@media (max-width: 900px) { .card-grid > * { grid-column: span 6; } }",
    "@media (max-width: 640px) { .card-grid > * { grid-column: 1 / -1; } }",
    "",
  ].join("\n");
}

function buildMarketingGlobalsCss(): string {
  return [
    buildStylesTokensCss("marketing-launch"),
    buildStylesUtilitiesCss(),
    "* { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; }",
    "body { min-height: 100vh; font-family: Inter, system-ui, sans-serif; color: var(--text); background: radial-gradient(circle at top left, rgba(91,93,240,0.12), transparent 24%), linear-gradient(180deg, #f8f7ff 0%, var(--bg) 100%); }",
    "a { color: inherit; text-decoration: none; }",
    ".site-frame { min-height: 100vh; }",
    ".site-header, .site-footer { max-width: 1160px; margin: 0 auto; display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 24px; }",
    ".site-header__identity, .site-header__controls, .header-actions { display: flex; align-items: center; gap: 12px; }",
    ".brand-mark { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.02em; }",
    ".shell-badge { padding: 6px 10px; border-radius: 999px; border: 1px solid var(--border); background: rgba(255,255,255,0.72); color: var(--muted); font-size: 0.8rem; }",
    ".site-nav { display: flex; flex-wrap: wrap; gap: 12px; }",
    ".nav-link { padding: 10px 14px; border-radius: 999px; color: var(--muted); }",
    ".nav-link:hover { background: rgba(91,93,240,0.08); color: var(--text); }",
    ".header-action { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: rgba(255,255,255,0.76); color: var(--text); font-weight: 600; }",
    ".header-action--active { background: var(--accent); color: #fff; border-color: transparent; }",
    ".page-shell { display: grid; gap: 64px; padding: 0 0 64px; }",
    ".hero-block { padding: 72px 0 16px; }",
    ".eyebrow { margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.18em; font-size: 0.76rem; color: var(--muted); }",
    ".hero-block h1 { margin: 0 0 18px; font-size: clamp(2.6rem, 6vw, 4.8rem); line-height: 0.96; max-width: 12ch; }",
    ".lead { margin: 0; max-width: 62ch; color: var(--muted); font-size: 1.08rem; line-height: 1.75; }",
    ".hero-actions { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 24px; }",
    ".button-primary, .button-secondary { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; border-radius: 999px; font-weight: 600; }",
    ".button-primary { background: var(--accent); color: white; }",
    ".button-secondary { border: 1px solid var(--border); background: rgba(255,255,255,0.72); color: var(--text); }",
    ".section-card { padding: 28px; border-radius: 24px; background: var(--card); border: 1px solid var(--border); box-shadow: 0 20px 48px rgba(17,24,39,0.06); }",
    ".section-card h2 { margin: 0 0 10px; font-size: 1.12rem; }",
    ".section-card p { margin: 0; color: var(--muted); line-height: 1.7; }",
    ".site-footer { color: var(--muted); font-size: 0.95rem; }",
    "@media (max-width: 720px) { .site-header, .site-footer { flex-direction: column; align-items: flex-start; } .hero-block { padding-top: 56px; } }",
    "",
  ].join("\n");
}

function buildB2bGlobalsCss(): string {
  return [
    buildStylesTokensCss("b2b-lead-generation"),
    buildStylesUtilitiesCss(),
    "* { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; }",
    "body { min-height: 100vh; font-family: Inter, system-ui, sans-serif; color: var(--text); background: linear-gradient(180deg, #08111f 0%, var(--bg) 100%); }",
    "a { color: inherit; text-decoration: none; }",
    ".site-frame { min-height: 100vh; }",
    ".site-header, .site-footer { max-width: 1160px; margin: 0 auto; display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 24px; }",
    ".brand-mark { font-size: 1.02rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }",
    ".site-nav { display: flex; flex-wrap: wrap; gap: 12px; }",
    ".nav-link { padding: 10px 14px; border-radius: 999px; color: var(--muted); }",
    ".nav-link:hover { background: rgba(56,189,248,0.12); color: var(--text); }",
    ".page-shell { display: grid; gap: 56px; padding: 0 0 64px; }",
    ".hero-block { padding: 72px 0 12px; }",
    ".eyebrow { margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.74rem; color: var(--muted); }",
    ".hero-block h1 { margin: 0 0 16px; font-size: clamp(2.5rem, 5.5vw, 4.6rem); line-height: 0.96; max-width: 12ch; }",
    ".lead { margin: 0; max-width: 70ch; color: var(--muted); font-size: 1.05rem; line-height: 1.75; }",
    ".proof-strip { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 24px; }",
    ".proof-pill { padding: 10px 14px; border: 1px solid var(--border); border-radius: 999px; background: rgba(17,28,51,0.88); color: var(--muted); }",
    ".section-card { padding: 28px; border-radius: 24px; background: var(--card); border: 1px solid var(--border); box-shadow: 0 18px 44px rgba(2, 8, 23, 0.28); }",
    ".section-card h2 { margin: 0 0 10px; font-size: 1.12rem; }",
    ".section-card p { margin: 0; color: var(--muted); line-height: 1.7; }",
    ".site-footer { color: var(--muted); font-size: 0.95rem; }",
    "@media (max-width: 720px) { .site-header, .site-footer { flex-direction: column; align-items: flex-start; } .hero-block { padding-top: 56px; } }",
    "",
  ].join("\n");
}

function getMarketingContent(companyName: string) {
  return {
    homePage: {
      eyebrow: "Launch-ready marketing baseline",
      title: `${companyName} helps product teams ship a clear website before they overbuild.`,
      lead:
        "Start from a marketing structure with positioning, proof, pricing, and CTA flow already in place so your team can iterate instead of starting over.",
      primaryCta: "Start building",
      secondaryCta: "View pricing",
    },
    aboutPage: {
      title: "Explain the product story without turning the homepage into a company essay.",
      lead:
        "Use this route to show who the team serves, why the product exists, and how the company thinks about launch clarity, buyer trust, and iteration speed.",
    },
    pricingPage: {
      title: "Choose a plan that matches how fast your team wants to ship.",
      lead: "The pricing baseline is structured so buyers can compare plans quickly without getting lost in feature noise.",
    },
    contactPage: {
      title: "Talk to the team behind the launch.",
      lead: "Use this contact route for demo requests, implementation questions, or commercial follow-up after a marketing launch.",
    },
    features: [
      {
        title: "Clear positioning",
        body: "Start from a launch-ready structure that explains what the product does before the team gets trapped in visual iteration.",
      },
      {
        title: "Reusable growth sections",
        body: "Ship with feature, proof, pricing, and CTA blocks that can be updated without rewriting the whole site shell.",
      },
      {
        title: "Code ownership",
        body: "Keep a deployable Next.js baseline you can export, host, and continue refining outside the builder.",
      },
    ],
    testimonials: [
      { quote: "The baseline gave us a clear launch path instead of another homepage rewrite cycle.", person: "Product Team" },
      { quote: "We could adjust copy and plans without losing the original structure.", person: "Growth Lead" },
      { quote: "It felt closer to a real product site than a generic AI page output.", person: "Founder" },
    ],
    logos: [{ name: "Northwind Labs" }, { name: "Orbit Stack" }, { name: "Signal Foundry" }, { name: "LaunchOps" }],
    plans: [
      { name: "Starter", price: "$19", interval: "/mo", summary: "For solo founders shipping one launch-ready website fast." },
      {
        name: "Growth",
        price: "$59",
        interval: "/mo",
        summary: "For teams that need stronger proof, more pages, and faster iteration cycles.",
      },
      {
        name: "Scale",
        price: "$149",
        interval: "/mo",
        summary: "For multi-page marketing systems that expand into docs, content, and post-launch workflows.",
      },
    ],
    faq: [
      {
        question: "Do I keep the code?",
        answer: "Yes. The baseline is prepared as a deployable Next.js project, not a locked page export.",
      },
      {
        question: "Can I add docs or a blog later?",
        answer: "Yes. This template is designed to pair with content and docs workflows after launch.",
      },
      {
        question: "Can I deploy outside Shpitto?",
        answer: "Yes. The baseline is meant for export and independent deployment on your own stack.",
      },
    ],
  };
}

function getB2bContent(companyName: string) {
  return {
    homePage: {
      eyebrow: "Enterprise-ready company baseline",
      title: `${companyName} helps buyers understand product scope and next steps faster.`,
      lead:
        "Start from a B2B homepage structure that balances company credibility, product family clarity, capability proof, and inquiry conversion instead of behaving like a generic landing page.",
      primaryCta: "Request information",
      secondaryCta: "Browse products",
    },
    productsPage: {
      title: "Explore the core product families buyers compare first.",
      lead:
        "Use this route to present your range with enough clarity that procurement, engineering, and distribution teams can quickly understand fit.",
    },
    contactPage: {
      title: "Start the inquiry with the information your team needs to respond well.",
      lead:
        "The contact route should reduce friction for quote, specification, or sourcing conversations instead of acting like a generic corporate afterthought.",
    },
    solutionsPage: {
      title: "Show how the team supports buyer-specific requirements and delivery conditions.",
      lead:
        "Use this route to explain process fit, customization support, and how your team helps buyers move from requirement to supply-ready scope.",
    },
    casesPage: {
      title: "Use real buyer scenarios to make capability and product fit easier to trust.",
      lead:
        "This route should summarize application examples, buyer outcomes, and proof that the team can support real sourcing or delivery contexts.",
    },
    aboutPage: {
      title: "Present the company as an operational team buyers can work with confidently.",
      lead:
        "Use this route to explain operating model, quality posture, sourcing discipline, and the signals that make enterprise buyers trust the company beyond the homepage.",
    },
    trustSignals: ["Procurement-ready response flows", "Reusable product family presentation", "Exportable website code ownership"],
    productGroups: [
      { title: "Core Components", body: "Present the primary product families buyers need to compare quickly." },
      { title: "Custom Solutions", body: "Explain where engineering support, adaptation, or delivery guidance applies." },
      { title: "Application Fit", body: "Show how product families map to buyer scenarios and procurement needs." },
    ],
    caseStudies: [
      {
        title: "Industrial buyer rollout",
        body: "Show how one customer segment benefited from structured product communication and response speed.",
      },
      {
        title: "Distributor enablement",
        body: "Highlight how the site helps channel partners understand offering scope faster.",
      },
      {
        title: "Procurement proof path",
        body: "Demonstrate how capability and evidence reduce pre-sales confusion.",
      },
    ],
    faq: [
      {
        question: "Can I adapt this for another B2B category?",
        answer: "Yes. The template is designed as a reusable company baseline rather than a single-industry one-off.",
      },
      {
        question: "Do I keep the code after generation?",
        answer: "Yes. The baseline is exportable and deployable outside the builder.",
      },
      {
        question: "Can I expand this into a larger product catalog later?",
        answer: "Yes. The products route is designed to evolve into a catalog module without rebuilding the whole shell.",
      },
    ],
    capabilities: [
      {
        title: "Customization support",
        body: "Explain how the team adapts products, specifications, and packaging to buyer-specific requirements.",
      },
      {
        title: "Process discipline",
        body: "Use this capability to show how sourcing, validation, and response steps stay predictable for enterprise buyers.",
      },
      {
        title: "Delivery readiness",
        body: "Highlight communication clarity, documentation support, and the operating posture behind reliable fulfillment.",
      },
    ],
  };
}

function getAiImageToolContent(productName: string) {
  return {
    homePage: {
      eyebrow: "FLUX.1 image generation",
      title: `Generate polished AI images in ${productName} with a real product shell, not a marketing-only starter.`,
      lead:
        "This baseline follows the fluxkreafree pattern: a public discovery homepage, a prompt generator, a gated generation workspace, replayable history, and brand surfaces that do not rewrite product semantics.",
      primaryCta: "Start generating",
      secondaryCta: "Prompt generator",
    },
    dashboardPage: {
      title: "Use the product hub to jump into generation, history, gift codes, or billing.",
      lead:
        "The app shell should act like a real product dashboard, not just a second marketing page.",
    },
    appPage: {
      title: "Generate images with product-owned prompt controls, model options, and reusable output history.",
      lead:
        "Use this route as the core generator workspace. Prompt input, aspect ratio, quality, model selection, and result review stay product-owned here.",
    },
    generatePage: {
      title: "Generate with prompt input, model selection, private mode, uploads, and replayable output controls.",
      lead:
        "This route mirrors the upstream generator more closely: prompt entry, model picker, aspect ratio, privacy toggle, upload slot, and a live result stack.",
    },
    promptGeneratorPage: {
      title: "Prompt Generator",
      lead:
        "Use this public route to transform a rough idea into a usable FLUX prompt before entering the actual generator workspace.",
    },
    fluxAiPage: {
      title: "FLUX.1 image generation tuned for public discovery and fast workspace handoff.",
      lead:
        "Use this route to explain the core FLUX.1 offer, showcase examples, and push visitors into the actual product workspace instead of stopping at brochure copy.",
    },
    fluxSchnellPage: {
      title: "FLUX Schnell for faster iterations and lighter-weight prompt runs.",
      lead:
        "Use this route to differentiate a faster model lane without replacing the main generator or history surfaces.",
    },
    kreaAlternativePage: {
      title: "A Krea alternative page that compares strengths without collapsing into generic comparison SEO filler.",
      lead:
        "Use this route to explain why the product exists, how the workspace behaves, and where prompt, generation, and history flows differ from alternatives.",
    },
    blogPage: {
      title: "Public updates, product notes, and prompt workflow articles.",
      lead:
        "Use this route for shipping notes, prompt advice, and model updates while keeping the app workspace separate from editorial content.",
    },
    historyPage: {
      title: "Review generated images, replay prompts, and reopen prior work without going back through marketing copy.",
      lead:
        "This route is product-owned. It should help users inspect earlier outputs, compare variants, and reopen work without routing them back through marketing copy.",
    },
    giftCodePage: {
      title: "Redeem a gift code or promo code without leaving the app shell.",
      lead:
        "This route belongs to the product dashboard and keeps reward redemption separate from public marketing pages.",
    },
    orderPage: {
      title: "Review product credits and order state inside the app shell.",
      lead:
        "Order and billing actions remain app-owned surfaces so the user can manage credits without going through the marketing site.",
    },
    signInPage: {
      title: "Gate generator access cleanly while keeping the public product surfaces open.",
      lead:
        "Use this route to explain why sign-in is required for product surfaces, what happens after access is granted, and how guest browsing stays limited to brand pages.",
    },
    signUpPage: {
      title: "Create an account before entering the product workspace.",
      lead:
        "Use this route to onboard new users into the generator, history, and billing shell without turning registration into a marketing page.",
    },
    pricingPage: {
      title: "Simple packaging and usage framing, kept separate from the generation workspace.",
      lead:
        "Use this route to explain usage tiers and commercial boundaries without making the workspace dependent on marketing copy.",
    },
    docsPage: {
      title: "Docs for model behavior, prompt workflow, and product boundaries.",
      lead:
        "Use this route to answer setup and usage questions without rewriting the generation workflow or core app ownership.",
    },
    featureCards: [
      {
        title: "Prompt-to-image workspace",
        body: "Keep prompt entry, model controls, reference handling, and result review in a real generation console instead of flattening them into landing-page cards.",
      },
      {
        title: "Replayable history",
        body: "Persist outputs, prompts, ratios, and generation states so users can compare, reopen, and export prior runs directly from the product surface.",
      },
      {
        title: "Model-specific entry points",
        body: "Expose product model framing, pricing, and prompt generation on public surfaces while keeping generation mechanics owned by the app workspace.",
      },
    ],
    workflowCards: [
      {
        title: "Prompt",
        body: "Start from a rough idea or a quick prompt generator output and convert it into a structured request.",
      },
      {
        title: "Generate",
        body: "Run the selected model with aspect ratio, quality, privacy, and upload controls inside the main workspace.",
      },
      {
        title: "Replay",
        body: "Review history, duplicate good runs, and move successful outputs into export or publishing flows without rebuilding the shell.",
      },
    ],
    examples: [
      {
        title: "Portrait study",
        body: "High-fidelity portrait prompts with clear light direction, realistic skin texture, and tight control over composition.",
      },
      {
        title: "Product hero render",
        body: "Catalog-style object staging with controlled backgrounds, reflective materials, and strong prompt adherence.",
      },
      {
        title: "Campaign visual",
        body: "Atmospheric key visuals for launches, social assets, and editorial frames generated from reusable prompt structures.",
      },
    ],
    plans: [
      { name: "Free", price: "$0", interval: "/forever", summary: "Public entry point with free generation framing, basic model access, and history visibility." },
      { name: "Pro", price: "$15", interval: "/mo", summary: "For repeat creators who need higher quality runs, reusable prompt workflows, and cleaner export paths." },
      { name: "Business", price: "$30", interval: "/mo", summary: "For teams that need stronger throughput, history reuse, and product-level publishing extensions." },
    ],
    faq: [
      {
        question: "Is this baseline only a homepage?",
        answer: "No. It preserves a real product split between public pages and a generator workspace with history and auth gating.",
      },
      {
        question: "Can the generator be extended later?",
        answer: "Yes. The workspace is intentionally shaped around product-owned slots so model controls, export steps, or plugins can expand without replacing the shell.",
      },
      {
        question: "Can users return to prior generations?",
        answer: "Yes. Replayable history is part of the baseline contract and should remain visible as the product grows.",
      },
    ],
  };
}

function buildMarketingFeaturesTs(): string {
  return buildConstExport("features", getMarketingContent("Shpitto Baseline").features);
}

function buildMarketingTestimonialsTs(): string {
  return buildConstExport("testimonials", getMarketingContent("Shpitto Baseline").testimonials);
}

function buildMarketingLogosTs(): string {
  return buildConstExport("logos", getMarketingContent("Shpitto Baseline").logos);
}

function buildMarketingPlansTs(): string {
  return buildConstExport("plans", getMarketingContent("Shpitto Baseline").plans);
}

function buildMarketingFaqTs(): string {
  return buildConstExport("faq", getMarketingContent("Shpitto Baseline").faq);
}

function buildMarketingHomeContentTs(companyName: string): string {
  return buildConstExport("homePage", getMarketingContent(companyName).homePage);
}

function buildMarketingAboutContentTs(): string {
  return buildConstExport("aboutPage", getMarketingContent("Shpitto Baseline").aboutPage);
}

function buildMarketingPricingContentTs(): string {
  return buildConstExport("pricingPage", getMarketingContent("Shpitto Baseline").pricingPage);
}

function buildMarketingContactContentTs(): string {
  return buildConstExport("contactPage", getMarketingContent("Shpitto Baseline").contactPage);
}

function buildMarketingHeroComponent(): string {
  return [
    'import { homePage } from "../../../content/pages/home";',
    "",
    "export function Hero() {",
    "  return (",
    '    <section className="hero-block container">',
    '      <p className="eyebrow">{homePage.eyebrow}</p>',
    '      <h1>{homePage.title}</h1>',
    '      <p className="lead">{homePage.lead}</p>',
    '      <div className="hero-actions">',
    '        <a href="/contact" className="button-primary">{homePage.primaryCta}</a>',
    '        <a href="/pricing" className="button-secondary">{homePage.secondaryCta}</a>',
    '      </div>',
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildMarketingFeatureGridComponent(): string {
  return [
    'import { features } from "../../../content/collections/features";',
    "",
    "export function FeatureGrid() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="card-grid">',
    '        {features.map((feature) => (',
    '          <article key={feature.title} className="section-card">',
    '            <h2>{feature.title}</h2>',
    '            <p>{feature.body}</p>',
    '          </article>',
    '        ))}',
    "      </div>",
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildMarketingSocialProofComponent(): string {
  return [
    'import { testimonials } from "../../../content/collections/testimonials";',
    "",
    "export function SocialProof() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="card-grid">',
    '        {testimonials.map((item) => (',
    '          <article key={item.person} className="section-card">',
    '            <h2>{item.person}</h2>',
    '            <p>{item.quote}</p>',
    '          </article>',
    '        ))}',
    "      </div>",
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildMarketingLogoCloudComponent(): string {
  return [
    'import { logos } from "../../../content/collections/logos";',
    "",
    "export function LogoCloud() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="card-grid">',
    '        {logos.map((item) => (',
    '          <article key={item.name} className="section-card">',
    '            <h2>{item.name}</h2>',
    '            <p>Example customer or partner mark used to calibrate launch-stage trust and category fit.</p>',
    '          </article>',
    '        ))}',
    "      </div>",
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildMarketingPricingSectionComponent(): string {
  return [
    'import { plans } from "../../../content/collections/plans";',
    "",
    "export function PricingSection() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="card-grid">',
    '        {plans.map((plan) => (',
    '          <article key={plan.name} className="section-card">',
    '            <h2>{plan.name}</h2>',
    '            <p>{plan.summary}</p>',
    '            <p><strong>{plan.price}</strong>{plan.interval}</p>',
    '          </article>',
    '        ))}',
    "      </div>",
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildMarketingFaqSectionComponent(): string {
  return [
    'import { faq } from "../../../content/collections/faq";',
    "",
    "export function FAQSection() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="card-grid">',
    '        {faq.map((item) => (',
    '          <article key={item.question} className="section-card">',
    '            <h2>{item.question}</h2>',
    '            <p>{item.answer}</p>',
    '          </article>',
    '        ))}',
    "      </div>",
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildMarketingFinalCtaComponent(): string {
  return [
    "export function FinalCTA() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <article className="section-card">',
    '        <h2>Start from a reusable launch baseline.</h2>',
    '        <p>Use this template to ship a clear product website, then keep iterating without rebuilding from scratch.</p>',
    '        <div className="hero-actions">',
    '          <a href="/contact" className="button-primary">Talk to sales</a>',
    '          <a href="/pricing" className="button-secondary">Compare plans</a>',
    '        </div>',
    '      </article>',
    '    </section>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildMarketingHomePage(): string {
  return [
    'import { Hero } from "../components/sections/landing/hero";',
    'import { LogoCloud } from "../components/sections/landing/logo-cloud";',
    'import { FeatureGrid } from "../components/sections/landing/feature-grid";',
    'import { SocialProof } from "../components/sections/landing/social-proof";',
    'import { PricingSection } from "../components/sections/landing/pricing-section";',
    'import { FAQSection } from "../components/sections/landing/faq-section";',
    'import { FinalCTA } from "../components/sections/landing/final-cta";',
    "",
    "export default function HomePage() {",
    "  return (",
    '    <div className="page-shell">',
    '      <Hero />',
    '      <LogoCloud />',
    '      <FeatureGrid />',
    '      <SocialProof />',
    '      <PricingSection />',
    '      <FAQSection />',
    '      <FinalCTA />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildMarketingPricingPage(): string {
  return [
    'import { pricingPage } from "../../content/pages/pricing";',
    'import { PricingSection } from "../../components/sections/landing/pricing-section";',
    'import { FAQSection } from "../../components/sections/landing/faq-section";',
    "",
    "export default function PricingPage() {",
    "  return (",
    '    <div className="page-shell">',
    '      <section className="hero-block container">',
    '        <p className="eyebrow">Pricing</p>',
    '        <h1>{pricingPage.title}</h1>',
    '        <p className="lead">{pricingPage.lead}</p>',
    '        <div className="hero-actions">',
    '          <a href="/contact" className="button-primary">Talk to sales</a>',
    '          <a href="/" className="button-secondary">Back to overview</a>',
    '        </div>',
    '      </section>',
    '      <PricingSection />',
    '      <FAQSection />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildMarketingContactPage(): string {
  return [
    'import { contactPage } from "../../content/pages/contact";',
    "",
    "export default function ContactPage() {",
    "  return (",
    '    <div className="page-shell">',
    '      <section className="hero-block container">',
    '        <p className="eyebrow">Contact</p>',
    '        <h1>{contactPage.title}</h1>',
    '        <p className="lead">{contactPage.lead}</p>',
    '        <article className="section-card">',
    '          <h2>Best for demos, launch questions, and commercial follow-up.</h2>',
    '          <p>Use this route when your team needs implementation guidance, pricing clarification, or a conversation about how the baseline should evolve after launch.</p>',
    '        </article>',
    '        <div className="hero-actions">',
    '          <a href="mailto:team@example.com" className="button-primary">Email the team</a>',
    '          <a href="/pricing" className="button-secondary">View plans</a>',
    '        </div>',
    '      </section>',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildMarketingAboutPage(): string {
  return [
    'import { aboutPage } from "../../content/pages/about";',
    "export default function AboutPage() {",
    "  return (",
    '    <div className="page-shell">',
    '      <section className="hero-block container">',
    '        <p className="eyebrow">About</p>',
    '        <h1>{aboutPage.title}</h1>',
    '        <p className="lead">{aboutPage.lead}</p>',
    '        <article className="section-card">',
    '          <h2>Use this space to explain the company and product relationship clearly.</h2>',
    '          <p>The about route should reinforce trust, explain the team perspective, and support conversion without replacing the homepage value proposition.</p>',
    '        </article>',
    '      </section>',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bTrustSignalsTs(): string {
  return buildConstExport("trustSignals", getB2bContent("Shpitto Baseline").trustSignals);
}

function buildB2bProductGroupsTs(): string {
  return buildConstExport("productGroups", getB2bContent("Shpitto Baseline").productGroups);
}

function buildB2bCaseStudiesTs(): string {
  return buildConstExport("caseStudies", getB2bContent("Shpitto Baseline").caseStudies);
}

function buildB2bFaqTs(): string {
  return buildConstExport("faq", getB2bContent("Shpitto Baseline").faq);
}

function buildB2bCapabilitiesTs(): string {
  return buildConstExport("capabilities", getB2bContent("Shpitto Baseline").capabilities);
}

function buildB2bHomeContentTs(companyName: string): string {
  return buildConstExport("homePage", getB2bContent(companyName).homePage);
}

function buildB2bProductsContentTs(): string {
  return buildConstExport("productsPage", getB2bContent("Shpitto Baseline").productsPage);
}

function buildB2bContactContentTs(): string {
  return buildConstExport("contactPage", getB2bContent("Shpitto Baseline").contactPage);
}

function buildB2bSolutionsContentTs(): string {
  return buildConstExport("solutionsPage", getB2bContent("Shpitto Baseline").solutionsPage);
}

function buildB2bCasesContentTs(): string {
  return buildConstExport("casesPage", getB2bContent("Shpitto Baseline").casesPage);
}

function buildB2bAboutContentTs(): string {
  return buildConstExport("aboutPage", getB2bContent("Shpitto Baseline").aboutPage);
}

function buildAiImageToolFeaturesTs(): string {
  return [
    'import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";',
    "",
    "const localizedFeatures = [",
    "  {",
    "    title: createLocalizedValue('Public discovery routes', 'Parcours public de decouverte'),",
    "    body: createLocalizedValue('Keep marketing, pricing, prompt ideation, and SEO pages open while the generation workspace remains product-owned.', 'Gardez marketing, tarifs, ideation de prompts et pages SEO ouverts pendant que l espace de generation reste controle par le produit.'),",
    "  },",
    "  {",
    "    title: createLocalizedValue('Gated generation workspace', 'Espace de generation protege'),",
    "    body: createLocalizedValue('Move authenticated users into a dedicated app shell with generation, history, billing, and CMS entry kept separate from promotional copy.', 'Faites entrer les utilisateurs authentifies dans une coque applicative dediee avec generation, historique, facturation et entree CMS separes du discours promotionnel.'),",
    "  },",
    "  {",
    "    title: createLocalizedValue('Template-ready operations', 'Operations pretes pour le template'),",
    "    body: createLocalizedValue('This baseline is prepared for payload-backed settings, provider configs, publishing flows, and skill-driven website edits.', 'Cette base est preparee pour des reglages pilotes par Payload, des configurations fournisseurs, des flux de publication et des editions de site pilotees par skill.'),",
    "  },",
    "] as const;",
    "",
    "export async function getFeatures() {",
    "  const locale = await getCurrentLocale();",
    "  return localizedFeatures.map((feature) => ({",
    "    title: resolveLocalizedValue(feature.title, locale),",
    "    body: resolveLocalizedValue(feature.body, locale),",
    "  }));",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolWorkflowTs(): string {
  return [
    'import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";',
    "",
    "const localizedWorkflowCards = [",
    "  {",
    "    title: createLocalizedValue('Pick a prompt path', 'Choisir un chemin de prompt'),",
    "    body: createLocalizedValue('Start from the public prompt generator or jump directly into the authenticated generation workspace.', 'Commencez par le generateur de prompts public ou entrez directement dans l espace de generation authentifie.'),",
    "  },",
    "  {",
    "    title: createLocalizedValue('Generate and review', 'Generer et verifier'),",
    "    body: createLocalizedValue('Run model presets, inspect outputs, and keep replayable history tied to the app shell.', 'Lancez des presets de modele, inspectez les resultats et conservez un historique rejouable lie a la coque applicative.'),",
    "  },",
    "  {",
    "    title: createLocalizedValue('Publish and operate', 'Publier et operer'),",
    "    body: createLocalizedValue('Manage billing, low-frequency CMS controls, SEO, and deployment readiness from the same template foundation.', 'Gerez facturation, controles CMS basse frequence, SEO et capacite de deploiement depuis la meme base de template.'),",
    "  },",
    "] as const;",
    "",
    "export async function getWorkflowCards() {",
    "  const locale = await getCurrentLocale();",
    "  return localizedWorkflowCards.map((item) => ({",
    "    title: resolveLocalizedValue(item.title, locale),",
    "    body: resolveLocalizedValue(item.body, locale),",
    "  }));",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolExamplesTs(): string {
  return [
    'import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";',
    "",
    "const localizedExamples = [",
    "  {",
    "    title: createLocalizedValue('Editorial portrait workflow', 'Workflow portrait editorial'),",
    "    body: createLocalizedValue('Prompt-led portrait generation with replay history and workspace continuity.', 'Generation de portrait pilotee par prompt avec historique rejouable et continuite de l espace de travail.'),",
    "  },",
    "  {",
    "    title: createLocalizedValue('Product render workflow', 'Workflow rendu produit'),",
    "    body: createLocalizedValue('Structured product visuals staged through the generator, pricing, and export surfaces.', 'Visuels produit structures, passes par le generateur, les surfaces tarifaires et l export.'),",
    "  },",
    "  {",
    "    title: createLocalizedValue('Campaign key visual workflow', 'Workflow visuel cle de campagne'),",
    "    body: createLocalizedValue('Public discovery routes lead into authenticated production for repeatable campaign imagery.', 'Les routes publiques de decouverte mènent vers une production authentifiee pour des visuels de campagne repetables.'),",
    "  },",
    "] as const;",
    "",
    "export async function getExamples() {",
    "  const locale = await getCurrentLocale();",
    "  return localizedExamples.map((item) => ({",
    "    title: resolveLocalizedValue(item.title, locale),",
    "    body: resolveLocalizedValue(item.body, locale),",
    "  }));",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolPlansTs(): string {
  return [
    'import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";',
    "",
    "const localizedPlans = [",
    "  {",
    "    name: createLocalizedValue('Free', 'Gratuit'),",
    "    price: '$0',",
    "    interval: createLocalizedValue('/forever', '/a vie'),",
    "    summary: createLocalizedValue('Public entry point with free generation framing, basic model access, and history visibility.', 'Point d entree public avec cadre gratuit, acces modele basique et visibilite sur l historique.'),",
    "  },",
    "  {",
    "    name: 'Pro',",
    "    price: '$15',",
    "    interval: '/mo',",
    "    summary: createLocalizedValue('For repeat creators who need higher quality runs, reusable prompt workflows, and cleaner export paths.', 'Pour les createurs reguliers qui ont besoin de rendus de meilleure qualite, de workflows de prompts reutilisables et d exports plus propres.'),",
    "  },",
    "  {",
    "    name: createLocalizedValue('Business', 'Business'),",
    "    price: '$30',",
    "    interval: '/mo',",
    "    summary: createLocalizedValue('For teams that need stronger throughput, history reuse, and product-level publishing extensions.', 'Pour les equipes qui ont besoin d un debit plus eleve, de reutilisation d historique et d extensions de publication au niveau produit.'),",
    "  },",
    "] as const;",
    "",
    "export async function getPlans() {",
    "  const locale = await getCurrentLocale();",
    "  return localizedPlans.map((plan) => ({",
    "    name: resolveLocalizedValue(plan.name, locale),",
    "    price: plan.price,",
    "    interval: resolveLocalizedValue(plan.interval, locale),",
    "    summary: resolveLocalizedValue(plan.summary, locale),",
    "  }));",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolFaqTs(): string {
  return [
    'import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";',
    "",
    "const localizedFaq = [",
    "  {",
    "    question: createLocalizedValue('Is this only a landing page?', 'Est-ce seulement une landing page ?'),",
    "    answer: createLocalizedValue('No. The baseline includes a public shell, an authenticated app surface, billing entry, history, and a CMS entry route.', 'Non. La base inclut une coque publique, une surface applicative authentifiee, un point d entree de facturation, l historique et une route d entree CMS.'),",
    "  },",
    "  {",
    "    question: createLocalizedValue('Can this connect to real providers?', 'Peut-on connecter de vrais fournisseurs ?'),",
    "    answer: createLocalizedValue('Yes. The template is prepared for provider-backed model execution, CMS configuration, and deployment workflows.', 'Oui. Le template est prepare pour une execution reelle des modeles, une configuration CMS et des workflows de deploiement.'),",
    "  },",
    "  {",
    "    question: createLocalizedValue('Can skills change theme, layout, and pages?', 'Les skills peuvent-ils changer le theme, la mise en page et les pages ?'),",
    "    answer: createLocalizedValue('Yes. The template is intended as a skill-driven baseline for theme, shell, route, content, SEO, and publishing changes.', 'Oui. Le template est pense comme une base pilotee par skills pour modifier theme, coque, routes, contenu, SEO et publication.'),",
    "  },",
    "] as const;",
    "",
    "export async function getFaq() {",
    "  const locale = await getCurrentLocale();",
    "  return localizedFaq.map((item) => ({",
    "    question: resolveLocalizedValue(item.question, locale),",
    "    answer: resolveLocalizedValue(item.answer, locale),",
    "  }));",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolHomeContentTs(productName: string): string {
  const safeProductName = escapeForTs(productName);
  return [
    'import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";',
    "",
    "const localizedHomePage = {",
    `  eyebrow: createLocalizedValue('FLUX.1 image generation', 'Generation d images FLUX.1'),`,
    `  title: createLocalizedValue('Free FLUX.1 image generation in ${safeProductName}, with a real product shell instead of a marketing-only starter.', 'Generation d images FLUX.1 gratuite dans ${safeProductName}, avec une vraie coque produit plutot qu un simple starter marketing.'),`,
    "  lead: createLocalizedValue('This baseline follows the fluxkreafree shape: public discovery pages, a prompt generator, a gated generation workspace, replayable history, and product-owned app routes.', 'Cette base suit la structure fluxkreafree : pages publiques de decouverte, generateur de prompts, espace de generation protege, historique rejouable et routes applicatives pilotees par le produit.'),",
    "  primaryCta: createLocalizedValue('Start generating', 'Commencer a generer'),",
    "  secondaryCta: createLocalizedValue('Prompt generator', 'Generateur de prompts'),",
    "  signInCta: createLocalizedValue('Sign in to generate', 'Se connecter pour generer'),",
    "  pricingCta: createLocalizedValue('Pricing', 'Tarifs'),",
    "} as const;",
    "",
    "export async function getHomePage() {",
    "  const locale = await getCurrentLocale();",
    "  return {",
    "    eyebrow: resolveLocalizedValue(localizedHomePage.eyebrow, locale),",
    "    title: resolveLocalizedValue(localizedHomePage.title, locale),",
    "    lead: resolveLocalizedValue(localizedHomePage.lead, locale),",
    "    primaryCta: resolveLocalizedValue(localizedHomePage.primaryCta, locale),",
    "    secondaryCta: resolveLocalizedValue(localizedHomePage.secondaryCta, locale),",
    "    signInCta: resolveLocalizedValue(localizedHomePage.signInCta, locale),",
    "    pricingCta: resolveLocalizedValue(localizedHomePage.pricingCta, locale),",
    "  };",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolDashboardContentTs(): string {
  return buildConstExport("dashboardPage", getAiImageToolContent("Shpitto Baseline").dashboardPage);
}

function buildAiImageToolAppContentTs(): string {
  return [
    'import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";',
    "",
    "const localizedAppPage = {",
    "  title: createLocalizedValue('Use the product hub to jump into generation, history, gift codes, or billing.', 'Utilisez le hub produit pour aller vers generation, historique, codes cadeau ou facturation.'),",
    "  lead: createLocalizedValue('The app shell should act like a real product dashboard, not just a second marketing page.', 'La coque applicative doit se comporter comme un vrai tableau de bord produit, pas comme une seconde page marketing.'),",
    "} as const;",
    "",
    "export async function getAppPage() {",
    "  const locale = await getCurrentLocale();",
    "  return {",
    "    title: resolveLocalizedValue(localizedAppPage.title, locale),",
    "    lead: resolveLocalizedValue(localizedAppPage.lead, locale),",
    "  };",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolGenerateContentTs(): string {
  return [
    'import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";',
    "",
    "const localizedGeneratePage = {",
    "  title: createLocalizedValue('Generate with prompt input, model selection, private mode, uploads, and replayable output controls.', 'Generez avec saisie de prompt, selection de modele, mode prive, uploads et controles de sortie rejouables.'),",
    "  lead: createLocalizedValue('This route mirrors the upstream generator more closely: prompt entry, model picker, aspect ratio, privacy toggle, upload slot, and a live result stack.', 'Cette route se rapproche du generateur amont : saisie du prompt, choix du modele, ratio, option de confidentialite, zone d upload et pile de resultats en direct.'),",
    "} as const;",
    "",
    "export async function getGeneratePage() {",
    "  const locale = await getCurrentLocale();",
    "  return {",
    "    title: resolveLocalizedValue(localizedGeneratePage.title, locale),",
    "    lead: resolveLocalizedValue(localizedGeneratePage.lead, locale),",
    "  };",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolPromptGeneratorContentTs(): string {
  return buildConstExport("promptGeneratorPage", getAiImageToolContent("Shpitto Baseline").promptGeneratorPage);
}

function buildAiImageToolFluxAiContentTs(): string {
  return buildConstExport("fluxAiPage", getAiImageToolContent("Shpitto Baseline").fluxAiPage);
}

function buildAiImageToolFluxSchnellContentTs(): string {
  return buildConstExport("fluxSchnellPage", getAiImageToolContent("Shpitto Baseline").fluxSchnellPage);
}

function buildAiImageToolKreaAlternativeContentTs(): string {
  return buildConstExport("kreaAlternativePage", getAiImageToolContent("Shpitto Baseline").kreaAlternativePage);
}

function buildAiImageToolBlogContentTs(): string {
  return buildConstExport("blogPage", getAiImageToolContent("Shpitto Baseline").blogPage);
}

function buildAiImageToolHistoryContentTs(): string {
  return [
    'import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";',
    "",
    "const localizedHistoryPage = {",
    "  title: createLocalizedValue('Review generated images, replay prompts, and reopen prior work without going back through marketing copy.', 'Consultez les images generees, rejouez les prompts et rouvrez le travail precedent sans repasser par le marketing.'),",
    "  lead: createLocalizedValue('This route is product-owned. It should help users inspect earlier outputs, compare variants, and reopen work without routing them back through marketing copy.', 'Cette route appartient au produit. Elle doit aider les utilisateurs a inspecter les sorties precedentes, comparer les variantes et rouvrir le travail sans les renvoyer vers le marketing.'),",
    "} as const;",
    "",
    "export async function getHistoryPage() {",
    "  const locale = await getCurrentLocale();",
    "  return {",
    "    title: resolveLocalizedValue(localizedHistoryPage.title, locale),",
    "    lead: resolveLocalizedValue(localizedHistoryPage.lead, locale),",
    "  };",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolGiftCodeContentTs(): string {
  return [
    'import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";',
    "",
    "const localizedGiftCodePage = {",
    "  title: createLocalizedValue('Redeem a gift code or promo code without leaving the app shell.', 'Activez un code cadeau ou promotionnel sans quitter la coque applicative.'),",
    "  lead: createLocalizedValue('This route belongs to the product dashboard and keeps reward redemption separate from public marketing pages.', 'Cette route appartient au tableau de bord produit et garde l activation des recompenses separee des pages marketing publiques.'),",
    "} as const;",
    "",
    "export async function getGiftCodePage() {",
    "  const locale = await getCurrentLocale();",
    "  return {",
    "    title: resolveLocalizedValue(localizedGiftCodePage.title, locale),",
    "    lead: resolveLocalizedValue(localizedGiftCodePage.lead, locale),",
    "  };",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolOrderContentTs(): string {
  return [
    'import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";',
    "",
    "const localizedOrderPage = {",
    "  title: createLocalizedValue('Review product credits and order state inside the app shell.', 'Consultez les credits produit et l etat des commandes dans la coque applicative.'),",
    "  lead: createLocalizedValue('Order and billing actions remain app-owned surfaces so the user can manage credits without going through the marketing site.', 'Les actions de commande et de facturation restent des surfaces produit afin que l utilisateur gere ses credits sans passer par le site marketing.'),",
    "} as const;",
    "",
    "export async function getOrderPage() {",
    "  const locale = await getCurrentLocale();",
    "  return {",
    "    title: resolveLocalizedValue(localizedOrderPage.title, locale),",
    "    lead: resolveLocalizedValue(localizedOrderPage.lead, locale),",
    "  };",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolSignInContentTs(): string {
  return [
    'import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";',
    "",
    "const localizedSignInPage = {",
    "  title: createLocalizedValue('Sign in to enter the product workspace.', 'Connectez-vous pour entrer dans l espace produit.'),",
    "  lead: createLocalizedValue('Public discovery stays open, while generation, billing, CMS, and user history stay gated behind product-owned authentication.', 'La decouverte publique reste ouverte, tandis que generation, facturation, CMS et historique utilisateur restent derriere une authentification controlee par le produit.'),",
    "} as const;",
    "",
    "export async function getSignInPage() {",
    "  const locale = await getCurrentLocale();",
    "  return {",
    "    title: resolveLocalizedValue(localizedSignInPage.title, locale),",
    "    lead: resolveLocalizedValue(localizedSignInPage.lead, locale),",
    "  };",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolSignUpContentTs(): string {
  return buildConstExport("signUpPage", getAiImageToolContent("Shpitto Baseline").signUpPage);
}

function buildAiImageToolPricingContentTs(): string {
  return [
    'import { createLocalizedValue, getCurrentLocale, resolveLocalizedValue } from "../../lib/i18n";',
    "",
    "const localizedPricingPage = {",
    "  title: createLocalizedValue('Pricing that supports product usage, not just page decoration.', 'Une tarification qui soutient l usage produit, pas seulement l habillage de page.'),",
    "  lead: createLocalizedValue('Use pricing as part of the product system: credits, plans, and order handling should align with the authenticated app shell and CMS operations.', 'Utilisez la tarification comme partie du systeme produit : credits, plans et gestion des commandes doivent s aligner avec la coque applicative authentifiee et les operations CMS.'),",
    "} as const;",
    "",
    "export async function getPricingPage() {",
    "  const locale = await getCurrentLocale();",
    "  return {",
    "    title: resolveLocalizedValue(localizedPricingPage.title, locale),",
    "    lead: resolveLocalizedValue(localizedPricingPage.lead, locale),",
    "  };",
    "}",
    "",
  ].join("\n");
}

function buildB2bEnterpriseHeroComponent(): string {
  return [
    'import { homePage } from "../../../content/pages/home";',
    'import { trustSignals } from "../../../content/collections/trust-signals";',
    "",
    "export function EnterpriseHero() {",
    "  return (",
    '    <section className="hero-block container">',
    '      <p className="eyebrow">{homePage.eyebrow}</p>',
    '      <h1>{homePage.title}</h1>',
    '      <p className="lead">{homePage.lead}</p>',
    '      <div className="proof-strip">',
    '        {trustSignals.map((item) => (',
    '          <span key={item} className="proof-pill">{item}</span>',
    '        ))}',
    '      </div>',
    '      <div className="hero-actions">',
    '        <a href="/contact" className="button-primary">{homePage.primaryCta}</a>',
    '        <a href="/products" className="button-secondary">{homePage.secondaryCta}</a>',
    '      </div>',
    '    </section>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bProductFamilyGridComponent(): string {
  return [
    'import { productGroups } from "../../../content/collections/product-groups";',
    "",
    "export function ProductFamilyGrid() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="card-grid">',
    '        {productGroups.map((group) => (',
    '          <article key={group.title} className="section-card">',
    '            <h2>{group.title}</h2>',
    '            <p>{group.body}</p>',
    '          </article>',
    '        ))}',
    '      </div>',
    '    </section>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bCapabilityBandComponent(): string {
  return [
    "export function CapabilityBand() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <article className="section-card">',
    '        <h2>Show buyers how your team supports sourcing, evaluation, and delivery.</h2>',
    '        <p>Use this section to explain operational capability, quality discipline, customization posture, and response model without turning the site into a generic brochure.</p>',
    '      </article>',
    '    </section>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bSolutionProcessComponent(): string {
  return [
    'import { capabilities } from "../../../content/collections/capabilities";',
    'import { solutionsPage } from "../../../content/pages/custom-solutions";',
    "",
    "export function SolutionProcess() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <article className="section-card">',
    '        <h2>{solutionsPage.title}</h2>',
    '        <p>{solutionsPage.lead}</p>',
    '      </article>',
    '      <div className="card-grid">',
    '        {capabilities.map((item) => (',
    '          <article key={item.title} className="section-card">',
    '            <h2>{item.title}</h2>',
    '            <p>{item.body}</p>',
    '          </article>',
    '        ))}',
    '      </div>',
    '    </section>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bCasesPageContentComponent(): string {
  return [
    'import { caseStudies } from "../../../content/collections/case-studies";',
    'import { casesPage } from "../../../content/pages/cases";',
    "",
    "export function CasesLedger() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <article className="section-card">',
    '        <h2>{casesPage.title}</h2>',
    '        <p>{casesPage.lead}</p>',
    '      </article>',
    '      <div className="card-grid">',
    '        {caseStudies.map((item) => (',
    '          <article key={item.title} className="section-card">',
    '            <h2>{item.title}</h2>',
    '            <p>{item.body}</p>',
    '          </article>',
    '        ))}',
    '      </div>',
    '    </section>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bCompanyProfileIntroComponent(): string {
  return [
    'import { aboutPage } from "../../../content/pages/about";',
    'import { trustSignals } from "../../../content/collections/trust-signals";',
    "",
    "export function CompanyProfileIntro() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <article className="section-card">',
    '        <h2>{aboutPage.title}</h2>',
    '        <p>{aboutPage.lead}</p>',
    '      </article>',
    '      <div className="proof-strip">',
    '        {trustSignals.map((item) => (',
    '          <span key={item} className="proof-pill">{item}</span>',
    '        ))}',
    '      </div>',
    '    </section>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolGlobalsCss(): string {
  const blueprint = getAiImageToolTemplateBlueprint();
  return [
    buildTemplateCssVariables(blueprint.designTokens),
    `:root {`,
    `  color-scheme: light;`,
    `  --header-height: 4rem;`,
    `  --ui-background: 255 255 255;`,
    `  --ui-foreground: var(--color-gray-700);`,
    `  --text: hsl(var(--foreground));`,
    `  --muted: hsl(var(--muted-foreground));`,
    `  --surface-soft: rgba(255, 255, 255, 0.82);`,
    `  --surface-border: rgba(15, 23, 42, 0.08);`,
    `  --accent-glow: rgba(156, 64, 255, 0.16);`,
    `}`,
    "",
    buildStylesUtilitiesCss(),
    "* { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; }",
    "body { min-height: 100vh; font-family: var(--font-sans), Inter, system-ui, sans-serif; color: hsl(var(--foreground)); background: radial-gradient(circle at top, rgba(156, 64, 255, 0.1), transparent 22%), radial-gradient(circle at 16% 14%, rgba(255, 170, 64, 0.1), transparent 18%), linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.98) 62%, rgba(255,255,255,0.98) 100%), hsl(var(--background)); font-feature-settings: 'rlig' 1, 'calt' 1; }",
    "a { color: inherit; text-decoration: none; }",
    ".site-frame { min-height: 100vh; }",
    ".site-header { position: sticky; top: 0; z-index: 40; width: 100%; display: flex; justify-content: center; border-bottom: 1px solid hsl(var(--border)); background: rgba(255, 255, 255, 0.68); backdrop-filter: blur(20px); }",
    ".site-header__inner, .site-footer { width: min(100%, 1240px); margin: 0 auto; display: flex; gap: 18px; align-items: center; justify-content: space-between; padding: 14px 24px; }",
    ".site-header__identity, .site-header__controls, .header-actions { display: flex; align-items: center; gap: 14px; }",
    ".brand-mark { font-family: var(--font-urban), var(--font-sans), sans-serif; font-size: 1.02rem; font-weight: 800; letter-spacing: -0.025em; }",
    ".shell-badge { border-radius: 999px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.9); padding: 6px 10px; color: var(--muted); font-size: 0.72rem; }",
    ".site-nav { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; }",
    ".nav-link { color: hsl(var(--foreground) / 0.6); font-size: 0.9rem; font-weight: 500; transition: color 200ms ease; }",
    ".nav-link:hover, .nav-link--active { color: hsl(var(--foreground)); }",
    ".header-action { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.94); padding: 0 14px; font-size: 0.9rem; font-weight: 500; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04); }",
    ".header-action--active { box-shadow: 0 0 0 1px rgba(156, 64, 255, 0.14) inset; }",
    ".page-shell { display: grid; gap: 56px; padding: 0 0 72px; }",
    ".hero-block { padding: 64px 0 4px; }",
    ".eyebrow { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 16px; padding: 8px 14px; border-radius: 999px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.92); letter-spacing: 0.02em; font-size: 0.82rem; color: var(--muted); }",
    ".eyebrow--gradient { box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08); }",
    ".eyebrow__emoji { font-size: 0.95rem; }",
    ".text-gradient_indigo-purple { background: linear-gradient(90deg, #ffaa40 0%, #9c40ff 55%, #ffaa40 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }",
    ".hero-title { margin: 0 0 18px; max-width: 12ch; text-wrap: balance; font-family: var(--font-urban), var(--font-sans), sans-serif; font-size: clamp(3.2rem, 7vw, 5.1rem); font-weight: 800; line-height: 0.92; letter-spacing: -0.055em; }",
    ".lead { margin: 0; max-width: 64ch; color: var(--muted); font-size: 1.06rem; line-height: 1.75; }",
    ".hero-actions { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 24px; }",
    ".hero-copy { display: grid; align-content: start; }",
    ".hero-note { margin: 14px 0 0; color: hsl(var(--foreground) / 0.68); font-size: 0.92rem; }",
    ".button-primary, .button-secondary { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 20px; border-radius: 999px; font-weight: 600; transition: transform 200ms ease, box-shadow 200ms ease, background-color 200ms ease; }",
    ".button-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); box-shadow: 0 14px 30px rgba(15, 23, 42, 0.12); }",
    ".button-secondary { border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.92); color: var(--text); }",
    ".button-primary:hover, .button-secondary:hover { transform: translateY(-1px); }",
    ".button-primary:active, .button-secondary:active { transform: translateY(0); }",
    ".button-primary--wide, .button-secondary--wide { width: 100%; }",
    ".button-google { gap: 10px; }",
    ".button-google__icon { display: inline-flex; width: 18px; height: 18px; border-radius: 999px; background: rgba(255,255,255,0.24); align-items: center; justify-content: center; font-size: 0.82rem; }",
    ".section-card { padding: 28px; border-radius: 24px; background: rgba(255, 255, 255, 0.92); border: 1px solid hsl(var(--border)); box-shadow: 0 14px 36px rgba(15, 23, 42, 0.06); }",
    ".section-card h2 { margin: 0 0 10px; font-size: 1.12rem; }",
    ".section-card p { margin: 0; color: var(--muted); line-height: 1.72; }",
    ".feature-card, .pricing-card, .faq-card { position: relative; overflow: hidden; }",
    ".feature-card::before, .pricing-card::before, .faq-card::before { content: ''; position: absolute; inset: -30% auto auto 14%; width: 180px; height: 180px; border-radius: 999px; background: linear-gradient(180deg, rgba(156, 64, 255, 0.22), rgba(255, 255, 255, 0)); filter: blur(18px); opacity: 0.6; pointer-events: none; }",
    ".hero-grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.95fr); gap: 40px; align-items: center; }",
    ".hero-preview { min-height: 480px; border-radius: 30px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.92); box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08); padding: 20px; display: grid; gap: 14px; }",
    ".hero-preview-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 0.88rem; }",
    ".checkerboard { background-image: linear-gradient(45deg, #f0f0f0 25%, transparent 0, transparent 75%, #f0f0f0 0, #f0f0f0), linear-gradient(45deg, #f0f0f0 25%, #fff 0, #fff 75%, #f0f0f0 0, #f0f0f0); background-size: 20px 20px; background-position: 0 0, 10px 10px; }",
    ".apple-tag { backdrop-filter: blur(8px); background-color: rgba(17, 24, 39, 0.58); box-shadow: 0 8px 16px rgba(0,0,0,0.12); color: white; overflow: hidden; position: relative; }",
    ".hero-preview-stage { position: relative; min-height: 308px; overflow: hidden; border-radius: 24px; border: 1px solid hsl(var(--border)); padding: 14px; }",
    ".hero-preview-stage__art { position: absolute; inset: 14px; border-radius: 18px; background: radial-gradient(circle at top, rgba(255,170,64,0.28), transparent 30%), linear-gradient(135deg, rgba(99,102,241,0.88), rgba(168,85,247,0.76)); }",
    ".hero-preview-stage__art::after { content: ''; position: absolute; inset: 12%; border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,0.32), rgba(255,255,255,0)); mix-blend-mode: screen; }",
    ".hero-preview-stage__caption { position: absolute; left: 20px; right: 20px; bottom: 18px; display: inline-flex; width: fit-content; max-width: calc(100% - 40px); border-radius: 12px; padding: 8px 12px; font-size: 0.86rem; line-height: 1.45; }",
    ".hero-preview-gallery { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }",
    ".preview-thumb { position: relative; min-height: 88px; overflow: hidden; border-radius: 18px; border: 1px solid hsl(var(--border)); background: linear-gradient(180deg, rgba(255,255,255,0.88), rgba(248,250,252,0.94)); }",
    ".preview-thumb::before { content: ''; position: absolute; inset: 10px; border-radius: 14px; background: linear-gradient(135deg, rgba(255,170,64,0.22), rgba(156,64,255,0.24)); }",
    ".preview-thumb .apple-tag { position: absolute; left: 10px; right: 10px; bottom: 10px; border-radius: 10px; padding: 6px 8px; font-size: 0.72rem; }",
    ".stats-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }",
    ".stat-card { padding: 18px 20px; border-radius: 20px; background: rgba(255,255,255,0.96); border: 1px solid hsl(var(--border)); box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04); }",
    ".stat-card strong { display: block; font-size: 1.4rem; color: var(--text); }",
    ".feature-band { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }",
    ".feature-band .section-card { min-height: 100%; }",
    ".workflow-shell { display: grid; gap: 22px; }",
    ".workflow-shell__body { display: grid; grid-template-columns: minmax(260px, 0.88fr) minmax(0, 1.12fr); gap: 22px; align-items: stretch; }",
    ".workflow-shell__visual { min-height: 280px; border-radius: 24px; border: 1px solid hsl(var(--border)); position: relative; overflow: hidden; }",
    ".workflow-shell__visual::before { content: ''; position: absolute; inset: 16px; border-radius: 18px; background: linear-gradient(135deg, rgba(255,170,64,0.18), rgba(156,64,255,0.24)); }",
    ".workflow-shell__visual::after { content: ''; position: absolute; inset: auto 20px 20px 20px; height: 48px; border-radius: 12px; background: rgba(17,24,39,0.58); box-shadow: 0 12px 24px rgba(0,0,0,0.12); }",
    ".workflow-list { display: grid; gap: 12px; }",
    ".workflow-item { border-radius: 18px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.84); padding: 18px 20px; }",
    ".tool-panel-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.85fr); gap: 18px; }",
    ".app-shell { display: grid; gap: 20px; }",
    ".app-shell__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 4px 2px; }",
    ".app-shell__title { display: grid; gap: 6px; }",
    ".app-shell__title h2, .app-shell__title h1 { margin: 0; font-family: var(--font-urban), var(--font-sans), sans-serif; font-size: clamp(2rem, 3vw, 2.7rem); letter-spacing: -0.04em; line-height: 1.02; }",
    ".app-shell__title p { margin: 0; max-width: 62ch; color: var(--muted); }",
    ".dashboard-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }",
    ".dashboard-kpi { border-radius: 18px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.92); padding: 16px 18px; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04); }",
    ".dashboard-kpi strong { display: block; font-size: 1.25rem; margin-bottom: 4px; }",
    ".dashboard-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr); gap: 18px; align-items: start; }",
    ".dashboard-grid--compact { grid-template-columns: minmax(0, 1fr) minmax(260px, 0.8fr); }",
    ".dashboard-stack { display: grid; gap: 18px; }",
    ".dashboard-card { position: relative; overflow: hidden; border-radius: 22px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.94); box-shadow: 0 14px 34px rgba(15, 23, 42, 0.05); padding: 22px; }",
    ".dashboard-card::before { content: ''; position: absolute; inset: -32% auto auto 16%; width: 170px; height: 170px; border-radius: 999px; background: linear-gradient(180deg, rgba(156,64,255,0.16), rgba(255,255,255,0)); filter: blur(16px); opacity: 0.7; pointer-events: none; }",
    ".dashboard-card h2, .dashboard-card h3 { margin: 0 0 10px; }",
    ".dashboard-card p { margin: 0; color: var(--muted); line-height: 1.7; }",
    ".dashboard-card__footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 18px; }",
    ".dashboard-card__meta { color: var(--muted); font-size: 0.88rem; }",
    ".dashboard-list { display: grid; gap: 12px; }",
    ".dashboard-list__item { border-radius: 18px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.9); padding: 16px 18px; }",
    ".cms-shell { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 22px; align-items: start; }",
    ".cms-sidebar { position: sticky; top: 92px; display: grid; gap: 18px; padding: 18px; border: 1px solid hsl(var(--border)); border-radius: 22px; background: rgba(255,255,255,0.84); box-shadow: 0 14px 34px rgba(15,23,42,0.05); }",
    ".cms-sidebar__brand, .cms-sidebar__footer { display: grid; gap: 8px; }",
    ".cms-sidebar__footer { border-top: 1px solid hsl(var(--border)); padding-top: 16px; }",
    ".cms-sidebar__footer a { color: hsl(var(--foreground) / 0.68); font-size: 0.88rem; }",
    ".cms-nav { display: grid; gap: 6px; }",
    ".cms-nav__link { display: flex; min-height: 40px; align-items: center; border-radius: 12px; padding: 0 12px; color: hsl(var(--foreground) / 0.64); font-weight: 600; }",
    ".cms-nav__link:hover, .cms-nav__link--active { background: rgba(156,64,255,0.09); color: var(--text); }",
    ".cms-main { display: grid; gap: 20px; min-width: 0; }",
    ".cms-source { display: inline-flex; width: fit-content; align-items: center; border: 1px solid hsl(var(--border)); border-radius: 999px; padding: 6px 10px; color: var(--muted); font-size: 0.76rem; font-weight: 600; }",
    ".cms-source--large { margin-top: 4px; }",
    ".cms-kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }",
    ".cms-kpi { display: grid; gap: 5px; padding: 16px 18px; border: 1px solid hsl(var(--border)); border-radius: 18px; background: rgba(255,255,255,0.92); }",
    ".cms-kpi strong { font-size: 1.45rem; }",
    ".cms-kpi span { color: var(--muted); font-size: 0.86rem; line-height: 1.45; }",
    ".cms-content-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }",
    ".cms-panel { display: grid; gap: 14px; padding: 22px; border: 1px solid hsl(var(--border)); border-radius: 22px; background: rgba(255,255,255,0.94); box-shadow: 0 14px 34px rgba(15,23,42,0.05); }",
    ".cms-panel h2 { margin: 0; }",
    ".cms-panel p { margin: 0; color: var(--muted); line-height: 1.65; }",
    ".cms-panel__header, .cms-toolbar, .cms-project-card__top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }",
    ".cms-panel__header h2 { margin: 0; }",
    ".cms-list { display: grid; gap: 8px; }",
    ".cms-list__row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0; border-top: 1px solid hsl(var(--border)); }",
    ".cms-list__row span:first-child { display: grid; gap: 4px; min-width: 0; }",
    ".cms-list__row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".cms-list__row small, .cms-table__row small { color: var(--muted); }",
    ".cms-status { display: inline-flex; width: fit-content; border-radius: 999px; padding: 5px 9px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }",
    ".cms-status--processing { background: rgba(59,130,246,0.12); color: #2563eb; }",
    ".cms-status--needs-attention, .cms-status--review { background: rgba(245,158,11,0.16); color: #b45309; }",
    ".cms-status--ready, .cms-status--approved { background: rgba(16,185,129,0.14); color: #047857; }",
    ".cms-action-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }",
    ".cms-action-card { display: grid; gap: 7px; padding: 18px; border: 1px solid hsl(var(--border)); border-radius: 18px; background: rgba(255,255,255,0.9); }",
    ".cms-action-card span { color: var(--muted); line-height: 1.55; font-size: 0.9rem; }",
    ".cms-action-card--accent { background: linear-gradient(135deg, rgba(255,170,64,0.12), rgba(156,64,255,0.12)); }",
    ".cms-table { overflow: hidden; border: 1px solid hsl(var(--border)); border-radius: 18px; background: rgba(255,255,255,0.92); }",
    ".cms-table__head, .cms-table__row { display: grid; grid-template-columns: minmax(180px, 1.5fr) minmax(120px, 1fr) minmax(100px, 0.8fr) minmax(120px, 0.8fr) minmax(100px, 0.7fr); gap: 14px; align-items: center; padding: 14px 16px; }",
    ".cms-table__head { color: var(--muted); font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; background: rgba(15,23,42,0.03); }",
    ".cms-table__row { border-top: 1px solid hsl(var(--border)); color: var(--text); }",
    ".cms-table__row > span:first-child { display: grid; gap: 4px; min-width: 0; }",
    ".cms-project-grid, .cms-settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }",
    ".cms-project-card__stats { display: flex; gap: 18px; color: var(--muted); font-size: 0.88rem; }",
    ".cms-project-card__stats strong { color: var(--text); font-size: 1.1rem; margin-right: 4px; }",
    ".cms-asset-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }",
    ".cms-asset-card { min-width: 0; }",
    ".cms-asset-card small { color: var(--muted); }",
    ".cms-note { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border: 1px solid hsl(var(--border)); border-radius: 16px; background: rgba(15,23,42,0.03); color: var(--muted); font-size: 0.88rem; line-height: 1.55; }",
    ".cms-note strong { color: var(--text); white-space: nowrap; }",
    ".playground-shell { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.92fr); gap: 20px; align-items: start; }",
    ".playground-column { display: grid; gap: 18px; }",
    ".playground-card { position: relative; overflow: hidden; border-radius: 22px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.94); box-shadow: 0 14px 34px rgba(15, 23, 42, 0.05); padding: 22px; }",
    ".playground-card::before { content: ''; position: absolute; inset: -32% auto auto 16%; width: 160px; height: 160px; border-radius: 999px; background: linear-gradient(180deg, rgba(255,170,64,0.12), rgba(255,255,255,0)); filter: blur(16px); opacity: 0.72; pointer-events: none; }",
    ".playground-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }",
    ".playground-toolbar__meta { display: inline-flex; align-items: center; gap: 10px; color: var(--muted); font-size: 0.9rem; }",
    ".playground-toolbar__meta span:first-child { font-weight: 700; color: var(--text); }",
    ".playground-output { display: grid; gap: 14px; }",
    ".playground-status { border-radius: 18px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.88); padding: 16px 18px; }",
    ".playground-status h3 { margin: 0 0 8px; }",
    ".playground-history { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }",
    ".playground-history button { border: 0; background: transparent; padding: 0; }",
    ".auth-shell { display: grid; grid-template-columns: minmax(0, 1.02fr) minmax(300px, 0.98fr); gap: 20px; align-items: stretch; }",
    ".auth-shell__panel { display: grid; gap: 16px; }",
    ".auth-shell__preview { display: grid; gap: 14px; align-content: start; min-height: 100%; }",
    ".auth-shell__preview-visual { position: relative; min-height: 280px; overflow: hidden; border-radius: 22px; border: 1px solid hsl(var(--border)); background: linear-gradient(180deg, rgba(255,255,255,0.88), rgba(248,250,252,0.96)); }",
    ".auth-shell__preview-visual::before { content: ''; position: absolute; inset: 16px; border-radius: 16px; background: radial-gradient(circle at top, rgba(255,170,64,0.22), transparent 28%), linear-gradient(135deg, rgba(99,102,241,0.86), rgba(168,85,247,0.74)); }",
    ".auth-shell__preview-visual::after { content: ''; position: absolute; inset: auto 18px 18px 18px; height: 44px; border-radius: 12px; background: rgba(17,24,39,0.56); box-shadow: 0 12px 24px rgba(0,0,0,0.14); }",
    ".auth-benefit-list { display: grid; gap: 12px; }",
    ".auth-benefit { border-radius: 18px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.88); padding: 16px 18px; }",
    ".auth-benefit h3 { margin: 0 0 8px; font-size: 1rem; }",
    ".control-stack { display: grid; gap: 12px; }",
    ".control-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border-radius: 18px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.88); }",
    ".control-label { font-weight: 600; }",
    ".control-value { color: var(--muted); font-size: 0.95rem; }",
    ".prompt-box { display: grid; gap: 12px; padding: 18px; border-radius: 20px; background: rgba(255,255,255,0.9); border: 1px solid hsl(var(--border)); }",
    ".prompt-box textarea { width: 100%; min-height: 140px; resize: vertical; border: 1px solid hsl(var(--border)); outline: none; border-radius: 16px; padding: 16px; color: var(--text); background: rgba(255,255,255,0.96); font: inherit; }",
    ".token-list { display: flex; flex-wrap: wrap; gap: 10px; }",
    ".token-pill { padding: 8px 12px; border-radius: 999px; background: rgba(15,23,42,0.04); color: var(--muted); font-size: 0.86rem; }",
    ".auth-form { display: grid; gap: 14px; margin-top: 20px; }",
    ".auth-form__actions { display: grid; gap: 12px; }",
    ".auth-field { display: grid; gap: 8px; font-weight: 600; color: var(--text); }",
    ".auth-field input { min-height: 46px; border-radius: 14px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.96); color: var(--text); padding: 0 14px; font: inherit; }",
    ".auth-hint { margin: 0; color: var(--muted); font-size: 0.92rem; line-height: 1.6; }",
    ".auth-error { margin: 0; color: #fca5a5; font-size: 0.92rem; font-weight: 600; }",
    ".preview-frame { min-height: 460px; border-radius: 24px; border: 1px solid hsl(var(--border)); background: rgba(255,255,255,0.92); display: grid; grid-template-rows: auto 1fr auto; gap: 14px; padding: 18px; box-shadow: 0 18px 36px rgba(15,23,42,0.06); }",
    ".preview-stage { min-height: 290px; border-radius: 18px; background: radial-gradient(circle at top, rgba(255,170,64,0.16), transparent 34%), radial-gradient(circle at 80% 30%, rgba(156,64,255,0.18), transparent 22%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%); border: 1px solid hsl(var(--border)); }",
    ".history-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }",
    ".history-card { overflow: hidden; border-radius: 20px; background: rgba(255,255,255,0.94); border: 1px solid hsl(var(--border)); box-shadow: 0 12px 30px rgba(15,23,42,0.05); }",
    ".history-thumb { position: relative; min-height: 180px; background: linear-gradient(135deg, rgba(255,170,64,0.14), rgba(156,64,255,0.18)); }",
    ".history-thumb__tag { position: absolute; left: 12px; right: 12px; bottom: 12px; display: inline-flex; width: fit-content; max-width: calc(100% - 24px); border-radius: 10px; padding: 6px 8px; font-size: 0.74rem; }",
    ".history-meta { display: grid; gap: 8px; padding: 16px; }",
    ".site-footer { width: min(100%, 1240px); margin: 0 auto; color: var(--muted); font-size: 0.95rem; border-top: 1px solid hsl(var(--border)); padding-top: 24px; }",
    ".site-footer__top, .site-footer__bottom { display: flex; gap: 16px; align-items: center; justify-content: space-between; }",
    ".site-footer__brand { display: grid; gap: 6px; }",
    ".site-footer__brand p, .site-footer__copyright { margin: 0; color: var(--muted); }",
    ".footer-link { color: hsl(var(--foreground) / 0.72); font-size: 0.92rem; }",
    ".footer-link:hover { text-decoration: underline; text-underline-offset: 4px; }",
    "@media (max-width: 980px) { .hero-grid, .tool-panel-grid, .workflow-shell__body, .dashboard-grid, .dashboard-grid--compact, .auth-shell, .playground-shell, .cms-shell, .cms-content-grid { grid-template-columns: 1fr; } .feature-band, .stats-grid, .history-grid, .card-grid, .dashboard-kpis, .playground-history, .cms-kpi-grid, .cms-action-grid, .cms-project-grid, .cms-settings-grid, .cms-asset-grid { grid-template-columns: 1fr; } .card-grid > * { grid-column: 1 / -1; } .cms-sidebar { position: static; } .cms-nav { grid-template-columns: repeat(5, minmax(0, 1fr)); } }",
    "@media (max-width: 720px) { .site-header__inner, .site-footer, .site-header__controls, .header-actions, .site-footer__top, .site-footer__bottom { flex-direction: column; align-items: flex-start; } .hero-block { padding-top: 32px; } .hero-preview-gallery { grid-template-columns: 1fr 1fr 1fr; } .hero-title { max-width: none; } .cms-nav { grid-template-columns: 1fr 1fr; } .cms-table { overflow-x: auto; } .cms-table__head, .cms-table__row { min-width: 720px; } }",
    "@media (max-width: 720px) { .site-header__inner, .site-footer, .site-header__controls, .header-actions, .site-footer__top, .site-footer__bottom { flex-direction: column; align-items: flex-start; } .hero-block { padding-top: 32px; } .hero-preview-gallery { grid-template-columns: 1fr 1fr 1fr; } .hero-title { max-width: none; } }",
    "",
  ].join("\n");
}

function buildAiImageToolHeroComponent(): string {
  return [
    'import { SignedIn, SignedOut } from "../../auth/auth-components";',
    'import { getHomePage } from "../../../content/pages/home";',
    "",
    "export async function ToolHero() {",
    "  const homePage = await getHomePage();",
    "  return (",
    '    <section className="hero-block container">',
    '      <div className="hero-grid">',
    '        <div className="hero-copy">',
    '          <p className="eyebrow eyebrow--gradient"><span className="eyebrow__emoji">🎉</span><span className="text-gradient_indigo-purple">{homePage.eyebrow}</span></p>',
    '          <h1 className="hero-title">{homePage.title}</h1>',
    '          <p className="lead">{homePage.lead}</p>',
    '          <div className="hero-actions">',
    '            <SignedIn><a href="/app/generate" className="button-primary">{homePage.primaryCta}</a></SignedIn>',
    '            <SignedOut><a href="/sign-in" className="button-primary">{homePage.signInCta}</a></SignedOut>',
    '            <a href="/flux-prompt-generator" className="button-secondary">{homePage.secondaryCta}</a>',
    '            <a href="/pricing" className="button-secondary">{homePage.pricingCta}</a>',
    '          </div>',
    '          <p className="hero-note">Open-source FLUX.1 image generation with fast login, pricing, and product-owned app routes.</p>',
    '          <div className="stats-grid" style={{ marginTop: "28px" }}>',
    '            <div className="stat-card"><strong>FLUX.1</strong><span className="control-value">{homePage.eyebrow}</span></div>',
    '            <div className="stat-card"><strong>Replay</strong><span className="control-value">{homePage.secondaryCta}</span></div>',
    '            <div className="stat-card"><strong>Free</strong><span className="control-value">{homePage.primaryCta}</span></div>',
    '          </div>',
    '        </div>',
    '        <aside className="hero-preview">',
    '          <div className="hero-preview-bar"><span>{homePage.secondaryCta}</span><span>FLUX.1</span></div>',
    '          <div className="hero-preview-stage checkerboard">',
    '            <div className="hero-preview-stage__art" />',
    '            <span className="hero-preview-stage__caption apple-tag">{homePage.lead}</span>',
    '          </div>',
    '          <div className="hero-preview-gallery">',
    '            <div className="preview-thumb"><span className="apple-tag">{homePage.primaryCta}</span></div>',
    '            <div className="preview-thumb"><span className="apple-tag">{homePage.secondaryCta}</span></div>',
    '            <div className="preview-thumb"><span className="apple-tag">{homePage.eyebrow}</span></div>',
    '          </div>',
    '        </aside>',
    '      </div>',
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolFeatureGridComponent(): string {
  return [
    'import { getFeatures } from "../../../content/collections/features";',
    "",
    "export async function ToolFeatureGrid() {",
    "  const features = await getFeatures();",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="feature-band">',
        '        {features.map((feature) => (',
        '          <article key={feature.title} className="section-card feature-card">',
        '            <h2>{feature.title}</h2>',
        '            <p>{feature.body}</p>',
    '          </article>',
    '        ))}',
    "      </div>",
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolWorkflowComponent(): string {
  return [
    'import { getWorkflowCards } from "../../../content/collections/workflow-cards";',
    "",
    "export async function ToolWorkflow() {",
    "  const workflowCards = await getWorkflowCards();",
    "  return (",
    '    <section className="container section-stack">',
    '      <article className="section-card workflow-shell">',
    '          <p className="eyebrow">{workflowCards[0]?.title || "How it works"}</p>',
    '          <div className="workflow-shell__body">',
    '            <div className="workflow-shell__visual checkerboard" />',
    '            <div className="workflow-list">',
    '            {workflowCards.map((item) => (',
    '              <article key={item.title} className="workflow-item">',
    '              <h2>{item.title}</h2>',
    '              <p>{item.body}</p>',
    '            </article>',
    '          ))}',
    '            </div>',
    '          </div>',
    "      </article>",
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolExamplesComponent(): string {
  return [
    'import { getExamples } from "../../../content/collections/examples";',
    "",
    "export async function ToolExamples() {",
    "  const examples = await getExamples();",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="history-grid">',
        '        {examples.map((item) => (',
    '          <article key={item.title} className="history-card example-card">',
    '            <div className="history-thumb checkerboard"><span className="apple-tag history-thumb__tag">{item.title}</span></div>',
    '            <div className="history-meta">',
    '              <h2>{item.title}</h2>',
    '              <p>{item.body}</p>',
    '            </div>',
    '          </article>',
        '        ))}',
      "      </div>",
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolPricingSectionComponent(): string {
  return [
    'import { getPlans } from "../../../content/collections/plans";',
    "",
    "export async function ToolPricingSection() {",
    "  const plans = await getPlans();",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="card-grid">',
    '        {plans.map((plan) => (',
    '          <article key={plan.name} className="section-card pricing-card">',
    '            <h2>{plan.name}</h2>',
    '            <p>{plan.summary}</p>',
    '            <p><strong>{plan.price}</strong>{plan.interval}</p>',
    '          </article>',
    '        ))}',
    "      </div>",
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolFaqSectionComponent(): string {
  return [
    'import { getFaq } from "../../../content/collections/faq";',
    "",
    "export async function ToolFaqSection() {",
    "  const faq = await getFaq();",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="card-grid">',
    '        {faq.map((item) => (',
    '          <article key={item.question} className="section-card faq-card">',
    '            <h2>{item.question}</h2>',
    '            <p>{item.answer}</p>',
    '          </article>',
    '        ))}',
    "      </div>",
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolAppWorkspaceComponent(): string {
  return [
    '"use client";',
    "",
    'import { useState } from "react";',
    "",
    "type MockHistoryItem = {",
    "  id: string;",
    "  prompt: string;",
    "  status: 'succeeded' | 'failed';",
    "  imageUrl?: string;",
    "  error?: string;",
    "};",
    "",
    "type MockGenerateResponse = {",
    "  ok: boolean;",
    "  result?: { id: string; prompt: string; imageUrl: string; summary: string };",
    "  error?: string;",
    "  historyItem?: MockHistoryItem;",
    "};",
    "",
    "type GenerateConsoleProps = {",
    "  title: string;",
    "  lead: string;",
    "};",
    "",
    "const controls = [",
    "  { label: 'Model', value: 'Flux / SDXL / Provider preset' },",
    "  { label: 'Aspect ratio', value: '1:1, 3:4, 16:9' },",
    "  { label: 'Quality', value: 'Draft, Standard, High' },",
    "  { label: 'Plugins', value: 'Sidebar tools and publish hooks mount here' },",
    "] as const;",
    "",
    "const INITIAL_PROMPT = 'cinematic portrait of a ceramic astronaut, rim light, 85mm lens, high detail, deep indigo background';",
    "",
    "export function GenerateConsole({ title, lead }: GenerateConsoleProps) {",
    "  const [prompt, setPrompt] = useState(INITIAL_PROMPT);",
    "  const [status, setStatus] = useState<'idle' | 'loading' | 'succeeded' | 'failed'>('idle');",
    "  const [result, setResult] = useState<MockGenerateResponse['result'] | null>(null);",
    "  const [error, setError] = useState('');",
    "  const [history, setHistory] = useState<MockHistoryItem[]>([]);",
    "",
    "  async function runMockGeneration() {",
    "    setStatus('loading');",
    "    setError('');",
    "    const response = await fetch('/api/generate', {",
    "      method: 'POST',",
    "      headers: { 'content-type': 'application/json' },",
    "      body: JSON.stringify({ prompt }),",
    "    });",
    "    const payload = (await response.json()) as MockGenerateResponse;",
    "    if (!response.ok || !payload.ok || !payload.result) {",
    "      setStatus('failed');",
    "      setResult(null);",
    "      setError(payload.error || 'Mock generation failed.');",
    "      const failedHistoryItem = payload.historyItem;",
    "      if (failedHistoryItem) setHistory((current) => [failedHistoryItem, ...current].slice(0, 4));",
    "      return;",
    "    }",
    "    const resultItem = payload.result;",
    "    setStatus('succeeded');",
    "    setResult(resultItem);",
    "    setHistory((current) => [payload.historyItem || { id: resultItem.id, prompt: resultItem.prompt, status: 'succeeded', imageUrl: resultItem.imageUrl }, ...current].slice(0, 4));",
    "  }",
    "",
    "  function replayHistory(item: MockHistoryItem) {",
    "    setPrompt(item.prompt);",
    "    if (item.status === 'failed') {",
    "      setStatus('failed');",
    "      setResult(null);",
    "      setError(item.error || 'Retry last failed run');",
    "      return;",
    "    }",
    "    setStatus('succeeded');",
    "    setError('');",
    "    setResult(item.imageUrl ? { id: item.id, prompt: item.prompt, imageUrl: item.imageUrl, summary: 'Replayed from local history.' } : null);",
    "  }",
    "",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="app-shell__header">',
    '        <div className="app-shell__title">',
    '          <p className="eyebrow">Generator workspace</p>',
    '          <h1>{title}</h1>',
    '          <p>{lead}</p>',
    '        </div>',
    '        <a href="/app/history" className="button-secondary">View history</a>',
    '      </div>',
    '      <div className="playground-shell">',
    '        <div className="playground-column">',
    '          <article className="playground-card control-stack">',
    '            <div className="playground-toolbar">',
    '              <div className="playground-toolbar__meta"><span>FLUX.1 Playground</span><span>Mock workspace</span></div>',
    '              <span className="token-pill">type "fail" to test recovery</span>',
    '            </div>',
    '            <div className="prompt-box">',
    '              <div className="control-row"><span className="control-label">Prompt</span><span className="control-value">Generator input</span></div>',
    '              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />',
    '              <div className="token-list">',
    '                <span className="token-pill">portrait</span>',
    '                <span className="token-pill">studio light</span>',
    '                <span className="token-pill">flux.1</span>',
    '                <span className="token-pill">editorial detail</span>',
    '              </div>',
    '            </div>',
    '            {controls.map((item) => (',
    '              <div key={item.label} className="control-row">',
    '                <span className="control-label">{item.label}</span>',
    '                <span className="control-value">{item.value}</span>',
    '              </div>',
    '            ))}',
    '            <div className="hero-actions">',
    '              <button type="button" className="button-primary" onClick={runMockGeneration} disabled={status === "loading"}>{status === "loading" ? "Running mock generation..." : "Run mock generation"}</button>',
              '              <a href="/app/history" className="button-secondary">History</a>',
              '              <a href="/app/order" className="button-secondary">Billing</a>',
            '            </div>',
    '          </article>',
    '        </div>',
    '        <div className="playground-column">',
    '          <article className="playground-card playground-output">',
    '            <div className="hero-preview-bar"><span>Result preview</span><span>{status === "succeeded" ? "Ready" : status === "failed" ? "Failed" : status === "loading" ? "Running" : "Draft"}</span></div>',
    '            <div className="preview-stage checkerboard" style={result ? { backgroundImage: `url(${result.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} />',
    '            <div className="playground-status">',
    '              <h3>Run status</h3>',
    '              <p>{status === "succeeded" ? result?.summary || "Mock generation completed." : status === "failed" ? error || "Latest render: failed generation recovered with prompt edits ready for retry." : status === "loading" ? "Mock generation in progress. This simulates the provider round-trip for the template baseline." : "Prompt, run, and review from one product-owned workspace."}</p>',
    '              <div className="hero-actions" style={{ marginTop: "14px" }}>',
    '                <button type="button" className="button-secondary" onClick={() => { setPrompt(prompt || INITIAL_PROMPT); void runMockGeneration(); }}>Retry last failed run</button>',
    '              </div>',
    '            </div>',
    '          </article>',
    '          <div className="playground-history">',
    '            {(history.length > 0 ? history : [',
    "              { id: 'placeholder-1', prompt: 'Editorial portrait prompt', status: 'succeeded' as const },",
    "              { id: 'placeholder-2', prompt: 'Product lighting prompt', status: 'succeeded' as const },",
    "              { id: 'placeholder-3', prompt: 'Concept key visual prompt', status: 'failed' as const, error: 'Replay this failed run after refining prompt structure.' },",
    "            ]).map((item) => (",
    '              <button key={item.id} type="button" className="history-card" onClick={() => replayHistory(item)} style={{ textAlign: "left", cursor: "pointer" }}>',
    '                <div className="history-thumb checkerboard" style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}><span className="apple-tag history-thumb__tag">{item.status === "failed" ? "Failed run" : "Saved run"}</span></div>',
    '                <div className="history-meta">',
    '                  <h3 style={{ margin: 0 }}>{item.status === "failed" ? "Failed run" : "Saved run"}</h3>',
    '                  <p>{item.prompt}</p>',
    '                  <p>{item.status === "failed" ? item.error || "Replay this failed run after refining prompt structure." : "Replay this run, duplicate the prompt, or export the selected image."}</p>',
    '                </div>',
    '              </button>',
    "            ))}",
    '          </div>',
    '        </div>',
    '      </div>',
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolGenerateApiRoute(): string {
  return [
    'import { NextResponse } from "next/server";',
    "",
    "function buildMockImage(prompt: string, accent: string) {",
    "  const safePrompt = String(prompt || '').slice(0, 72);",
    "  const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1024\" height=\"1024\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"g\" x1=\"0\" x2=\"1\" y1=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"#111827\"/><stop offset=\"100%\" stop-color=\"${accent}\"/></linearGradient></defs><rect width=\"1024\" height=\"1024\" rx=\"48\" fill=\"url(#g)\"/><circle cx=\"760\" cy=\"220\" r=\"150\" fill=\"rgba(255,255,255,0.12)\"/><text x=\"80\" y=\"160\" fill=\"#ffffff\" font-family=\"Arial, sans-serif\" font-size=\"42\">Mock AI image result</text><text x=\"80\" y=\"240\" fill=\"#d1d5db\" font-family=\"Arial, sans-serif\" font-size=\"26\">${safePrompt.replace(/[<&>]/g, '')}</text></svg>`;",
    '  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;',
    "}",
    "",
    "export async function POST(request: Request) {",
    "  const body = (await request.json().catch(() => ({}))) as { prompt?: string };",
    "  const prompt = String(body.prompt || '').trim();",
    "  if (!prompt) {",
    '    return NextResponse.json({ ok: false, error: "Prompt is required." }, { status: 400 });',
    "  }",
    "  if (/fail/i.test(prompt)) {",
    "    return NextResponse.json(",
    "      {",
    "        ok: false,",
    '        error: "Mock generation failed. Adjust prompt structure and retry.",',
    "        historyItem: {",
    '          id: `failed-${Date.now()}`,',
    "          prompt,",
    '          status: "failed",',
    '          error: "Mock generation failed. Adjust prompt structure and retry.",',
    "        },",
    "      },",
    "      { status: 422 },",
    "    );",
    "  }",
    "  const result = {",
    '    id: `mock-${Date.now()}`,',
    "    prompt,",
    "    imageUrl: buildMockImage(prompt, '#7c3aed'),",
    '    summary: "Mock generation completed. Result, history, and replay are all available in the template baseline.",',
    "  };",
    "  return NextResponse.json({",
    "    ok: true,",
    "    result,",
    "    historyItem: {",
    "      id: result.id,",
    "      prompt: result.prompt,",
    '      status: "succeeded",',
    "      imageUrl: result.imageUrl,",
    "    },",
    "  });",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolDashboardHubComponent(): string {
  return [
    'import { getAppPage } from "../../../content/pages/app";',
    'import { getCurrentLocale } from "../../../lib/i18n";',
    "",
    "export async function DashboardHub() {",
    "  const dashboardPage = await getAppPage();",
    "  const locale = await getCurrentLocale();",
    "  const dashboardLinks = locale === 'fr'",
    "    ? [",
    "        { href: '/app/generate', title: 'Generer', body: 'Ouvrez l espace complet de prompt avec controles modele, uploads et sortie rejouable.' },",
    "        { href: '/app/history', title: 'Historique', body: 'Revenez aux sorties precedentes, rejouez les prompts et comparez les executions sans quitter l app.' },",
    "        { href: '/app/giftcode', title: 'Code cadeau', body: 'Activez des codes et credits bonus dans le tableau de bord produit.' },",
    "        { href: '/app/order', title: 'Commandes', body: 'Consultez plans, credits et etat des commandes sans repasser par le marketing.' },",
    "        { href: '/cms', title: 'CMS', body: 'Gerez projets, taches, assets approuves et reglages operationnels depuis une surface produit dediee.' },",
    "      ]",
    "    : [",
    "        { href: '/app/generate', title: 'Generate', body: 'Open the full prompt workspace with model controls, uploads, and replayable output.' },",
    "        { href: '/app/history', title: 'History', body: 'Return to prior outputs, replay prompts, and compare runs without leaving the app shell.' },",
    "        { href: '/app/giftcode', title: 'GiftCode', body: 'Redeem codes and bonus credits inside the product-owned dashboard.' },",
    "        { href: '/app/order', title: 'ChargeOrder', body: 'Review plans, credits, and order state without routing through the marketing site.' },",
    "        { href: '/cms', title: 'CMS', body: 'Manage user-owned tasks, saved projects, approved assets, and low-frequency operational settings.' },",
    "      ];",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="app-shell">',
    '        <div className="app-shell__header">',
    '          <div className="app-shell__title">',
    '            <p className="eyebrow">{locale === "fr" ? "Coque app" : "App shell"}</p>',
    '            <h1>{dashboardPage.title}</h1>',
    '            <p>{dashboardPage.lead}</p>',
    '          </div>',
    '          <a href="/app/generate" className="button-primary">{locale === "fr" ? "Generer" : "Generate"}</a>',
    '        </div>',
    '        <div className="dashboard-kpis">',
    '          <div className="dashboard-kpi"><strong>128</strong><span className="control-value">{locale === "fr" ? "credits disponibles" : "credits available"}</span></div>',
    '          <div className="dashboard-kpi"><strong>FLUX.1</strong><span className="control-value">{locale === "fr" ? "modele actif" : "active model"}</span></div>',
    '          <div className="dashboard-kpi"><strong>24h</strong><span className="control-value">{locale === "fr" ? "historique rejouable" : "replayable history"}</span></div>',
    '        </div>',
    '        <div className="dashboard-grid">',
    '          <div className="dashboard-stack">',
    '            {dashboardLinks.slice(0, 2).map((item) => (',
    '              <article key={item.href} className="dashboard-card">',
    '                <h2>{item.title}</h2>',
    '                <p>{item.body}</p>',
    '                <div className="dashboard-card__footer">',
    '                  <span className="dashboard-card__meta">{locale === "fr" ? "Entree produit" : "Product-owned route"}</span>',
    '                  <a href={item.href} className="button-primary">{locale === "fr" ? "Ouvrir" : "Open route"}</a>',
    '                </div>',
    '              </article>',
    '            ))}',
    '          </div>',
    '          <div className="dashboard-stack">',
    '            {dashboardLinks.slice(2).map((item) => (',
    '              <article key={item.href} className="dashboard-list__item">',
    '                <h3 style={{ margin: "0 0 8px" }}>{item.title}</h3>',
    '                <p>{item.body}</p>',
    '                <div className="dashboard-card__footer">',
    '                  <span className="dashboard-card__meta">{locale === "fr" ? "Operations" : "Operations"}</span>',
    '                  <a href={item.href} className="button-secondary">{locale === "fr" ? "Voir" : "View"}</a>',
    '                </div>',
    '              </article>',
    '            ))}',
    '          </div>',
    '        </div>',
    '      </div>',
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolHistoryTimelineComponent(): string {
  return [
    'import { getHistoryPage } from "../../../content/pages/history";',
    'import { getExamples } from "../../../content/collections/examples";',
    'import { getCurrentLocale } from "../../../lib/i18n";',
    "",
    "export async function HistoryTimeline() {",
    "  const historyPage = await getHistoryPage();",
    "  const examples = await getExamples();",
    "  const locale = await getCurrentLocale();",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="app-shell__header">',
    '        <div className="app-shell__title">',
    '          <p className="eyebrow">{locale === "fr" ? "Historique" : "History"}</p>',
    '          <h1>{historyPage.title}</h1>',
    '          <p>{historyPage.lead}</p>',
    '        </div>',
    '        <a href="/app/generate" className="button-secondary">{locale === "fr" ? "Nouveau rendu" : "New render"}</a>',
    '      </div>',
    '      <div className="history-grid">',
        '        {examples.map((item) => (',
    '          <article key={item.title} className="history-card">',
    '            <div className="history-thumb checkerboard"><span className="apple-tag history-thumb__tag">{item.title}</span></div>',
    '            <div className="history-meta">',
    '              <h2>{item.title}</h2>',
    '              <p>{item.body}</p>',
    '              <p>{locale === "fr" ? "Rejouez cette execution, dupliquez le prompt ou exportez l image selectionnee." : "Replay this run, duplicate the prompt, or export the selected image."}</p>',
    '            </div>',
    '          </article>',
        '        ))}',
    '      </div>',
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolSignInGateComponent(): string {
  return [
    'import { getSignInPage } from "../../../content/pages/sign-in";',
    'import { getTemplateAuthMode } from "../../../lib/auth";',
    'import { getDictionary } from "../../../lib/i18n";',
    'import { AuthForm } from "../../auth/auth-form";',
    "",
    "export async function SignInGate() {",
    "  const authMode = getTemplateAuthMode();",
    "  const dictionary = await getDictionary();",
    "  const signInPage = await getSignInPage();",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="auth-shell">',
    '        <article className="dashboard-card auth-shell__panel">',
    '          <div className="app-shell__title">',
    '            <p className="eyebrow eyebrow--gradient"><span className="eyebrow__emoji">🎉</span><span className="text-gradient_indigo-purple">Authentication</span></p>',
            '            <h1>{signInPage.title}</h1>',
            '            <p>{signInPage.lead}</p>',
    '          </div>',
    '          {authMode === "google" ? <p className="auth-hint">{dictionary.authGoogleReady}</p> : null}',
    '          {authMode === "preview-credentials" ? <p className="auth-hint">{dictionary.authPreviewFallback}</p> : null}',
    '          {authMode === "unconfigured" ? <p className="auth-hint">{dictionary.authUnconfigured}</p> : null}',
    '          <AuthForm mode={authMode} dictionary={dictionary} />',
    '        </article>',
    '        <aside className="dashboard-card auth-shell__preview">',
    '          <div className="hero-preview-bar"><span>{dictionary.aiImageTemplate}</span><span>FLUX.1</span></div>',
          '          <div className="auth-shell__preview-visual checkerboard" />',
          '          <div className="auth-benefit-list">',
    '            <article className="auth-benefit"><h3>Secure access</h3><p>Sign-in protects the generator while public routes still explain product value and pricing.</p></article>',
    '            <article className="auth-benefit"><h3>Workspace entry</h3><p>Successful login drops users into the product hub, then directly into generation and history.</p></article>',
    '            <article className="auth-benefit"><h3>Product-owned flow</h3><p>Authentication, app routes, and billing stay inside the template instead of leaking back into marketing copy.</p></article>',
          '          </div>',
    '        </aside>',
    '      </div>',
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolPromptGeneratorComponent(): string {
  return [
    'import { promptGeneratorPage } from "../../../content/pages/prompt-generator";',
    "",
    "const quickPrompts = [",
    "  'photoreal portrait, cinematic rim light, 85mm lens, studio detail',",
    "  'premium product render, floating object, soft shadow, clean backdrop',",
    "  'campaign key visual, dramatic light shafts, editorial framing, motion energy',",
    "] as const;",
    "",
    "export function PromptGeneratorSurface() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <article className="section-card">',
    '        <p className="eyebrow">Prompt Generator</p>',
    '        <h2>{promptGeneratorPage.title}</h2>',
    '        <p>{promptGeneratorPage.lead}</p>',
    '      </article>',
    '      <div className="tool-panel-grid">',
    '        <article className="section-card control-stack">',
    '          <div className="prompt-box">',
    '            <div className="control-row"><span className="control-label">Idea</span><span className="control-value">Public prompt ideation</span></div>',
    '            <textarea defaultValue="Editorial portrait of a ceramic astronaut with indigo atmosphere and strong rim light." />',
    '            <div className="token-list">',
    '              {quickPrompts.map((item) => <span key={item} className="token-pill">{item}</span>)}',
    '            </div>',
    '          </div>',
    '          <div className="hero-actions">',
    '            <a href="/app/generate" className="button-primary">Send to generator</a>',
    '            <a href="/pricing" className="button-secondary">View pricing</a>',
    '          </div>',
    '        </article>',
    '        <article className="section-card">',
    '          <h2>Prompt shaping guide</h2>',
    '          <p>Use the public prompt route to structure subject, medium, lighting, lens, composition, and style modifiers before handing off to the real workspace.</p>',
    '        </article>',
    '      </div>',
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolGiftCodePanelComponent(): string {
  return [
    'import { getGiftCodePage } from "../../../content/pages/giftcode";',
    'import { getCurrentLocale } from "../../../lib/i18n";',
    "",
    "export async function GiftCodePanel() {",
    "  const giftCodePage = await getGiftCodePage();",
    "  const locale = await getCurrentLocale();",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="app-shell__header">',
    '        <div className="app-shell__title">',
    '          <p className="eyebrow">{locale === "fr" ? "Code cadeau" : "Gift code"}</p>',
    '          <h1>{giftCodePage.title}</h1>',
    '          <p>{giftCodePage.lead}</p>',
    '        </div>',
    '      </div>',
    '      <div className="dashboard-grid dashboard-grid--compact">',
    '        <article className="dashboard-card control-stack">',
    '          <div className="prompt-box">',
    '            <div className="control-row"><span className="control-label">{locale === "fr" ? "Code cadeau" : "Gift code"}</span><span className="control-value">{locale === "fr" ? "Activer dans l app" : "Redeem inside app"}</span></div>',
    '            <textarea defaultValue="FLUX-FREE-2026" />',
    '          </div>',
    '          <div className="hero-actions">',
    '            <a href="/app/order" className="button-primary">{locale === "fr" ? "Appliquer le credit" : "Apply credit"}</a>',
    '            <a href="/app" className="button-secondary">{locale === "fr" ? "Retour au hub" : "Back to hub"}</a>',
    '          </div>',
    '        </article>',
    '        <article className="dashboard-card">',
    '          <h2>{locale === "fr" ? "Les recompenses restent pilotees par le produit" : "Reward handling stays product-owned"}</h2>',
    '          <p>{locale === "fr" ? "L activation des codes cadeau reste dans le tableau de bord, separee de la tarification et des pages publiques d acquisition." : "Gift code redemption belongs inside the dashboard, separate from pricing copy and public acquisition pages."}</p>',
    '        </article>',
    '      </div>',
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolOrderPanelComponent(): string {
  return [
    'import { getOrderPage } from "../../../content/pages/order";',
    'import { getCurrentLocale } from "../../../lib/i18n";',
    "",
    "export async function OrderPanel() {",
    "  const orderPage = await getOrderPage();",
    "  const locale = await getCurrentLocale();",
    "  const orderCards = locale === 'fr'",
    "    ? [",
    "        { title: 'Solde de credits', body: '128 credits image disponibles pour FLUX.1 et les modeles associes.' },",
    "        { title: 'Plan actuel', body: 'Plan Pro avec file plus rapide et historique enregistre.' },",
    "        { title: 'Derniere commande', body: 'Commande #FK-2048 traitee pour le rechargement mensuel des credits.' },",
    "      ]",
    "    : [",
    "        { title: 'Credits balance', body: '128 image credits available for FLUX.1 and related models.' },",
    "        { title: 'Current plan', body: 'Pro plan with faster render queue and saved history.' },",
    "        { title: 'Latest order', body: 'Charge order #FK-2048 processed for monthly credit refill.' },",
    "      ];",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="app-shell__header">',
    '        <div className="app-shell__title">',
    '          <p className="eyebrow">{locale === "fr" ? "Commandes" : "ChargeOrder"}</p>',
    '          <h1>{orderPage.title}</h1>',
    '          <p>{orderPage.lead}</p>',
    '        </div>',
    '      </div>',
    '      <div className="card-grid">',
    '        {orderCards.map((item) => (',
    '          <article key={item.title} className="dashboard-card">',
    '            <h2>{item.title}</h2>',
    '            <p>{item.body}</p>',
    '          </article>',
    '        ))}',
    '      </div>',
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolHomePage(): string {
  return [
    'import { ToolHero } from "../components/sections/ai-image-tool/tool-hero";',
    'import { ToolFeatureGrid } from "../components/sections/ai-image-tool/tool-feature-grid";',
    'import { ToolWorkflow } from "../components/sections/ai-image-tool/tool-workflow";',
    'import { ToolExamples } from "../components/sections/ai-image-tool/tool-examples";',
    'import { ToolPricingSection } from "../components/sections/ai-image-tool/tool-pricing-section";',
    'import { ToolFaqSection } from "../components/sections/ai-image-tool/tool-faq-section";',
    'import { SchnellIntroPanel } from "../components/sections/ai-image-tool/schnell-intro-panel";',
    "",
    "export default function HomePage() {",
    "  return (",
    '    <div className="page-shell">',
    '      <ToolHero />',
    '      <SchnellIntroPanel />',
    '      <ToolPricingSection />',
    '      <ToolFeatureGrid />',
    '      <ToolWorkflow />',
    '      <ToolExamples />',
    '      <ToolFaqSection />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolMarketingToolPage(exportName: string, componentImport: string): string {
  return [
    `import { ${componentImport} } from "../../components/sections/ai-image-tool/${componentImport}";`,
    "",
    `export default function ${exportName}Page() {`,
    "  return (",
      '    <div className="page-shell">',
      `      <${componentImport[0].toUpperCase()}${componentImport.slice(1)} />`,
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolAppPage(): string {
  return [
    'import { redirect } from "next/navigation";',
    'import { getTemplateSessionUser } from "../../lib/auth";',
    'import { DashboardHub } from "../../components/sections/ai-image-tool/dashboard-hub";',
    "",
    "export default async function AppPage() {",
    "  const user = await getTemplateSessionUser();",
    "  if (!user) redirect('/sign-in?next=/app');",
    "  return (",
      '    <div className="page-shell">',
      '      <DashboardHub />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolGeneratePage(): string {
  return [
    'import { redirect } from "next/navigation";',
    'import { getTemplateSessionUser } from "../../../lib/auth";',
    'import { getGeneratePage } from "../../../content/pages/generate";',
    'import { GenerateConsole } from "../../../components/sections/ai-image-tool/app-workspace";',
    "",
    "export default async function GeneratePage() {",
    "  const user = await getTemplateSessionUser();",
    "  if (!user) redirect('/sign-in?next=/app/generate');",
    "  const generatePage = await getGeneratePage();",
    "  return (",
      '    <div className="page-shell">',
      '      <GenerateConsole title={generatePage.title} lead={generatePage.lead} />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolHistoryPage(): string {
  return [
    'import { redirect } from "next/navigation";',
    'import { getTemplateSessionUser } from "../../../lib/auth";',
    'import { HistoryTimeline } from "../../../components/sections/ai-image-tool/history-timeline";',
    "",
    "export default async function HistoryPage() {",
    "  const user = await getTemplateSessionUser();",
    "  if (!user) redirect('/sign-in?next=/app/history');",
    "  return (",
      '    <div className="page-shell">',
      '      <HistoryTimeline />',
      '    </div>',
      '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolPromptGeneratorPage(): string {
  return [
    'import { PromptGeneratorSurface } from "../../components/sections/ai-image-tool/prompt-generator-surface";',
    "",
    "export default function PromptGeneratorPage() {",
    "  return (",
      '    <div className="page-shell">',
      '      <PromptGeneratorSurface />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolSimpleMarketingPage(params: {
  eyebrow: string;
  importPath: string;
  exportName: string;
  ctaHref: string;
  ctaLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
}): string {
  return [
    `import { ${params.exportName} } from "${params.importPath}";`,
    "",
    "export default function MarketingRoutePage() {",
    "  return (",
      '    <div className="page-shell">',
      '      <section className="hero-block container">',
      `        <p className="eyebrow">${params.eyebrow}</p>`,
      `        <h1>{${params.exportName}.title}</h1>`,
      `        <p className="lead">{${params.exportName}.lead}</p>`,
      '        <div className="hero-actions">',
      `          <a href="${params.ctaHref}" className="button-primary">${params.ctaLabel}</a>`,
      `          <a href="${params.secondaryHref}" className="button-secondary">${params.secondaryLabel}</a>`,
      '        </div>',
      '      </section>',
      '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolGiftCodePage(): string {
  return [
    'import { redirect } from "next/navigation";',
    'import { getTemplateSessionUser } from "../../../lib/auth";',
    'import { GiftCodePanel } from "../../../components/sections/ai-image-tool/gift-code-panel";',
    "",
    "export default async function GiftCodePage() {",
    "  const user = await getTemplateSessionUser();",
    "  if (!user) redirect('/sign-in?next=/app/giftcode');",
    "  return (",
      '    <div className="page-shell">',
      '      <GiftCodePanel />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolOrderPage(): string {
  return [
    'import { redirect } from "next/navigation";',
    'import { getTemplateSessionUser } from "../../../lib/auth";',
    'import { OrderPanel } from "../../../components/sections/ai-image-tool/order-panel";',
    "",
    "export default async function OrderPage() {",
    "  const user = await getTemplateSessionUser();",
    "  if (!user) redirect('/sign-in?next=/app/order');",
    "  return (",
      '    <div className="page-shell">',
      '      <OrderPanel />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolSignInPage(): string {
  return [
    'import { Suspense } from "react";',
    'import { SignInGate } from "../../components/sections/ai-image-tool/sign-in-gate";',
    'import { ToolFaqSection } from "../../components/sections/ai-image-tool/tool-faq-section";',
    "",
    "export default function SignInPage() {",
    "  return (",
    '    <div className="page-shell">',
    '      <Suspense fallback={null}>',
    '        <SignInGate />',
    '      </Suspense>',
    '      <ToolFaqSection />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolSignInAliasPage(): string {
  return buildAiImageToolSignInPage();
}

function buildAiImageToolSignUpPage(): string {
  return buildAiImageToolSimpleMarketingPage({
    eyebrow: "Sign Up",
    importPath: "../../content/pages/sign-up",
    exportName: "signUpPage",
    ctaHref: "/sign-in",
    ctaLabel: "Continue to sign in",
    secondaryHref: "/app",
    secondaryLabel: "Open app hub",
  });
}

function buildAiImageToolCmsShellComponent(): string {
  return [
    'import type { ReactNode } from "react";',
    'import type { CmsDataSource } from "../../../lib/cms";',
    "",
    "type CmsShellProps = {",
    "  active: 'overview' | 'tasks' | 'projects' | 'assets' | 'settings';",
    "  title: string;",
    "  lead: string;",
    "  source: CmsDataSource;",
    "  children: ReactNode;",
    "};",
    "",
    "const items = [",
    "  { id: 'overview', href: '/cms', label: 'Overview' },",
    "  { id: 'tasks', href: '/cms/tasks', label: 'Tasks' },",
    "  { id: 'projects', href: '/cms/projects', label: 'Projects' },",
    "  { id: 'assets', href: '/cms/assets', label: 'Assets' },",
    "  { id: 'settings', href: '/cms/settings', label: 'Settings' },",
    "] as const;",
    "",
    "function sourceLabel(source: CmsDataSource) {",
    "  if (source === 'payload') return 'Payload connected';",
    "  if (source === 'product-api') return 'Product API connected';",
    "  return 'Preview seed data';",
    "}",
    "",
    "export function CmsShell({ active, title, lead, source, children }: CmsShellProps) {",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="cms-shell">',
    '        <aside className="cms-sidebar">',
    '          <div className="cms-sidebar__brand"><span className="brand-mark">CMS</span><span className="cms-source">{sourceLabel(source)}</span></div>',
    '          <nav className="cms-nav" aria-label="CMS navigation">',
    "            {items.map((item) => (",
    '              <a key={item.id} href={item.href} className={item.id === active ? "cms-nav__link cms-nav__link--active" : "cms-nav__link"}>{item.label}</a>',
    "            ))}",
    "          </nav>",
    '          <div className="cms-sidebar__footer"><a href="/app">Back to app</a><a href="/app/generate">New generation</a></div>',
    '        </aside>',
    '        <main className="cms-main">',
    '          <div className="app-shell__header">',
    '            <div className="app-shell__title"><p className="eyebrow">Product CMS</p><h1>{title}</h1><p>{lead}</p></div>',
    '            <span className="cms-source cms-source--large">{sourceLabel(source)}</span>',
    '          </div>',
    "          {children}",
    "        </main>",
    "      </div>",
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildLegacyAiImageToolCmsPage(): string {
  return [
    'import { redirect } from "next/navigation";',
    'import { getTemplateSessionUser } from "../../lib/auth";',
    "",
    "export default async function CmsPage() {",
    "  const user = await getTemplateSessionUser();",
    "  if (!user) redirect('/sign-in?next=/cms');",
    "  return (",
    '    <div className="page-shell">',
    '      <section className="container section-stack">',
    '        <div className="app-shell">',
    '          <div className="app-shell__header">',
    '            <div className="app-shell__title">',
    '              <p className="eyebrow">CMS</p>',
    '              <h1>User task and asset control center</h1>',
    '              <p>Use this product-owned route to manage generation jobs, saved projects, reusable prompt batches, published assets, and low-frequency operational settings without leaving the authenticated shell.</p>',
    '            </div>',
    '            <a href="/app/generate" className="button-primary">New generation</a>',
    '          </div>',
    '          <div className="dashboard-kpis">',
    '            <div className="dashboard-kpi"><strong>18</strong><span className="control-value">active tasks across prompt, rerun, and export flows</span></div>',
    '            <div className="dashboard-kpi"><strong>6</strong><span className="control-value">saved projects with reusable prompt and style presets</span></div>',
    '            <div className="dashboard-kpi"><strong>42</strong><span className="control-value">approved assets ready for download, publish, or team handoff</span></div>',
    '          </div>',
    '          <div className="dashboard-grid">',
    '            <div className="dashboard-stack">',
    '              <article className="dashboard-card">',
    '                <h2>Task board</h2>',
    '                <p>Track queue state for current generations, bulk reruns, failed outputs, and exports that still need review.</p>',
    '                <div className="dashboard-list" style={{ marginTop: "18px" }}>',
    '                  <div className="dashboard-list__item"><h3 style={{ margin: "0 0 8px" }}>Processing now</h3><p>Poster campaign batch, editorial portrait rerun, and square social cut-downs are still rendering.</p></div>',
    '                  <div className="dashboard-list__item"><h3 style={{ margin: "0 0 8px" }}>Needs attention</h3><p>Two failed tasks require prompt cleanup before retry; one export is blocked by missing title metadata.</p></div>',
    '                  <div className="dashboard-list__item"><h3 style={{ margin: "0 0 8px" }}>Ready to deliver</h3><p>Approved hero renders can be downloaded, moved into history, or attached to publish and SEO workflows.</p></div>',
    '                </div>',
    '                <div className="dashboard-card__footer"><span className="dashboard-card__meta">Task-state management</span><a href="/app/history" className="button-secondary">Open history</a></div>',
    '              </article>',
    '              <article className="dashboard-card">',
    '                <h2>Projects and prompt systems</h2>',
    '                <p>Organize work by campaign, client, style pack, or internal experiment so prompts and outputs stay grouped.</p>',
    '                <div className="card-grid" style={{ marginTop: "18px" }}>',
    '                  <article className="dashboard-list__item"><h3 style={{ margin: "0 0 8px" }}>Campaign launch</h3><p>Stored hero prompt set, selected references, cover image, and export checklist for the next ship.</p></article>',
    '                  <article className="dashboard-list__item"><h3 style={{ margin: "0 0 8px" }}>Reusable looks</h3><p>Keep portrait, product, and editorial prompt recipes as reusable presets for the generator workspace.</p></article>',
    '                </div>',
    '                <div className="dashboard-card__footer"><span className="dashboard-card__meta">Project library</span><a href="/flux-prompt-generator" className="button-secondary">Prompt tools</a></div>',
    '              </article>',
    '            </div>',
    '            <div className="dashboard-stack">',
    '              <article className="dashboard-card">',
    '                <h2>Asset library</h2>',
    '                <p>Promote successful generations into a curated library with download, publish, SEO, and reuse status.</p>',
    '                <div className="history-grid" style={{ marginTop: "18px", gridTemplateColumns: "1fr" }}>',
    '                  <article className="history-card"><div className="history-thumb checkerboard"><span className="apple-tag history-thumb__tag">Homepage hero</span></div><div className="history-meta"><h3 style={{ margin: 0 }}>Hero render approved</h3><p>Ready for homepage rollout, OG image export, and paid landing-page reuse.</p></div></article>',
    '                  <article className="history-card"><div className="history-thumb checkerboard"><span className="apple-tag history-thumb__tag">Ad variant set</span></div><div className="history-meta"><h3 style={{ margin: 0 }}>Social package in review</h3><p>Three square variants still need naming, alt text, and final publish decision.</p></div></article>',
    '                </div>',
    '              </article>',
    '              <article className="dashboard-card">',
    '                <h2>Operational settings</h2>',
    '                <p>Keep low-frequency controls nearby: model profiles, provider settings, billing rules, SEO defaults, and release readiness.</p>',
    '                <div className="dashboard-list" style={{ marginTop: "18px" }}>',
    '                  <div className="dashboard-list__item"><h3 style={{ margin: "0 0 8px" }}>Model profiles</h3><p>Replicate, RunningHub, and Hugging Face presets stay controlled here instead of leaking into the public shell.</p></div>',
    '                  <div className="dashboard-list__item"><h3 style={{ margin: "0 0 8px" }}>Billing and credits</h3><p>Plans, credit packs, entitlements, and provider toggles stay aligned with ChargeOrder and gift-code flows.</p></div>',
    '                  <div className="dashboard-list__item"><h3 style={{ margin: "0 0 8px" }}>SEO and publish</h3><p>Metadata, canonical defaults, and release notes can be reviewed before shipping approved assets.</p></div>',
    '                </div>',
    '                <div className="dashboard-card__footer"><span className="dashboard-card__meta">Payload-ready operations</span><a href="/pricing" className="button-secondary">Billing overview</a></div>',
    '              </article>',
    '            </div>',
    '          </div>',
    '        </div>',
    '      </section>',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolCmsPage(): string {
  return [
    'import { redirect } from "next/navigation";',
    'import { getTemplateSessionUser } from "../../lib/auth";',
    'import { getCmsOverview } from "../../lib/cms";',
    'import { CmsShell } from "../../components/sections/ai-image-tool/cms-shell";',
    "",
    "export default async function CmsPage() {",
    "  const user = await getTemplateSessionUser();",
    "  if (!user) redirect('/sign-in?next=/cms');",
    "  const overview = await getCmsOverview();",
    "  return (",
    '    <div className="page-shell">',
    '      <CmsShell active="overview" title="Task and asset control center" lead="Manage user-owned tasks, projects, generated assets, and low-frequency product settings from one authenticated CMS surface." source={overview.source}>',
    '        <div className="cms-kpi-grid">',
    '          <div className="cms-kpi"><strong>{overview.tasks.items.length}</strong><span>tracked generation tasks</span></div>',
    '          <div className="cms-kpi"><strong>{overview.projects.items.length}</strong><span>saved projects and prompt systems</span></div>',
    '          <div className="cms-kpi"><strong>{overview.assets.items.length}</strong><span>managed output assets</span></div>',
    '          <div className="cms-kpi"><strong>{overview.settings.settings.enabledProviders.length}</strong><span>enabled model providers</span></div>',
    '        </div>',
    '        <div className="cms-content-grid">',
    '          <article className="cms-panel">',
    '            <div className="cms-panel__header"><div><p className="eyebrow">Task queue</p><h2>Recent work</h2></div><a href="/cms/tasks" className="button-secondary">View all tasks</a></div>',
    '            <div className="cms-list">',
    '              {overview.tasks.items.slice(0, 3).map((task) => <a key={task.id} href="/cms/tasks" className="cms-list__row"><span><strong>{task.title}</strong><small>{task.project} · {task.model} · {task.updatedAt}</small></span><span className={"cms-status cms-status--" + task.status}>{task.status}</span></a>)}',
    '            </div>',
    '          </article>',
    '          <article className="cms-panel">',
    '            <div className="cms-panel__header"><div><p className="eyebrow">Asset library</p><h2>Recent outputs</h2></div><a href="/cms/assets" className="button-secondary">Manage assets</a></div>',
    '            <div className="cms-list">',
    '              {overview.assets.items.slice(0, 3).map((asset) => <a key={asset.id} href="/cms/assets" className="cms-list__row"><span><strong>{asset.title}</strong><small>{asset.kind} · {asset.project} · {asset.updatedAt}</small></span><span className={"cms-status cms-status--" + asset.status}>{asset.status}</span></a>)}',
    '            </div>',
    '          </article>',
    '        </div>',
    '        <div className="cms-action-grid">',
    '          <a href="/cms/projects" className="cms-action-card"><strong>Organize projects</strong><span>Group prompts, references, outputs, and publish checklists by campaign or client.</span></a>',
    '          <a href="/cms/settings" className="cms-action-card"><strong>Review settings</strong><span>Check Payload globals, provider profiles, billing rules, and SEO readiness before publishing.</span></a>',
    '          <a href="/app/generate" className="cms-action-card cms-action-card--accent"><strong>Start a generation</strong><span>Create a new task and keep its output connected to history and the asset library.</span></a>',
    '        </div>',
    '      </CmsShell>',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolCmsTasksPage(): string {
  return [
    'import { redirect } from "next/navigation";',
    'import { getTemplateSessionUser } from "../../../lib/auth";',
    'import { getCmsTasks } from "../../../lib/cms";',
    'import { CmsShell } from "../../../components/sections/ai-image-tool/cms-shell";',
    "",
    "export default async function CmsTasksPage() {",
    "  const user = await getTemplateSessionUser();",
    "  if (!user) redirect('/sign-in?next=/cms/tasks');",
    "  const data = await getCmsTasks();",
    "  return (",
    '    <div className="page-shell">',
    '      <CmsShell active="tasks" title="Generation tasks" lead="Track processing, attention-required, and ready-to-deliver work. High-frequency task state remains owned by the product task service." source={data.source}>',
    '        <div className="cms-toolbar"><span className="cms-source">Source: {data.source}</span><a href="/app/generate" className="button-primary">New task</a></div>',
    '        <div className="cms-table">',
    '          <div className="cms-table__head"><span>Task</span><span>Project</span><span>Model</span><span>Status</span><span>Updated</span></div>',
    '          {data.items.map((task) => <a key={task.id} href="/app/history" className="cms-table__row"><span><strong>{task.title}</strong><small>{task.id} · {task.outputCount} outputs</small></span><span>{task.project}</span><span>{task.model}</span><span className={"cms-status cms-status--" + task.status}>{task.status}</span><span>{task.updatedAt}</span></a>)}',
    '        </div>',
    '        <div className="cms-note"><strong>Task service boundary</strong><span>Configure PRODUCT_API_URL to read real task state. Payload is intentionally not used as a high-frequency queue store.</span></div>',
    '      </CmsShell>',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolCmsProjectsPage(): string {
  return [
    'import { redirect } from "next/navigation";',
    'import { getTemplateSessionUser } from "../../../lib/auth";',
    'import { getCmsProjects } from "../../../lib/cms";',
    'import { CmsShell } from "../../../components/sections/ai-image-tool/cms-shell";',
    "",
    "export default async function CmsProjectsPage() {",
    "  const user = await getTemplateSessionUser();",
    "  if (!user) redirect('/sign-in?next=/cms/projects');",
    "  const data = await getCmsProjects();",
    "  return (",
    '    <div className="page-shell">',
    '      <CmsShell active="projects" title="Projects and prompt systems" lead="Keep reusable prompts, references, output groups, and delivery notes organized as low-frequency product metadata." source={data.source}>',
    '        <div className="cms-toolbar"><span className="cms-source">Source: {data.source}</span><a href="/flux-prompt-generator" className="button-primary">Create prompt system</a></div>',
    '        <div className="cms-project-grid">',
    '          {data.items.map((project) => <article key={project.id} className="cms-panel cms-project-card"><div className="cms-project-card__top"><span className="token-pill">{project.updatedAt}</span><span className="cms-source">{project.id}</span></div><h2>{project.name}</h2><p>{project.summary}</p><div className="cms-project-card__stats"><span><strong>{project.promptCount}</strong> prompts</span><span><strong>{project.assetCount}</strong> assets</span></div><div className="dashboard-card__footer"><span className="dashboard-card__meta">Payload collection: Projects</span><a href="/cms/assets" className="button-secondary">View assets</a></div></article>)}',
    '        </div>',
    '      </CmsShell>',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolCmsAssetsPage(): string {
  return [
    'import { redirect } from "next/navigation";',
    'import { getTemplateSessionUser } from "../../../lib/auth";',
    'import { getCmsAssets } from "../../../lib/cms";',
    'import { CmsShell } from "../../../components/sections/ai-image-tool/cms-shell";',
    "",
    "export default async function CmsAssetsPage() {",
    "  const user = await getTemplateSessionUser();",
    "  if (!user) redirect('/sign-in?next=/cms/assets');",
    "  const data = await getCmsAssets();",
    "  return (",
    '    <div className="page-shell">',
    '      <CmsShell active="assets" title="Generated asset library" lead="Review approved and pending outputs with project links, alt text, and publish readiness before they leave the product." source={data.source}>',
    '        <div className="cms-toolbar"><span className="cms-source">Source: {data.source}</span><a href="/app/history" className="button-secondary">Open history</a></div>',
    '        <div className="cms-asset-grid">',
    '          {data.items.map((asset) => <article key={asset.id} className="history-card cms-asset-card"><div className="history-thumb checkerboard"><span className="apple-tag history-thumb__tag">{asset.kind}</span></div><div className="history-meta"><div className="cms-project-card__top"><span className={"cms-status cms-status--" + asset.status}>{asset.status}</span><span className="cms-source">{asset.updatedAt}</span></div><h2>{asset.title}</h2><p>{asset.altText}</p><small>{asset.project} · Payload collection: Media</small><div className="hero-actions"><a href="/app/history" className="button-secondary">Open history</a><a href="/cms/settings" className="button-secondary">SEO settings</a></div></div></article>)}',
    '        </div>',
    '      </CmsShell>',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolCmsSettingsPage(): string {
  return [
    'import { redirect } from "next/navigation";',
    'import { getTemplateSessionUser } from "../../../lib/auth";',
    'import { getCmsSettings } from "../../../lib/cms";',
    'import { CmsShell } from "../../../components/sections/ai-image-tool/cms-shell";',
    "",
    "export default async function CmsSettingsPage() {",
    "  const user = await getTemplateSessionUser();",
    "  if (!user) redirect('/sign-in?next=/cms/settings');",
    "  const data = await getCmsSettings();",
    "  return (",
    '    <div className="page-shell">',
    '      <CmsShell active="settings" title="Operational settings" lead="Keep low-frequency globals and configuration close to the product shell while secrets remain in environment variables or a secret manager." source={data.source}>',
    '        <div className="cms-settings-grid">',
    '          <article className="cms-panel"><p className="eyebrow">Site settings</p><h2>{data.settings.siteName}</h2><p>Payload global: SiteSettings. Navigation, brand copy, SEO defaults, and publish metadata are controlled here.</p><div className="dashboard-card__footer"><span className="cms-source">Configured globally</span><a href={data.settings.payloadAdminUrl || "/cms/settings"} className="button-secondary">Open editor</a></div></article>',
    '          <article className="cms-panel"><p className="eyebrow">Generation settings</p><h2>{data.settings.defaultModel}</h2><p>Enabled providers: {data.settings.enabledProviders.join(", ")}.</p><div className="dashboard-card__footer"><span className="cms-source">Payload global: GenerationSettings</span><a href="/app/generate" className="button-secondary">Open generator</a></div></article>',
    '          <article className="cms-panel"><p className="eyebrow">Billing rules</p><h2>{data.settings.billingMode}</h2><p>Pricing plans, credit packs, entitlements, and provider toggles stay aligned with ChargeOrder and gift-code flows.</p><div className="dashboard-card__footer"><span className="cms-source">Payload global: BillingSettings</span><a href="/app/order" className="button-secondary">Open billing</a></div></article>',
    '          <article className="cms-panel"><p className="eyebrow">SEO and publish</p><h2>{data.settings.seoStatus}</h2><p>Review canonical metadata, alt text, social image references, and release readiness before publishing an approved asset.</p><div className="dashboard-card__footer"><span className="cms-source">Payload global: SeoSettings</span><a href="/cms/assets" className="button-secondary">Review assets</a></div></article>',
    '        </div>',
    '        <div className="cms-note"><strong>Secret boundary</strong><span>Provider keys, webhook secrets, and payment credentials are never stored in Payload content fields. Set PAYLOAD_API_URL, PAYLOAD_API_KEY, and PAYLOAD_ADMIN_URL on the server.</span></div>',
    '      </CmsShell>',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolPricingPage(): string {
  return [
    'import { getPricingPage } from "../../content/pages/pricing";',
    'import { ToolPricingSection } from "../../components/sections/ai-image-tool/tool-pricing-section";',
    'import { ToolFaqSection } from "../../components/sections/ai-image-tool/tool-faq-section";',
    "",
    "export default async function PricingPage() {",
    "  const pricingPage = await getPricingPage();",
    "  return (",
    '    <div className="page-shell">',
    '      <section className="hero-block container">',
    '        <p className="eyebrow">Pricing</p>',
    '        <h1>{pricingPage.title}</h1>',
    '        <p className="lead">{pricingPage.lead}</p>',
    '      </section>',
    '      <ToolPricingSection />',
    '      <ToolFaqSection />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolFluxAiPage(): string {
  return buildAiImageToolSimpleMarketingPage({
    eyebrow: "FLUX AI",
    importPath: "../../content/pages/flux-ai",
    exportName: "fluxAiPage",
    ctaHref: "/app/generate",
    ctaLabel: "Open generator",
    secondaryHref: "/pricing",
    secondaryLabel: "View pricing",
  });
}

function buildAiImageToolFluxSchnellPage(): string {
  return buildAiImageToolSimpleMarketingPage({
    eyebrow: "FLUX Schnell",
    importPath: "../../content/pages/flux-schnell",
    exportName: "fluxSchnellPage",
    ctaHref: "/app/generate",
    ctaLabel: "Try schnell",
    secondaryHref: "/flux-ai",
    secondaryLabel: "Compare FLUX.1",
  });
}

function buildAiImageToolKreaAlternativePage(): string {
  return buildAiImageToolSimpleMarketingPage({
    eyebrow: "Krea Alternative",
    importPath: "../../content/pages/krea-alternative",
    exportName: "kreaAlternativePage",
    ctaHref: "/app/generate",
    ctaLabel: "Open workspace",
    secondaryHref: "/flux-prompt-generator",
    secondaryLabel: "Use prompt generator",
  });
}

function buildAiImageToolBlogPage(): string {
  return [
    'import { blogPage } from "../../content/pages/blog";',
    'import { getExamples } from "../../content/collections/examples";',
    "",
    "export default async function BlogPage() {",
    "  const examples = await getExamples();",
    "  return (",
    '    <div className="page-shell">',
    '      <section className="hero-block container">',
    '        <p className="eyebrow">Blog</p>',
    '        <h1>{blogPage.title}</h1>',
    '        <p className="lead">{blogPage.lead}</p>',
    '      </section>',
    '      <div className="card-grid">',
    '        {examples.map((item) => (',
    '          <article key={item.title} className="section-card">',
    '            <h2>{item.title}</h2>',
    '            <p>{item.body}</p>',
    '          </article>',
    '        ))}',
    '      </div>',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildAiImageToolSchnellIntroPanelComponent(): string {
  return [
    'import { fluxSchnellPage } from "../../../content/pages/flux-schnell";',
    "",
    "export function SchnellIntroPanel() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <article className="section-card spotlight-card">',
    '        <div>',
    '          <p className="eyebrow">FLUX Schnell</p>',
    '          <h2>{fluxSchnellPage.title}</h2>',
    '          <p>{fluxSchnellPage.lead}</p>',
    '          <div className="hero-actions">',
    '            <a href="/flux-schnell" className="button-primary">View schnell</a>',
    '            <a href="/flux-ai" className="button-secondary">Compare FLUX.1</a>',
    '          </div>',
    '        </div>',
    '        <div className="spotlight-visual" />',
    '      </article>',
    '    </section>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bCasePreviewStripComponent(): string {
  return [
    'import { caseStudies } from "../../../content/collections/case-studies";',
    "",
    "export function CasePreviewStrip() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <div className="card-grid">',
    '        {caseStudies.map((item) => (',
    '          <article key={item.title} className="section-card">',
    '            <h2>{item.title}</h2>',
    '            <p>{item.body}</p>',
    '          </article>',
    '        ))}',
    '      </div>',
    '    </section>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bContactConversionComponent(): string {
  return [
    "export function ContactConversion() {",
    "  return (",
    '    <section className="container section-stack">',
    '      <article className="section-card">',
    '        <h2>Turn interest into a real inquiry path.</h2>',
    '        <p>Use this final section to explain how buyers should contact your team and what information helps you respond quickly.</p>',
    '        <div className="hero-actions">',
    '          <a href="/contact" className="button-primary">Contact sales</a>',
    '          <a href="/products" className="button-secondary">Review products</a>',
    '        </div>',
    '      </article>',
    '    </section>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bHomePage(): string {
  return [
    'import { EnterpriseHero } from "../components/sections/enterprise/enterprise-hero";',
    'import { ProductFamilyGrid } from "../components/sections/enterprise/product-family-grid";',
    'import { CapabilityBand } from "../components/sections/enterprise/capability-band";',
    'import { CasePreviewStrip } from "../components/sections/enterprise/case-preview-strip";',
    'import { ContactConversion } from "../components/sections/enterprise/contact-conversion";',
    "",
    "export default function HomePage() {",
    "  return (",
    '    <div className="page-shell">',
    '      <EnterpriseHero />',
    '      <ProductFamilyGrid />',
    '      <CapabilityBand />',
    '      <CasePreviewStrip />',
    '      <ContactConversion />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bProductsPage(): string {
  return [
    'import { productsPage } from "../../content/pages/products";',
    'import { ProductFamilyGrid } from "../../components/sections/enterprise/product-family-grid";',
    "",
    "export default function ProductsPage() {",
    "  return (",
    '    <div className="page-shell">',
    '      <section className="hero-block container">',
    '        <p className="eyebrow">Products</p>',
    '        <h1>{productsPage.title}</h1>',
    '        <p className="lead">{productsPage.lead}</p>',
    '      </section>',
    '      <ProductFamilyGrid />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bContactPage(): string {
  return [
    'import { contactPage } from "../../content/pages/contact";',
    "",
    "export default function ContactPage() {",
    "  return (",
    '    <div className="page-shell">',
    '      <section className="hero-block container">',
    '        <p className="eyebrow">Contact</p>',
    '        <h1>{contactPage.title}</h1>',
    '        <p className="lead">{contactPage.lead}</p>',
    '        <div className="hero-actions">',
    '          <a href="mailto:sales@example.com" className="button-primary">Email the team</a>',
    '          <a href="/products" className="button-secondary">See products</a>',
    '        </div>',
    '      </section>',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bCustomSolutionsPage(): string {
  return [
    'import { SolutionProcess } from "../../components/sections/enterprise/solution-process";',
    "",
    "export default function CustomSolutionsPage() {",
    "  return (",
    '    <div className="page-shell">',
    '      <SolutionProcess />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bCasesPage(): string {
  return [
    'import { CasesLedger } from "../../components/sections/enterprise/cases-ledger";',
    "",
    "export default function CasesPage() {",
    "  return (",
    '    <div className="page-shell">',
    '      <CasesLedger />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildB2bAboutPage(): string {
  return [
    'import { CompanyProfileIntro } from "../../components/sections/enterprise/company-profile-intro";',
    "",
    "export default function AboutPage() {",
    "  return (",
    '    <div className="page-shell">',
    '      <CompanyProfileIntro />',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildPlaceholderSimplePage(eyebrow: string, title: string, lead: string): string {
  return [
    "export default function RoutePage() {",
    "  return (",
    '    <div className="page-shell">',
    '      <section className="hero-block container">',
    `        <p className="eyebrow">${escapeForTs(eyebrow)}</p>`,
    `        <h1>${escapeForTs(title)}</h1>`,
    `        <p className="lead">${escapeForTs(lead)}</p>`,
    '      </section>',
    '    </div>',
    '  );',
    "}",
    "",
  ].join("\n");
}

function buildFamilyWorkspaceFiles(params: {
  request: ShpittoOpenCodeRequest;
  routes: string[];
}): PreparedWorkspaceFile[] {
  const family = resolveBaselineFamily(params.request);
  const companyName = params.request.structuredInputs.companyName || params.request.structuredInputs.productName || "Shpitto Baseline";
  const navItems = buildNavItems(params.routes);

  const files: PreparedWorkspaceFile[] = [
    { path: "content/site.ts", content: buildContentSiteTs(params.request) },
    { path: "content/navigation.ts", content: buildContentNavigationTs(navItems) },
    { path: "content/footer.ts", content: buildContentFooterTs(params.request) },
    { path: "lib/auth.ts", content: buildLibAuthTs() },
    { path: "lib/cms.ts", content: buildLibCmsTs() },
    { path: "lib/i18n.ts", content: buildLibI18nTs() },
    { path: "lib/routes.ts", content: buildLibRoutesTs(params.routes) },
    { path: "lib/metadata.ts", content: buildLibMetadataTs() },
    { path: "lib/site-config.ts", content: buildLibSiteConfigTs(params.request) },
    { path: "hooks/use-auth.ts", content: buildUseAuthTs() },
    { path: "components/auth/auth-provider.tsx", content: buildAuthProviderTs() },
    { path: "components/auth/auth-components.tsx", content: buildAuthComponentsTs() },
    { path: "components/auth/user-button.tsx", content: buildUserButtonTs() },
    { path: "components/shell/site-header.tsx", content: buildSiteHeaderTs() },
    { path: "components/shell/site-footer.tsx", content: buildSiteFooterTs() },
    { path: "components/auth/auth-form.tsx", content: buildAuthFormTs() },
    { path: "styles/tokens.css", content: buildStylesTokensCss(family) },
    { path: "styles/utilities.css", content: buildStylesUtilitiesCss() },
  ];

  if (family === "marketing-launch") {
    files.push(
      { path: "app/globals.css", content: buildMarketingGlobalsCss() },
      { path: "content/pages/home.ts", content: buildMarketingHomeContentTs(companyName) },
      { path: "content/pages/pricing.ts", content: buildMarketingPricingContentTs() },
      { path: "content/pages/contact.ts", content: buildMarketingContactContentTs() },
      { path: "content/pages/about.ts", content: buildMarketingAboutContentTs() },
      { path: "content/collections/features.ts", content: buildMarketingFeaturesTs() },
      { path: "content/collections/testimonials.ts", content: buildMarketingTestimonialsTs() },
      { path: "content/collections/logos.ts", content: buildMarketingLogosTs() },
      { path: "content/collections/plans.ts", content: buildMarketingPlansTs() },
      { path: "content/collections/faq.ts", content: buildMarketingFaqTs() },
      { path: "components/sections/landing/hero.tsx", content: buildMarketingHeroComponent() },
      { path: "components/sections/landing/logo-cloud.tsx", content: buildMarketingLogoCloudComponent() },
      { path: "components/sections/landing/feature-grid.tsx", content: buildMarketingFeatureGridComponent() },
      { path: "components/sections/landing/social-proof.tsx", content: buildMarketingSocialProofComponent() },
      { path: "components/sections/landing/pricing-section.tsx", content: buildMarketingPricingSectionComponent() },
      { path: "components/sections/landing/faq-section.tsx", content: buildMarketingFaqSectionComponent() },
      { path: "components/sections/landing/final-cta.tsx", content: buildMarketingFinalCtaComponent() },
      { path: "app/page.tsx", content: buildMarketingHomePage() },
      { path: "app/pricing/page.tsx", content: buildMarketingPricingPage() },
      { path: "app/contact/page.tsx", content: buildMarketingContactPage() },
      {
        path: "app/about/page.tsx",
        content: params.routes.includes("/about")
          ? buildMarketingAboutPage()
          : buildPlaceholderSimplePage("About", "About the team", "This route is reserved for company and product context that supports launch trust."),
      },
    );
    return files;
  }

  if (family === "b2b-lead-generation") {
    files.push(
      { path: "app/globals.css", content: buildB2bGlobalsCss() },
      { path: "content/pages/home.ts", content: buildB2bHomeContentTs(companyName) },
      { path: "content/pages/products.ts", content: buildB2bProductsContentTs() },
      { path: "content/pages/about.ts", content: buildB2bAboutContentTs() },
      { path: "content/pages/contact.ts", content: buildB2bContactContentTs() },
      { path: "content/pages/custom-solutions.ts", content: buildB2bSolutionsContentTs() },
      { path: "content/pages/cases.ts", content: buildB2bCasesContentTs() },
      { path: "content/collections/trust-signals.ts", content: buildB2bTrustSignalsTs() },
      { path: "content/collections/product-groups.ts", content: buildB2bProductGroupsTs() },
      { path: "content/collections/case-studies.ts", content: buildB2bCaseStudiesTs() },
      { path: "content/collections/capabilities.ts", content: buildB2bCapabilitiesTs() },
      { path: "content/collections/faq.ts", content: buildB2bFaqTs() },
      { path: "components/sections/enterprise/enterprise-hero.tsx", content: buildB2bEnterpriseHeroComponent() },
      { path: "components/sections/enterprise/product-family-grid.tsx", content: buildB2bProductFamilyGridComponent() },
      { path: "components/sections/enterprise/capability-band.tsx", content: buildB2bCapabilityBandComponent() },
      { path: "components/sections/enterprise/case-preview-strip.tsx", content: buildB2bCasePreviewStripComponent() },
      { path: "components/sections/enterprise/contact-conversion.tsx", content: buildB2bContactConversionComponent() },
      { path: "components/sections/enterprise/solution-process.tsx", content: buildB2bSolutionProcessComponent() },
      { path: "components/sections/enterprise/cases-ledger.tsx", content: buildB2bCasesPageContentComponent() },
      { path: "components/sections/enterprise/company-profile-intro.tsx", content: buildB2bCompanyProfileIntroComponent() },
      { path: "app/page.tsx", content: buildB2bHomePage() },
      { path: "app/products/page.tsx", content: buildB2bProductsPage() },
      { path: "app/contact/page.tsx", content: buildB2bContactPage() },
    );
    if (params.routes.includes("/custom-solutions")) {
      files.push({
        path: "app/custom-solutions/page.tsx",
        content: buildB2bCustomSolutionsPage(),
      });
    }
    if (params.routes.includes("/cases")) {
      files.push({
        path: "app/cases/page.tsx",
        content: buildB2bCasesPage(),
      });
    }
    if (params.routes.includes("/about")) {
      files.push({
        path: "app/about/page.tsx",
        content: buildB2bAboutPage(),
      });
    }
    return files;
  }

  if (family === "ai-image-tool-platform") {
    files.push(
      { path: "app/globals.css", content: buildAiImageToolGlobalsCss() },
      { path: "content/pages/home.ts", content: buildAiImageToolHomeContentTs(companyName) },
      { path: "content/pages/dashboard.ts", content: buildAiImageToolDashboardContentTs() },
      { path: "content/pages/app.ts", content: buildAiImageToolAppContentTs() },
      { path: "content/pages/generate.ts", content: buildAiImageToolGenerateContentTs() },
      { path: "content/pages/prompt-generator.ts", content: buildAiImageToolPromptGeneratorContentTs() },
      { path: "content/pages/flux-ai.ts", content: buildAiImageToolFluxAiContentTs() },
      { path: "content/pages/flux-schnell.ts", content: buildAiImageToolFluxSchnellContentTs() },
      { path: "content/pages/krea-alternative.ts", content: buildAiImageToolKreaAlternativeContentTs() },
      { path: "content/pages/blog.ts", content: buildAiImageToolBlogContentTs() },
      { path: "content/pages/history.ts", content: buildAiImageToolHistoryContentTs() },
      { path: "content/pages/giftcode.ts", content: buildAiImageToolGiftCodeContentTs() },
      { path: "content/pages/order.ts", content: buildAiImageToolOrderContentTs() },
      { path: "content/pages/sign-in.ts", content: buildAiImageToolSignInContentTs() },
      { path: "content/pages/sign-up.ts", content: buildAiImageToolSignUpContentTs() },
      { path: "content/collections/features.ts", content: buildAiImageToolFeaturesTs() },
      { path: "content/collections/workflow-cards.ts", content: buildAiImageToolWorkflowTs() },
      { path: "content/collections/examples.ts", content: buildAiImageToolExamplesTs() },
      { path: "content/collections/faq.ts", content: buildAiImageToolFaqTs() },
      { path: "components/sections/ai-image-tool/tool-hero.tsx", content: buildAiImageToolHeroComponent() },
      { path: "components/sections/ai-image-tool/tool-feature-grid.tsx", content: buildAiImageToolFeatureGridComponent() },
      { path: "components/sections/ai-image-tool/tool-workflow.tsx", content: buildAiImageToolWorkflowComponent() },
      { path: "components/sections/ai-image-tool/tool-examples.tsx", content: buildAiImageToolExamplesComponent() },
      { path: "components/sections/ai-image-tool/tool-faq-section.tsx", content: buildAiImageToolFaqSectionComponent() },
      { path: "components/sections/ai-image-tool/schnell-intro-panel.tsx", content: buildAiImageToolSchnellIntroPanelComponent() },
      { path: "components/sections/ai-image-tool/dashboard-hub.tsx", content: buildAiImageToolDashboardHubComponent() },
      { path: "components/sections/ai-image-tool/app-workspace.tsx", content: buildAiImageToolAppWorkspaceComponent() },
      { path: "components/sections/ai-image-tool/prompt-generator-surface.tsx", content: buildAiImageToolPromptGeneratorComponent() },
      { path: "components/sections/ai-image-tool/history-timeline.tsx", content: buildAiImageToolHistoryTimelineComponent() },
      { path: "components/sections/ai-image-tool/gift-code-panel.tsx", content: buildAiImageToolGiftCodePanelComponent() },
      { path: "components/sections/ai-image-tool/order-panel.tsx", content: buildAiImageToolOrderPanelComponent() },
      { path: "components/sections/ai-image-tool/sign-in-gate.tsx", content: buildAiImageToolSignInGateComponent() },
      { path: "components/sections/ai-image-tool/cms-shell.tsx", content: buildAiImageToolCmsShellComponent() },
      { path: "app/api/auth/[...nextauth]/route.ts", content: buildNextAuthRoute() },
      { path: "app/api/locale/route.ts", content: buildLocaleApiRoute() },
      { path: "app/api/generate/route.ts", content: buildAiImageToolGenerateApiRoute() },
      { path: "app/page.tsx", content: buildAiImageToolHomePage() },
      { path: "app/app/page.tsx", content: buildAiImageToolAppPage() },
      { path: "app/app/generate/page.tsx", content: buildAiImageToolGeneratePage() },
      { path: "app/app/history/page.tsx", content: buildAiImageToolHistoryPage() },
      { path: "app/app/giftcode/page.tsx", content: buildAiImageToolGiftCodePage() },
      { path: "app/app/order/page.tsx", content: buildAiImageToolOrderPage() },
      {
        path: "app/flux-ai/page.tsx",
        content: buildAiImageToolFluxAiPage(),
      },
      {
        path: "app/flux-schnell/page.tsx",
        content: buildAiImageToolFluxSchnellPage(),
      },
      {
        path: "app/krea-alternative/page.tsx",
        content: buildAiImageToolKreaAlternativePage(),
      },
      {
        path: "app/blog/page.tsx",
        content: buildAiImageToolBlogPage(),
      },
      { path: "app/flux-prompt-generator/page.tsx", content: buildAiImageToolPromptGeneratorPage() },
      { path: "app/sign-in/page.tsx", content: buildAiImageToolSignInPage() },
      { path: "app/signin/page.tsx", content: buildAiImageToolSignInAliasPage() },
      { path: "app/sign-up/page.tsx", content: buildAiImageToolSignUpPage() },
      { path: "app/cms/page.tsx", content: buildAiImageToolCmsPage() },
      { path: "app/cms/tasks/page.tsx", content: buildAiImageToolCmsTasksPage() },
      { path: "app/cms/projects/page.tsx", content: buildAiImageToolCmsProjectsPage() },
      { path: "app/cms/assets/page.tsx", content: buildAiImageToolCmsAssetsPage() },
      { path: "app/cms/settings/page.tsx", content: buildAiImageToolCmsSettingsPage() },
    );
    if (params.routes.includes("/pricing")) {
      files.push(
        { path: "content/pages/pricing.ts", content: buildAiImageToolPricingContentTs() },
        { path: "content/collections/plans.ts", content: buildAiImageToolPlansTs() },
        { path: "components/sections/ai-image-tool/tool-pricing-section.tsx", content: buildAiImageToolPricingSectionComponent() },
        { path: "app/pricing/page.tsx", content: buildAiImageToolPricingPage() },
      );
    }
    if (params.routes.includes("/privacy-policy")) {
      files.push(
        {
          path: "app/privacy-policy/page.tsx",
          content: buildPlaceholderSimplePage(
            "Privacy Policy",
            "Review privacy and usage boundaries for the public and authenticated product surfaces.",
            "This shared route can explain policy and data usage, but it must not replace product-owned generator, history, or billing workflows.",
          ),
        },
      );
    }
    if (params.routes.includes("/terms-of-use")) {
      files.push(
        {
          path: "app/terms-of-use/page.tsx",
          content: buildPlaceholderSimplePage(
            "Terms of Use",
            "Define the rules for public exploration, authenticated usage, and purchased credits.",
            "This shared route exists for policy and legal clarity while product functionality stays in the app shell.",
          ),
        },
      );
    }
    return files;
  }

  files.push(
    { path: "app/globals.css", content: buildGlobalsCss() },
    { path: "components/site-shell.tsx", content: buildSiteShellComponent(navItems, companyName) },
    { path: "components/route-section.tsx", content: buildRouteSectionComponent() },
  );
  for (const route of params.routes) {
    files.push({
      path: routeAppPagePath(route),
      content: buildRoutePageContent(route, params.request, params.routes),
    });
  }
  return files;
}

function buildTsConfig(): string {
  return serializeJson({
    compilerOptions: {
      target: "ES2022",
      lib: ["dom", "dom.iterable", "es2022"],
      allowJs: false,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      plugins: [{ name: "next" }],
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"],
  });
}

function buildNextConfig(): string {
  return ['/** @type {import("next").NextConfig} */', "const nextConfig = {};", "", "export default nextConfig;", ""].join("\n");
}

function buildReadme(request: ShpittoOpenCodeRequest): string {
  return [
    "# Shpitto OpenCode Workspace",
    "",
    `This workspace was prepared by Shpitto for \`${request.skillId}\`.`,
    "",
    "## Start",
    "",
    "```bash",
    "pnpm install",
    "pnpm dev",
    "```",
    "",
    "## Template Preview",
    "",
    "Use the preview flag when you want the generated template to run with production-style `next start` while still exposing the local preview credentials fallback.",
    "",
    "```bash",
    "SHPITTO_TEMPLATE_PREVIEW=1 NEXTAUTH_URL=http://127.0.0.1:4173 pnpm start --hostname 127.0.0.1 --port 4173",
    "```",
    "",
    "Google OAuth remains the production path. Preview credentials are only enabled when Google keys are absent and the preview flag is set, or during local development.",
    "",
    "## CMS Integration",
    "",
    "The AI image template includes /cms, /cms/tasks, /cms/projects, /cms/assets, and /cms/settings.",
    "",
    "Set these server-only variables when connecting real services:",
    "",
    "- PAYLOAD_API_URL: Payload server base URL.",
    "- PAYLOAD_API_KEY: server-only Payload credential.",
    "- PAYLOAD_ADMIN_URL: optional Payload admin URL shown in settings.",
    "- PRODUCT_API_URL: product task and high-frequency generation state API.",
    "",
    "Payload is used for low-frequency settings and metadata. High-frequency generation queues remain in the product task service.",
    "",
    "## Contract",
    "",
    "Read the `.shpitto/` directory before making structural changes. It contains the normalized request, template manifest, route contract, selected foundations, selected seeds, and deployment target.",
    "",
  ].join("\n");
}

function buildTaskMarkdown(
  request: ShpittoOpenCodeRequest,
  routeContract: ShpittoRouteContractDocument,
): string {
  const routes = routeContract.requiredRoutes.map((route) => `- ${route}`).join("\n");
  const criteria = request.successCriteria.map((item) => `- ${item}`).join("\n");
  return [
    "# OpenCode Task",
    "",
    `Skill: \`${request.skillId}\``,
    `Task class: \`${request.taskClass}\``,
    `Execution scope: \`${request.executionScope}\``,
    "",
    "## Intent",
    "",
    request.userIntentSummary,
    "",
    "## Required routes",
    "",
    routes,
    "",
    "## Success criteria",
    "",
    criteria,
    "",
  ].join("\n");
}

function buildSiteShellComponent(navItems: Array<{ route: string; label: string }>, companyName: string): string {
  const navLiteral = JSON.stringify(navItems, null, 2);
  return [
    "type SiteShellProps = {",
    "  currentPath: string;",
    "  title: string;",
    "  lead: string;",
    "  children: React.ReactNode;",
    "};",
    "",
    `const navItems = ${navLiteral} as const;`,
    "",
    "export function SiteShell({ currentPath, title, lead, children }: SiteShellProps) {",
    "  return (",
    "    <div className=\"site-frame\">",
    "      <header className=\"site-header\">",
    `        <a href=\"/\" className=\"brand-mark\">${companyName}</a>`,
    "        <nav className=\"site-nav\" aria-label=\"Primary\">",
    "          {navItems.map((item) => (",
    "            <a",
    "              key={item.route}",
    "              href={item.route}",
    "              className={item.route === currentPath ? \"nav-link nav-link--active\" : \"nav-link\"}",
    "            >",
    "              {item.label}",
    "            </a>",
    "          ))}",
    "        </nav>",
    "      </header>",
    "      <main className=\"page-shell\">",
    "        <section className=\"hero-block\">",
    "          <p className=\"eyebrow\">Shpitto baseline</p>",
    "          <h1>{title}</h1>",
    "          <p className=\"lead\">{lead}</p>",
    "        </section>",
    "        <section className=\"content-grid\">{children}</section>",
    "      </main>",
    "      <footer className=\"site-footer\">",
    `        <p>${companyName} baseline prepared by Shpitto with a reusable Next.js shell.</p>`,
    "      </footer>",
    "    </div>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildRouteSectionComponent(): string {
  return [
    "type RouteSectionProps = {",
    "  heading: string;",
    "  body: string;",
    "};",
    "",
    "export function RouteSection({ heading, body }: RouteSectionProps) {",
    "  return (",
    "    <article className=\"route-card\">",
    "      <h2>{heading}</h2>",
    "      <p>{body}</p>",
    "    </article>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildLayout(request: ShpittoOpenCodeRequest): string {
  const company = request.structuredInputs.companyName || "Shpitto Baseline";
  const isAiImageTool = resolveBaselineFamily(request) === "ai-image-tool-platform";
  const blueprint = isAiImageTool ? getAiImageToolTemplateBlueprint() : undefined;
  const bodyClassName = blueprint?.sharedShell.bodyClassName || "";
  return [
    'import type { Metadata } from "next";',
    'import { Inter, Urbanist } from "next/font/google";',
    'import "./globals.css";',
    'import { AuthProvider } from "../components/auth/auth-provider";',
    'import { SiteHeader } from "../components/shell/site-header";',
    'import { SiteFooter } from "../components/shell/site-footer";',
    'import { getCurrentLocale, getDictionary } from "../lib/i18n";',
    "",
    "const fontSans = Inter({ subsets: ['latin'], variable: '--font-sans' });",
    "const fontUrban = Urbanist({ subsets: ['latin'], variable: '--font-urban' });",
    "",
    "export const metadata: Metadata = {",
    `  title: "${company}",`,
    `  description: "${request.userIntentSummary.replace(/"/g, '\\"')}",`,
    "};",
    "",
    "export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {",
    "  const locale = await getCurrentLocale();",
    "  const dictionary = await getDictionary(locale);",
    `  const bodyClassName = [${bodyClassName ? `"${bodyClassName}", ` : ""}fontSans.variable, fontUrban.variable].filter(Boolean).join(" ");`,
    "  return (",
    "    <html lang={locale}>",
    '      <body className={bodyClassName}>',
    '        <AuthProvider>',
    '          <div className="site-frame">',
    '            <SiteHeader dictionary={dictionary} />',
    '            {children}',
    '            <SiteFooter dictionary={dictionary} />',
    '          </div>',
    '        </AuthProvider>',
    '      </body>',
    "    </html>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildGlobalsCss(): string {
  return [
    ":root {",
    "  color-scheme: light;",
    "  --bg: #f4efe5;",
    "  --surface: rgba(255, 255, 255, 0.78);",
    "  --card: #fffefb;",
    "  --text: #161616;",
    "  --muted: #625a52;",
    "  --accent: #0f766e;",
    "  --border: rgba(22, 22, 22, 0.08);",
    "}",
    "",
    "* { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; }",
    "body {",
    "  min-height: 100vh;",
    "  font-family: Georgia, 'Times New Roman', serif;",
    "  color: var(--text);",
    "  background:",
    "    radial-gradient(circle at top left, rgba(15, 118, 110, 0.16), transparent 28%),",
    "    linear-gradient(180deg, #fbf7f0 0%, var(--bg) 100%);",
    "}",
    "a { color: inherit; text-decoration: none; }",
    ".site-frame { max-width: 1160px; margin: 0 auto; padding: 24px; }",
    ".site-header, .site-footer { display: flex; gap: 16px; align-items: center; justify-content: space-between; }",
    ".brand-mark { font-size: 1.15rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }",
    ".site-nav { display: flex; flex-wrap: wrap; gap: 12px; }",
    ".nav-link { padding: 10px 14px; border-radius: 999px; color: var(--muted); }",
    ".nav-link--active, .nav-link:hover { background: rgba(15, 118, 110, 0.12); color: var(--text); }",
    ".page-shell { display: grid; gap: 24px; padding: 36px 0 56px; }",
    ".hero-block { padding: 36px; border: 1px solid var(--border); border-radius: 28px; background: var(--surface); backdrop-filter: blur(12px); }",
    ".eyebrow { margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.22em; font-size: 0.74rem; color: var(--muted); }",
    ".hero-block h1 { margin: 0 0 14px; font-size: clamp(2.4rem, 6vw, 4.75rem); line-height: 0.98; }",
    ".lead { max-width: 70ch; margin: 0; color: var(--muted); font-size: 1.05rem; line-height: 1.65; }",
    ".content-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 18px; }",
    ".route-card { grid-column: span 4; min-height: 180px; padding: 24px; border-radius: 22px; background: var(--card); border: 1px solid var(--border); box-shadow: 0 18px 48px rgba(22, 22, 22, 0.06); }",
    ".route-card h2 { margin: 0 0 10px; font-size: 1.1rem; }",
    ".route-card p { margin: 0; color: var(--muted); line-height: 1.65; }",
    ".site-footer { padding: 18px 0 36px; color: var(--muted); font-size: 0.95rem; }",
    "@media (max-width: 900px) { .route-card { grid-column: span 6; } }",
    "@media (max-width: 640px) { .site-header, .site-footer { flex-direction: column; align-items: flex-start; } .route-card { grid-column: 1 / -1; } .hero-block { padding: 24px; } }",
    "",
  ].join("\n");
}

function buildRoutePageContent(route: string, request: ShpittoOpenCodeRequest, routes: string[]): string {
  const title = routeLabel(route);
  const lead = routeLead(route, request);
  const relatedRoutes = routes.filter((item) => item !== route).slice(0, 3);
  const cards = (relatedRoutes.length > 0 ? relatedRoutes : routes.slice(0, 3)).map((item) => ({
    heading: routeLabel(item),
    body: routeLead(item, request),
  }));
  const depth = routeSegments(route).length;
  const importPrefix = "../".repeat(depth + 1);
  const cardLiteral = JSON.stringify(cards, null, 2);
  return [
    `import { RouteSection } from "${importPrefix}components/route-section";`,
    `import { SiteShell } from "${importPrefix}components/site-shell";`,
    "",
    `const cards = ${cardLiteral};`,
    "",
    "export default function RoutePage() {",
    "  return (",
    `    <SiteShell currentPath="${normalizeRoute(route)}" title="${title}" lead="${lead.replace(/"/g, '\\"')}">`,
    "      {cards.map((card) => (",
    "        <RouteSection key={card.heading} heading={card.heading} body={card.body} />",
    "      ))}",
    "    </SiteShell>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildStaticHtml(route: string, request: ShpittoOpenCodeRequest, routes: string[]): string {
  const family = resolveBaselineFamily(request);
  if (family === "ai-image-tool-platform") {
    return buildAiImageToolStaticHtml(route, request, routes);
  }
  if (family === "marketing-launch") {
    return buildMarketingStaticHtml(route, request, routes);
  }
  if (family === "b2b-lead-generation") {
    return buildB2bStaticHtml(route, request, routes);
  }
  return buildGenericStaticHtml(route, request, routes);
}

function buildHtmlDocument(params: {
  company: string;
  locale: string;
  route: string;
  routes: string[];
  title: string;
  eyebrow: string;
  lead: string;
  body: string;
  templateFamily?: string;
}) {
  const nav = buildNavItems(params.routes, params.templateFamily, params.route)
    .map(
      (item) =>
        `<a class="nav-link${!item.external && item.route === params.route ? " nav-link--active" : ""}" href="${item.external ? item.href : routePreviewHref(params.route, item.route)}"${item.external ? ' target="_blank" rel="noreferrer"' : ""}>${item.label}</a>`,
    )
    .join("");
  const homeHref = routePreviewHref(params.route, "/");
  const stylesHref = routePreviewHref(params.route, "/").replace(/index\.html$/, "styles.css");
  const scriptHref = routePreviewHref(params.route, "/").replace(/index\.html$/, "script.js");
  const footerNav = params.templateFamily === "ai-image-tool-platform"
    ? getAiImageToolTemplateBlueprint().sharedShell.footerNav
        .map(
          (item) =>
            `<a class="nav-link" href="${item.external ? item.href : routePreviewHref(params.route, item.href)}"${item.external ? ' target="_blank" rel="noreferrer"' : ""}>${item.title}</a>`,
        )
        .join("")
    : "";
  return [
    "<!doctype html>",
    `<html lang="${params.locale}">`,
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${params.title} | ${params.company}</title>`,
    `  <link rel="stylesheet" href="${stylesHref}" />`,
    "</head>",
    "<body>",
    '  <div class="site-frame">',
    '    <header class="site-header">',
    `      <a href="${homeHref}" class="brand-mark">${params.company}</a>`,
    `      <nav class="site-nav" aria-label="Primary">${nav}</nav>`,
    "    </header>",
    '    <main class="page-shell">',
    '      <section class="hero-block container">',
    `        <p class="eyebrow">${params.eyebrow}</p>`,
    `        <h1>${params.title}</h1>`,
    `        <p class="lead">${params.lead}</p>`,
    "      </section>",
    params.body,
    "    </main>",
    '    <footer class="site-footer">',
    `      <p>${params.templateFamily === "ai-image-tool-platform" ? "fluxkreafree-derived product baseline prepared by Shpitto." : `${params.company} baseline prepared by Shpitto with a reusable Next.js shell.`}</p>`,
    footerNav ? `      <nav class="site-nav" aria-label="Footer">${footerNav}</nav>` : "",
    "    </footer>",
    "  </div>",
    `  <script src="${scriptHref}" defer></script>`,
    "</body>",
    "</html>",
  ].join("\n");
}

function renderStaticCardGrid(
  cards: Array<{ title: string; body: string; extra?: string }>,
  options?: { heading?: string; lead?: string },
) {
  const intro =
    options?.heading || options?.lead
      ? [
          '<article class="section-card">',
          options?.heading ? `  <h2>${options.heading}</h2>` : "",
          options?.lead ? `  <p>${options.lead}</p>` : "",
          "</article>",
        ]
          .filter(Boolean)
          .join("\n")
      : "";
  const grid = cards
    .map(
      (card) =>
        [
          '<article class="section-card">',
          `  <h2>${card.title}</h2>`,
          `  <p>${card.body}</p>`,
          card.extra ? `  <p>${card.extra}</p>` : "",
          "</article>",
        ]
          .filter(Boolean)
          .join("\n"),
    )
    .join("\n");
  return [
    '<section class="container section-stack">',
    intro,
    '<div class="card-grid">',
    grid,
    "</div>",
    "</section>",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderStaticActionCard(
  currentRoute: string,
  title: string,
  body: string,
  primaryHref: string,
  primaryLabel: string,
  secondaryHref: string,
  secondaryLabel: string,
) {
  return [
    '<section class="container section-stack">',
    '  <article class="section-card">',
    `    <h2>${title}</h2>`,
    `    <p>${body}</p>`,
    '    <div class="hero-actions">',
    `      <a href="${previewLinkHref(currentRoute, primaryHref)}" class="button-primary">${primaryLabel}</a>`,
    `      <a href="${previewLinkHref(currentRoute, secondaryHref)}" class="button-secondary">${secondaryLabel}</a>`,
    "    </div>",
    "  </article>",
    "</section>",
  ].join("\n");
}

function buildAiImageToolStaticHtml(route: string, request: ShpittoOpenCodeRequest, routes: string[]) {
  const productName = request.structuredInputs.companyName || request.structuredInputs.productName || "Shpitto Baseline";
  const content = getAiImageToolContent(productName);
  let title = routeLabel(route);
  let eyebrow = title;
  let lead = routeLead(route, request);
  let body = "";

  if (route === "/") {
    title = content.homePage.title;
    eyebrow = content.homePage.eyebrow;
    lead = content.homePage.lead;
    body = [
      [
        '<section class="container section-stack">',
        '  <div class="hero-grid">',
        '    <article class="section-card">',
        '      <h2>Public discovery that still points into the real product.</h2>',
        '      <p>Homepage messaging should introduce FLUX-style image generation, model entry points, and the route to the generator without collapsing the app into generic B2B or marketing patterns.</p>',
        '      <div class="hero-actions">',
        `        <a href="${routePreviewHref(route, "/app")}" class="button-primary">Start generating</a>`,
        `        <a href="${routePreviewHref(route, "/pricing")}" class="button-secondary">See pricing</a>`,
        '      </div>',
        '    </article>',
        '    <aside class="hero-preview">',
        '      <div class="hero-preview-bar"><span>Generator preview</span><span>FLUX.1</span></div>',
        '      <div class="hero-preview-canvas"><div><h2>Prompt-driven image generation.</h2><p class="lead">Public homepage + private workspace + replayable history.</p></div></div>',
        '      <div class="hero-preview-gallery"><div class="preview-thumb"></div><div class="preview-thumb"></div><div class="preview-thumb"></div></div>',
        '    </aside>',
        '  </div>',
        '</section>',
      ].join("\n"),
      renderStaticCardGrid(content.featureCards, { heading: "Core product surfaces", lead: "These sections belong to the product baseline, not to a generic marketing archetype." }),
      renderStaticCardGrid(content.workflowCards, { heading: "Lifecycle", lead: "From prompt idea to result replay, the workflow stays visible and stable." }),
      [
        '<section class="container section-stack">',
        '  <div class="history-grid">',
        ...content.examples.map(
          (item) =>
            [
              '    <article class="history-card">',
              '      <div class="history-thumb"></div>',
              '      <div class="history-meta">',
              `        <h2>${item.title}</h2>`,
              `        <p>${item.body}</p>`,
              '      </div>',
              '    </article>',
            ].join("\n"),
        ),
        '  </div>',
        '</section>',
      ].join("\n"),
      renderStaticActionCard(
        route,
        "Keep the generator shell product-owned.",
        "Brand, prompt, and pricing pages can evolve, but the generation workspace, history, and billing routes stay anchored to the baseline contract.",
        "/app",
        "Open workspace",
        "/sign-in",
        "Sign in",
      ),
    ].join("\n");
  } else if (route === "/app") {
    title = content.dashboardPage.title;
    eyebrow = "Index";
    lead = content.dashboardPage.lead;
    body = [
      '<section class="container section-stack">',
      '  <div class="card-grid">',
      `    <article class="section-card"><h2>Generate</h2><p>Open the full prompt workspace with model controls, uploads, and replayable output.</p><div class="hero-actions"><a href="${routePreviewHref(route, "/app/generate")}" class="button-primary">Open route</a></div></article>`,
      `    <article class="section-card"><h2>History</h2><p>Return to prior outputs, replay prompts, and compare runs without leaving the app shell.</p><div class="hero-actions"><a href="${routePreviewHref(route, "/app/history")}" class="button-primary">Open route</a></div></article>`,
      `    <article class="section-card"><h2>GiftCode</h2><p>Redeem codes and bonus credits inside the product-owned dashboard.</p><div class="hero-actions"><a href="${routePreviewHref(route, "/app/giftcode")}" class="button-primary">Open route</a></div></article>`,
      `    <article class="section-card"><h2>ChargeOrder</h2><p>Review plans, credits, and order state without routing through the marketing site.</p><div class="hero-actions"><a href="${routePreviewHref(route, "/app/order")}" class="button-primary">Open route</a></div></article>`,
      '  </div>',
      '</section>',
    ].join("\n");
  } else if (route === "/app/generate") {
    title = content.generatePage.title;
    eyebrow = "Workspace";
    lead = content.generatePage.lead;
    body = [
      '<section class="container section-stack">',
      '  <div class="tool-panel-grid">',
      '    <article class="section-card control-stack">',
      '      <div class="prompt-box">',
      '        <div class="control-row"><span class="control-label">Prompt</span><span class="control-value">Generator input</span></div>',
      '        <textarea>cinematic portrait of a ceramic astronaut, rim light, 85mm lens, high detail, deep indigo background</textarea>',
      '        <div class="token-list"><span class="token-pill">portrait</span><span class="token-pill">studio light</span><span class="token-pill">flux.1</span></div>',
      '      </div>',
      '      <div class="control-row"><span class="control-label">Model</span><span class="control-value">FLUX.1 / dev / schnell</span></div>',
      '      <div class="control-row"><span class="control-label">Aspect ratio</span><span class="control-value">1:1, 3:4, 16:9</span></div>',
      '      <div class="control-row"><span class="control-label">Quality</span><span class="control-value">Draft, Standard, High</span></div>',
      '      <div class="control-row"><span class="control-label">Private</span><span class="control-value">On / Off toggle</span></div>',
      '      <div class="hero-actions">',
      `        <a href="${routePreviewHref(route, "/app/history")}" class="button-secondary">View history</a>`,
      `        <a href="${routePreviewHref(route, "/sign-in")}" class="button-primary">Sign in to render</a>`,
      '      </div>',
      '    </article>',
      '    <article class="preview-frame">',
      '      <div class="hero-preview-bar"><span>Result preview</span><span>Draft</span></div>',
      '      <div class="preview-stage"></div>',
      '      <div class="history-grid"><div class="history-card"><div class="history-thumb"></div></div><div class="history-card"><div class="history-thumb"></div></div><div class="history-card"><div class="history-thumb"></div></div></div>',
      '    </article>',
      '  </div>',
      '</section>',
    ].join("\n");
  } else if (route === "/app/history") {
    title = content.historyPage.title;
    eyebrow = "History";
    lead = content.historyPage.lead;
    body = [
      '<section class="container section-stack">',
      '  <div class="history-grid">',
      ...content.examples.map(
        (item) =>
          [
            '    <article class="history-card">',
            '      <div class="history-thumb"></div>',
            '      <div class="history-meta">',
            `        <h2>${item.title}</h2>`,
            `        <p>${item.body}</p>`,
            '        <p>Replay this run, duplicate the prompt, or export the selected image.</p>',
            '      </div>',
            '    </article>',
          ].join("\n"),
      ),
      '  </div>',
      '</section>',
    ].join("\n");
  } else if (route === "/flux-prompt-generator") {
    title = content.promptGeneratorPage.title;
    eyebrow = "Prompt Generator";
    lead = content.promptGeneratorPage.lead;
    body = [
      renderStaticCardGrid(content.faq.map((item) => ({ title: item.question, body: item.answer })), {
        heading: "Prompt shaping",
        lead: "Use the public route to structure ideas before handing them to the real generator workspace.",
      }),
      renderStaticActionCard(
        route,
        "Move into the workspace only after the prompt is shaped.",
        "The public prompt route helps visitors structure subject, medium, lighting, lens, and mood before handing the result to the product workspace.",
        "/app/generate",
        "Send to generator",
        "/pricing",
        "View pricing",
      ),
    ].join("\n");
  } else if (route === "/flux-ai") {
    title = content.fluxAiPage.title;
    eyebrow = "FLUX AI";
    lead = content.fluxAiPage.lead;
    body = renderStaticActionCard(
      route,
      "Show FLUX.1 as a real product entry point.",
      "This route should frame the model offer, point to example outputs, and send visitors into the actual workspace rather than stopping at brochure copy.",
      "/app/generate",
      "Open generator",
      "/pricing",
      "View pricing",
    );
  } else if (route === "/flux-schnell") {
    title = content.fluxSchnellPage.title;
    eyebrow = "FLUX Schnell";
    lead = content.fluxSchnellPage.lead;
    body = renderStaticActionCard(
      route,
      "Position the faster model lane without replacing the app shell.",
      "Use this route to explain the quicker iteration path while keeping generation, history, and billing anchored inside the product-owned surfaces.",
      "/app/generate",
      "Try schnell",
      "/flux-ai",
      "Compare FLUX.1",
    );
  } else if (route === "/krea-alternative") {
    title = content.kreaAlternativePage.title;
    eyebrow = "Krea Alternative";
    lead = content.kreaAlternativePage.lead;
    body = renderStaticActionCard(
      route,
      "Keep comparison copy tied to the real workspace.",
      "This route should compare product posture and workflow shape, then send users into prompt or generation flows instead of acting like SEO filler.",
      "/app/generate",
      "Open workspace",
      "/flux-prompt-generator",
      "Use prompt generator",
    );
  } else if (route === "/blog") {
    title = content.blogPage.title;
    eyebrow = "Blog";
    lead = content.blogPage.lead;
    body = renderStaticCardGrid([
      { title: "Prompt workflow notes", body: "Explain prompt structure, repeatability, and creator-facing usage guidance." },
      { title: "Model updates", body: "Publish changes across FLUX, Schnell, and pricing without mutating product-owned routes." },
      { title: "Product launches", body: "Ship public release notes and examples while keeping interactive generation in the app shell." },
    ]);
  } else if (route === "/app/giftcode") {
    title = content.giftCodePage.title;
    eyebrow = "GiftCode";
    lead = content.giftCodePage.lead;
    body = renderStaticActionCard(
      route,
      "Redeem promo credits inside the dashboard.",
      "Gift code handling belongs to the product shell so the reward flow stays separate from public marketing pages.",
      "/app/order",
      "Apply credit",
      "/app",
      "Back to hub",
    );
  } else if (route === "/app/order") {
    title = content.orderPage.title;
    eyebrow = "ChargeOrder";
    lead = content.orderPage.lead;
    body = renderStaticCardGrid([
      { title: "Credits balance", body: "128 image credits available for FLUX.1 and related models." },
      { title: "Current plan", body: "Pro plan with faster render queue and saved history." },
      { title: "Latest order", body: "Charge order #FK-2048 processed for monthly credit refill." },
    ]);
  } else if (route === "/sign-in") {
    title = content.signInPage.title;
    eyebrow = "Sign in";
    lead = content.signInPage.lead;
    body = renderStaticActionCard(
      route,
      "Protect workspace routes with a clear access step.",
      "Guests should browse the brand-facing overview first, then sign in before they enter workspace or history surfaces.",
      "/app",
      "Continue after sign-in",
      "/",
      "Return to overview",
    );
  } else if (route === "/signin") {
    title = content.signInPage.title;
    eyebrow = "Sign In";
    lead = content.signInPage.lead;
    body = renderStaticActionCard(
      route,
      "Alias route for sign-in access.",
      "This alias should resolve to the same workspace gate semantics as the primary sign-in route.",
      "/sign-in",
      "Open sign-in",
      "/",
      "Back home",
    );
  } else if (route === "/sign-up") {
    title = content.signUpPage.title;
    eyebrow = "Sign Up";
    lead = content.signUpPage.lead;
    body = renderStaticActionCard(
      route,
      "Create an account before entering the workspace.",
      "Use registration to grant access to generation, history, and billing without rewriting the product shell as a marketing funnel.",
      "/sign-in",
      "Continue to sign in",
      "/app",
      "Open app hub",
    );
  } else if (route === "/pricing") {
    title = content.pricingPage.title;
    eyebrow = "Pricing";
    lead = content.pricingPage.lead;
    body = renderStaticCardGrid(
      content.plans.map((plan) => ({
        title: plan.name,
        body: plan.summary,
        extra: `<strong>${plan.price}</strong>${plan.interval}`,
      })),
    );
  } else if (route === "/privacy-policy") {
    title = "Privacy Policy";
    eyebrow = "Legal";
    lead = "Review privacy and usage boundaries for the public and authenticated product surfaces.";
    body = renderStaticCardGrid([
      {
        title: "Policy scope",
        body: "This shared route can explain policy and data usage, but it must not replace product-owned generator, history, or billing workflows.",
      },
    ]);
  } else if (route === "/terms-of-use") {
    title = "Terms of Use";
    eyebrow = "Legal";
    lead = "Define the rules for public exploration, authenticated usage, and purchased credits.";
    body = renderStaticCardGrid([
      {
        title: "Terms scope",
        body: "This shared route exists for policy and legal clarity while product functionality stays in the app shell.",
      },
    ]);
  } else {
    body = renderStaticCardGrid(
      routes
        .filter((item) => item !== route)
        .slice(0, 3)
        .map((item) => ({ title: routeLabel(item), body: routeLead(item, request) })),
    );
  }

  return buildHtmlDocument({
    company: productName,
    locale: request.structuredInputs.locale || "en",
    route: normalizeRoute(route),
    routes,
    title,
    eyebrow,
    lead,
    body,
    templateFamily: request.templateContext.templateFamily,
  });
}

function buildMarketingStaticHtml(route: string, request: ShpittoOpenCodeRequest, routes: string[]) {
  const company = request.structuredInputs.companyName || "Shpitto Baseline";
  const content = getMarketingContent(company);
  let title = routeLabel(route);
  let eyebrow = title;
  let lead = routeLead(route, request);
  let body = "";

  if (route === "/") {
    title = content.homePage.title;
    eyebrow = content.homePage.eyebrow;
    lead = content.homePage.lead;
    body = [
      renderStaticCardGrid(
        content.logos.map((item) => ({
          title: item.name,
          body: "Example customer or partner mark used to calibrate launch-stage trust and category fit.",
        })),
      ),
      renderStaticCardGrid(content.features),
      renderStaticCardGrid(content.testimonials.map((item) => ({ title: item.person, body: item.quote }))),
      renderStaticCardGrid(
        content.plans.map((plan) => ({
          title: plan.name,
          body: plan.summary,
          extra: `<strong>${plan.price}</strong>${plan.interval}`,
        })),
      ),
      renderStaticCardGrid(content.faq.map((item) => ({ title: item.question, body: item.answer }))),
      renderStaticActionCard(
        route,
        "Start from a reusable launch baseline.",
        "Use this template to ship a clear product website, then keep iterating without rebuilding from scratch.",
        "/contact",
        "Talk to sales",
        "/pricing",
        "Compare plans",
      ),
    ].join("\n");
  } else if (route === "/pricing") {
    title = content.pricingPage.title;
    eyebrow = "Pricing";
    lead = content.pricingPage.lead;
    body = [
      renderStaticCardGrid(
        content.plans.map((plan) => ({
          title: plan.name,
          body: plan.summary,
          extra: `<strong>${plan.price}</strong>${plan.interval}`,
        })),
      ),
      renderStaticCardGrid(content.faq.map((item) => ({ title: item.question, body: item.answer }))),
    ].join("\n");
  } else if (route === "/contact") {
    title = content.contactPage.title;
    eyebrow = "Contact";
    lead = content.contactPage.lead;
    body = renderStaticActionCard(
      route,
      "Best for demos, launch questions, and commercial follow-up.",
      "Use this route when your team needs implementation guidance, pricing clarification, or a conversation about how the baseline should evolve after launch.",
      "mailto:team@example.com",
      "Email the team",
      "/pricing",
      "View plans",
    );
  } else if (route === "/about") {
    title = content.aboutPage.title;
    eyebrow = "About";
    lead = content.aboutPage.lead;
    body = renderStaticCardGrid([
      {
        title: "Use this space to explain the company and product relationship clearly.",
        body: "The about route should reinforce trust, explain the team perspective, and support conversion without replacing the homepage value proposition.",
      },
    ]);
  } else {
    body = renderStaticCardGrid(
      routes
        .filter((item) => item !== route)
        .slice(0, 3)
        .map((item) => ({ title: routeLabel(item), body: routeLead(item, request) })),
    );
  }

  return buildHtmlDocument({
    company,
    locale: request.structuredInputs.locale || "en",
    route,
    routes,
    title,
    eyebrow,
    lead,
    body,
    templateFamily: request.templateContext.templateFamily,
  });
}

function buildB2bStaticHtml(route: string, request: ShpittoOpenCodeRequest, routes: string[]) {
  const company = request.structuredInputs.companyName || "Shpitto Baseline";
  const content = getB2bContent(company);
  let title = routeLabel(route);
  let eyebrow = title;
  let lead = routeLead(route, request);
  let body = "";

  if (route === "/") {
    title = content.homePage.title;
    eyebrow = content.homePage.eyebrow;
    lead = content.homePage.lead;
    body = [
      renderStaticCardGrid(content.trustSignals.map((item) => ({ title: item, body: "Enterprise-ready signal for buyers comparing fit and response confidence." }))),
      renderStaticCardGrid(content.productGroups),
      renderStaticCardGrid([
        {
          title: "Show buyers how your team supports sourcing, evaluation, and delivery.",
          body: "Use this section to explain operational capability, quality discipline, customization posture, and response model without turning the site into a generic brochure.",
        },
      ]),
      renderStaticCardGrid(content.caseStudies),
      renderStaticActionCard(
        route,
        "Turn interest into a real inquiry path.",
        "Use this final section to explain how buyers should contact your team and what information helps you respond quickly.",
        "/contact",
        "Contact sales",
        "/products",
        "Review products",
      ),
    ].join("\n");
  } else if (route === "/products") {
    title = content.productsPage.title;
    eyebrow = "Products";
    lead = content.productsPage.lead;
    body = renderStaticCardGrid(content.productGroups);
  } else if (route === "/contact") {
    title = content.contactPage.title;
    eyebrow = "Contact";
    lead = content.contactPage.lead;
    body = renderStaticActionCard(
      route,
      "Use the contact route for quote, spec, and sourcing conversations.",
      "Make it easy for buyers to reach the team with the project details that help you respond quickly.",
      "mailto:sales@example.com",
      "Email the team",
      "/products",
      "See products",
    );
  } else if (route === "/custom-solutions") {
    title = content.solutionsPage.title;
    eyebrow = "Custom Solutions";
    lead = content.solutionsPage.lead;
    body = renderStaticCardGrid(content.capabilities);
  } else if (route === "/cases") {
    title = content.casesPage.title;
    eyebrow = "Cases";
    lead = content.casesPage.lead;
    body = renderStaticCardGrid(content.caseStudies);
  } else if (route === "/about") {
    title = content.aboutPage.title;
    eyebrow = "About";
    lead = content.aboutPage.lead;
    body = renderStaticCardGrid(content.trustSignals.map((item) => ({ title: item, body: "Operational proof point that reinforces procurement confidence." })));
  } else {
    body = renderStaticCardGrid(
      routes
        .filter((item) => item !== route)
        .slice(0, 3)
        .map((item) => ({ title: routeLabel(item), body: routeLead(item, request) })),
    );
  }

  return buildHtmlDocument({
    company,
    locale: request.structuredInputs.locale || "en",
    route,
    routes,
    title,
    eyebrow,
    lead,
    body,
    templateFamily: request.templateContext.templateFamily,
  });
}

function buildGenericStaticHtml(route: string, request: ShpittoOpenCodeRequest, routes: string[]): string {
  const title = routeLabel(route);
  const lead = routeLead(route, request);
  const company = request.structuredInputs.companyName || "Shpitto Baseline";
  const body = renderStaticCardGrid(
    routes
      .filter((item) => item !== route)
      .slice(0, 3)
      .map((item) => ({ title: routeLabel(item), body: routeLead(item, request) })),
  );
  return buildHtmlDocument({
    company,
    locale: request.structuredInputs.locale || "en",
    route,
    routes,
    title,
    eyebrow: "Shpitto baseline",
    lead,
    body,
    templateFamily: request.templateContext.templateFamily,
  });
}

export function buildPreparedWorkspaceBundle(params: {
  request: ShpittoOpenCodeRequest;
  templateManifest: ShpittoTemplateManifest;
  routeContract: ShpittoRouteContractDocument;
  selectedFoundations: ShpittoSelectedFoundationsDocument;
  selectedSeeds: ShpittoSelectedSeedsDocument;
  deploymentTarget: ShpittoDeploymentTargetDocument;
  workspaceRoot: string;
}): PreparedWorkspaceBundle {
  const routes = params.routeContract.requiredRoutes.map((route) => normalizeRoute(route));
  const companyName = params.request.structuredInputs.companyName || "Shpitto Baseline";
  const workspaceFiles: PreparedWorkspaceFile[] = [
    { path: "package.json", content: buildPackageJson() },
    { path: "tsconfig.json", content: buildTsConfig() },
    { path: "next.config.mjs", content: buildNextConfig() },
    { path: "next-env.d.ts", content: '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n\n' },
    { path: ".gitignore", content: ".next\nnode_modules\n" },
    { path: "README.md", content: buildReadme(params.request) },
    { path: "OPENCODE_TASK.md", content: buildTaskMarkdown(params.request, params.routeContract) },
    { path: ".shpitto/request.json", content: serializeJson(params.request) },
    { path: ".shpitto/template-manifest.json", content: serializeJson(params.templateManifest) },
    { path: ".shpitto/route-contract.json", content: serializeJson(params.routeContract) },
    { path: ".shpitto/selected-foundations.json", content: serializeJson(params.selectedFoundations) },
    { path: ".shpitto/selected-seeds.json", content: serializeJson(params.selectedSeeds) },
    { path: ".shpitto/deployment-target.json", content: serializeJson(params.deploymentTarget) },
    { path: "app/layout.tsx", content: buildLayout(params.request) },
  ];
  workspaceFiles.push(...buildFamilyWorkspaceFiles({ request: params.request, routes }));

  const staticSiteFiles: PreparedStaticSiteFile[] = [
    {
      path: "/styles.css",
      type: "text/css",
      content:
        resolveBaselineFamily(params.request) === "marketing-launch"
          ? buildMarketingGlobalsCss()
          : resolveBaselineFamily(params.request) === "b2b-lead-generation"
            ? buildB2bGlobalsCss()
            : resolveBaselineFamily(params.request) === "ai-image-tool-platform"
              ? buildAiImageToolGlobalsCss()
            : buildGlobalsCss(),
    },
    { path: "/script.js", type: "text/javascript", content: "document.documentElement.dataset.shpittoBaseline = 'ready';\n" },
    ...routes.map((route) => ({
      path: routeHtmlPath(route),
      type: "text/html",
      content: buildStaticHtml(route, params.request, routes),
    })),
  ];

  const projectArtifact = {
    projectId: path.basename(params.workspaceRoot),
    framework: "nextjs-app-router",
    template: params.templateManifest,
    templateBlueprint:
      resolveBaselineFamily(params.request) === "ai-image-tool-platform"
        ? {
            ...getAiImageToolTemplateBlueprint(),
            designTokens: {
              ...getAiImageToolTemplateBlueprint().designTokens,
              utilityClasses: getAiImageToolTemplateBlueprint().designTokens.utilityClasses,
            },
          }
        : undefined,
    routes,
    pages: routes.map((route) => ({
      path: route,
      title: routeLabel(route),
      sections: [
        { heading: routeLabel(route), body: routeLead(route, params.request) },
      ],
    })),
    staticSite: {
      mode: "shpitto-opencode-nextjs-baseline",
      files: staticSiteFiles,
    },
    shpittoWorkspace: {
      rootDir: params.workspaceRoot,
      requestFile: path.join(params.workspaceRoot, ".shpitto", "request.json"),
      framework: "nextjs-app-router",
    },
  };

  return {
    workspaceFiles,
    staticSiteFiles,
    projectArtifact,
  };
}

export async function materializePreparedWorkspace(params: {
  request: ShpittoOpenCodeRequest;
  templateManifest: ShpittoTemplateManifest;
  routeContract: ShpittoRouteContractDocument;
  selectedFoundations: ShpittoSelectedFoundationsDocument;
  selectedSeeds: ShpittoSelectedSeedsDocument;
  deploymentTarget: ShpittoDeploymentTargetDocument;
  workspaceRoot: string;
  previewRoot?: string;
}): Promise<PreparedWorkspaceBundle> {
  const bundle = buildPreparedWorkspaceBundle(params);
  await fs.rm(params.workspaceRoot, { recursive: true, force: true });
  await fs.mkdir(params.workspaceRoot, { recursive: true });
  for (const file of bundle.workspaceFiles) {
    const target = path.join(params.workspaceRoot, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, "utf8");
  }
  if (params.previewRoot) {
    await fs.rm(params.previewRoot, { recursive: true, force: true });
    await fs.mkdir(params.previewRoot, { recursive: true });
    for (const file of bundle.staticSiteFiles) {
      const relative = file.path.replace(/^\/+/, "");
      const target = path.join(params.previewRoot, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.content, "utf8");
    }
  }
  return bundle;
}
