import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { HumanMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { Bundler } from "../bundler";
import { CloudflareClient } from "../cloudflare";
import { runSkillRuntimeExecutor } from "../skill-runtime/executor";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, maxAttempts = 6): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  let lastStatus: number | null = null;
  let lastError: string | null = null;
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10_000) });
      lastStatus = res.status;
      lastError = null;
      if (res.ok) return { ok: true, status: res.status, error: null };
      if (![408, 429, 500, 502, 503, 504, 522, 524].includes(res.status)) {
        break;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    await sleep(4000);
  }
  return { ok: false, status: lastStatus, error: lastError };
}

dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false });
process.env.CLOUDFLARE_REQUIRE_REAL = "1";

describe("lc-cnc online regression", () => {
  it(
    "runs skill-runtime, deploys generated site, and verifies all routes",
    async () => {
      const outRoot = path.resolve(process.cwd(), ".tmp", "lc-cnc-online-regression");
      await fs.mkdir(outRoot, { recursive: true });

      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      expect(Boolean(accountId)).toBe(true);
      expect(Boolean(apiToken)).toBe(true);

      const prompt = `Generate a complete 6-page LC-CNC static website in English.
Routes: /, /3c-machines, /custom-solutions, /cases, /about, /contact.
Industrial style with clear navigation, shared /styles.css and /script.js.
Contact page must include a quote form with fields: Name, Company, Email, WhatsApp, Machine Model, Quantity, Deadline.`;

      const generated = await runSkillRuntimeExecutor({
        state: {
          messages: [new HumanMessage(prompt)],
          phase: "conversation",
          sitemap: ["/", "/3c-machines", "/custom-solutions", "/cases", "/about", "/contact"],
          workflow_context: { genMode: "skill_native", preferredLocale: "en" },
        } as any,
        timeoutMs: 600000,
      });

      const project = generated.state.site_artifacts as any;
      expect(project).toBeTruthy();
      expect(project?.staticSite?.mode).toBe("skill-direct");
      const staticFiles: any[] = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
      expect(staticFiles.some((f) => String(f?.path || "").toLowerCase() === "/styles.css")).toBe(true);
      expect(staticFiles.some((f) => String(f?.path || "").toLowerCase() === "/script.js")).toBe(true);

      const pageRoutes: string[] = (project.pages || []).map((p: any) => p.path || "/");
      expect(pageRoutes).toEqual(
        expect.arrayContaining(["/", "/3c-machines", "/custom-solutions", "/cases", "/about", "/contact"]),
      );

      for (const page of project.pages || []) {
        const html = String(page?.html || "").toLowerCase();
        expect(html.includes("/styles.css")).toBe(true);
        expect(html.includes("/script.js")).toBe(true);
      }

      const projectName = `lc-cnc-reg-${Date.now().toString().slice(-8)}`;
      const cf = new CloudflareClient();
      await cf.createProject(projectName);
      await sleep(3000);

      const bundle = await Bundler.createBundle(project);
      const deployment = await cf.uploadDeployment(projectName, bundle);
      const baseUrl = `https://${projectName}.pages.dev`;

      const routeChecks: Array<{ path: string; ok: boolean; status: number | null; error: string | null }> = [];
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
        const check = await fetchWithRetry(url, 6);
        routeChecks.push({ path: route, ok: check.ok, status: check.status, error: check.error });
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
