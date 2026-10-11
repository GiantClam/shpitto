import fs from "node:fs/promises";
import path from "node:path";
import { buildPreparedWorkspaceBundle } from "../lib/opencode-cli/nextjs-baseline.ts";

const repositoryRoot = path.resolve(process.cwd(), "../..");
const templateRoot = path.join(repositoryRoot, "apps/web/skills/product-baselines/ai-image-tool-baseline/assets/template");
const targetRoot = path.resolve(process.argv[2] || path.join(templateRoot, "source"));

async function readJson(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(path.join(templateRoot, relativePath), "utf8")) as Record<string, unknown>;
}

async function writeFiles(root: string, files: Array<{ path: string; content: string }>): Promise<void> {
  for (const file of files) {
    const absolutePath = path.join(root, file.path);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.content, "utf8");
  }
}

async function main(): Promise<void> {
  const manifest = await readJson("template-manifest.json");
  const routes = [...((manifest.requiredRoutes as string[]) || []), ...((manifest.optionalRoutes as string[]) || [])];
  const request = {
    skillId: "build-ai-image-tool",
    taskClass: "baseline_generation" as const,
    projectRoot: targetRoot,
    userIntentSummary: "Commercial AI image generation template derived from the fluxkreafree product workflow.",
    executionScope: "full-baseline",
    successCriteria: [
      "all required routes exist",
      "generation controls, history, storage, billing, gift codes, and admin boundaries are functional",
      "production deployment uses configured provider, database, and object storage services",
    ],
    structuredInputs: {
      productName: "AI Image Studio",
      industry: "AI image generation or creative tooling",
      targetAudience: ["creators", "design teams", "AI product founders"],
      primaryGoal: ["sell a deployable AI image product template"],
      locale: String(manifest.defaultLocale || "en"),
      routes,
    },
    templateContext: {
      templateId: String(manifest.templateId || "ai-image-tool-baseline-v1"),
      siteType: String(manifest.siteType || "ai-image-tool-site"),
      templateFamily: String(manifest.templateFamily || "ai-image-tool-platform"),
      foundations: ["ai-tool-product-foundation"],
      seeds: ["fluxkreafree-product-template"],
    },
  };
  const bundle = buildPreparedWorkspaceBundle({
    workspaceRoot: targetRoot,
    request,
    templateManifest: { ...manifest, templateRoutes: routes },
    routeContract: { requiredRoutes: manifest.requiredRoutes, optionalRoutes: manifest.optionalRoutes, sharedShellContract: ["preserve shared nav", "preserve shared footer"], routeOwnershipNotes: ["/admin is hidden and direct-access only"] },
    selectedFoundations: { designSystemName: "AI Tool Product Foundation", upstreamSource: "GiantClam/fluxkreafree" },
    selectedSeeds: { selected: [{ id: "fluxkreafree-product-template", source: "upstream-behavioral-reference" }] },
    deploymentTarget: { target: "vercel", staticFirst: false, framework: "nextjs-app-router", runtime: "server" },
  });
  await fs.rm(targetRoot, { recursive: true, force: true });
  await fs.mkdir(targetRoot, { recursive: true });
  await writeFiles(targetRoot, bundle.workspaceFiles);
  await fs.writeFile(path.join(targetRoot, "UPSTREAM-NOTICE.md"), [
    "# Upstream Notice",
    "",
    "This commercial template reimplements product capabilities observed in GiantClam/fluxkreafree:",
    "model selection, aspect-ratio controls, reference-image input, generation history, downloads, Stripe checkout, gift-code redemption, and administrative order operations.",
    "",
    "The upstream repository did not contain a LICENSE file at the inspected commit. This export does not copy upstream source files; it uses an independent implementation and preserves the repository URL as a behavioral reference.",
    "Verify licensing and attribution requirements before redistributing any upstream assets, logos, fonts, images, or copied source.",
    "",
  ].join("\n"), "utf8");
  console.log(`Exported ${bundle.workspaceFiles.length} source files to ${targetRoot}`);
}

await main();
