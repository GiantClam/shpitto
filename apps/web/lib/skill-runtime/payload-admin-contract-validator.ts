import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectAiImageToolBaselineSelection } from "./product-baseline-contract.ts";

export type PayloadAdminContractValidation = {
  valid: boolean;
  schemaFilePresent: boolean;
  missingGlobals: string[];
  missingCollections: string[];
  missingLocalizedGlobals: string[];
  missingLocalizedCollections: string[];
  missingConfigKeys: string[];
  missingForbiddenDataDomains: string[];
};

const REQUIRED_GLOBALS = [
  "SiteSettings",
  "SeoSettings",
  "NavigationSettings",
  "GenerationSettings",
  "BillingSettings",
] as const;

const REQUIRED_COLLECTIONS = [
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
] as const;

const REQUIRED_LOCALIZED_GLOBALS = [
  "SiteSettings",
  "SeoSettings",
  "NavigationSettings",
] as const;

const REQUIRED_LOCALIZED_COLLECTIONS = [
  "Pages",
  "BlogPosts",
  "Media",
  "ModelProfiles",
  "PromptPresets",
  "PricingPlans",
  "CreditPacks",
  "Entitlements",
] as const;

const REQUIRED_CONFIG_KEYS = [
  "site.defaultLocale",
  "site.supportedLocales",
  "billing.defaultPaymentProvider",
  "billing.billingMode",
  "billing.defaultPlan",
  "generation.defaultModelProfile",
  "generation.enabledProviders",
] as const;

const REQUIRED_FORBIDDEN_DOMAINS = [
  "raw webhook payload store",
  "immutable payment event ledger",
  "provider secrets in plaintext",
  "high-frequency usage events",
  "generation task queues",
] as const;

function missingItems(source: string[] | undefined, required: readonly string[]): string[] {
  const actual = new Set((source || []).map((item) => String(item || "").trim()).filter(Boolean));
  return required.filter((item) => !actual.has(item));
}

export function validateAiImageToolPayloadAdminContract(): PayloadAdminContractValidation {
  const contract = selectAiImageToolBaselineSelection().contract.immutable.payloadAdminContract;
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const schemaFilePath = path.resolve(
    currentDir,
    "../../skills/product-baselines/ai-image-tool-baseline/assets/template/payload-admin.schema.json",
  );
  return {
    valid: Boolean(contract),
    schemaFilePresent: fs.existsSync(schemaFilePath),
    missingGlobals: missingItems(contract?.globals, REQUIRED_GLOBALS),
    missingCollections: missingItems(contract?.collections, REQUIRED_COLLECTIONS),
    missingLocalizedGlobals: missingItems(contract?.localizedGlobals, REQUIRED_LOCALIZED_GLOBALS),
    missingLocalizedCollections: missingItems(contract?.localizedCollections, REQUIRED_LOCALIZED_COLLECTIONS),
    missingConfigKeys: missingItems(contract?.configKeys, REQUIRED_CONFIG_KEYS),
    missingForbiddenDataDomains: missingItems(contract?.forbiddenDataDomains, REQUIRED_FORBIDDEN_DOMAINS),
  };
}
