import path from "node:path";
import fs from "node:fs/promises";

async function loadWebsiteGenerationMvp() {
  const mvpModule = await import("../lib/agent/website-generation-mvp.ts");
  return ((mvpModule as any).recoverWebsiteGenerationMvpFromCheckpoints ? mvpModule : (mvpModule as any).default) as {
    recoverWebsiteGenerationMvpFromCheckpoints: (typeof import("../lib/agent/website-generation-mvp.ts"))["recoverWebsiteGenerationMvpFromCheckpoints"];
  };
}

const outputDir =
  String(process.env.SHPITTO_MVP_OUTPUT_DIR || "").trim() ||
  path.resolve(process.cwd(), ".tmp", "website-generation-mvp", "casux");
const reportPath = path.join(outputDir, "fullflow-report.json");

const { recoverWebsiteGenerationMvpFromCheckpoints } = await loadWebsiteGenerationMvp();
const result = await recoverWebsiteGenerationMvpFromCheckpoints({
  outputDir,
  allowFailedVerification: true,
});
await fs.writeFile(
  reportPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      outputDir,
      siteDir: result.siteDir,
      checkpointDir: result.checkpointDir,
      generation: {
        routes: result.generationContract.promptControlManifest.routes,
        generatedFiles: result.generatedFiles,
        recoveredFrom: result.recoveredFrom,
        previewOnly: Boolean(result.previewOnly),
        verification: result.verification,
      },
    },
    null,
    2,
  ),
  "utf8",
);

console.log("");
console.log("CASUX website generation MVP recovered from checkpoints.");
console.log(`Output directory: ${result.outputDir}`);
console.log(`Site directory: ${result.siteDir}`);
console.log(`Recovered from: ${result.recoveredFrom}`);
console.log(`Preview only: ${result.previewOnly ? "yes" : "no"}`);
console.log(`Verification status: ${result.verification.status}`);
console.log(`Generated files: ${result.generatedFiles.join(", ")}`);
console.log(`Report: ${reportPath}`);
