import path from "node:path";
import dotenv from "dotenv";
import fs from "node:fs/promises";

async function loadWebsiteGenerationMvp() {
  const mvpModule = await import("../lib/agent/website-generation-mvp.ts");
  return ((mvpModule as any).runWebsiteGenerationMvp ? mvpModule : (mvpModule as any).default) as {
    runWebsiteGenerationMvp: (typeof import("../lib/agent/website-generation-mvp.ts"))["runWebsiteGenerationMvp"];
    recoverWebsiteGenerationMvpFromCheckpoints: (typeof import("../lib/agent/website-generation-mvp.ts"))["recoverWebsiteGenerationMvpFromCheckpoints"];
  };
}

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });

const requirementPath = path.resolve(process.cwd(), "test-fixtures", "casux-requirement.txt");
const sourcePath = path.resolve(process.cwd(), "test-fixtures", "casux-source.txt");
const outputDir =
  String(process.env.SHPITTO_MVP_OUTPUT_DIR || "").trim() ||
  path.resolve(process.cwd(), ".tmp", "website-generation-mvp", "casux");

const requirementText = await (await import("node:fs/promises")).readFile(requirementPath, "utf8");
const { runWebsiteGenerationMvp, recoverWebsiteGenerationMvpFromCheckpoints } = await loadWebsiteGenerationMvp();
const startedAt = Date.now();
const reportPath = path.join(outputDir, "fullflow-report.json");

if (/^(1|true|yes|on)$/i.test(String(process.env.SHPITTO_MVP_RECOVER_ONLY || "").trim())) {
  const recovered = await recoverWebsiteGenerationMvpFromCheckpoints({ outputDir });
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        requirementPath,
        sourcePath,
        outputDir,
        siteDir: recovered.siteDir,
        checkpointDir: recovered.checkpointDir,
        generation: {
          routes: recovered.generationContract.promptControlManifest.routes,
          generatedFiles: recovered.generatedFiles,
          recoveredFrom: recovered.recoveredFrom,
          previewOnly: Boolean(recovered.previewOnly),
          verification: recovered.verification,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log("");
  console.log("CASUX website generation MVP recovered from checkpoints.");
  console.log(`Output directory: ${recovered.outputDir}`);
  console.log(`Site directory: ${recovered.siteDir}`);
  console.log(`Recovered from: ${recovered.recoveredFrom}`);
  console.log(`Generated files: ${recovered.generatedFiles.join(", ")}`);
  console.log(`Report: ${reportPath}`);
  process.exit(0);
}

const result = await runWebsiteGenerationMvp({
  requirementText,
  referencedAssets: [`Asset "casux-source.txt" path: ${sourcePath}`],
  outputDir,
  routePolicy: "default",
  disableWebSearch: true,
  timeoutMs: Number(process.env.SHPITTO_MVP_TIMEOUT_MS || 900_000),
  onStep: (snapshot) => {
    console.log(
      `[website-generation-mvp:casux] step ${snapshot.stepIndex}/${snapshot.totalSteps} ${snapshot.stepKey} ${snapshot.status}`,
    );
  },
});

await fs.writeFile(
  reportPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      requirementPath,
      sourcePath,
      outputDir,
      siteDir: result.siteDir,
      checkpointDir: result.checkpointDir,
      generation: {
        routes: result.manifest.routes,
        generatedFiles: result.generatedFiles,
        recoveredFrom: result.recoveredFrom || null,
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
console.log("CASUX website generation MVP completed.");
console.log(`Output directory: ${result.outputDir}`);
console.log(`Site directory: ${result.siteDir}`);
console.log(`Routes: ${(result.manifest.routes || []).join(", ")}`);
console.log(`Generated files: ${result.generatedFiles.join(", ")}`);
if (result.recoveredFrom) {
  console.log(`Recovered from: ${result.recoveredFrom}`);
  console.log(`Preview only: ${result.previewOnly ? "yes" : "no"}`);
}
console.log(`Report: ${reportPath}`);
