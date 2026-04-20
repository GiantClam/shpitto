import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import dotenv from "dotenv";
import { CloudflareClient } from "../cloudflare";
import { Bundler } from "../bundler";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false });

type SourceResolution = {
  sourceProjectPath: string;
  sourceHint: string;
};

async function fileExists(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function listTmpSubdirs(tmpRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(tmpRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function resolveDeploySourceProject(): Promise<SourceResolution> {
  const explicit = process.env.REAL_DEPLOY_SOURCE_PROJECT_JSON?.trim();
  if (explicit) {
    const abs = path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit);
    if (!(await fileExists(abs))) {
      throw new Error(`REAL_DEPLOY_SOURCE_PROJECT_JSON not found: ${abs}`);
    }
    return {
      sourceProjectPath: abs,
      sourceHint: "REAL_DEPLOY_SOURCE_PROJECT_JSON",
    };
  }

  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  const subdirs = await listTmpSubdirs(tmpRoot);

  const reportCandidates: Array<{ projectPath: string; reportPath: string; mtimeMs: number }> = [];
  for (const dir of subdirs) {
    const reportPath = path.join(tmpRoot, dir, "report.json");
    if (!(await fileExists(reportPath))) continue;
    try {
      const raw = await fs.readFile(reportPath, "utf8");
      const json = JSON.parse(raw) as any;
      const projectPathRaw = typeof json?.output?.projectJson === "string" ? json.output.projectJson.trim() : "";
      if (!projectPathRaw) continue;
      const projectPath = path.isAbsolute(projectPathRaw)
        ? projectPathRaw
        : path.resolve(process.cwd(), projectPathRaw);
      if (!(await fileExists(projectPath))) continue;
      const stat = await fs.stat(reportPath);
      reportCandidates.push({ projectPath, reportPath, mtimeMs: stat.mtimeMs });
    } catch {
      // Ignore malformed reports and continue scanning.
    }
  }

  if (reportCandidates.length > 0) {
    reportCandidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const picked = reportCandidates[0];
    return {
      sourceProjectPath: picked.projectPath,
      sourceHint: `latest-report-output:${picked.reportPath}`,
    };
  }

  const projectCandidates: Array<{ projectPath: string; mtimeMs: number }> = [];
  for (const dir of subdirs) {
    const projectPath = path.join(tmpRoot, dir, "project.json");
    if (!(await fileExists(projectPath))) continue;
    const stat = await fs.stat(projectPath);
    projectCandidates.push({ projectPath, mtimeMs: stat.mtimeMs });
  }
  if (projectCandidates.length > 0) {
    projectCandidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return {
      sourceProjectPath: projectCandidates[0].projectPath,
      sourceHint: "latest-project-json-in-.tmp",
    };
  }

  throw new Error(
    "No deploy source found. Run mainflow first or set REAL_DEPLOY_SOURCE_PROJECT_JSON to a project.json path."
  );
}

describe("problem1 real deploy flow", () => {
  it(
    "deploys generated LC-CNC site to Cloudflare and verifies it is reachable",
    async () => {
      const outRoot = path.resolve(process.cwd(), ".tmp", "problem1-real-deploy");
      const sourceResolution = await resolveDeploySourceProject();
      const sourceProjectPath = sourceResolution.sourceProjectPath;

      await fs.mkdir(outRoot, { recursive: true });

      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      expect(Boolean(accountId)).toBe(true);
      expect(Boolean(apiToken)).toBe(true);

      const projectRaw = await fs.readFile(sourceProjectPath, "utf8");
      const project = JSON.parse(projectRaw);

      const requestedProjectName = process.env.REAL_DEPLOY_PROJECT_NAME?.trim();
      const projectName =
        requestedProjectName && requestedProjectName.length > 0
          ? requestedProjectName
          : `lc-cnc-real-${Date.now().toString().slice(-8)}`;
      const cf = new CloudflareClient();

      await cf.createProject(projectName);
      await sleep(3000);

      const bundle = await Bundler.createBundle(project);
      const deployment = await cf.uploadDeployment(projectName, bundle);
      const url = `https://${projectName}.pages.dev`;

      let reachable = false;
      let status: number | null = null;
      let error: string | null = null;

      for (let i = 0; i < 12; i += 1) {
        try {
          const ping = await fetch(url, { method: "GET" });
          status = ping.status;
          if (ping.ok) {
            reachable = true;
            break;
          }
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
        await sleep(5000);
      }

      const report = {
        generatedAt: new Date().toISOString(),
        sourceProjectPath,
        sourceHint: sourceResolution.sourceHint,
        projectName,
        url,
        pageCount: (project.pages || []).length,
        deploymentId: deployment?.result?.id || deployment?.id || null,
        reachable,
        status,
        error,
      };

      await fs.writeFile(
        path.join(outRoot, "report.json"),
        JSON.stringify(report, null, 2),
        "utf8"
      );

      console.log("REAL_DEPLOY_REPORT=" + JSON.stringify(report));
      expect(reachable).toBe(true);
    },
    900000
  );
});
