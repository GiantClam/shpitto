import { CloudflareClient } from "../cloudflare.ts";
import { getD1Client } from "../d1.ts";
import { getR2Client } from "../r2.ts";
import { createSupabaseAdminClient } from "../supabase/admin.ts";
import { DEFAULT_BILLING_RETENTION_DAYS } from "./entitlements.ts";

type CleanupCandidate = {
  usageId: string;
  projectId: string;
  ownerUserId: string;
  r2SnapshotKey?: string;
};

type CleanupArtifact = {
  deploymentUrl?: string;
  r2BundlePrefix?: string;
  cfWaSiteTag?: string;
  customHostnameId?: string;
};

export type BillingCleanupResult = {
  scanned: number;
  cleaned: number;
  errors: Array<{ projectId: string; error: string }>;
};

export function pagesProjectNameFromUrl(url: string | undefined): string | undefined {
  const text = String(url || "").trim();
  if (!text) return undefined;
  try {
    const host = new URL(text).host;
    if (!host.endsWith(".pages.dev")) return undefined;
    return host.slice(0, -".pages.dev".length) || undefined;
  } catch {
    const host = text.replace(/^https?:\/\//i, "").split("/")[0] || "";
    if (!host.endsWith(".pages.dev")) return undefined;
    return host.slice(0, -".pages.dev".length) || undefined;
  }
}

export async function cleanupExpiredBillingProjects(params: {
  now?: Date;
  retentionDays?: number;
  limit?: number;
  dryRun?: boolean;
} = {}): Promise<BillingCleanupResult> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return { scanned: 0, cleaned: 0, errors: [] };

  const now = params.now || new Date();
  const retentionDays = params.retentionDays ?? DEFAULT_BILLING_RETENTION_DAYS;
  const limit = Math.max(1, Math.min(100, Number(params.limit || 25)));
  const threshold = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: usageRows, error } = await supabase
    .from("shpitto_billing_project_usages")
    .select("id,owner_user_id,source_project_id")
    .eq("source_app", "shpitto")
    .is("cleanup_completed_at", null)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const candidates: CleanupCandidate[] = [];
  for (const row of usageRows || []) {
    const ownerUserId = String(row.owner_user_id || "");
    const { data: entitlement, error: entitlementError } = await supabase
      .from("shpitto_entitlements")
      .select("valid_until")
      .eq("owner_user_id", ownerUserId)
      .order("valid_until", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (entitlementError) throw entitlementError;
    if (!entitlement?.valid_until || String(entitlement.valid_until) > threshold) continue;

    const projectId = String(row.source_project_id || "");
    const r2SnapshotKey = await getD1ProjectSnapshotKey(projectId);
    candidates.push({
      usageId: String(row.id || ""),
      projectId,
      ownerUserId,
      r2SnapshotKey,
    });
  }

  const result: BillingCleanupResult = { scanned: candidates.length, cleaned: 0, errors: [] };
  for (const candidate of candidates) {
    try {
      if (!params.dryRun) {
        await cleanupProject(candidate, now);
      }
      result.cleaned += 1;
    } catch (error) {
      const message = String((error as any)?.message || error || "cleanup failed");
      result.errors.push({ projectId: candidate.projectId, error: message });
      await markCleanupError(candidate.projectId, message).catch(() => undefined);
    }
  }

  return result;
}

async function cleanupProject(candidate: CleanupCandidate, now: Date) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const d1 = getD1Client();
  const cf = new CloudflareClient();
  const r2 = getR2Client();
  const timestamp = now.toISOString();
  const { error: usageStartError } = await supabase
    .from("shpitto_billing_project_usages")
    .update({
      cleanup_started_at: timestamp,
      cleanup_status: "running",
      cleanup_error: null,
      updated_at: timestamp,
    })
    .eq("id", candidate.usageId);
  if (usageStartError) throw usageStartError;

  if (d1.isConfigured()) {
    await d1.ensureShpittoSchema();
    await d1.execute(
      `
      UPDATE shpitto_projects
      SET cleanup_started_at = COALESCE(cleanup_started_at, ?),
          cleanup_status = 'running',
          cleanup_error = NULL,
          updated_at = ?
      WHERE id = ?;
      `,
      [timestamp, timestamp, candidate.projectId],
    );
  }

  const artifacts = await listCleanupArtifacts(candidate.projectId);
  const r2Prefixes = new Set<string>();
  for (const artifact of artifacts) {
    const pagesProjectName = pagesProjectNameFromUrl(artifact.deploymentUrl);
    if (pagesProjectName) {
      await cf.deletePagesProject(pagesProjectName).catch(() => undefined);
    }
    if (artifact.customHostnameId) {
      await cf.deleteCustomHostname(artifact.customHostnameId).catch(() => undefined);
    }
    if (artifact.cfWaSiteTag) {
      await cf.deleteWebAnalyticsSite(artifact.cfWaSiteTag).catch(() => undefined);
    }
    if (artifact.r2BundlePrefix) {
      r2Prefixes.add(artifact.r2BundlePrefix);
    }
  }
  if (candidate.r2SnapshotKey) {
    await r2.deleteObject(candidate.r2SnapshotKey).catch(() => undefined);
  }
  for (const prefix of r2Prefixes) {
    await deleteR2Prefix(prefix);
  }

  if (d1.isConfigured()) {
    await d1.execute(
      `
      UPDATE shpitto_project_sites
      SET deployment_host = NULL,
          analytics_status = 'deleted',
          analytics_last_sync_at = ?,
          cf_wa_site_id = NULL,
          cf_wa_site_tag = NULL,
          cf_wa_site_token = NULL,
          cf_wa_host = NULL,
          updated_at = ?
      WHERE project_id = ?;
      `,
      [timestamp, timestamp, candidate.projectId],
    );
    await d1.execute(
      `
      UPDATE shpitto_project_domains
      SET status = 'deleted',
          custom_hostname_id = NULL,
          ssl_status = NULL,
          verification_errors_json = NULL,
          updated_at = ?
      WHERE project_id = ?;
      `,
      [timestamp, candidate.projectId],
    );
    await d1.execute(
      `
      UPDATE shpitto_projects
      SET config_json = '{}',
          r2_snapshot_key = NULL,
          cleanup_completed_at = ?,
          cleanup_status = 'completed',
          cleanup_error = NULL,
          updated_at = ?
      WHERE id = ?;
      `,
      [timestamp, timestamp, candidate.projectId],
    );
  }

  const { error: usageCompleteError } = await supabase
    .from("shpitto_billing_project_usages")
    .update({
      cleanup_completed_at: timestamp,
      cleanup_status: "completed",
      cleanup_error: null,
      updated_at: timestamp,
    })
    .eq("id", candidate.usageId);
  if (usageCompleteError) throw usageCompleteError;
}

async function listCleanupArtifacts(projectId: string): Promise<CleanupArtifact[]> {
  const d1 = getD1Client();
  if (!d1.isConfigured()) return [];
  await d1.ensureShpittoSchema();
  return d1.query<CleanupArtifact>(
    `
    SELECT d.url AS deploymentUrl,
           d.r2_bundle_prefix AS r2BundlePrefix,
           s.cf_wa_site_tag AS cfWaSiteTag,
           pd.custom_hostname_id AS customHostnameId
    FROM shpitto_projects p
    LEFT JOIN shpitto_deployments d ON d.project_id = p.id
    LEFT JOIN shpitto_project_sites s ON s.project_id = p.id
    LEFT JOIN shpitto_project_domains pd ON pd.project_id = p.id
    WHERE p.id = ?;
    `,
    [projectId],
  );
}

async function getD1ProjectSnapshotKey(projectId: string): Promise<string | undefined> {
  const d1 = getD1Client();
  if (!d1.isConfigured()) return undefined;
  await d1.ensureShpittoSchema();
  const row = await d1.queryOne<{ r2SnapshotKey?: string }>(
    "SELECT r2_snapshot_key AS r2SnapshotKey FROM shpitto_projects WHERE id = ? LIMIT 1;",
    [projectId],
  );
  return row?.r2SnapshotKey || undefined;
}

async function deleteR2Prefix(prefix: string) {
  const r2 = getR2Client();
  const normalized = String(prefix || "").replace(/^\/+|\/+$/g, "");
  if (!normalized) return;
  const objects = await r2.listObjects(normalized);
  for (const object of objects) {
    await r2.deleteObject(object.key).catch(() => undefined);
  }
}

async function markCleanupError(projectId: string, message: string) {
  const supabase = createSupabaseAdminClient();
  if (supabase) {
    await supabase
      .from("shpitto_billing_project_usages")
      .update({
        cleanup_status: "failed",
        cleanup_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("source_app", "shpitto")
      .eq("source_project_id", projectId);
  }
  const d1 = getD1Client();
  if (!d1.isConfigured()) return;
  await d1.execute(
    `
    UPDATE shpitto_projects
    SET cleanup_status = 'failed',
        cleanup_error = ?,
        updated_at = ?
    WHERE id = ?;
    `,
    [message, new Date().toISOString(), projectId],
  );
}
