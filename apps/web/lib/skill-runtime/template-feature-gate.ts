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
  templateId: string;
  templateVersion: string;
  siteType: string;
  runtime: string;
  cmsSchemaVersion: string;
  generationCapabilities: string[];
  providerPolicy: { defaultProvider: string; mockMode?: string };
  billingPolicy: { defaultProvider: string; ledger?: string; usage?: string };
  deploymentTargets: Array<{ target: string; runtime: string }>;
  requiredSecrets: string[];
  skillCapabilities: string[];
  requiredRoutes: string[];
  artifacts: {
    sourceDirectory?: string;
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

  const manifestContractPass =
    Boolean(manifest.templateId && manifest.templateVersion && manifest.siteType && manifest.runtime) &&
    Boolean(manifest.cmsSchemaVersion) &&
    manifest.generationCapabilities.length > 0 &&
    manifest.providerPolicy.defaultProvider === "replicate" &&
    manifest.billingPolicy.defaultProvider === "stripe" &&
    manifest.billingPolicy.ledger === "append-only" &&
    manifest.billingPolicy.usage === "reserve-settle-release" &&
    manifest.deploymentTargets.some((target) => target.target === "vercel" && target.runtime === "server") &&
    manifest.requiredSecrets.includes("REPLICATE_API_TOKEN") &&
    manifest.skillCapabilities.includes("modify");
  findings.push({
    id: "versioned-template-manifest",
    status: manifestContractPass ? "pass" : "fail",
    scope: "export",
    evidence: manifestContractPass
      ? "Template manifest declares version, runtime, provider, billing, deployment, secret, and skill capability contracts."
      : "Template manifest is missing one or more product contract sections.",
    blocker: !manifestContractPass,
    nextAction: manifestContractPass ? undefined : "Complete template-manifest.json with the versioned product contract fields.",
  });

  const deploymentTargets = new Map(manifest.deploymentTargets.map((target) => [target.target, target]));
  const deploymentMatrixPass =
    deploymentTargets.get("vercel")?.runtime === "server" &&
    deploymentTargets.get("railway")?.runtime === "server" &&
    deploymentTargets.get("docker")?.runtime === "server" &&
    deploymentTargets.get("source")?.runtime === "server" &&
    deploymentTargets.get("cloudflare-pages")?.runtime === "server" &&
    (deploymentTargets.get("cloudflare-pages") as any)?.supported === false;
  findings.push({
    id: "deployment-adapter-matrix",
    status: deploymentMatrixPass ? "pass" : "fail",
    scope: "export",
    evidence: deploymentMatrixPass
      ? "Managed server, Docker, source, and explicitly blocked Cloudflare targets are declared without overstating static Pages support."
      : "Template deployment target metadata does not match the implemented adapter matrix.",
    blocker: !deploymentMatrixPass,
    nextAction: deploymentMatrixPass ? undefined : "Align deployment target metadata with the available server and packaging adapters.",
  });

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
    Boolean(manifest.artifacts.sourceDirectory) &&
    exists(root, `${manifest.artifacts.sourceDirectory || "source"}/package.json`) &&
    exists(root, `${manifest.artifacts.sourceDirectory || "source"}/Dockerfile`) &&
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
