import { CloudflareClient, type CloudflareWebAnalyticsSite } from "@/lib/cloudflare";
import { upsertProjectSiteBinding } from "@/lib/agent/db";

export type WebAnalyticsProvisionStatus = "pending" | "active" | "degraded";

function normalizeHost(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).host.toLowerCase();
  } catch {
    return raw.replace(/^\/+|\/+$/g, "");
  }
}

function isPagesDevHost(host: string): boolean {
  const normalized = normalizeHost(host);
  return normalized === "pages.dev" || normalized.endsWith(".pages.dev");
}

export function shouldProvisionWebAnalytics(host: string): boolean {
  if (String(process.env.CLOUDFLARE_WA_AUTO_PROVISION || "1").trim() === "0") return false;
  if (isPagesDevHost(host)) {
    return String(process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV || "").trim() === "1";
  }
  return true;
}

export async function provisionProjectWebAnalyticsSite(params: {
  projectId: string;
  userId: string;
  deploymentUrl?: string | null;
  host: string;
  cf?: CloudflareClient;
}): Promise<{
  status: WebAnalyticsProvisionStatus;
  site: CloudflareWebAnalyticsSite | null;
  warning: string;
}> {
  const normalizedHost = normalizeHost(params.host);
  const deploymentUrl = String(params.deploymentUrl || "").trim() || (normalizedHost ? `https://${normalizedHost}` : "");
  if (!normalizedHost) {
    return {
      status: "pending",
      site: null,
      warning: "Missing analytics host.",
    };
  }

  if (!shouldProvisionWebAnalytics(normalizedHost)) {
    return {
      status: "pending",
      site: null,
      warning:
        "Cloudflare Web Analytics is skipped for pages.dev preview deployments. Bind a custom domain or enable CLOUDFLARE_WA_ENABLE_PAGES_DEV=1 to collect Web Analytics.",
    };
  }

  const cf = params.cf || new CloudflareClient();
  try {
    const site = await cf.ensureWebAnalyticsSite(normalizedHost);
    await upsertProjectSiteBinding(params.projectId, params.userId, deploymentUrl || null, {
      analyticsProvider: "cloudflare_web_analytics",
      analyticsStatus: "active",
      analyticsLastSyncAt: new Date().toISOString(),
      cfWaSiteId: site.siteId,
      cfWaSiteTag: site.siteTag,
      cfWaSiteToken: site.siteToken || null,
      cfWaHost: site.host || normalizedHost,
    });
    return {
      status: "active",
      site,
      warning: "",
    };
  } catch (error) {
    const warning = String((error as any)?.message || error || "Failed to provision analytics site token.");
    await upsertProjectSiteBinding(params.projectId, params.userId, deploymentUrl || null, {
      analyticsProvider: "cloudflare_web_analytics",
      analyticsStatus: "degraded",
      analyticsLastSyncAt: new Date().toISOString(),
      cfWaHost: normalizedHost,
    });
    return {
      status: "degraded",
      site: null,
      warning,
    };
  }
}
