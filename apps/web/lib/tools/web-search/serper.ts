export type WebSearchSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type SerperSearchConfig = {
  apiKey: string;
  endpoint: string;
  gl: string;
  hl: string;
  num: number;
  timeoutMs: number;
};

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function safeJsonParse<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function normalizeSources(rawSources: any): WebSearchSource[] {
  if (!Array.isArray(rawSources)) return [];
  const seen = new Set<string>();
  const sources: WebSearchSource[] = [];
  for (const row of rawSources) {
    const title = normalizeText(row?.title).slice(0, 160);
    const url = normalizeText(row?.url || row?.link);
    const snippet = normalizeText(row?.snippet).slice(0, 320);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      title: title || url,
      url,
      ...(snippet ? { snippet } : {}),
    });
  }
  return sources.slice(0, 10);
}

export function resolveSerperSearchConfigFromEnv(overrides?: Partial<SerperSearchConfig>): {
  config?: SerperSearchConfig;
  reason?: string;
} {
  const apiKey = normalizeText(overrides?.apiKey || process.env.SERPER_API_KEY);
  if (!apiKey) return { reason: "missing_serper_api_key" };

  const endpointRaw =
    normalizeText(overrides?.endpoint) ||
    normalizeText(process.env.SERPER_SEARCH_URL) ||
    normalizeText(process.env.SERPER_BASE_URL) ||
    "https://google.serper.dev/search";
  const endpoint = endpointRaw.endsWith("/search")
    ? endpointRaw
    : `${endpointRaw.replace(/\/+$/g, "")}/search`;

  return {
    config: {
      apiKey,
      endpoint,
      gl: normalizeText(overrides?.gl || process.env.SERPER_GL || "us"),
      hl: normalizeText(overrides?.hl || process.env.SERPER_HL || "en"),
      num: Math.max(1, Math.min(10, Number(overrides?.num || process.env.SERPER_NUM || 5))),
      timeoutMs: Math.max(
        3_000,
        Number(overrides?.timeoutMs || process.env.SERPER_TIMEOUT_MS || 12_000),
      ),
    },
  };
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // no-op
    }
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`serper_http_${response.status}:${text.slice(0, 240)}`);
    }
    return safeJsonParse<any>(text) || {};
  } finally {
    clearTimeout(timer);
  }
}

export async function searchSerper(
  query: string,
  options?: {
    config?: SerperSearchConfig;
    num?: number;
    gl?: string;
    hl?: string;
    timeoutMs?: number;
  },
): Promise<WebSearchSource[]> {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const resolved = options?.config
    ? { config: options.config }
    : resolveSerperSearchConfigFromEnv({
        num: options?.num,
        gl: options?.gl,
        hl: options?.hl,
        timeoutMs: options?.timeoutMs,
      });
  if (!resolved.config) {
    throw new Error(resolved.reason || "missing_serper_config");
  }

  const payload = await fetchJsonWithTimeout(
    resolved.config.endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": resolved.config.apiKey,
      },
      body: JSON.stringify({
        q: normalizedQuery,
        gl: options?.gl || resolved.config.gl,
        hl: options?.hl || resolved.config.hl,
        num: Math.max(1, Math.min(10, Number(options?.num || resolved.config.num))),
      }),
    },
    Math.max(2_000, Number(options?.timeoutMs || resolved.config.timeoutMs)),
  );

  const organic = Array.isArray(payload?.organic) ? payload.organic : [];
  const raw = organic.map((item: any) => ({
    title: item?.title,
    url: item?.link,
    snippet: item?.snippet,
  }));
  return normalizeSources(raw);
}

export async function searchSerperBatch(
  queries: string[],
  options?: {
    config?: SerperSearchConfig;
    num?: number;
    gl?: string;
    hl?: string;
    timeoutMs?: number;
  },
): Promise<Array<{ query: string; sources: WebSearchSource[] }>> {
  const resolved: Array<{ query: string; sources: WebSearchSource[] }> = [];
  for (const query of queries || []) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) continue;
    const sources = await searchSerper(normalizedQuery, options);
    resolved.push({ query: normalizedQuery, sources });
  }
  return resolved;
}
