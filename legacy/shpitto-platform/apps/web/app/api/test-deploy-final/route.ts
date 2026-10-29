import { NextRequest, NextResponse } from "next/server";
import { Bundler } from "../../../lib/bundler";
import { CloudflareClient } from "../../../lib/cloudflare";
import { TEST_PROJECT_LC_CNC } from "../../../lib/agent/test_cases";
import { configureUndiciProxyFromEnv } from "../../../lib/agent/network";
import { buildProjectFromExtractedSite, extractWebsiteMainPages } from "../../../lib/agent/site-extractor";

export const dynamic = "force-dynamic";

type StaticSiteFile = {
  path: string;
  content: string;
  type: string;
};

function normalizeRoutePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "")
    .toLowerCase();
}

function routeToHtmlPath(route: string): string {
  const normalized = normalizeRoutePath(route);
  if (normalized === "/") return "/index.html";
  return `${normalized}/index.html`;
}

function buildFallbackPageHtml(params: {
  route: string;
  routes: string[];
  title: string;
  description: string;
  brandName: string;
}): string {
  const nav = params.routes
    .map((item) => {
      const normalized = normalizeRoutePath(item);
      const label =
        normalized === "/"
          ? "Home"
          : normalized
              .replace(/^\//, "")
              .split("/")
              .join(" ")
              .split(/[-_]/g)
              .filter(Boolean)
              .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
              .join(" ");
      return `<a href="${normalized}">${label}</a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${params.title}</title>
  <meta name="description" content="${params.description}" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header>
    <div class="container">
      <nav>${nav}</nav>
    </div>
  </header>
  <main class="container">
    <section class="hero">
      <h1>${params.title}</h1>
      <p>${params.description}</p>
    </section>
  </main>
  <footer>
    <div class="container">${params.brandName}</div>
  </footer>
  <script src="/script.js"></script>
</body>
</html>`;
}

function ensureSkillDirectProject(config: any): { project: any; routes: string[]; staticFiles: StaticSiteFile[] } {
  const existingStaticFiles = Array.isArray(config?.staticSite?.files) ? config.staticSite.files : [];
  if (config?.staticSite?.mode === "skill-direct" && existingStaticFiles.length > 0) {
    const routes: string[] = existingStaticFiles
      .filter((file: any) => String(file?.path || "").toLowerCase().endsWith(".html"))
      .map((file: any) => {
        const filePath = String(file.path || "");
        if (filePath === "/index.html") return "/";
        return normalizeRoutePath(filePath.replace(/\/index\.html$/i, ""));
      });
    return {
      project: config,
      routes: Array.from(new Set<string>(routes)),
      staticFiles: existingStaticFiles as StaticSiteFile[],
    };
  }

  const pages = Array.isArray(config?.pages) ? config.pages : [];
  if (pages.length === 0) {
    throw new Error("test-deploy-final requires either staticSite.files or pages[] input");
  }

  const routes: string[] = Array.from(
    new Set<string>(
      pages
        .map((page: any) => normalizeRoutePath(String(page?.path || "/")))
        .filter((route: string) => Boolean(route)),
    ),
  );
  const withHome: string[] = routes.includes("/") ? routes : ["/", ...routes];
  const orderedRoutes: string[] = Array.from(new Set<string>(withHome));
  const brandName = String(config?.branding?.name || config?.projectId || "Website");

  const staticFiles: StaticSiteFile[] = orderedRoutes.map((route) => {
    const page = pages.find((item: any) => normalizeRoutePath(String(item?.path || "/")) === route);
    const title = String(page?.seo?.title || `${brandName} ${route === "/" ? "Home" : route}`);
    const description = String(page?.seo?.description || `${brandName} ${route} page`);
    return {
      path: routeToHtmlPath(route),
      content: buildFallbackPageHtml({
        route,
        routes: orderedRoutes,
        title,
        description,
        brandName,
      }),
      type: "text/html",
    };
  });

  staticFiles.push({
    path: "/styles.css",
    type: "text/css",
    content: "body{font-family:Inter,Arial,sans-serif;margin:0;background:#f8fafc;color:#111827}.container{width:min(1080px,92vw);margin:0 auto}nav{display:flex;gap:12px;flex-wrap:wrap;padding:16px 0}nav a{text-decoration:none;color:#0b3b66;font-weight:600}.hero{padding:56px 0}",
  });
  staticFiles.push({
    path: "/script.js",
    type: "text/javascript",
    content: "(()=>{document.querySelectorAll('[data-year]').forEach((n)=>{n.textContent=String(new Date().getFullYear())})})();",
  });

  return {
    project: {
      ...config,
      staticSite: {
        mode: "skill-direct",
        routeToFile: Object.fromEntries(orderedRoutes.map((route) => [route, routeToHtmlPath(route)])),
        files: staticFiles,
      },
    },
    routes: orderedRoutes,
    staticFiles,
  };
}

export async function GET(_req: NextRequest) {
  try {
    configureUndiciProxyFromEnv();

    const cf = new CloudflareClient();
    const testProjectName = `lc-cnc-static-${Date.now().toString().slice(-6)}`;
    const sourceUrl = _req.nextUrl.searchParams.get("sourceUrl")?.trim();
    const debugMode = _req.nextUrl.searchParams.get("debug") === "1";
    let config: any = structuredClone(TEST_PROJECT_LC_CNC);
    let extracted: any = undefined;

    if (sourceUrl) {
      extracted = await extractWebsiteMainPages(sourceUrl);
      config = buildProjectFromExtractedSite(extracted);
    }
    const normalized = ensureSkillDirectProject(config);
    const normalizedProject = normalized.project;
    const staticFiles = normalized.staticFiles;
    const expectedRoutes = normalized.routes;

    await cf.createProject(testProjectName);

    // Cloudflare Pages project metadata can be eventually consistent in real env.
    if (process.env.NODE_ENV !== "test") {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    const bundle = await Bundler.createBundle(normalizedProject);
    const deployment = await cf.uploadDeployment(testProjectName, bundle);
    const url = `https://${testProjectName}.pages.dev`;

    const pageDebug = staticFiles
      .filter((file: any) => String(file?.path || "").toLowerCase().endsWith(".html"))
      .map((file: any) => ({
        filePath: file.path,
        bytes: String(file?.content || "").length,
      }));

    let reachability: { ok: boolean; status?: number; error?: string } = { ok: false };
    if (process.env.NODE_ENV === "test") {
      reachability = { ok: true, status: 200 };
    } else {
      // Verify the website is reachable after deployment.
      try {
        const ping = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
        reachability = { ok: ping.ok, status: ping.status };
      } catch (err) {
        reachability = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    return NextResponse.json({
      success: true,
      projectName: testProjectName,
      sourceUrl: sourceUrl || null,
      pageCount: expectedRoutes.length,
      expectedRoutes,
      url,
      reachability,
      extractedSummary: extracted
        ? {
            sourceUrl: extracted.sourceUrl,
            siteName: extracted.siteName,
            logo: extracted.logo,
            pageCount: extracted.pages?.length || 0,
            pages: extracted.pages?.map((p: any) => ({
              label: p.label,
              sourcePath: p.sourcePath,
              targetPath: p.targetPath,
              imageCount: p.images?.length || 0,
            })),
          }
        : null,
      pageDebug: debugMode ? pageDebug : undefined,
      deployment,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        error: e.message,
        stack: e.stack,
      },
      { status: 500 },
    );
  }
}
