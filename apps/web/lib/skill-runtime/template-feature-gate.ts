import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FLUXKREAFREE_SOURCE_BILLING_ENTITIES } from "../billing/fluxkreafree-billing-model.ts";
import { selectAiImageToolBaselineSelection } from "./product-baseline-contract.ts";

export type TemplateGateStatus = "pass" | "fail";
export type TemplateGateScope =
  | "route"
  | "payment"
  | "i18n"
  | "admin"
  | "export"
  | "security";

export type TemplateGateFinding = {
  id: string;
  status: TemplateGateStatus;
  scope: TemplateGateScope;
  evidence: string;
  blocker: boolean;
  nextAction?: string;
};

type TemplateManifest = {
  requiredRoutes: string[];
  artifacts: {
    envExample: string;
    readme: string;
    deploymentGuides: string[];
  };
};

function getTemplateRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(
    currentDir,
    "../../skills/product-baselines/ai-image-tool-baseline/assets/template",
  );
}

function readTemplateManifest(root: string): TemplateManifest {
  return JSON.parse(
    fs.readFileSync(path.join(root, "template-manifest.json"), "utf8"),
  ) as TemplateManifest;
}

function exists(root: string, relativePath: string): boolean {
  return fs.existsSync(path.join(root, relativePath));
}

export function runAiImageToolTemplateFeatureGate(): TemplateGateFinding[] {
  const baseline = selectAiImageToolBaselineSelection();
  const root = getTemplateRoot();
  const manifest = readTemplateManifest(root);
  const findings: TemplateGateFinding[] = [];

  const requiredRoutes = baseline.contract.immutable.appRoutes
    .filter((route) => route.required)
    .map((route) => route.route);
  const routeMatch =
    JSON.stringify(requiredRoutes) === JSON.stringify(manifest.requiredRoutes);
  findings.push({
    id: "route-contract-required-routes",
    status: routeMatch ? "pass" : "fail",
    scope: "route",
    evidence: routeMatch
      ? `Manifest requiredRoutes matches baseline contract (${requiredRoutes.length} routes).`
      : "Manifest requiredRoutes drift from baseline contract.",
    blocker: !routeMatch,
    nextAction: routeMatch ? undefined : "Align template-manifest.json with ProductBaselineContract required routes.",
  });

  const billing = baseline.contract.immutable.billingRuntimeContract;
  const hasStripe =
    billing?.defaultProvider === "stripe" &&
    billing.providers.some((provider) => provider.id === "stripe");
  const preservesModels = FLUXKREAFREE_SOURCE_BILLING_ENTITIES.every((entity) =>
    billing?.preservedEntities.includes(entity),
  );
  findings.push({
    id: "billing-stripe-adapter-contract",
    status: hasStripe && preservesModels ? "pass" : "fail",
    scope: "payment",
    evidence:
      hasStripe && preservesModels
        ? "Baseline billing contract exposes Stripe as default and preserves fluxkreafree billing entities."
        : "Billing contract is missing Stripe default provider or preserved source entities.",
    blocker: !(hasStripe && preservesModels),
    nextAction:
      hasStripe && preservesModels
        ? undefined
        : "Complete billingRuntimeContract with Stripe default-provider and preserved entity mapping.",
  });

  const payload = baseline.contract.immutable.payloadAdminContract;
  const payloadPass =
    payload?.mode === "optional" &&
    payload.collections.includes("PaymentProviders") &&
    payload.forbiddenDataDomains.includes("immutable payment event ledger");
  findings.push({
    id: "payload-admin-contract",
    status: payloadPass ? "pass" : "fail",
    scope: "admin",
    evidence: payloadPass
      ? "Payload contract covers billing metadata and explicitly forbids ledger storage."
      : "Payload contract is incomplete for billing/admin boundaries.",
    blocker: !payloadPass,
    nextAction: payloadPass ? undefined : "Complete payloadAdminContract collections and forbidden data domains.",
  });

  const i18n = baseline.contract.immutable.i18nContract;
  const i18nPass =
    i18n.defaultLocale === "en" &&
    i18n.routeStrategy === "shared-structure-with-locale-catalogs" &&
    Array.isArray(i18n.localeCatalogPaths) &&
    i18n.localeCatalogPaths.length > 0;
  findings.push({
    id: "i18n-contract",
    status: i18nPass ? "pass" : "fail",
    scope: "i18n",
    evidence: i18nPass
      ? "Baseline i18n contract exposes default locale, route strategy, and locale catalog paths."
      : "Baseline i18n contract is incomplete.",
    blocker: !i18nPass,
    nextAction: i18nPass ? undefined : "Expose locale strategy and catalog paths in the baseline contract.",
  });

  const exportArtifactsPass =
    exists(root, manifest.artifacts.envExample) &&
    exists(root, manifest.artifacts.readme) &&
    manifest.artifacts.deploymentGuides.every((guide) => exists(root, guide));
  findings.push({
    id: "template-export-artifacts",
    status: exportArtifactsPass ? "pass" : "fail",
    scope: "export",
    evidence: exportArtifactsPass
      ? "README, .env.example, and deployment guides are present in template assets."
      : "One or more export artifacts are missing from template assets.",
    blocker: !exportArtifactsPass,
    nextAction: exportArtifactsPass ? undefined : "Add missing README, env example, or deployment guides.",
  });

  const envText = exists(root, manifest.artifacts.envExample)
    ? fs.readFileSync(path.join(root, manifest.artifacts.envExample), "utf8")
    : "";
  const securityPass =
    envText.includes("STRIPE_SECRET_KEY=") &&
    envText.includes("STRIPE_WEBHOOK_SECRET=") &&
    !envText.includes("STRIPE_SECRET_KEY=sk_") &&
    !envText.includes("PAYLOAD_SECRET=secret");
  findings.push({
    id: "template-secret-boundary-example",
    status: securityPass ? "pass" : "fail",
    scope: "security",
    evidence: securityPass
      ? "Template env example exposes placeholders without bundling payment or admin secrets."
      : "Template env example appears to include concrete secret values.",
    blocker: !securityPass,
    nextAction: securityPass ? undefined : "Remove concrete secret values from template env examples.",
  });

  return findings;
}
