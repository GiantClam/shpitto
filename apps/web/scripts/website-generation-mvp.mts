import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

async function loadWebsiteGenerationMvp() {
  const mvpModule = await import("../lib/agent/website-generation-mvp.ts");
  return ((mvpModule as any).runWebsiteGenerationMvp ? mvpModule : (mvpModule as any).default) as {
    runWebsiteGenerationMvp: (typeof import("../lib/agent/website-generation-mvp.ts"))["runWebsiteGenerationMvp"];
  };
}

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });

function readArg(name: string): string {
  const index = process.argv.findIndex((arg) => arg === name);
  if (index >= 0) return String(process.argv[index + 1] || "").trim();
  return "";
}

async function resolveRequirementText(): Promise<string> {
  const inline = readArg("--requirement");
  if (inline) return inline;

  const file = readArg("--requirement-file");
  if (file) {
    return fs.readFile(path.resolve(process.cwd(), file), "utf8");
  }

  const envValue = String(process.env.SHPITTO_MVP_REQUIREMENT || "").trim();
  if (envValue) return envValue;

  throw new Error(
    "Missing requirement text. Provide --requirement, --requirement-file, or SHPITTO_MVP_REQUIREMENT.",
  );
}

function resolveReferencedAssets(): string[] {
  const cliValue = readArg("--referenced-assets");
  const raw = cliValue || String(process.env.SHPITTO_MVP_REFERENCED_ASSETS || "").trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n|;;/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveDisableWebSearch(): boolean {
  const raw = readArg("--web-search") || String(process.env.SHPITTO_MVP_WEB_SEARCH || "").trim();
  if (!raw) return true;
  return /^(1|true|on|yes)$/i.test(raw) ? false : true;
}

function resolveRoutePolicy(): "default" | "force_root_single_page" {
  const raw = (readArg("--route-policy") || String(process.env.SHPITTO_MVP_ROUTE_POLICY || "").trim()).toLowerCase();
  if (raw === "default" || raw === "fullsite" || raw === "multi-page" || raw === "multi") return "default";
  return "force_root_single_page";
}

async function main() {
  const { runWebsiteGenerationMvp } = await loadWebsiteGenerationMvp();
  const requirementText = await resolveRequirementText();
  const outputDir =
    readArg("--output-dir") ||
    String(process.env.SHPITTO_MVP_OUTPUT_DIR || "").trim() ||
    path.resolve(process.cwd(), ".tmp", "website-generation-mvp", "latest");
  const result = await runWebsiteGenerationMvp({
    requirementText,
    referencedAssets: resolveReferencedAssets(),
    outputDir,
    timeoutMs: Number(readArg("--timeout-ms") || process.env.SHPITTO_MVP_TIMEOUT_MS || 900_000),
    disableWebSearch: resolveDisableWebSearch(),
    routePolicy: resolveRoutePolicy(),
    onStep: (snapshot) => {
      console.log(
        `[website-generation-mvp] step ${snapshot.stepIndex}/${snapshot.totalSteps} ${snapshot.stepKey} ${snapshot.status}`,
      );
    },
  });

  console.log("");
  console.log("Website generation MVP completed.");
  console.log(`Output directory: ${result.outputDir}`);
  console.log(`Site directory: ${result.siteDir}`);
  console.log(`Routes: ${(result.manifest.routes || []).join(", ")}`);
  console.log(`Generated files: ${result.generatedFiles.join(", ")}`);
}

main().catch((error) => {
  console.error("[website-generation-mvp] failed:", error);
  process.exitCode = 1;
});
