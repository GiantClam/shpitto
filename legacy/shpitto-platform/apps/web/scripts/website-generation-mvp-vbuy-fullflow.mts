import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

async function loadWebsiteGenerationMvp() {
  const mvpModule = await import("../lib/agent/website-generation-mvp.ts");
  return ((mvpModule as any).runWebsiteGenerationMvp ? mvpModule : (mvpModule as any).default) as {
    runWebsiteGenerationMvp: (typeof import("../lib/agent/website-generation-mvp.ts"))["runWebsiteGenerationMvp"];
  };
}

async function loadBundler() {
  const bundlerModule = await import("../lib/bundler.ts");
  return ((bundlerModule as any).Bundler ? bundlerModule : (bundlerModule as any).default) as {
    Bundler: (typeof import("../lib/bundler.ts"))["Bundler"];
  };
}

async function loadRouteUnitCheckpoint() {
  const checkpointModule = await import("../lib/skill-runtime/route-unit-checkpoint.ts");
  return ((checkpointModule as any).recoverGeneratedProjectCheckpoint ? checkpointModule : (checkpointModule as any).default) as {
    recoverGeneratedProjectCheckpoint: (typeof import("../lib/skill-runtime/route-unit-checkpoint.ts"))["recoverGeneratedProjectCheckpoint"];
  };
}

async function loadCloudflareClient() {
  const cloudflareModule = await import("../lib/cloudflare.ts");
  return ((cloudflareModule as any).CloudflareClient ? cloudflareModule : (cloudflareModule as any).default) as {
    CloudflareClient: (typeof import("../lib/cloudflare.ts"))["CloudflareClient"];
  };
}

async function loadNetwork() {
  const networkModule = await import("../lib/agent/network.ts");
  return ((networkModule as any).configureUndiciProxyFromEnv ? networkModule : (networkModule as any).default) as {
    configureUndiciProxyFromEnv: (typeof import("../lib/agent/network.ts"))["configureUndiciProxyFromEnv"];
  };
}

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });

function normalizeBaseUrl(value: string) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeRoute(route: string) {
  const raw = String(route || "").trim();
  if (!raw || raw === "/") return "/";
  return `/${raw.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function routeToUrl(baseUrl: string, route: string) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedRoute = normalizeRoute(route);
  return normalizedRoute === "/" ? `${normalizedBase}/` : `${normalizedBase}${normalizedRoute}/`;
}

function safeProjectName(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "shpitto-vbuy-v2";
}

async function fetchWithRetry(url: string, attempts = 10, waitMs = 5000) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "user-agent": "shpitto-website-generation-v2-smoke",
          accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        },
      });
      const text = await response.text();
      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          contentType: String(response.headers.get("content-type") || ""),
          text,
        };
      }
      lastError = new Error(`HTTP ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

async function main() {
  const requirementPath = path.resolve(process.cwd(), "test-fixtures", "vbuygroup-requirement.txt");
  const sourcePath = path.resolve(process.cwd(), "test-fixtures", "vbuygroup-source.txt");
  const outputDir =
    String(process.env.SHPITTO_MVP_OUTPUT_DIR || "").trim() ||
    path.resolve(process.cwd(), ".tmp", "website-generation-mvp", "vbuygroup");
  const requirementText = await fs.readFile(requirementPath, "utf8");
  const { runWebsiteGenerationMvp } = await loadWebsiteGenerationMvp();
  const { Bundler } = await loadBundler();
  const { recoverGeneratedProjectCheckpoint } = await loadRouteUnitCheckpoint();
  const { CloudflareClient } = await loadCloudflareClient();
  const { configureUndiciProxyFromEnv } = await loadNetwork();
  configureUndiciProxyFromEnv?.();

  const result = await runWebsiteGenerationMvp({
    requirementText,
    referencedAssets: [`Asset "vbuygroup-source.txt" path: ${sourcePath}`],
    outputDir,
    routePolicy: "default",
    disableWebSearch: true,
    timeoutMs: Number(process.env.SHPITTO_MVP_TIMEOUT_MS || 900_000),
    onStep: (snapshot) => {
      console.log(
        `[website-generation-mvp:vbuy] step ${snapshot.stepIndex}/${snapshot.totalSteps} ${snapshot.stepKey} ${snapshot.status}`,
      );
    },
  });

  const project = await recoverGeneratedProjectCheckpoint(result.checkpointDir);
  if (!project?.staticSite?.files?.length) {
    throw new Error(`No generated project checkpoint found in ${result.checkpointDir}`);
  }

  const bundle = await Bundler.createBundle({
    staticSite: {
      mode: "skill-direct",
      files: project.staticSite.files,
    },
  });

  const cloudflare = new CloudflareClient();
  const configuredProjectName = String(process.env.SHPITTO_VBUY_DEPLOY_PROJECT || "").trim();
  const projectName = configuredProjectName
    ? safeProjectName(configuredProjectName)
    : `shpitto-vbuy-v2-${Date.now().toString(36)}`;
  await cloudflare.createProject(projectName);
  const deploy = await cloudflare.uploadDeployment(projectName, bundle);
  const deployedUrl = normalizeBaseUrl(
    String(deploy?.result?.url || `https://${projectName}.pages.dev`),
  );
  const projectRecord = await cloudflare.getPagesProject(projectName).catch(() => null);

  const verification: Array<{
    route: string;
    url: string;
    ok: boolean;
    status: number | null;
    contentType: string;
    error?: string;
  }> = [];

  for (const route of result.manifest.routes || []) {
    const url = routeToUrl(deployedUrl, route);
    try {
      const response = await fetchWithRetry(url);
      verification.push({
        route,
        url,
        ok: response.ok,
        status: response.status,
        contentType: response.contentType,
      });
    } catch (error) {
      verification.push({
        route,
        url,
        ok: false,
        status: null,
        contentType: "",
        error: String((error as Error)?.message || error || "unknown verification error"),
      });
    }
  }

  const reportPath = path.join(outputDir, "fullflow-report.json");
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
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
        deployment: {
          projectName,
          deployedUrl,
          cloudflareProject: projectRecord
            ? {
                name: projectRecord.name,
                subdomain: projectRecord.subdomain,
                latestDeploymentUrl: projectRecord.latestDeployment?.url || null,
                latestStage: projectRecord.latestDeployment?.latestStage || null,
              }
            : null,
          verification,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("");
  console.log("VBUY website generation V2 fullflow completed.");
  console.log(`Output directory: ${outputDir}`);
  console.log(`Site directory: ${result.siteDir}`);
  console.log(`Routes: ${(result.manifest.routes || []).join(", ")}`);
  console.log(`Recovered from: ${result.recoveredFrom || "fresh"}`);
  console.log(`Preview only: ${result.previewOnly ? "yes" : "no"}`);
  console.log(`Deployment project: ${projectName}`);
  console.log(`Deployment URL: ${deployedUrl}`);
  if (projectRecord?.latestDeployment?.latestStage) {
    console.log(
      `Deployment stage: ${projectRecord.latestDeployment.latestStage.name} (${projectRecord.latestDeployment.latestStage.status})`,
    );
  }
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error("[website-generation-mvp:vbuy:fullflow] failed:", error);
  process.exitCode = 1;
});
