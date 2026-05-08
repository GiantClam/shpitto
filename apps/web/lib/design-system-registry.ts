import path from "node:path";

export type DesignSystemSource = "builder" | "workflow-skill" | "cache" | "unknown";

export type DesignSystemSummary = {
  id: string;
  title: string;
  category: string;
  summary: string;
  swatches: string[];
  sourcePath: string;
  source: DesignSystemSource;
};

export type DesignSystemDetail = {
  summary: DesignSystemSummary;
  body: string;
};

type DesignSystemCandidate = {
  id: string;
  filePath: string;
  source: DesignSystemSource;
};

type IndexStyleMeta = {
  name?: string;
  slug?: string;
  category?: string;
  description?: string;
};

const SAFE_DESIGN_SYSTEM_ID = /^[a-z0-9._-]+$/i;
const HEX_COLOR_PATTERN = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const MAX_SUMMARY_LENGTH = 220;

const SOURCE_PRIORITY: Record<DesignSystemSource, number> = {
  builder: 3,
  "workflow-skill": 2,
  cache: 1,
  unknown: 0,
};

function appRoot(): string {
  const cwd = path.resolve(/* turbopackIgnore: true */ process.cwd());
  if (cwd.endsWith(`${path.sep}apps${path.sep}web`)) return cwd;
  return path.resolve(cwd, "apps", "web");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function toDesignSystemId(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(title: string, id: string): string {
  const normalized = stripMarkdown(title)
    .replace(/^Design System Inspiration of\s+/i, "")
    .replace(/^Design System\s*:\s*/i, "")
    .trim();
  if (normalized) return normalized;
  return id
    .split(/[-_.]+/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractTitle(body: string, id: string): string {
  const titleMatch = body.match(/^#\s+(.+)$/m);
  return cleanTitle(titleMatch?.[1] || "", id);
}

function extractCategory(body: string, meta?: IndexStyleMeta): string {
  if (meta?.category) return meta.category;
  const categoryMatch =
    body.match(/^##\s*\d*\.?\s*(?:Category|Industry|Use Case)\s*:?\s*(.+)$/im) ||
    body.match(/\*\*(?:Category|Industry|Use Case):\*\*\s*(.+)$/im);
  return stripMarkdown(categoryMatch?.[1] || "Website Inspiration");
}

function extractSummary(body: string, meta?: IndexStyleMeta): string {
  if (meta?.description) return meta.description.trim();
  const lines = body
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("|") && !line.startsWith("---"));
  const firstParagraph = stripMarkdown(lines.slice(0, 6).join(" "));
  if (firstParagraph.length <= MAX_SUMMARY_LENGTH) return firstParagraph;
  return `${firstParagraph.slice(0, MAX_SUMMARY_LENGTH - 1).trim()}...`;
}

function normalizeHexColor(color: string): string {
  const value = color.trim();
  if (value.length === 4 || value.length === 5) {
    const chars = value.slice(1).split("");
    return `#${chars
      .slice(0, 3)
      .map((char) => `${char}${char}`)
      .join("")}`.toLowerCase();
  }
  return value.slice(0, 7).toLowerCase();
}

function extractSwatches(body: string): string[] {
  const matches = body.match(HEX_COLOR_PATTERN) || [];
  const colors = new Set<string>();
  for (const match of matches) {
    colors.add(normalizeHexColor(match));
    if (colors.size >= 8) break;
  }
  return Array.from(colors);
}

function relativeToRepo(filePath: string): string {
  return path.relative(appRoot(), filePath).replace(/\\/g, "/");
}

async function readIndexMetadata(): Promise<Map<string, IndexStyleMeta>> {
  const fs = await import("node:fs/promises");
  const candidates = [
    path.join(/* turbopackIgnore: true */ appRoot(), "skills", "website-generation-workflow", "awesome-design.local.index.json"),
  ];
  const bySlug = new Map<string, IndexStyleMeta>();

  for (const filePath of candidates) {
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as {
        categories?: Array<{ name?: string; styles?: IndexStyleMeta[] }>;
      };
      for (const category of parsed.categories || []) {
        for (const style of category.styles || []) {
          const id = toDesignSystemId(style.slug || style.name || "");
          if (!id) continue;
          bySlug.set(id, {
            ...style,
            category: style.category || category.name,
          });
        }
      }
    } catch {
      // Index files are optional; DESIGN.md remains the source of truth.
    }
  }

  return bySlug;
}

async function discoverCandidates(): Promise<DesignSystemCandidate[]> {
  const fs = await import("node:fs/promises");
  const roots: Array<{ dir: string; source: DesignSystemSource }> = [
    {
      dir: path.join(
        /* turbopackIgnore: true */
        appRoot(),
        "skills",
        "website-generation-workflow",
        "awesome-design-md",
        "design-md",
      ),
      source: "workflow-skill",
    },
    {
      dir: path.join(/* turbopackIgnore: true */ appRoot(), "skills", "design-systems", "design-md"),
      source: "workflow-skill",
    },
  ];

  const candidates: DesignSystemCandidate[] = [];
  for (const root of roots) {
    if (!(await pathExists(root.dir))) continue;
    let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
    try {
      entries = await fs.readdir(root.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const id = toDesignSystemId(entry.name);
      if (!id || !SAFE_DESIGN_SYSTEM_ID.test(id)) continue;
      const filePath = path.join(root.dir, entry.name, "DESIGN.md");
      if (!(await pathExists(filePath))) continue;
      candidates.push({ id, filePath, source: root.source });
    }
  }

  return candidates;
}

function preferCandidate(
  current: DesignSystemCandidate | undefined,
  next: DesignSystemCandidate,
): DesignSystemCandidate {
  if (!current) return next;
  return SOURCE_PRIORITY[next.source] > SOURCE_PRIORITY[current.source] ? next : current;
}

async function summarizeCandidate(
  candidate: DesignSystemCandidate,
  meta?: IndexStyleMeta,
): Promise<DesignSystemSummary | undefined> {
  try {
    const fs = await import("node:fs/promises");
    const body = await fs.readFile(candidate.filePath, "utf8");
    const title = cleanTitle(meta?.name || extractTitle(body, candidate.id), candidate.id);
    return {
      id: candidate.id,
      title,
      category: extractCategory(body, meta),
      summary: extractSummary(body, meta),
      swatches: extractSwatches(body),
      sourcePath: relativeToRepo(candidate.filePath),
      source: candidate.source,
    };
  } catch {
    return undefined;
  }
}

export async function listDesignSystems(): Promise<DesignSystemSummary[]> {
  const metadata = await readIndexMetadata();
  const preferred = new Map<string, DesignSystemCandidate>();

  for (const candidate of await discoverCandidates()) {
    preferred.set(candidate.id, preferCandidate(preferred.get(candidate.id), candidate));
  }

  const summaries: DesignSystemSummary[] = [];
  for (const candidate of preferred.values()) {
    const summary = await summarizeCandidate(candidate, metadata.get(candidate.id));
    if (summary) summaries.push(summary);
  }

  return summaries.sort((a, b) => a.title.localeCompare(b.title));
}

export async function readDesignSystem(id: string): Promise<DesignSystemDetail | null> {
  const normalized = toDesignSystemId(id);
  if (!normalized || !SAFE_DESIGN_SYSTEM_ID.test(normalized)) return null;

  const metadata = await readIndexMetadata();
  const candidate = (await discoverCandidates()).reduce<DesignSystemCandidate | undefined>((best, next) => {
    if (next.id !== normalized) return best;
    return preferCandidate(best, next);
  }, undefined);
  if (!candidate) return null;

  try {
    const fs = await import("node:fs/promises");
    const body = await fs.readFile(candidate.filePath, "utf8");
    const summary = await summarizeCandidate(candidate, metadata.get(candidate.id));
    return summary ? { summary, body } : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSwatches(swatches: string[]): string {
  const colors = swatches.length > 0 ? swatches : ["#0f172a", "#f8fafc", "#2563eb", "#e2e8f0"];
  return colors
    .map(
      (color) =>
        `<span class="swatch" style="background:${escapeHtml(color)}" title="${escapeHtml(color)}"></span>`,
    )
    .join("");
}

export async function renderDesignSystemPreviewHtml(id: string): Promise<string | null> {
  const detail = await readDesignSystem(id);
  if (!detail) return null;
  const { summary, body } = detail;
  const excerpt = stripMarkdown(body).slice(0, 900);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(summary.title)} Design System Preview</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0b0f19;
        color: #f8fafc;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at 20% 20%, rgba(96, 165, 250, 0.18), transparent 32rem),
          radial-gradient(circle at 80% 0%, rgba(251, 191, 36, 0.12), transparent 28rem),
          #0b0f19;
      }
      main {
        box-sizing: border-box;
        width: min(1040px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 56px 0;
      }
      .eyebrow {
        color: #93c5fd;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
        margin-bottom: 18px;
        text-transform: uppercase;
      }
      h1 {
        font-size: clamp(44px, 7vw, 92px);
        letter-spacing: -0.08em;
        line-height: 0.9;
        margin: 0;
        max-width: 840px;
      }
      .summary {
        color: #cbd5e1;
        font-size: clamp(18px, 2.4vw, 24px);
        line-height: 1.55;
        margin: 28px 0 0;
        max-width: 760px;
      }
      .panel {
        background: rgba(15, 23, 42, 0.72);
        border: 1px solid rgba(148, 163, 184, 0.26);
        border-radius: 28px;
        box-shadow: 0 30px 100px rgba(0, 0, 0, 0.34);
        margin-top: 38px;
        padding: 28px;
      }
      .swatches {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 24px;
      }
      .swatch {
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 999px;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14);
        display: block;
        height: 46px;
        width: 46px;
      }
      .excerpt {
        color: #dbeafe;
        font-size: 15px;
        line-height: 1.8;
        margin: 0;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">${escapeHtml(summary.category)} / ${escapeHtml(summary.source)}</div>
      <h1>${escapeHtml(summary.title)}</h1>
      <p class="summary">${escapeHtml(summary.summary)}</p>
      <section class="panel" aria-label="Design system details">
        <div class="swatches">${renderSwatches(summary.swatches)}</div>
        <p class="excerpt">${escapeHtml(excerpt)}</p>
      </section>
    </main>
  </body>
</html>`;
}
