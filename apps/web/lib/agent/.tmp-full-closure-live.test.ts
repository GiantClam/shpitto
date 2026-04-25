import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false });
process.env.CLOUDFLARE_REQUIRE_REAL = "1";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHost(input: string): string {
  const text = String(input || "").trim().toLowerCase();
  if (!text) return "";
  try {
    if (/^https?:\/\//.test(text)) return new URL(text).host.toLowerCase();
  } catch {
    // ignore
  }
  return text.replace(/^\/+|\/+$/g, "");
}

describe("tmp full closure live e2e", () => {
  it(
    "runs generate -> modify -> deploy -> domain -> assets -> analytics",
    async () => {
      const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
      process.env.CHAT_TASKS_USE_SUPABASE = "0";

      const ownerUserId = String(process.env.E2E_OWNER_USER_ID || "shpitto-owner").trim();
      const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
      expect(apiToken).toBeTruthy();

      const { CloudflareClient } = await import("../cloudflare");
      const { getLatestChatTaskForChat } = await import("./chat-task-store");
      const { listProjectAssets, syncGeneratedProjectAssetsFromSite } = await import("../project-assets");
      const {
        getProjectAnalyticsBinding,
        getOwnedProjectSummary,
        saveProjectState,
        upsertProjectCustomDomain,
      } = await import("./db");

      const cf = new CloudflareClient();
      expect(cf.isConfigured()).toBe(true);

      const chatId = `closure-live-${Date.now()}`;
      const projectId = chatId;
      const domainHost = `closure-${Date.now()}.coworkany.com`;

      const { POST } = await import("../../app/api/chat/route");
      const { GET: getTaskStatus } = await import("../../app/api/chat/tasks/[taskId]/route");
      const { GET: getPreviewFile } = await import("../../app/api/chat/tasks/[taskId]/preview/[...path]/route");
      const { runChatTaskWorkerOnce } = await import("../../scripts/chat-task-worker");

      async function waitTask(taskId: string, maxLoops = 16) {
        let latest: any = null;
        for (let i = 0; i < maxLoops; i += 1) {
          await runChatTaskWorkerOnce();
          const statusRes = await getTaskStatus(new Request("http://localhost"), {
            params: Promise.resolve({ taskId }),
          });
          latest = await statusRes.json();
          const status = String(latest?.task?.status || "");
          if (status === "succeeded" || status === "failed") return latest;
          await sleep(1_500);
        }
        return latest;
      }

      async function postChat(text: string) {
        return POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: chatId,
              user_id: ownerUserId,
              messages: [{ role: "user", parts: [{ type: "text", text }] }],
            }),
          }),
        );
      }

      try {
        // 1) Generate
        const generatePrompt =
          "__SHP_CONFIRM_GENERATE__\nGenerate an industrial LC-CNC multi-page website with Home/About/Products/Cases/Contact in English.";
        const genRes = await postChat(generatePrompt);
        expect(genRes.status).toBe(202);

        const queuedGen = await getLatestChatTaskForChat(chatId);
        expect(queuedGen?.id).toBeTruthy();
        const doneGen = await waitTask(String(queuedGen?.id || ""));
        expect(doneGen?.task?.status).toBe("succeeded");
        expect(["done", "refined"]).toContain(String(doneGen?.task?.result?.progress?.stage || ""));

        const genTaskId = String(queuedGen?.id || "");
        const genPreviewRes = await getPreviewFile(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: genTaskId, path: ["index.html"] }),
        });
        expect(genPreviewRes.status).toBe(200);
        const genPreviewHtml = await genPreviewRes.text();
        expect(genPreviewHtml.toLowerCase()).toContain("<!doctype html");

        // 2) Modify (refine)
        const refineRes = await postChat(
          "Please change accent color to blue. Keep all pages, structure, and content unchanged.",
        );
        expect(refineRes.status).toBe(202);

        const queuedRefine = await getLatestChatTaskForChat(chatId);
        expect(queuedRefine?.id).toBeTruthy();
        expect(queuedRefine?.id).not.toBe(queuedGen?.id);
        const doneRefine = await waitTask(String(queuedRefine?.id || ""));
        expect(doneRefine?.task?.status).toBe("succeeded");
        expect(["refined", "done"]).toContain(String(doneRefine?.task?.result?.progress?.stage || ""));

        const refineTaskId = String(queuedRefine?.id || "");
        const refineStylesRes = await getPreviewFile(new Request("http://localhost"), {
          params: Promise.resolve({ taskId: refineTaskId, path: ["styles.css"] }),
        });
        expect(refineStylesRes.status).toBe(200);
        const refineStyles = await refineStylesRes.text();
        expect(refineStyles).toContain("refine-runtime-accent");

        // 3) Deploy
        const deployRes = await postChat("deploy to cloudflare");
        expect(deployRes.status).toBe(202);
        const queuedDeploy = await getLatestChatTaskForChat(chatId);
        expect(queuedDeploy?.id).toBeTruthy();
        const doneDeploy = await waitTask(String(queuedDeploy?.id || ""), 24);
        expect(doneDeploy?.task?.status).toBe("succeeded");
        expect(String(doneDeploy?.task?.result?.progress?.stage || "")).toBe("deployed");

        const deployedUrl = String(doneDeploy?.task?.result?.deployedUrl || "").trim();
        expect(deployedUrl).toContain(".pages.dev");
        const deploymentHost = normalizeHost(deployedUrl);
        expect(deploymentHost).toBeTruthy();

        // ensure and verify D1 project mapping exists for downstream domain/data binds
        const deploySourceProjectPath = String(
          doneRefine?.task?.result?.progress?.checkpointProjectPath ||
            doneGen?.task?.result?.progress?.checkpointProjectPath ||
            "",
        ).trim();
        expect(deploySourceProjectPath).toBeTruthy();
        const deployProjectJson = JSON.parse(await fs.readFile(deploySourceProjectPath, "utf8"));
        await saveProjectState(ownerUserId, deployProjectJson, undefined, projectId);

        const projectSummary = await getOwnedProjectSummary(projectId, ownerUserId);
        expect(projectSummary?.projectId).toBe(projectId);

        // 4) Domain bind (custom hostname + DNS)
        const ensured = await cf.ensureCustomHostname({ hostname: domainHost });
        await cf.ensureSaasRouterRouteForHostname(domainHost);

        await upsertProjectCustomDomain({
          projectId,
          userId: ownerUserId,
          hostname: domainHost,
          status: ensured.status || "pending",
          customHostnameId: ensured.id || null,
          sslStatus: ensured.sslStatus || null,
          verificationErrors: ensured.verificationErrors,
          originHost: deploymentHost,
        });

        const zoneRes = await fetch("https://api.cloudflare.com/client/v4/zones?name=coworkany.com", {
          headers: { Authorization: `Bearer ${apiToken}` },
        });
        const zoneJson = await zoneRes.json();
        const coworkanyZoneId = String(zoneJson?.result?.[0]?.id || "");
        expect(coworkanyZoneId).toBeTruthy();

        const cnameTarget = String(process.env.CLOUDFLARE_SAAS_CNAME_TARGET || "customers.shpitto.com").trim();
        const dnsBody = {
          type: "CNAME",
          name: domainHost,
          content: cnameTarget,
          proxied: true,
          ttl: 1,
        };

        const dnsListRes = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${coworkanyZoneId}/dns_records?type=CNAME&name=${encodeURIComponent(domainHost)}`,
          { headers: { Authorization: `Bearer ${apiToken}` } },
        );
        const dnsListJson = await dnsListRes.json();
        expect(dnsListRes.ok).toBe(true);
        const existingDnsId = String(dnsListJson?.result?.[0]?.id || "");
        if (existingDnsId) {
          const updateDnsRes = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${coworkanyZoneId}/dns_records/${existingDnsId}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(dnsBody),
            },
          );
          const updateDnsJson = await updateDnsRes.json();
          expect(updateDnsRes.ok).toBe(true);
          expect(updateDnsJson?.success).toBe(true);
        } else {
          const createDnsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${coworkanyZoneId}/dns_records`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(dnsBody),
          });
          const createDnsJson = await createDnsRes.json();
          expect(createDnsRes.ok).toBe(true);
          expect(createDnsJson?.success).toBe(true);
        }

        const verifyDnsRes = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${coworkanyZoneId}/dns_records?type=CNAME&name=${encodeURIComponent(domainHost)}`,
          { headers: { Authorization: `Bearer ${apiToken}` } },
        );
        const verifyDnsJson = await verifyDnsRes.json();
        expect(verifyDnsRes.ok).toBe(true);
        expect(verifyDnsJson?.success).toBe(true);
        expect(String(verifyDnsJson?.result?.[0]?.content || "")).toBe(cnameTarget);

        const verifyCustomHostnames = await cf.listCustomHostnames(domainHost);
        const currentCustomHostname = verifyCustomHostnames.find((item) => item.hostname === domainHost);
        expect(currentCustomHostname).toBeTruthy();

        // best-effort live probe (propagation may take time)
        await sleep(4_000);
        await fetch(`https://${domainHost}/`, {
          method: "GET",
          redirect: "manual",
        }).catch(() => null);

        // 5) Assets sync/list
        const refineGeneratedFiles = Array.isArray(doneRefine?.task?.result?.progress?.generatedFiles)
          ? (doneRefine.task.result.progress.generatedFiles as string[])
          : [];
        const refineSiteDir = String(doneRefine?.task?.result?.progress?.checkpointSiteDir || "").trim();
        if (refineTaskId && refineSiteDir && refineGeneratedFiles.length > 0) {
          await syncGeneratedProjectAssetsFromSite({
            ownerUserId,
            projectId,
            taskId: refineTaskId,
            siteDir: refineSiteDir,
            generatedFiles: refineGeneratedFiles,
          });
        }
        const assets = await listProjectAssets({ ownerUserId, projectId });
        expect(Array.isArray(assets)).toBe(true);
        expect(assets.length).toBeGreaterThan(0);
        expect(assets.some((asset) => String(asset.path || "") === "index.html")).toBe(true);

        // 6) Analytics query (reuse deploy-bound siteTag to avoid creating extra WA sites)
        const analyticsBinding = await getProjectAnalyticsBinding(projectId, ownerUserId);
        const siteTag = String(analyticsBinding?.cfWaSiteTag || "").trim();
        expect(siteTag).toBeTruthy();

        for (let i = 0; i < 3; i += 1) {
          try {
            await fetch(`https://${domainHost}/`, { redirect: "manual" });
          } catch {
            // best effort
          }
          await sleep(800);
        }

        const analytics = await cf.queryAnalyticsBySiteTag({
          siteTag,
          startAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endAt: new Date().toISOString(),
          limit: 10,
        });
        expect(typeof analytics?.totals?.visits).toBe("number");
        expect(typeof analytics?.totals?.pageViews).toBe("number");

        console.log(
          "FULL_CLOSURE_LIVE_REPORT=" +
            JSON.stringify({
              generatedAt: new Date().toISOString(),
              chatId,
              projectId,
              ownerUserId,
              generateTaskId: queuedGen?.id,
              refineTaskId,
              deployTaskId: queuedDeploy?.id,
              deployedUrl,
              deploymentHost,
              domainHost,
              customHostnameStatus: ensured.status,
              assetsCount: assets.length,
              waSiteTag: siteTag,
              analyticsTotals: analytics.totals,
            }),
        );
      } finally {
        if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
        else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
      }
    },
    1_200_000,
  );
});
