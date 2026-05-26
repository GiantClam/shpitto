import fs from "node:fs/promises";
import path from "node:path";

export function normalizePreviewSiteRelativePath(value: string): string {
  return String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

export function normalizeTaskPlanRoutePath(route: string): string {
  const raw = String(route || "").trim();
  if (!raw) return "";
  const withoutQuery = raw.split(/[?#]/)[0] || "";
  const withSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  const compact = withSlash.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  return compact === "/index" ? "/" : compact;
}

export function routeToHtmlFile(route: string): string {
  const normalized = normalizeTaskPlanRoutePath(route);
  if (!normalized || normalized === "/") return "index.html";
  return `${normalized.replace(/^\//, "")}/index.html`;
}

export function parseRequiredRoutesFromTaskPlan(taskPlan: string): string[] {
  const routeLine = String(taskPlan || "").match(/^\s*-\s*Routes:\s*(.+)$/im)?.[1] || "";
  if (!routeLine.trim()) return [];
  return Array.from(
    new Set(
      routeLine
        .split(",")
        .map((item) => normalizeTaskPlanRoutePath(item))
        .filter(Boolean),
    ),
  );
}

export function resolveRequiredFilesFromTaskPlanText(taskPlan: string): string[] {
  const routes = parseRequiredRoutesFromTaskPlan(taskPlan);
  const required = new Set(["styles.css", "script.js"]);
  if (routes.length > 0) {
    for (const route of routes) required.add(routeToHtmlFile(route));
  } else {
    required.add("index.html");
  }
  return Array.from(required).sort();
}

export function isPreviewHtmlFile(filePath: string): boolean {
  return normalizePreviewSiteRelativePath(filePath).toLowerCase().endsWith(".html");
}

function previewEntrySortKey(filePath: string): [number, number, number, string] {
  const normalized = normalizePreviewSiteRelativePath(filePath);
  if (normalized === "index.html") return [0, 0, 0, normalized];
  const segments = normalized.split("/").filter(Boolean);
  const blogPenalty = normalized.startsWith("blog/") ? 1 : 0;
  return [1, segments.length, blogPenalty, normalized];
}

export function pickDefaultPreviewRelativePath(files: string[]): string {
  const htmlFiles = Array.from(
    new Set(files.map(normalizePreviewSiteRelativePath).filter((filePath) => isPreviewHtmlFile(filePath))),
  );
  if (htmlFiles.length === 0) return "";
  htmlFiles.sort((left, right) => {
    const leftKey = previewEntrySortKey(left);
    const rightKey = previewEntrySortKey(right);
    const [leftIndexRank, leftDepth, leftBlogPenalty, leftPath] = leftKey;
    const [rightIndexRank, rightDepth, rightBlogPenalty, rightPath] = rightKey;
    if (leftIndexRank !== rightIndexRank) return leftIndexRank - rightIndexRank;
    if (leftDepth !== rightDepth) return leftDepth - rightDepth;
    if (leftBlogPenalty !== rightBlogPenalty) return leftBlogPenalty - rightBlogPenalty;
    return leftPath.localeCompare(rightPath);
  });
  return htmlFiles[0] || "";
}

export async function listPreviewSiteFiles(siteDir: string): Promise<string[]> {
  const output: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      output.push(path.relative(siteDir, fullPath).replace(/\\/g, "/"));
    }
  }

  try {
    await walk(siteDir);
  } catch {
    return [];
  }

  return output.sort();
}

export async function resolveDefaultPreviewRelativePathFromSiteDir(siteDir: string): Promise<string> {
  const files = await listPreviewSiteFiles(siteDir);
  return pickDefaultPreviewRelativePath(files);
}

export async function siteHasPreviewEntrypoint(siteDir: string): Promise<boolean> {
  const normalized = String(siteDir || "").trim();
  if (!normalized) return false;
  try {
    const stat = await fs.stat(normalized);
    if (!stat.isDirectory()) return false;
  } catch {
    return false;
  }
  return Boolean(await resolveDefaultPreviewRelativePathFromSiteDir(normalized));
}
