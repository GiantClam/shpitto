import fs from "node:fs/promises";
import path from "node:path";

async function loadWebsiteGenerationMvp() {
  const mvpModule = await import("../lib/agent/website-generation-mvp.ts");
  return ((mvpModule as any).recoverWebsiteGenerationMvpFromCheckpoints ? mvpModule : (mvpModule as any).default) as {
    recoverWebsiteGenerationMvpFromCheckpoints: (typeof import("../lib/agent/website-generation-mvp.ts"))["recoverWebsiteGenerationMvpFromCheckpoints"];
  };
}

function readArg(name: string): string {
  const index = process.argv.findIndex((arg) => arg === name);
  if (index >= 0) return String(process.argv[index + 1] || "").trim();
  return "";
}

function resolveAllowFailedVerification(): boolean {
  return /^(1|true|yes|on)$/i.test(readArg("--allow-failed-verification"));
}

async function main() {
  const { recoverWebsiteGenerationMvpFromCheckpoints } = await loadWebsiteGenerationMvp();
  const outputDir =
    readArg("--output-dir") ||
    String(process.env.SHPITTO_MVP_OUTPUT_DIR || "").trim() ||
    path.resolve(process.cwd(), ".tmp", "website-generation-mvp", "latest");

  await fs.mkdir(outputDir, { recursive: true });
  const result = await recoverWebsiteGenerationMvpFromCheckpoints({
    outputDir,
    allowFailedVerification: resolveAllowFailedVerification(),
  });
  console.log("");
  console.log("Website generation MVP recovered from checkpoints.");
  console.log(`Output directory: ${result.outputDir}`);
  console.log(`Site directory: ${result.siteDir}`);
  console.log(`Recovered from: ${result.recoveredFrom}`);
  console.log(`Preview only: ${result.previewOnly ? "yes" : "no"}`);
  console.log(`Verification status: ${result.verification.status}`);
  console.log(`Generated files: ${result.generatedFiles.join(", ")}`);
}

main().catch((error) => {
  console.error("[website-generation-mvp:recover] failed:", error);
  process.exitCode = 1;
});
