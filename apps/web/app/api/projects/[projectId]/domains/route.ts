import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";
import { CloudflareClient } from "@/lib/cloudflare";
import {
  getOwnedProjectSummary,
  listProjectCustomDomains,
  upsertProjectCustomDomain,
} from "@/lib/agent/db";

export const runtime = "nodejs";

function toHost(value: string): string {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (/^https?:\/\//.test(text)) {
    try {
      return new URL(text).host.toLowerCase();
    } catch {
      return "";
    }
  }
  return text.replace(/^\/+|\/+$/g, "");
}

function isValidHostname(host: string): boolean {
  if (!host || host.length > 253) return false;
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host);
}

const DEFAULT_CNAME_TARGET = String(process.env.CLOUDFLARE_SAAS_CNAME_TARGET || "customers.shpitto.com").trim();
const DEFAULT_DNS_HOST = String(process.env.CLOUDFLARE_SAAS_DNS_HOST || "@").trim() || "@";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });

    const project = await getOwnedProjectSummary(projectId, userId);
    if (!project) return NextResponse.json({ ok: false, error: "Project not found or access denied." }, { status: 404 });

    const domains = await listProjectCustomDomains(projectId, userId);
    return NextResponse.json({
      ok: true,
      project,
      domains,
      dns: {
        type: "CNAME",
        host: DEFAULT_DNS_HOST,
        target: DEFAULT_CNAME_TARGET,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list project domains.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });

    const project = await getOwnedProjectSummary(projectId, userId);
    if (!project) return NextResponse.json({ ok: false, error: "Project not found or access denied." }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as {
      hostname?: string;
      customOriginServer?: string;
    };

    const hostname = toHost(String(body.hostname || ""));
    if (!hostname || !isValidHostname(hostname)) {
      return NextResponse.json({ ok: false, error: "Invalid hostname." }, { status: 400 });
    }

    const explicitCustomOriginHost = toHost(String(body.customOriginServer || ""));
    const originHost = explicitCustomOriginHost || toHost(project.deploymentHost || "");

    const cf = new CloudflareClient();
    let status = "pending";
    let customHostnameId: string | null = null;
    let sslStatus: string | null = null;
    let verificationErrors: unknown[] | null = null;
    const warnings: string[] = [];
    let customHostnameEnsured = false;

    if (cf.isSaasReady()) {
      try {
        const ensured = await cf.ensureCustomHostname(
          explicitCustomOriginHost
            ? {
                hostname,
                customOriginServer: explicitCustomOriginHost,
              }
            : { hostname },
        );
        status = ensured.status || "pending";
        customHostnameId = ensured.id || null;
        sslStatus = ensured.sslStatus || null;
        verificationErrors = ensured.verificationErrors;
        customHostnameEnsured = true;
      } catch (error) {
        warnings.push(String((error as any)?.message || error || "Failed to ensure custom hostname on Cloudflare."));
        status = "pending";
      }

      if (customHostnameEnsured) {
        try {
          await cf.ensureSaasRouterRouteForHostname(hostname);
        } catch (error) {
          warnings.push(String((error as any)?.message || error || "Failed to ensure Worker route on Cloudflare."));
        }
      }
    } else {
      warnings.push("Cloudflare for SaaS is not configured on server env yet (missing CLOUDFLARE_ZONE_ID/API token).");
    }

    await upsertProjectCustomDomain({
      projectId,
      userId,
      hostname,
      status,
      customHostnameId,
      sslStatus,
      verificationErrors,
      originHost: originHost || null,
    });

    const domains = await listProjectCustomDomains(projectId, userId);
    return NextResponse.json({
      ok: true,
      project,
      domain: domains.find((item) => item.hostname === hostname) || null,
      domains,
      dns: {
        type: "CNAME",
        host: DEFAULT_DNS_HOST,
        fqdn: hostname,
        target: DEFAULT_CNAME_TARGET,
      },
      ...(warnings.length > 0 ? { warning: warnings.join(" | "), warnings } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create project domain.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
