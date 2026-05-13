import { NextResponse } from "next/server";
import {
  repairBrokenProjectAssetDirectoryUrls,
  rewriteProjectAssetLogicalUrls,
} from "@/lib/project-assets";
import { getOwnedProjectState } from "@/lib/agent/db";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";

export const runtime = "nodejs";

type VirtualPreviewFile = {
  path: string;
  content: string;
  type?: string;
};

function normalizePreviewFilePath(value: string): string {
  return String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function detectMime(filePath: string): string {
  const lower = String(filePath || "").toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

function injectPreviewNavigationBridge(html: string, previewBase: string): string {
  const safePreviewBase = JSON.stringify(String(previewBase || "").replace(/\/+$/, ""));
  const bridge = `<script>
(() => {
  const previewBase = ${safePreviewBase};
  if (!previewBase || typeof document === "undefined") return;

  const shouldRewrite = (href) =>
    typeof href === "string" &&
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !href.startsWith(previewBase + "/") &&
    href !== previewBase &&
    !/^\\/(?:api\\/|_next\\/)/i.test(href);

  const toPreviewHref = (href) => (shouldRewrite(href) ? previewBase + href : href);

  const rewriteAnchor = (anchor) => {
    if (!anchor || typeof anchor.getAttribute !== "function") return;
    const href = String(anchor.getAttribute("href") || "").trim();
    const next = toPreviewHref(href);
    if (next && next !== href) {
      anchor.setAttribute("href", next);
    }
  };

  const rewriteTree = (root) => {
    if (!root) return;
    if (root.matches && root.matches('a[href^="/"]')) rewriteAnchor(root);
    if (typeof root.querySelectorAll === "function") {
      root.querySelectorAll('a[href^="/"]').forEach(rewriteAnchor);
    }
  };

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!anchor) return;
      const href = String(anchor.getAttribute("href") || "").trim();
      const next = toPreviewHref(href);
      if (!next || next === href) return;
      anchor.setAttribute("href", next);
      event.preventDefault();
      window.location.assign(next);
    },
    true,
  );

  rewriteTree(document);
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) rewriteTree(node);
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
</script>`;

  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${bridge}</head>`);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${bridge}</body>`);
  return `${bridge}${html}`;
}

function rewriteHtmlForPreview(html: string, previewBase: string): string {
  const attrRewritten = String(html || "").replace(
    /\b(href|src)=["']\/(?!\/|api\/|_next\/)([^"']*)["']/gi,
    (_match, attr: string, target: string) => `${attr}="${previewBase}/${target}"`,
  );
  const sharedAssetRewritten = attrRewritten.replace(
    /\b(href|src)=["'](?:(?:\.\.?\/)+)?(styles\.css|script\.js)([?#][^"']*)?["']/gi,
    (_match, attr: string, target: string, suffix = "") => `${attr}="${previewBase}/${target}${suffix}"`,
  );
  const rootRewritten = sharedAssetRewritten.replace(/\bhref=["']\/["']/gi, `href="${previewBase}/"`);
  return injectPreviewNavigationBridge(rootRewritten, previewBase);
}

function resolveVirtualPreviewFile(project: any, parts: string[]): VirtualPreviewFile | undefined {
  const files = Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
  if (files.length === 0) return undefined;

  const byPath = new Map<string, VirtualPreviewFile>();
  for (const file of files) {
    const filePath = normalizePreviewFilePath(String(file?.path || ""));
    if (!filePath || typeof file?.content !== "string") continue;
    byPath.set(filePath, {
      path: filePath,
      content: file.content,
      type: typeof file.type === "string" ? file.type : undefined,
    });
  }

  const target = normalizePreviewFilePath(parts.join("/"));
  const candidates = target ? [target, `${target}/index.html`] : ["index.html"];
  for (const candidate of candidates) {
    const file = byPath.get(candidate);
    if (file) return file;
  }
  return undefined;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ projectId: string; path?: string[] }> },
) {
  const userId = await getAuthenticatedRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const params = await ctx.params;
  const projectId = decodeURIComponent(String(params.projectId || "").trim());
  const pathParts = Array.isArray(params.path) ? params.path : [];
  if (!projectId) {
    return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });
  }

  const projectState = await getOwnedProjectState(projectId, userId);
  const project = projectState?.projectJson;
  if (!project || typeof project !== "object") {
    return NextResponse.json({ ok: false, error: "Project preview is unavailable." }, { status: 404 });
  }

  const virtualFile = resolveVirtualPreviewFile(project, pathParts);
  if (!virtualFile) {
    return NextResponse.json({ ok: false, error: "Preview file not found." }, { status: 404 });
  }

  const mime = virtualFile.type || detectMime(virtualFile.path);
  const previewBase = `/api/projects/${encodeURIComponent(projectId)}/preview`;
  const content =
    /^text\/html/i.test(mime)
      ? repairBrokenProjectAssetDirectoryUrls(
          rewriteProjectAssetLogicalUrls(rewriteHtmlForPreview(virtualFile.content, previewBase), ""),
        )
      : /^(text\/css|application\/javascript|text\/javascript|application\/json|text\/plain|text\/markdown)/i.test(mime)
        ? repairBrokenProjectAssetDirectoryUrls(rewriteProjectAssetLogicalUrls(virtualFile.content, ""))
        : virtualFile.content;

  return new NextResponse(content, {
    status: 200,
    headers: {
      "content-type": mime,
      "cache-control": "no-store",
      "x-shpitto-project-preview": projectId,
      "x-shpitto-preview-path": normalizePreviewFilePath(virtualFile.path),
    },
  });
}
