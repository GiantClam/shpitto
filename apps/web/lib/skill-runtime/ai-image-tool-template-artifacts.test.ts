import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { selectAiImageToolBaselineSelection } from "./product-baseline-contract.ts";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const templateRoot = path.resolve(
  currentDir,
  "../../skills/product-baselines/ai-image-tool-baseline/assets/template",
);

type TemplateManifest = {
  templateId: string;
  defaultLocale: string;
  supportedLocales: string[];
  requiredRoutes: string[];
  optionalRoutes: string[];
  artifacts: {
    envExample: string;
    readme: string;
    deploymentGuides: string[];
  };
  billing: {
    defaultProvider: string;
    supportedProviders: string[];
    preservedEntities: string[];
  };
};

function readTemplateManifest(): TemplateManifest {
  return JSON.parse(
    fs.readFileSync(path.join(templateRoot, "template-manifest.json"), "utf8"),
  ) as TemplateManifest;
}

describe("ai-image-tool template artifacts", () => {
  it("ships a complete template manifest aligned to the product baseline", () => {
    const manifest = readTemplateManifest();
    const baseline = selectAiImageToolBaselineSelection();
    const requiredBaselineRoutes = baseline.contract.immutable.appRoutes
      .filter((route) => route.required)
      .map((route) => route.route);

    expect(manifest.templateId).toBe("ai-image-tool-baseline-v1");
    expect(manifest.defaultLocale).toBe("en");
    expect(manifest.supportedLocales).toEqual(["en"]);
    expect(manifest.requiredRoutes).toContain("/cms");
    expect(manifest.billing.defaultProvider).toBe("stripe");
    expect(manifest.billing.supportedProviders).toContain("stripe");
    expect(manifest.billing.preservedEntities).toContain("ChargeOrder");
    expect(manifest.requiredRoutes).toEqual(requiredBaselineRoutes);
  });

  it("includes export and deployment artifacts required by the template gate", () => {
    const manifest = readTemplateManifest();
    const envExamplePath = path.join(templateRoot, manifest.artifacts.envExample);
    const readmePath = path.join(templateRoot, manifest.artifacts.readme);
    const payloadSchemaPath = path.join(templateRoot, "payload-admin.schema.json");

    expect(fs.existsSync(envExamplePath)).toBe(true);
    expect(fs.existsSync(readmePath)).toBe(true);
    expect(fs.existsSync(payloadSchemaPath)).toBe(true);
    for (const guide of manifest.artifacts.deploymentGuides) {
      expect(fs.existsSync(path.join(templateRoot, guide))).toBe(true);
    }
  });

  it("keeps secret-bearing env vars empty in the template example", () => {
    const envText = fs.readFileSync(path.join(templateRoot, ".env.example"), "utf8");
    const requiredBlankKeys = [
      "NEXTAUTH_SECRET",
      "DATABASE_URL",
      "DIRECT_URL",
      "REPLICATE_API_TOKEN",
      "RUNNINGHUB_API_KEY",
      "HUGGINGFACE_API_KEY",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "PAYPAL_CLIENT_SECRET",
      "PAYLOAD_SECRET",
    ];

    for (const key of requiredBlankKeys) {
      expect(envText).toContain(`${key}=`);
      expect(envText).not.toContain(`${key}=changeme`);
      expect(envText).not.toContain(`${key}=secret`);
    }
  });
});
