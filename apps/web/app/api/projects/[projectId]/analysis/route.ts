import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";
import { CloudflareClient } from "@/lib/cloudflare";
import { getD1Client } from "@/lib/d1";
import { getProjectAnalyticsBinding, upsertProjectSiteBinding } from "@/lib/agent/db";

export const runtime = "nodejs";

type AnalyticsStatus = "pending" | "active" | "degraded" | "not_configured";

function normalizeDeployHost(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).host.toLowerCase();
  } catch {
    return raw.replace(/^\/+|\/+$/g, "");
  }
}

function isPagesDevHost(host: string): boolean {
  const normalized = normalizeDeployHost(host);
  return normalized === "pages.dev" || normalized.endsWith(".pages.dev");
}

function shouldProvisionWebAnalytics(host: string): boolean {
  if (String(process.env.CLOUDFLARE_WA_AUTO_PROVISION || "1").trim() === "0") return false;
  if (isPagesDevHost(host)) {
    return String(process.env.CLOUDFLARE_WA_ENABLE_PAGES_DEV || "").trim() === "1";
  }
  return true;
}

function defaultWindow() {
  const now = new Date();
  const endAt = now.toISOString();
  const startAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return { startAt, endAt };
}

function normalizeDateInput(raw: string | null, fallback: string): string {
  const text = String(raw || "").trim();
  if (!text) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${text}T00:00:00.000Z`;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

function normalizeDateInputEnd(raw: string | null, fallback: string): string {
  const text = String(raw || "").trim();
  if (!text) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${text}T23:59:59.999Z`;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

function emptyAnalytics(window: { startAt: string; endAt: string }, status: AnalyticsStatus) {
  return {
    status,
    provider: "cloudflare_web_analytics",
    window,
    totals: {
      visits: 0,
      pageViews: 0,
      bounceRate: null,
      avgVisitDurationSeconds: null,
    },
    pages: [] as Array<{ requestPath: string; visits: number; pageViews: number }>,
    sources: [] as Array<{
      refererHost: string;
      refererPath: string;
      channel: "direct" | "search" | "social" | "referral";
      visits: number;
      pageViews: number;
    }>,
    channels: [
      { channel: "direct", visits: 0, pageViews: 0 },
      { channel: "search", visits: 0, pageViews: 0 },
      { channel: "social", visits: 0, pageViews: 0 },
      { channel: "referral", visits: 0, pageViews: 0 },
    ],
    capabilities: {
      hasBounceRate: false,
      hasAvgVisitDuration: false,
      hasPageViews: true,
    },
  };
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });
    }

    const defaultRange = defaultWindow();
    const startAt = normalizeDateInput(request.nextUrl.searchParams.get("start"), defaultRange.startAt);
    const endAt = normalizeDateInputEnd(request.nextUrl.searchParams.get("end"), defaultRange.endAt);
    const limit = Math.max(5, Math.min(100, Number(request.nextUrl.searchParams.get("limit") || 20)));

    const d1 = getD1Client();
    if (!d1.isConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Cloudflare D1 is not configured.",
          analytics: emptyAnalytics({ startAt, endAt }, "not_configured"),
        },
        { status: 503 },
      );
    }

    const binding = await getProjectAnalyticsBinding(projectId, userId);
    if (!binding) {
      return NextResponse.json({ ok: false, error: "Project not found or access denied." }, { status: 404 });
    }

    const project = {
      id: binding.projectId,
      name: binding.projectName,
      latestDeploymentUrl: binding.latestDeploymentUrl,
      deploymentHost: binding.deploymentHost || binding.cfWaHost,
    };

    const cf = new CloudflareClient();
    const deploymentHost = String(binding.cfWaHost || binding.deploymentHost || "").trim();
    let siteTag = String(binding.cfWaSiteTag || "").trim();
    let siteId = String(binding.cfWaSiteId || "").trim();
    let siteToken = String(binding.cfWaSiteToken || "").trim();
    let analyticsStatus: AnalyticsStatus = (String(binding.analyticsStatus || "pending").trim() as AnalyticsStatus) || "pending";
    let warning = "";

    if (!siteTag && deploymentHost && shouldProvisionWebAnalytics(deploymentHost)) {
      try {
        const ensured = await cf.ensureWebAnalyticsSite(deploymentHost);
        siteTag = ensured.siteTag;
        siteId = ensured.siteId;
        siteToken = ensured.siteToken || "";
        analyticsStatus = "active";
        await upsertProjectSiteBinding(projectId, userId, binding.latestDeploymentUrl || `https://${deploymentHost}`, {
          analyticsProvider: "cloudflare_web_analytics",
          analyticsStatus: "active",
          analyticsLastSyncAt: new Date().toISOString(),
          cfWaSiteId: siteId,
          cfWaSiteTag: siteTag,
          cfWaSiteToken: siteToken || null,
          cfWaHost: ensured.host || deploymentHost,
        });
      } catch (error) {
        analyticsStatus = "degraded";
        warning = String((error as any)?.message || error || "Failed to provision analytics site token.");
      }
    } else if (!siteTag && deploymentHost) {
      analyticsStatus = "pending";
      warning =
        "Cloudflare Web Analytics is skipped for pages.dev preview deployments. Bind a custom domain or enable CLOUDFLARE_WA_ENABLE_PAGES_DEV=1 to collect Web Analytics.";
    }

    if (!siteTag) {
      return NextResponse.json({
        ok: true,
        project,
        analytics: {
          ...emptyAnalytics({ startAt, endAt }, analyticsStatus),
          status: analyticsStatus,
          siteTag: "",
          syncedAt: binding.analyticsLastSyncAt || null,
        },
        warning: warning || "Analytics provisioning is pending. Please retry in a few minutes.",
      });
    }

    try {
      const analytics = await cf.queryAnalyticsBySiteTag({
        siteTag,
        startAt,
        endAt,
        limit,
      });
      const syncedAt = new Date().toISOString();
      await upsertProjectSiteBinding(projectId, userId, binding.latestDeploymentUrl || null, {
        analyticsProvider: "cloudflare_web_analytics",
        analyticsStatus: "active",
        analyticsLastSyncAt: syncedAt,
        cfWaSiteId: siteId || null,
        cfWaSiteTag: siteTag,
        cfWaSiteToken: siteToken || null,
        cfWaHost: deploymentHost || null,
      });

      return NextResponse.json({
        ok: true,
        project,
        analytics: {
          ...analytics,
          status: "active",
          provider: "cloudflare_web_analytics",
          siteTag,
          syncedAt,
        },
        ...(warning ? { warning } : {}),
      });
    } catch (error) {
      const message = String((error as any)?.message || error || "Failed to query Cloudflare analytics.");
      const syncedAt = new Date().toISOString();
      await upsertProjectSiteBinding(projectId, userId, binding.latestDeploymentUrl || null, {
        analyticsProvider: "cloudflare_web_analytics",
        analyticsStatus: "degraded",
        analyticsLastSyncAt: syncedAt,
        cfWaSiteId: siteId || null,
        cfWaSiteTag: siteTag,
        cfWaSiteToken: siteToken || null,
        cfWaHost: deploymentHost || null,
      });

      return NextResponse.json({
        ok: true,
        project,
        analytics: {
          ...emptyAnalytics({ startAt, endAt }, "degraded"),
          status: "degraded",
          provider: "cloudflare_web_analytics",
          siteTag,
          syncedAt,
        },
        warning: message,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch project analytics.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
