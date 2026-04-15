import { NextRequest, NextResponse } from "next/server";
import { Bundler } from "../../../lib/bundler";
import { CloudflareClient } from "../../../lib/cloudflare";
import { TEST_PROJECT_LC_CNC } from "../../../lib/agent/test_cases";
import { configureUndiciProxyFromEnv } from "../../../lib/agent/network";
import { buildProjectFromExtractedSite, extractWebsiteMainPages } from "../../../lib/agent/site-extractor";

export const dynamic = "force-dynamic";

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

    await cf.createProject(testProjectName);

    // Cloudflare Pages project metadata can be eventually consistent.
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const bundle = await Bundler.createBundle(config);
    const deployment = await cf.uploadDeployment(testProjectName, bundle);
    const url = `https://${testProjectName}.pages.dev`;

    const pageDebug = config.pages.map((p: any) => {
      const hero = (p?.puckData?.content || []).find((c: any) => c.type === "Hero");
      return {
        path: p.path,
        seoTitle: p?.seo?.title,
        heroTitle: hero?.props?.title,
        heroImage: hero?.props?.image,
      };
    });

    // Verify the website is reachable after deployment.
    let reachability: { ok: boolean; status?: number; error?: string } = { ok: false };
    try {
      const ping = await fetch(url, { method: "GET" });
      reachability = { ok: ping.ok, status: ping.status };
    } catch (err) {
      reachability = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    return NextResponse.json({
      success: true,
      projectName: testProjectName,
      sourceUrl: sourceUrl || null,
      pageCount: config.pages.length,
      expectedRoutes: config.pages.map((p: any) => p.path),
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
