import { createHash } from "node:crypto";

type CloudflareApiError = {
  code?: number;
  message?: string;
};

type CloudflareApiResponse<T> = {
  success?: boolean;
  errors?: CloudflareApiError[];
  result?: T;
  result_info?: {
    page?: number;
    per_page?: number;
    count?: number;
    total_count?: number;
    total_pages?: number;
  };
};

type CloudflareGraphQLError = {
  message?: string;
};

type CloudflareGraphqlResponse<T> = {
  data?: T;
  errors?: CloudflareGraphQLError[];
};

type CloudflareRumSiteInfo = {
  id?: string;
  uuid?: string;
  id_please_delete?: string | number;
  site_tag?: string;
  siteTag?: string;
  site_token?: string;
  siteToken?: string;
  host?: string;
  zone_tag?: string | null;
  zoneTag?: string | null;
  ruleset?: {
    zone_tag?: string | null;
    zoneTag?: string | null;
    zone_name?: string | null;
    zoneName?: string | null;
  };
};

type RumGroupRow = {
  count?: number;
  sum?: {
    visits?: number;
    pageViews?: number;
  };
  dimensions?: {
    requestPath?: string | null;
    refererHost?: string | null;
    refererPath?: string | null;
  };
};

export type CloudflareWebAnalyticsSite = {
  siteId: string;
  siteTag: string;
  siteToken: string | null;
  host: string;
  zoneTag: string | null;
  proxied: boolean;
  createdAt?: string | null;
};

export type CloudflareAnalyticsPage = {
  requestPath: string;
  visits: number;
  pageViews: number;
};

export type CloudflareAnalyticsSource = {
  refererHost: string;
  refererPath: string;
  channel: "direct" | "search" | "social" | "referral";
  visits: number;
  pageViews: number;
};

export type CloudflareAnalyticsSnapshot = {
  window: {
    startAt: string;
    endAt: string;
  };
  totals: {
    visits: number;
    pageViews: number;
    bounceRate: number | null;
    avgVisitDurationSeconds: number | null;
  };
  pages: CloudflareAnalyticsPage[];
  sources: CloudflareAnalyticsSource[];
  channels: Array<{
    channel: "direct" | "search" | "social" | "referral";
    visits: number;
    pageViews: number;
  }>;
  capabilities: {
    hasBounceRate: boolean;
    hasAvgVisitDuration: boolean;
    hasPageViews: boolean;
  };
};

type CloudflareCustomHostnameRecord = {
  id?: string;
  hostname?: string;
  status?: string;
  ssl?: {
    status?: string;
    method?: string;
    type?: string;
  };
  ownership_verification?: Array<Record<string, unknown>>;
  custom_origin_server?: string | null;
};

type CloudflareWorkerRouteRecord = {
  id?: string;
  pattern?: string;
  script?: string | null;
};

export type CloudflareCustomHostname = {
  id: string;
  hostname: string;
  status: string;
  sslStatus: string;
  verificationErrors: unknown[] | null;
  customOriginServer: string | null;
};

function toIso(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function startOfDayIso(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T00:00:00.000Z`;
  }
  return toIso(raw);
}

function endOfDayIso(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T23:59:59.999Z`;
  }
  return toIso(raw);
}

function toMetricNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeHost(raw: string): string {
  const text = String(raw || "").trim().toLowerCase();
  if (!text) return "";
  if (/^https?:\/\//.test(text)) {
    try {
      return new URL(text).host.toLowerCase();
    } catch {
      return text;
    }
  }
  return text.replace(/^\/+|\/+$/g, "");
}

function parseCsvPatterns(raw: string): string[] {
  return String(raw || "")
    .split(",")
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

function wildcardPatternToRegExp(pattern: string): RegExp {
  const escaped = String(pattern || "")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function classifyTrafficChannel(host: string): "direct" | "search" | "social" | "referral" {
  const normalized = String(host || "").trim().toLowerCase();
  if (!normalized) return "direct";

  const searchHosts = [
    "google.",
    "bing.",
    "baidu.",
    "yandex.",
    "duckduckgo.",
    "yahoo.",
    "sogou.",
    "so.com",
    "naver.",
  ];
  if (searchHosts.some((needle) => normalized.includes(needle))) return "search";

  const socialHosts = [
    "x.com",
    "twitter.com",
    "t.co",
    "facebook.com",
    "fb.com",
    "instagram.com",
    "linkedin.com",
    "weibo.com",
    "reddit.com",
    "youtube.com",
    "tiktok.com",
  ];
  if (socialHosts.some((needle) => normalized.includes(needle))) return "social";

  return "referral";
}

export function buildCloudflareBeaconSnippet(siteTag: string): string {
  const safeTag = JSON.stringify(String(siteTag || "").trim() || "missing-site-tag");
  return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":${safeTag}}'></script>`;
}

function gqlLiteral(value: string): string {
  return JSON.stringify(String(value || ""));
}

export class CloudflareClient {
  private accountId: string;
  private zoneId: string;
  private apiToken: string;
  private baseUrl = process.env.CLOUDFLARE_BASE_URL || "https://api.cloudflare.com/client/v4";
  private readonly fetchRetries = Math.max(0, Number(process.env.CLOUDFLARE_FETCH_RETRIES || 3));
  private readonly fetchTimeoutMs = Math.max(10_000, Number(process.env.CLOUDFLARE_FETCH_TIMEOUT_MS || 20_000));
  private readonly retryBaseMs = Math.max(300, Number(process.env.CLOUDFLARE_FETCH_RETRY_BASE_MS || 1200));
  private readonly requireReal = String(process.env.CLOUDFLARE_REQUIRE_REAL || "").trim() === "1";
  private readonly waCleanupOnLimit = String(process.env.CLOUDFLARE_WA_CLEANUP_ON_LIMIT || "1").trim() !== "0";
  private readonly waCleanupMaxDeletePerRun = Math.max(1, Number(process.env.CLOUDFLARE_WA_CLEANUP_MAX_DELETE_PER_RUN || 3));
  private readonly waCleanupHostPatterns = parseCsvPatterns(
    String(process.env.CLOUDFLARE_WA_CLEANUP_HOST_PATTERNS || "closure-*.coworkany.com,lc-cnc-bindtest*.coworkany.com"),
  );
  private readonly waCleanupHostRegexes = this.waCleanupHostPatterns.map((pattern) => wildcardPatternToRegExp(pattern));

  constructor() {
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
    this.zoneId = process.env.CLOUDFLARE_ZONE_ID || process.env.SHPITTO_CLOUDFLARE_ZONE_ID || "";
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN || "";
  }

  private get headers() {
    return {
      "Authorization": `Bearer ${this.apiToken}`,
    };
  }

  private shouldUseMock(): boolean {
    return !this.accountId || !this.apiToken;
  }

  private assertRealConfigured(operation: string) {
    if (this.requireReal && this.shouldUseMock()) {
      throw new Error(
        `[Cloudflare] ${operation} requires real credentials (set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN).`,
      );
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetriableStatus(status: number): boolean {
    return status === 408 || status === 409 || status === 429 || status === 522 || status === 524 || status >= 500;
  }

  private isRetriableError(error: unknown): boolean {
    const message = String((error as any)?.message || error || "").toLowerCase();
    const code = String((error as any)?.code || (error as any)?.cause?.code || "").toUpperCase();
    if (code.startsWith("UND_ERR_")) return true;
    return (
      message.includes("fetch failed") ||
      message.includes("timeout") ||
      message.includes("econn") ||
      message.includes("socket") ||
      message.includes("network")
    );
  }

  private async fetchWithRetry(
    url: string,
    initFactory: () => RequestInit,
    operation: string,
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.fetchRetries; attempt += 1) {
      try {
        const init = initFactory();
        const merged: RequestInit = {
          ...init,
          signal: init.signal ?? AbortSignal.timeout(this.fetchTimeoutMs),
        };
        const res = await fetch(url, merged);
        if (attempt < this.fetchRetries && this.isRetriableStatus(res.status)) {
          const waitMs = Math.min(8_000, this.retryBaseMs * (attempt + 1));
          console.warn(
            `[Cloudflare] ${operation} retry ${attempt + 1}/${this.fetchRetries} due to status ${res.status}, waiting ${waitMs}ms`,
          );
          await this.sleep(waitMs);
          continue;
        }
        return res;
      } catch (error) {
        lastError = error;
        if (attempt >= this.fetchRetries || !this.isRetriableError(error)) {
          throw error;
        }
        const waitMs = Math.min(8_000, this.retryBaseMs * (attempt + 1));
        console.warn(
          `[Cloudflare] ${operation} retry ${attempt + 1}/${this.fetchRetries} due to ${String((error as any)?.message || error)}, waiting ${waitMs}ms`,
        );
        await this.sleep(waitMs);
      }
    }
    throw (lastError instanceof Error ? lastError : new Error(String(lastError || "Cloudflare fetch failed")));
  }

  isConfigured(): boolean {
    return !this.shouldUseMock();
  }

  isSaasReady(): boolean {
    return this.isConfigured() && Boolean(this.zoneId);
  }

  private mapRumSiteInfo(input: CloudflareRumSiteInfo): CloudflareWebAnalyticsSite | null {
    const host = normalizeHost(
      String(input?.host || input?.ruleset?.zone_name || input?.ruleset?.zoneName || ""),
    );
    const siteTag = String(input?.site_tag || input?.siteTag || "").trim();
    const rawSiteId = String(input?.id || input?.uuid || "").trim();
    const numericFallbackId = Number(input?.id_please_delete);
    const fallbackSiteId =
      Number.isFinite(numericFallbackId) && numericFallbackId > 0
        ? String(numericFallbackId)
        : siteTag;
    const siteId = rawSiteId || fallbackSiteId;
    if (!host || !siteTag || !siteId) return null;
    const zoneTagRaw = String(
      input?.zone_tag || input?.zoneTag || input?.ruleset?.zone_tag || input?.ruleset?.zoneTag || "",
    ).trim();
    const zoneTag = zoneTagRaw || null;
    return {
      siteId,
      siteTag,
      siteToken: String(input?.site_token || input?.siteToken || "").trim() || null,
      host,
      zoneTag,
      proxied: Boolean(zoneTag),
      createdAt: toIso((input as any)?.created),
    };
  }

  private buildMockWebAnalyticsSite(host: string): CloudflareWebAnalyticsSite {
    const normalizedHost = normalizeHost(host) || "mock.pages.dev";
    const digest = createHash("sha256").update(normalizedHost).digest("hex");
    return {
      siteId: `mock-${digest.slice(0, 16)}`,
      siteTag: `mock-${digest.slice(0, 24)}`,
      siteToken: null,
      host: normalizedHost,
      zoneTag: null,
      proxied: false,
      createdAt: null,
    };
  }

  private shouldCleanupWebAnalyticsHost(host: string): boolean {
    const normalizedHost = normalizeHost(host);
    if (!normalizedHost) return false;
    if (this.waCleanupHostRegexes.length <= 0) return false;
    return this.waCleanupHostRegexes.some((regex) => regex.test(normalizedHost));
  }

  private async deleteWebAnalyticsSiteByTag(siteTag: string): Promise<void> {
    const tag = String(siteTag || "").trim();
    if (!tag || this.shouldUseMock()) return;
    await this.readCloudflareJson<Record<string, unknown>>(
      `${this.baseUrl}/accounts/${this.accountId}/rum/site_info/${encodeURIComponent(tag)}`,
      () => ({
        method: "DELETE",
        headers: this.headers,
      }),
      "web-analytics:delete-site",
    );
  }

  async cleanupWebAnalyticsSites(params?: {
    excludeHosts?: string[];
    maxDelete?: number;
    dryRun?: boolean;
  }): Promise<{
    candidateHosts: string[];
    deletedHosts: string[];
    deletedSiteTags: string[];
  }> {
    this.assertRealConfigured("cleanupWebAnalyticsSites");
    if (this.shouldUseMock()) {
      return { candidateHosts: [], deletedHosts: [], deletedSiteTags: [] };
    }

    const excludeSet = new Set(
      (Array.isArray(params?.excludeHosts) ? params?.excludeHosts : [])
        .map((host) => normalizeHost(String(host || "")))
        .filter(Boolean),
    );
    const maxDelete = Math.max(0, Math.min(100, Number(params?.maxDelete ?? this.waCleanupMaxDeletePerRun)));
    const dryRun = Boolean(params?.dryRun);
    if (maxDelete <= 0) {
      return { candidateHosts: [], deletedHosts: [], deletedSiteTags: [] };
    }

    const sites = await this.listWebAnalyticsSites();
    const candidates = sites
      .filter((site) => {
        const host = normalizeHost(site.host);
        if (!host) return false;
        if (excludeSet.has(host)) return false;
        if (site.proxied) return false;
        if (!this.shouldCleanupWebAnalyticsHost(host)) return false;
        return true;
      })
      .sort((a, b) => {
        const aTs = Date.parse(String(a.createdAt || "")) || Number.MAX_SAFE_INTEGER;
        const bTs = Date.parse(String(b.createdAt || "")) || Number.MAX_SAFE_INTEGER;
        if (aTs !== bTs) return aTs - bTs;
        return String(a.host || "").localeCompare(String(b.host || ""));
      });

    const limited = candidates.slice(0, maxDelete);
    const candidateHosts = limited.map((site) => site.host);
    if (dryRun || limited.length <= 0) {
      return { candidateHosts, deletedHosts: [], deletedSiteTags: [] };
    }

    const deletedHosts: string[] = [];
    const deletedSiteTags: string[] = [];
    for (const site of limited) {
      try {
        await this.deleteWebAnalyticsSiteByTag(site.siteTag);
        deletedHosts.push(site.host);
        deletedSiteTags.push(site.siteTag);
      } catch (error) {
        console.warn(
          `[Cloudflare] Failed to delete Web Analytics site ${site.host} (${site.siteTag}): ${String((error as any)?.message || error || "unknown")}`,
        );
      }
    }
    return { candidateHosts, deletedHosts, deletedSiteTags };
  }

  private async readCloudflareJson<T>(
    url: string,
    initFactory: () => RequestInit,
    operation: string,
  ): Promise<CloudflareApiResponse<T>> {
    const res = await this.fetchWithRetry(url, initFactory, operation);
    const payload = (await res.json()) as CloudflareApiResponse<T>;
    if (!res.ok || payload?.success === false) {
      const msg = String(payload?.errors?.[0]?.message || "").trim();
      throw new Error(msg || `${operation} failed with status ${res.status}`);
    }
    return payload;
  }

  private async queryGraphql<T>(query: string): Promise<T> {
    const res = await this.fetchWithRetry(
      `${this.baseUrl}/graphql`,
      () => ({
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      }),
      "graphql:query",
    );
    const data = (await res.json()) as CloudflareGraphqlResponse<T>;
    if (!res.ok) {
      const errorMessage = Array.isArray(data?.errors) ? String(data.errors[0]?.message || "").trim() : "";
      throw new Error(errorMessage || `GraphQL query failed with status ${res.status}`);
    }
    const graphqlErrors = Array.isArray(data?.errors) ? data.errors : [];
    if (graphqlErrors.length > 0) {
      const firstMessage = String(graphqlErrors[0]?.message || "").trim();
      throw new Error(firstMessage || "GraphQL query failed.");
    }

    if (!data?.data) {
      throw new Error("GraphQL response missing data.");
    }

    return data.data;
  }

  async listWebAnalyticsSites(): Promise<CloudflareWebAnalyticsSite[]> {
    this.assertRealConfigured("listWebAnalyticsSites");
    if (this.shouldUseMock()) return [];

    const listBase = `${this.baseUrl}/accounts/${this.accountId}/rum/site_info/list`;
    const endpoints = [
      listBase,
      `${this.baseUrl}/accounts/${this.accountId}/rum/site_info`,
    ];

    let lastError: unknown = null;
    for (const endpoint of endpoints) {
      try {
        const rows: CloudflareRumSiteInfo[] = [];
        if (endpoint === listBase) {
          let page = 1;
          let totalPages = 1;
          do {
            const payload = await this.readCloudflareJson<CloudflareRumSiteInfo[]>(
              `${listBase}?per_page=100&page=${page}`,
              () => ({
                method: "GET",
                headers: this.headers,
              }),
              "web-analytics:list-sites",
            );
            const pageRows = Array.isArray(payload.result) ? payload.result : [];
            rows.push(...pageRows);
            totalPages = Math.max(1, Number(payload?.result_info?.total_pages || 1));
            page += 1;
          } while (page <= totalPages && page <= 20);
        } else {
          const payload = await this.readCloudflareJson<CloudflareRumSiteInfo[]>(
            endpoint,
            () => ({
              method: "GET",
              headers: this.headers,
            }),
            "web-analytics:list-sites",
          );
          const pageRows = Array.isArray(payload.result) ? payload.result : [];
          rows.push(...pageRows);
        }

        return rows
          .map((row) => this.mapRumSiteInfo(row))
          .filter((row): row is CloudflareWebAnalyticsSite => Boolean(row));
      } catch (error) {
        lastError = error;
      }
    }
    throw (lastError instanceof Error ? lastError : new Error(String(lastError || "listWebAnalyticsSites failed")));
  }

  async ensureWebAnalyticsSite(host: string): Promise<CloudflareWebAnalyticsSite> {
    this.assertRealConfigured("ensureWebAnalyticsSite");
    const normalizedHost = normalizeHost(host);
    if (!normalizedHost) {
      throw new Error("Cannot ensure Web Analytics site: host is empty.");
    }

    if (this.shouldUseMock()) {
      console.log("[Cloudflare] Missing credentials, mocking Web Analytics site");
      return this.buildMockWebAnalyticsSite(normalizedHost);
    }

    let existingSites = await this.listWebAnalyticsSites();
    let existing = existingSites.find((site) => site.host === normalizedHost);
    if (existing) return existing;

    const softLimit = Math.max(0, Number(process.env.CLOUDFLARE_WA_NOT_PROXIED_SOFT_LIMIT || 8));
    const hardLimit = Math.max(0, Number(process.env.CLOUDFLARE_WA_NOT_PROXIED_HARD_LIMIT || 10));
    let notProxiedCount = existingSites.filter((site) => !site.proxied).length;
    if (softLimit > 0 && notProxiedCount >= softLimit) {
      console.warn(
        `[Cloudflare] Web Analytics not-proxied usage warning: ${notProxiedCount}/${hardLimit || "unbounded"}`,
      );
    }
    if (this.waCleanupOnLimit && hardLimit > 0 && notProxiedCount >= hardLimit) {
      const cleanup = await this.cleanupWebAnalyticsSites({
        excludeHosts: [normalizedHost],
        maxDelete: Math.max(1, notProxiedCount - hardLimit + 1),
      });
      if (cleanup.deletedSiteTags.length > 0) {
        console.warn(
          `[Cloudflare] Auto-cleaned WA hosts to free capacity: ${cleanup.deletedHosts.join(", ")}`,
        );
        existingSites = await this.listWebAnalyticsSites();
        existing = existingSites.find((site) => site.host === normalizedHost);
        if (existing) return existing;
        notProxiedCount = existingSites.filter((site) => !site.proxied).length;
      }
    }
    if (hardLimit > 0 && notProxiedCount >= hardLimit) {
      throw new Error(`Cloudflare Web Analytics not-proxied limit reached (${notProxiedCount}/${hardLimit}).`);
    }

    const createSite = async () =>
      this.readCloudflareJson<CloudflareRumSiteInfo>(
        `${this.baseUrl}/accounts/${this.accountId}/rum/site_info`,
        () => ({
          method: "POST",
          headers: {
            ...this.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            host: normalizedHost,
          }),
        }),
        "web-analytics:create-site",
      );

    let createdPayload: CloudflareApiResponse<CloudflareRumSiteInfo> | null = null;
    try {
      createdPayload = await createSite();
    } catch (error) {
      const reason = String((error as any)?.message || error || "").trim();
      const normalizedReason = reason.toLowerCase().replace(/[^a-z0-9]/g, "");
      const isMaxSiteInfo = normalizedReason.includes("maxsiteinfo");
      if (this.waCleanupOnLimit && isMaxSiteInfo) {
        const cleanup = await this.cleanupWebAnalyticsSites({
          excludeHosts: [normalizedHost],
          maxDelete: this.waCleanupMaxDeletePerRun,
        });
        if (cleanup.deletedSiteTags.length > 0) {
          console.warn(
            `[Cloudflare] Retrying WA create after cleanup for ${normalizedHost}. Deleted: ${cleanup.deletedHosts.join(", ")}`,
          );
          createdPayload = await createSite();
        } else {
          console.warn(
            `[Cloudflare] WA create hit maxSiteInfo for ${normalizedHost}, but no cleanup candidates matched patterns: ${this.waCleanupHostPatterns.join(", ")}`,
          );
        }
      } else {
        throw new Error(
          `Unable to create Web Analytics site for "${normalizedHost}" via API. ${reason || "Unknown error."} ` +
          "Enable Web Analytics in Cloudflare dashboard (Pages/Zone) or use a token that supports this endpoint.",
        );
      }
    }

    if (!createdPayload) {
      throw new Error(
        `Unable to create Web Analytics site for "${normalizedHost}" via API. web_analytics.configuration.api.maxSiteInfo ` +
        "Enable Web Analytics in Cloudflare dashboard (Pages/Zone) or use a token that supports this endpoint.",
      );
    }

    const createdDirect = this.mapRumSiteInfo((createdPayload?.result || {}) as CloudflareRumSiteInfo);
    if (createdDirect && createdDirect.host === normalizedHost) return createdDirect;

    // Cloudflare list endpoints can be eventually consistent for recently created hosts.
    // Retry list briefly before failing hard.
    for (let i = 0; i < 3; i += 1) {
      await this.sleep(1000 * (i + 1));
      const afterCreate = await this.listWebAnalyticsSites();
      const created = afterCreate.find((site) => site.host === normalizedHost);
      if (created) return created;
    }

    throw new Error(`Web Analytics site creation succeeded but site host "${normalizedHost}" was not found.`);
  }

  async queryAnalyticsBySiteTag(params: {
    siteTag: string;
    startAt?: string;
    endAt?: string;
    limit?: number;
  }): Promise<CloudflareAnalyticsSnapshot> {
    this.assertRealConfigured("queryAnalyticsBySiteTag");
    const siteTag = String(params?.siteTag || "").trim();
    if (!siteTag) {
      throw new Error("Missing siteTag for analytics query.");
    }

    const now = Date.now();
    const defaultEnd = new Date(now).toISOString();
    const defaultStart = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const startAt = startOfDayIso(String(params?.startAt || "")) || defaultStart;
    const endAt = endOfDayIso(String(params?.endAt || "")) || defaultEnd;
    const limit = Math.max(1, Math.min(100, Number(params?.limit || 20)));

    if (this.shouldUseMock()) {
      return {
        window: { startAt, endAt },
        totals: {
          visits: 0,
          pageViews: 0,
          bounceRate: null,
          avgVisitDurationSeconds: null,
        },
        pages: [],
        sources: [],
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

    const accountTag = gqlLiteral(this.accountId);
    const tagLiteral = gqlLiteral(siteTag);
    const startLiteral = gqlLiteral(startAt);
    const endLiteral = gqlLiteral(endAt);
    const limitLiteral = String(limit);

    const buildQuery = (opts: { includePageViews: boolean; includeOrderBy: boolean; includeRefererDims: boolean }) => {
      const sumFields = opts.includePageViews ? "visits pageViews" : "visits";
      const pageOrderBy = opts.includeOrderBy ? ", orderBy: [sum_visits_DESC]" : "";
      const sourceOrderBy = opts.includeOrderBy ? ", orderBy: [sum_visits_DESC]" : "";
      const sourceDims = opts.includeRefererDims ? "refererHost refererPath" : "";
      return `{
  viewer {
    accounts(filter: { accountTag: ${accountTag} }) {
      totals: rumPageloadEventsAdaptiveGroups(
        filter: {
          AND: [
            { siteTag: ${tagLiteral} }
            { datetime_geq: ${startLiteral} }
            { datetime_leq: ${endLiteral} }
          ]
        }
        limit: 1
      ) {
        count
        sum { ${sumFields} }
      }
      topPages: rumPageloadEventsAdaptiveGroups(
        filter: {
          AND: [
            { siteTag: ${tagLiteral} }
            { datetime_geq: ${startLiteral} }
            { datetime_leq: ${endLiteral} }
          ]
        }
        limit: ${limitLiteral}${pageOrderBy}
      ) {
        count
        sum { ${sumFields} }
        dimensions { requestPath }
      }
      topSources: rumPageloadEventsAdaptiveGroups(
        filter: {
          AND: [
            { siteTag: ${tagLiteral} }
            { datetime_geq: ${startLiteral} }
            { datetime_leq: ${endLiteral} }
          ]
        }
        limit: ${limitLiteral}${sourceOrderBy}
      ) {
        count
        sum { ${sumFields} }
        dimensions { ${sourceDims} }
      }
    }
  }
}`;
    };

    type GraphqlRumPayload = {
      viewer?: {
        accounts?: Array<{
          totals?: RumGroupRow[];
          topPages?: RumGroupRow[];
          topSources?: RumGroupRow[];
        }>;
      };
    };

    const queryAttempts = [
      { includePageViews: true, includeOrderBy: true, includeRefererDims: true },
      { includePageViews: true, includeOrderBy: false, includeRefererDims: true },
      { includePageViews: false, includeOrderBy: false, includeRefererDims: true },
      { includePageViews: false, includeOrderBy: false, includeRefererDims: false },
    ] as const;

    let activeAttempt: { includePageViews: boolean; includeOrderBy: boolean; includeRefererDims: boolean } =
      queryAttempts[0];
    let payload: GraphqlRumPayload | null = null;
    let lastError: unknown;
    for (const attempt of queryAttempts) {
      try {
        payload = await this.queryGraphql<GraphqlRumPayload>(buildQuery(attempt));
        activeAttempt = attempt;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!payload) {
      const message = String((lastError as any)?.message || "Failed to query Cloudflare analytics.");
      throw new Error(message);
    }

    const accountData = Array.isArray(payload?.viewer?.accounts) ? payload.viewer.accounts[0] : undefined;
    const totalsRow = Array.isArray(accountData?.totals) ? accountData.totals[0] : undefined;
    const totalVisits =
      toMetricNumber(totalsRow?.sum?.visits) ||
      toMetricNumber(totalsRow?.count);
    const totalPageViews = activeAttempt.includePageViews
      ? (toMetricNumber(totalsRow?.sum?.pageViews) || totalVisits)
      : totalVisits;

    const pagesRows = Array.isArray(accountData?.topPages) ? accountData.topPages : [];
    const pages = pagesRows
      .map((row) => {
        const requestPath = String(row?.dimensions?.requestPath || "/").trim() || "/";
        const visits = toMetricNumber(row?.sum?.visits) || toMetricNumber(row?.count);
        const pageViews = activeAttempt.includePageViews
          ? (toMetricNumber(row?.sum?.pageViews) || visits)
          : visits;
        return {
          requestPath,
          visits,
          pageViews,
        } satisfies CloudflareAnalyticsPage;
      })
      .filter((row) => row.visits > 0 || row.pageViews > 0)
      .sort((a, b) => (b.pageViews - a.pageViews) || (b.visits - a.visits))
      .slice(0, limit);

    const sourceRows = Array.isArray(accountData?.topSources) ? accountData.topSources : [];
    const sources = sourceRows
      .map((row) => {
        const refererHost = String(row?.dimensions?.refererHost || "").trim().toLowerCase();
        const refererPath = String(row?.dimensions?.refererPath || "").trim();
        const visits = toMetricNumber(row?.sum?.visits) || toMetricNumber(row?.count);
        const pageViews = activeAttempt.includePageViews
          ? (toMetricNumber(row?.sum?.pageViews) || visits)
          : visits;
        const channel = classifyTrafficChannel(refererHost);
        return {
          refererHost,
          refererPath,
          channel,
          visits,
          pageViews,
        } satisfies CloudflareAnalyticsSource;
      })
      .filter((row) => row.visits > 0 || row.pageViews > 0)
      .sort((a, b) => (b.visits - a.visits) || (b.pageViews - a.pageViews))
      .slice(0, limit);

    const channelSeed: Record<"direct" | "search" | "social" | "referral", { visits: number; pageViews: number }> = {
      direct: { visits: 0, pageViews: 0 },
      search: { visits: 0, pageViews: 0 },
      social: { visits: 0, pageViews: 0 },
      referral: { visits: 0, pageViews: 0 },
    };
    for (const source of sources) {
      channelSeed[source.channel].visits += source.visits;
      channelSeed[source.channel].pageViews += source.pageViews;
    }
    const channels: CloudflareAnalyticsSnapshot["channels"] = [
      { channel: "direct", visits: channelSeed.direct.visits, pageViews: channelSeed.direct.pageViews },
      { channel: "search", visits: channelSeed.search.visits, pageViews: channelSeed.search.pageViews },
      { channel: "social", visits: channelSeed.social.visits, pageViews: channelSeed.social.pageViews },
      { channel: "referral", visits: channelSeed.referral.visits, pageViews: channelSeed.referral.pageViews },
    ];

    return {
      window: {
        startAt,
        endAt,
      },
      totals: {
        visits: totalVisits,
        pageViews: totalPageViews,
        bounceRate: null,
        avgVisitDurationSeconds: null,
      },
      pages,
      sources,
      channels,
      capabilities: {
        hasBounceRate: false,
        hasAvgVisitDuration: false,
        hasPageViews: activeAttempt.includePageViews,
      },
    };
  }

  private mapCustomHostnameRecord(record: CloudflareCustomHostnameRecord): CloudflareCustomHostname | null {
    const id = String(record?.id || "").trim();
    const hostname = normalizeHost(String(record?.hostname || ""));
    if (!id || !hostname) return null;

    return {
      id,
      hostname,
      status: String(record?.status || "pending").trim() || "pending",
      sslStatus: String(record?.ssl?.status || "pending").trim() || "pending",
      verificationErrors: Array.isArray(record?.ownership_verification)
        ? record.ownership_verification
        : null,
      customOriginServer: String(record?.custom_origin_server || "").trim() || null,
    };
  }

  private assertSaasConfigured(operation: string) {
    this.assertRealConfigured(operation);
    if (!this.zoneId) {
      throw new Error(`[Cloudflare] ${operation} requires CLOUDFLARE_ZONE_ID.`);
    }
  }

  async listCustomHostnames(hostname?: string): Promise<CloudflareCustomHostname[]> {
    this.assertSaasConfigured("listCustomHostnames");

    const normalizedHost = normalizeHost(String(hostname || ""));
    if (this.shouldUseMock()) return [];

    const params = new URLSearchParams();
    params.set("per_page", "50");
    if (normalizedHost) params.set("hostname", normalizedHost);

    const query = params.toString();
    const url = `${this.baseUrl}/zones/${this.zoneId}/custom_hostnames${query ? `?${query}` : ""}`;
    const payload = await this.readCloudflareJson<CloudflareCustomHostnameRecord[]>(
      url,
      () => ({
        method: "GET",
        headers: this.headers,
      }),
      "custom-hostnames:list",
    );
    const rows = Array.isArray(payload.result) ? payload.result : [];
    return rows.map((row) => this.mapCustomHostnameRecord(row)).filter((row): row is CloudflareCustomHostname => Boolean(row));
  }

  async createCustomHostname(params: {
    hostname: string;
    customOriginServer?: string;
  }): Promise<CloudflareCustomHostname> {
    this.assertSaasConfigured("createCustomHostname");
    const hostname = normalizeHost(String(params.hostname || ""));
    if (!hostname) {
      throw new Error("createCustomHostname requires hostname.");
    }

    if (this.shouldUseMock()) {
      const digest = createHash("sha256").update(hostname).digest("hex");
      return {
        id: `mock-ch-${digest.slice(0, 16)}`,
        hostname,
        status: "pending",
        sslStatus: "pending_validation",
        verificationErrors: null,
        customOriginServer: normalizeHost(params.customOriginServer || "") || null,
      };
    }

    const payloadBody: Record<string, unknown> = {
      hostname,
      ssl: {
        method: "txt",
        type: "dv",
      },
    };
    const originHost = normalizeHost(String(params.customOriginServer || ""));
    if (originHost) {
      payloadBody.custom_origin_server = originHost;
    }

    const payload = await this.readCloudflareJson<CloudflareCustomHostnameRecord>(
      `${this.baseUrl}/zones/${this.zoneId}/custom_hostnames`,
      () => ({
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payloadBody),
      }),
      "custom-hostnames:create",
    );
    const mapped = this.mapCustomHostnameRecord((payload.result || {}) as CloudflareCustomHostnameRecord);
    if (!mapped) {
      throw new Error("Cloudflare custom hostname created but response was incomplete.");
    }
    return mapped;
  }

  async ensureCustomHostname(params: {
    hostname: string;
    customOriginServer?: string;
  }): Promise<CloudflareCustomHostname> {
    const hostname = normalizeHost(String(params.hostname || ""));
    if (!hostname) {
      throw new Error("ensureCustomHostname requires hostname.");
    }
    const existing = await this.listCustomHostnames(hostname);
    const hit = existing.find((row) => row.hostname === hostname);
    if (hit) return hit;
    return this.createCustomHostname(params);
  }

  async updateFallbackOrigin(origin: string): Promise<void> {
    this.assertSaasConfigured("updateFallbackOrigin");
    const originHost = normalizeHost(String(origin || ""));
    if (!originHost) {
      throw new Error("updateFallbackOrigin requires a valid origin hostname.");
    }
    if (this.shouldUseMock()) return;

    await this.readCloudflareJson<Record<string, unknown>>(
      `${this.baseUrl}/zones/${this.zoneId}/custom_hostnames/fallback_origin`,
      () => ({
        method: "PUT",
        headers: {
          ...this.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ origin: originHost }),
      }),
      "custom-hostnames:update-fallback-origin",
    );
  }

  async ensureSaasRouterRouteForHostname(hostname: string): Promise<void> {
    this.assertSaasConfigured("ensureSaasRouterRouteForHostname");
    const normalizedHost = normalizeHost(hostname);
    if (!normalizedHost) {
      throw new Error("ensureSaasRouterRouteForHostname requires hostname.");
    }
    const script = String(process.env.CLOUDFLARE_SAAS_WORKER_NAME || "").trim();
    if (!script) {
      throw new Error("CLOUDFLARE_SAAS_WORKER_NAME is required to ensure router route.");
    }
    if (this.shouldUseMock()) return;

    const pattern = `${normalizedHost}/*`;
    const listPayload = await this.readCloudflareJson<CloudflareWorkerRouteRecord[]>(
      `${this.baseUrl}/zones/${this.zoneId}/workers/routes`,
      () => ({
        method: "GET",
        headers: this.headers,
      }),
      "workers-routes:list",
    );

    const routes = Array.isArray(listPayload.result) ? listPayload.result : [];
    const existing = routes.find((item) => String(item?.pattern || "").trim() === pattern);
    const existingScript = String(existing?.script || "").trim();
    if (existing && existingScript === script) {
      return;
    }

    if (existing?.id) {
      await this.readCloudflareJson<CloudflareWorkerRouteRecord>(
        `${this.baseUrl}/zones/${this.zoneId}/workers/routes/${existing.id}`,
        () => ({
          method: "PUT",
          headers: {
            ...this.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pattern,
            script,
          }),
        }),
        "workers-routes:update",
      );
      return;
    }

    await this.readCloudflareJson<CloudflareWorkerRouteRecord>(
      `${this.baseUrl}/zones/${this.zoneId}/workers/routes`,
      () => ({
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pattern,
          script,
        }),
      }),
      "workers-routes:create",
    );
  }

  async createProject(name: string) {
    this.assertRealConfigured("createProject");
    if (this.shouldUseMock()) {
      console.log("[Cloudflare] Missing credentials, mocking createProject");
      return { name };
    }

    try {
      console.log(`[Cloudflare] Creating/Verifying project: ${name}`);
      const res = await this.fetchWithRetry(
        `${this.baseUrl}/accounts/${this.accountId}/pages/projects/${name}`,
        () => ({
          method: "GET",
          headers: this.headers,
        }),
        `createProject:get:${name}`,
      );

      const projectConfig = {
        name,
        production_branch: "main",
        deployment_configs: {
          production: {
            compatibility_date: "2026-01-13",
            compatibility_flags: []
          },
          preview: {
            compatibility_date: "2026-01-13",
            compatibility_flags: []
          }
        }
      };

      if (res.ok) {
        console.log(`[Cloudflare] Project ${name} already exists, updating config...`);
        const updateRes = await this.fetchWithRetry(
          `${this.baseUrl}/accounts/${this.accountId}/pages/projects/${name}`,
          () => ({
            method: "PATCH",
            headers: { ...this.headers, "Content-Type": "application/json" },
            body: JSON.stringify(projectConfig),
          }),
          `createProject:patch:${name}`,
        );
        return await updateRes.json();
      }

      console.log(`[Cloudflare] Project ${name} not found, creating...`);
      const createRes = await this.fetchWithRetry(
        `${this.baseUrl}/accounts/${this.accountId}/pages/projects`,
        () => ({
          method: "POST",
          headers: { ...this.headers, "Content-Type": "application/json" },
          body: JSON.stringify(projectConfig),
        }),
        `createProject:post:${name}`,
      );
      
      const data = await createRes.json();
      if (!createRes.ok) {
        console.error("[Cloudflare] Create Project Error Response:", JSON.stringify(data, null, 2));
        throw new Error(data.errors?.[0]?.message || `Create project failed with status ${createRes.status}`);
      }
      
      console.log(`[Cloudflare] Project ${name} created successfully`);
      return data;
    } catch (e) {
      console.error("[Cloudflare] Create Project Error:", e);
      throw e;
    }
  }

  async uploadDeployment(projectName: string, bundle: { manifest: Record<string, string>, fileEntries: any[] }) {
    this.assertRealConfigured("uploadDeployment");
    if (this.shouldUseMock()) {
      console.log("[Cloudflare] Missing credentials, mocking uploadDeployment");
      return {
        result: {
          url: `https://${projectName}.pages.dev`,
          id: "mock-deployment-id"
        }
      };
    }

    try {
      console.log(`[Cloudflare] Starting 4-step deployment for project: ${projectName}`);
      
      // Step 1: Get upload token
      console.log("[Cloudflare] Step 1: Getting upload token...");
      const tokenRes = await this.fetchWithRetry(
        `${this.baseUrl}/accounts/${this.accountId}/pages/projects/${projectName}/upload-token`,
        () => ({
          method: "GET",
          headers: this.headers,
        }),
        `uploadDeployment:token:${projectName}`,
      );
      
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        console.error("[Cloudflare] Get Upload Token Error:", JSON.stringify(tokenData, null, 2));
        throw new Error(tokenData.errors?.[0]?.message || `Get upload token failed with status ${tokenRes.status}`);
      }
      
      const jwt = tokenData.result?.jwt;
      if (!jwt) {
        throw new Error("No JWT token returned from upload-token endpoint");
      }
      console.log("[Cloudflare] Upload token obtained successfully");

      // Step 2: Upload files to buckets using JSON array format
      console.log("[Cloudflare] Step 2: Uploading files to buckets...");
      const uploadPayload = bundle.fileEntries.map(entry => ({
        key: entry.hash,
        value: entry.base64Content,
        metadata: {
          contentType: entry.type
        },
        base64: true
      }));

      const uploadRes = await this.fetchWithRetry(
        `${this.baseUrl}/pages/assets/upload`,
        () => ({
          method: "POST",
          headers: {
            "Authorization": `Bearer ${jwt}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(uploadPayload),
        }),
        `uploadDeployment:upload:${projectName}`,
      );

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        console.error("[Cloudflare] Upload Buckets Error:", JSON.stringify(uploadData, null, 2));
        throw new Error(uploadData.errors?.[0]?.message || `Upload buckets failed with status ${uploadRes.status}`);
      }
      console.log("[Cloudflare] Files uploaded to buckets successfully");

      // Step 3: Upsert hashes
      console.log("[Cloudflare] Step 3: Upserting hashes...");
      const hashes = bundle.fileEntries.map(entry => entry.hash);
      
      const upsertRes = await this.fetchWithRetry(
        `${this.baseUrl}/pages/assets/upsert-hashes`,
        () => ({
          method: "POST",
          headers: {
            "Authorization": `Bearer ${jwt}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ hashes }),
        }),
        `uploadDeployment:upsert:${projectName}`,
      );

      const upsertData = await upsertRes.json();
      if (!upsertRes.ok) {
        console.error("[Cloudflare] Upsert Hashes Error:", JSON.stringify(upsertData, null, 2));
        throw new Error(upsertData.errors?.[0]?.message || `Upsert hashes failed with status ${upsertRes.status}`);
      }
      console.log("[Cloudflare] Hashes upserted successfully");

      // Step 4: Create deployment with manifest
      console.log("[Cloudflare] Step 4: Creating deployment...");
      const deployRes = await this.fetchWithRetry(
        `${this.baseUrl}/accounts/${this.accountId}/pages/projects/${projectName}/deployments`,
        () => {
          const formData = new FormData();
          formData.append("manifest", JSON.stringify(bundle.manifest));
          formData.append("branch", "main");
          return {
            method: "POST",
            headers: this.headers,
            body: formData,
          };
        },
        `uploadDeployment:deploy:${projectName}`,
      );

      const deployData = await deployRes.json();
      if (!deployRes.ok) {
        console.error("[Cloudflare] Create Deployment Error:", JSON.stringify(deployData, null, 2));
        throw new Error(deployData.errors?.[0]?.message || `Create deployment failed with status ${deployRes.status}`);
      }

      const deploymentId = deployData.result.id;
      console.log(`[Cloudflare] Deployment created: ${deploymentId}`);

      // Wait for deployment to be ready
      console.log(`[Cloudflare] Waiting for deployment ${deploymentId} to be ready...`);
      let attempts = 0;
      const maxAttempts = 20;
      while (attempts < maxAttempts) {
        const statusRes = await this.fetchWithRetry(
          `${this.baseUrl}/accounts/${this.accountId}/pages/projects/${projectName}/deployments/${deploymentId}`,
          () => ({
            method: "GET",
            headers: this.headers,
          }),
          `uploadDeployment:status:${projectName}:${deploymentId}`,
        );
        const statusData = await statusRes.json();
        if (statusRes.ok) {
          const deploy = statusData.result;
          const stages = deploy.stages || [];
          const deployStage = stages.find((s: any) => s.name === "deploy");
          const stageStatus = deployStage?.status || "unknown";
          
          console.log(`[Cloudflare] Current stage: ${deploy.latest_stage?.name} (${deploy.latest_stage?.status}), Deploy stage: ${stageStatus}`);
          
          if (stageStatus === "success") {
            console.log("[Cloudflare] Deployment successful:", deploy.url);
            return statusData;
          }
          if (stageStatus === "failure" || stageStatus === "failed") {
            throw new Error(`Cloudflare deployment failed during deploy stage`);
          }
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      }

      console.log("[Cloudflare] Polling timed out, returning last known data");
      return deployData;
    } catch (e) {
      console.error("[Cloudflare] 4-Step Upload Error:", e);
      throw e;
    }
  }

  async getDeploymentStatus(projectName: string, deploymentId: string) {
    const res = await this.fetchWithRetry(
      `${this.baseUrl}/accounts/${this.accountId}/pages/projects/${projectName}/deployments/${deploymentId}`,
      () => ({
        headers: this.headers,
      }),
      `getDeploymentStatus:${projectName}:${deploymentId}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.result;
  }
}
