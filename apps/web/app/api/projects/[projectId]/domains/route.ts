import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";
import { CloudflareClient, type CloudflarePagesDomain } from "@/lib/cloudflare";
import {
  deleteProjectCustomDomain,
  getOwnedProjectSummary,
  listProjectCustomDomains,
  upsertProjectCustomDomain,
} from "@/lib/agent/db";
import { provisionProjectWebAnalyticsSite } from "@/lib/project-web-analytics";
import { BillingAccessError, assertCanMutatePublishedSite } from "@/lib/billing/enforcement";

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

const DEFAULT_DNS_HOST = String(process.env.CLOUDFLARE_SAAS_DNS_HOST || "@").trim() || "@";

function resolveProjectDnsTarget(project: { deploymentHost?: string | null }): string {
  return toHost(project.deploymentHost || "");
}

function pagesProjectNameFromHost(host: string): string {
  const normalized = toHost(host);
  return normalized.endsWith(".pages.dev") ? normalized.slice(0, -".pages.dev".length) : "";
}

function pagesDomainSslStatus(domain: CloudflarePagesDomain): string | null {
  return String(domain.verificationStatus || domain.validationStatus || "").trim() || null;
}

function pagesDomainErrors(domain: CloudflarePagesDomain): string[] | null {
  const values = [domain.validationError, domain.verificationError].map((item) => String(item || "").trim()).filter(Boolean);
  return values.length > 0 ? values : null;
}

function isIgnorablePagesDomainMissingError(error: unknown): boolean {
  const message = String((error as any)?.message || error || "").trim().toLowerCase();
  if (!message) return false;
  return message.includes("does not exist") || message.includes("not found");
}

async function requireOwnedProject(projectId: string, userId: string) {
  const project = await getOwnedProjectSummary(projectId, userId);
  if (!project) {
    return {
      error: NextResponse.json({ ok: false, error: "Project not found or access denied." }, { status: 404 }),
      project: null,
    };
  }
  return { error: null, project };
}

async function requireDomainMutationAccess(userId: string) {
  try {
    await assertCanMutatePublishedSite(userId);
    return null;
  } catch (error) {
    if (error instanceof BillingAccessError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
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
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });

    const owned = await requireOwnedProject(projectId, userId);
    if (owned.error) return owned.error;
    const project = owned.project;

    let domains = await listProjectCustomDomains(projectId, userId);
    const shouldRefresh = String(request.nextUrl.searchParams.get("refresh") || "").trim() === "1";
    const cf = new CloudflareClient();
    const pagesProjectName = pagesProjectNameFromHost(project.deploymentHost || "");
    if (shouldRefresh && cf.isConfigured() && pagesProjectName) {
      try {
        const remoteDomains = await cf.listPagesProjectDomains(pagesProjectName);
        if (remoteDomains.length > 0) {
          await Promise.all(
            remoteDomains.map((domain) =>
              upsertProjectCustomDomain({
                projectId,
                userId,
                hostname: domain.name,
                status: domain.status || "pending",
                customHostnameId: domain.id || null,
                sslStatus: pagesDomainSslStatus(domain),
                verificationErrors: pagesDomainErrors(domain),
                originHost: toHost(project.deploymentHost || "") || null,
              }),
            ),
          );
          domains = await listProjectCustomDomains(projectId, userId);
        }
      } catch {
        // best-effort status refresh
      }
    }
    const dnsTarget = resolveProjectDnsTarget(project);
    return NextResponse.json({
      ok: true,
      project,
      domains,
      dns: {
        type: "CNAME",
        host: DEFAULT_DNS_HOST,
        target: dnsTarget,
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

    const owned = await requireOwnedProject(projectId, userId);
    if (owned.error) return owned.error;
    const project = owned.project;
    const accessError = await requireDomainMutationAccess(userId);
    if (accessError) return accessError;

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
    const pagesProjectName = pagesProjectNameFromHost(project.deploymentHost || "");
    if (!cf.isConfigured()) {
      return NextResponse.json({ ok: false, error: "Cloudflare API is not configured on server env yet (missing account/token)." }, { status: 500 });
    }
    if (!pagesProjectName) {
      return NextResponse.json(
        { ok: false, error: "Current project has no resolvable Cloudflare Pages deployment host yet. Deploy the site first, then bind a custom domain." },
        { status: 400 },
      );
    }

    let status = "pending";
    let customHostnameId: string | null = null;
    let sslStatus: string | null = null;
    let verificationErrors: unknown[] | null = null;
    try {
      const ensured = await cf.ensurePagesProjectDomain(pagesProjectName, hostname);
      status = ensured.status || "pending";
      customHostnameId = ensured.id || null;
      sslStatus = ensured.verificationStatus || ensured.validationStatus || null;
      verificationErrors = [ensured.validationError, ensured.verificationError].filter(Boolean);
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: String((error as any)?.message || error || "Failed to bind domain to Cloudflare Pages project.") },
        { status: 400 },
      );
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

    const analyticsDeploymentUrl = project.latestDeploymentUrl || (project.deploymentHost ? `https://${project.deploymentHost}` : null);
    const analyticsResult = await provisionProjectWebAnalyticsSite({
      projectId,
      userId,
      deploymentUrl: analyticsDeploymentUrl,
      host: hostname,
      cf,
    });

    const domains = await listProjectCustomDomains(projectId, userId);
    const dnsTarget = resolveProjectDnsTarget(project);
    return NextResponse.json({
      ok: true,
      project,
      domain: domains.find((item) => item.hostname === hostname) || null,
      domains,
      dns: {
        type: "CNAME",
        host: DEFAULT_DNS_HOST,
        fqdn: hostname,
        target: dnsTarget,
      },
      ...(analyticsResult.warning ? { warning: analyticsResult.warning } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create project domain.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });

    const owned = await requireOwnedProject(projectId, userId);
    if (owned.error) return owned.error;
    const project = owned.project;
    const accessError = await requireDomainMutationAccess(userId);
    if (accessError) return accessError;

    const body = (await request.json().catch(() => ({}))) as {
      currentHostname?: string;
      hostname?: string;
    };

    const currentHostname = toHost(String(body.currentHostname || ""));
    const nextHostname = toHost(String(body.hostname || ""));
    if (!currentHostname || !isValidHostname(currentHostname)) {
      return NextResponse.json({ ok: false, error: "Invalid current hostname." }, { status: 400 });
    }
    if (!nextHostname || !isValidHostname(nextHostname)) {
      return NextResponse.json({ ok: false, error: "Invalid hostname." }, { status: 400 });
    }

    const cf = new CloudflareClient();
    const pagesProjectName = pagesProjectNameFromHost(project.deploymentHost || "");
    const originHost = toHost(project.deploymentHost || "");
    if (!cf.isConfigured()) {
      return NextResponse.json({ ok: false, error: "Cloudflare API is not configured on server env yet (missing account/token)." }, { status: 500 });
    }
    if (!pagesProjectName) {
      return NextResponse.json(
        { ok: false, error: "Current project has no resolvable Cloudflare Pages deployment host yet. Deploy the site first, then bind a custom domain." },
        { status: 400 },
      );
    }

    let status = "pending";
    let customHostnameId: string | null = null;
    let sslStatus: string | null = null;
    let verificationErrors: unknown[] | null = null;
    try {
      const ensured = await cf.ensurePagesProjectDomain(pagesProjectName, nextHostname);
      status = ensured.status || "pending";
      customHostnameId = ensured.id || null;
      sslStatus = ensured.verificationStatus || ensured.validationStatus || null;
      verificationErrors = [ensured.validationError, ensured.verificationError].filter(Boolean);
      if (currentHostname !== nextHostname) {
        try {
          await cf.deletePagesProjectDomain(pagesProjectName, currentHostname);
        } catch (error) {
          if (!isIgnorablePagesDomainMissingError(error)) throw error;
        }
      }
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: String((error as any)?.message || error || "Failed to update Cloudflare Pages custom domain.") },
        { status: 400 },
      );
    }

    if (currentHostname !== nextHostname) {
      await deleteProjectCustomDomain({ projectId, userId, hostname: currentHostname });
    }
    await upsertProjectCustomDomain({
      projectId,
      userId,
      hostname: nextHostname,
      status,
      customHostnameId,
      sslStatus,
      verificationErrors,
      originHost: originHost || null,
    });

    const analyticsDeploymentUrl = project.latestDeploymentUrl || (project.deploymentHost ? `https://${project.deploymentHost}` : null);
    const analyticsResult = await provisionProjectWebAnalyticsSite({
      projectId,
      userId,
      deploymentUrl: analyticsDeploymentUrl,
      host: nextHostname,
      cf,
    });

    const domains = await listProjectCustomDomains(projectId, userId);
    return NextResponse.json({
      ok: true,
      project,
      domain: domains.find((item) => item.hostname === nextHostname) || null,
      domains,
      dns: {
        type: "CNAME",
        host: DEFAULT_DNS_HOST,
        fqdn: nextHostname,
        target: resolveProjectDnsTarget(project),
      },
      ...(analyticsResult.warning ? { warning: analyticsResult.warning } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update project domain.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });

    const owned = await requireOwnedProject(projectId, userId);
    if (owned.error) return owned.error;
    const project = owned.project;
    const accessError = await requireDomainMutationAccess(userId);
    if (accessError) return accessError;

    const body = (await request.json().catch(() => ({}))) as {
      hostname?: string;
    };
    const hostname = toHost(String(body.hostname || ""));
    if (!hostname || !isValidHostname(hostname)) {
      return NextResponse.json({ ok: false, error: "Invalid hostname." }, { status: 400 });
    }

    const cf = new CloudflareClient();
    const pagesProjectName = pagesProjectNameFromHost(project.deploymentHost || "");
    if (cf.isConfigured() && pagesProjectName) {
      try {
        await cf.deletePagesProjectDomain(pagesProjectName, hostname);
      } catch (error) {
        if (!isIgnorablePagesDomainMissingError(error)) {
          return NextResponse.json(
            { ok: false, error: String((error as any)?.message || error || "Failed to remove Cloudflare Pages custom domain.") },
            { status: 400 },
          );
        }
      }
    }

    await deleteProjectCustomDomain({ projectId, userId, hostname });
    const domains = await listProjectCustomDomains(projectId, userId);
    return NextResponse.json({
      ok: true,
      project,
      domains,
      dns: {
        type: "CNAME",
        host: DEFAULT_DNS_HOST,
        target: resolveProjectDnsTarget(project),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete project domain.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
