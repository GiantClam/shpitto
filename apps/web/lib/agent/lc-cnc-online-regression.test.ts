import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import { Bundler } from "../bundler";
import { CloudflareClient } from "../cloudflare";
import { TEST_PROJECT_LC_CNC } from "./test_cases";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

describe("lc-cnc online regression", () => {
  it(
    "deploys complete LC-CNC site and verifies all page routes",
    async () => {
      const outRoot = path.resolve(process.cwd(), ".tmp", "lc-cnc-online-regression");
      await fs.mkdir(outRoot, { recursive: true });

      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      expect(Boolean(accountId)).toBe(true);
      expect(Boolean(apiToken)).toBe(true);

      const project = structuredClone(TEST_PROJECT_LC_CNC) as any;
      const projectName = `lc-cnc-reg-${Date.now().toString().slice(-8)}`;
      const cf = new CloudflareClient();

      await cf.createProject(projectName);
      await sleep(3000);

      const bundle = await Bundler.createBundle(project);
      const deployment = await cf.uploadDeployment(projectName, bundle);
      const baseUrl = `https://${projectName}.pages.dev`;

      const pageRoutes: string[] = (project.pages || []).map((p: any) => p.path || "/");
      const routeChecks: Array<{ path: string; ok: boolean; status: number | null; error: string | null }> = [];

      // Wait root ready
      let rootReady = false;
      for (let i = 0; i < 12; i += 1) {
        try {
          const r = await fetch(baseUrl, { method: "GET" });
          if (r.ok) {
            rootReady = true;
            break;
          }
        } catch {}
        await sleep(5000);
      }
      expect(rootReady).toBe(true);

      for (const route of pageRoutes) {
        const url = route === "/" ? `${baseUrl}/` : `${baseUrl}${route.endsWith("/") ? route : `${route}/`}`;
        let ok = false;
        let status: number | null = null;
        let error: string | null = null;

        try {
          const r = await fetch(url, { method: "GET" });
          status = r.status;
          ok = r.ok;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }

        routeChecks.push({ path: route, ok, status, error });
      }

      const report = {
        generatedAt: new Date().toISOString(),
        projectName,
        url: baseUrl,
        pageCount: pageRoutes.length,
        deploymentId: deployment?.result?.id || deployment?.id || null,
        routeChecks,
      };

      await fs.writeFile(path.join(outRoot, "report.json"), JSON.stringify(report, null, 2), "utf8");
      console.log("LC_CNC_ONLINE_REGRESSION_REPORT=" + JSON.stringify(report));

      expect(pageRoutes.length).toBeGreaterThanOrEqual(6);
      expect(routeChecks.every((x) => x.ok)).toBe(true);
    },
    900000,
  );
});
