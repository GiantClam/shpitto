interface Env {
  DOMAIN_DB: D1Database;
  SHPITTO_PRIMARY_HOSTS?: string;
  SHPITTO_ROUTER_DEBUG?: string;
}

type DomainOriginRow = {
  originHost?: string;
  deploymentHost?: string;
  projectId?: string;
  status?: string;
};

function normalizeHost(value: string): string {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  return text.replace(/^\/+|\/+$/g, "");
}

function parseProtectedHosts(env: Env): Set<string> {
  const raw = String(env.SHPITTO_PRIMARY_HOSTS || "").trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((item) => normalizeHost(item))
      .filter(Boolean),
  );
}

function debugEnabled(env: Env): boolean {
  const raw = String(env.SHPITTO_ROUTER_DEBUG || "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function resolveOriginHost(env: Env, hostname: string): Promise<DomainOriginRow | null> {
  const normalized = normalizeHost(hostname);
  if (!normalized) return null;

  const result = await env.DOMAIN_DB.prepare(
    `
    SELECT
      d.origin_host AS originHost,
      s.deployment_host AS deploymentHost,
      d.project_id AS projectId,
      d.status AS status
    FROM shpitto_project_domains d
    LEFT JOIN shpitto_project_sites s ON s.project_id = d.project_id
    WHERE d.hostname = ?
      AND d.source_app = 'shpitto'
    ORDER BY d.updated_at DESC
    LIMIT 1
    `,
  )
    .bind(normalized)
    .first<DomainOriginRow>();

  return result || null;
}

function withProxyHeaders(request: Request, targetHost: string): Headers {
  const headers = new Headers(request.headers);
  headers.set("x-shpitto-proxy-host", targetHost);
  headers.set("x-forwarded-host", new URL(request.url).host);
  return headers;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incomingUrl = new URL(request.url);
    const incomingHost = normalizeHost(incomingUrl.host);

    if (!incomingHost) {
      return new Response("Bad host", { status: 400 });
    }

    const protectedHosts = parseProtectedHosts(env);
    if (protectedHosts.has(incomingHost)) {
      return new Response(
        `Host ${incomingHost} is marked as protected and should not be routed by saas-router.`,
        { status: 421 },
      );
    }

    if (incomingUrl.pathname === "/__router/healthz") {
      return json({ ok: true, host: incomingHost, time: new Date().toISOString() });
    }

    const row = await resolveOriginHost(env, incomingHost);
    if (!row) {
      return new Response("Custom domain is not mapped yet.", { status: 404 });
    }

    const originHost = normalizeHost(String(row.originHost || row.deploymentHost || ""));
    if (!originHost) {
      return new Response("Mapped origin host is empty.", { status: 502 });
    }

    if (originHost === incomingHost) {
      return new Response("Origin host loop detected.", { status: 502 });
    }

    const targetUrl = new URL(request.url);
    targetUrl.protocol = "https:";
    targetUrl.host = originHost;

    const proxiedRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: withProxyHeaders(request, originHost),
      body: request.method === "GET" || request.method === "HEAD" ? null : request.body,
      redirect: "manual",
    });

    const upstream = await fetch(proxiedRequest);
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("x-shpitto-router", "saas-router");
    responseHeaders.set("x-shpitto-router-project", String(row.projectId || ""));

    if (debugEnabled(env)) {
      responseHeaders.set("x-shpitto-router-origin", originHost);
      responseHeaders.set("x-shpitto-router-status", String(row.status || "unknown"));
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  },
};
