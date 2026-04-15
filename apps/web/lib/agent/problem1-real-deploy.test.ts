import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import dotenv from "dotenv";
import { CloudflareClient } from "../cloudflare";
import { Bundler } from "../bundler";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

describe("problem1 real deploy flow", () => {
  it(
    "deploys generated LC-CNC site to Cloudflare and verifies it is reachable",
    async () => {
      const outRoot = path.resolve(process.cwd(), ".tmp", "problem1-real-deploy");
      const sourceProjectPath = path.resolve(
        process.cwd(),
        ".tmp",
        "problem1-real-aiberm",
        "project.json"
      );

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
