import { unstable_cache } from "next/cache";
import { promises as fs } from "node:fs";
import path from "node:path";
import { listChatSessionsForOwner } from "@/lib/agent/chat-task-store";
import {
  LAUNCH_CENTER_RECENT_PROJECTS_TAG,
  LAUNCH_CENTER_TEMPLATE_CARDS_TAG,
} from "@/lib/launch-center/cache";

type AwesomeDesignStyle = {
  name?: string;
  slug?: string;
  category?: string;
  description?: string;
  sourceUrl?: string;
};

type AwesomeDesignCategory = {
  name?: string;
  styles?: AwesomeDesignStyle[];
};

type AwesomeDesignIndex = {
  categories?: AwesomeDesignCategory[];
};

export type LaunchCenterProjectCard = {
  id: string;
  title: string;
  ageLabel: string;
  summary: string;
};

export type LaunchCenterTemplateCard = {
  name: string;
  slug: string;
  tag: string;
  tone: string;
  sourceUrl?: string;
};

const DEFAULT_TEMPLATES: LaunchCenterTemplateCard[] = [
  {
    name: "Precision Manufacturing",
    slug: "precision-manufacturing",
    tag: "Industrial",
    tone: "High-contrast hero + dense proof sections for technical buyers.",
  },
  {
    name: "B2B Equipment Showcase",
    slug: "b2b-equipment-showcase",
    tag: "Sales",
    tone: "Product-led layout with configurable module and CTA comparison blocks.",
  },
  {
    name: "Modern Case Journal",
    slug: "modern-case-journal",
    tag: "Editorial",
    tone: "Story-first structure for project timelines, benchmarks, and visuals.",
  },
  {
    name: "Factory Service Landing",
    slug: "factory-service-landing",
    tag: "Conversion",
    tone: "Fast qualification flow with quote-ready forms and trust signals.",
  },
];

const PROJECT_FALLBACK_SUMMARY = "Continue building this draft in studio with full chat context.";

function formatRelativeTimeLabel(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "just now";
  const diffMs = timestamp - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (absSec < 60) return rtf.format(Math.round(diffSec), "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHour = Math.round(diffSec / 3600);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour");
  const diffDay = Math.round(diffSec / 86400);
  return rtf.format(diffDay, "day");
}

async function readAwesomeDesignIndex(): Promise<AwesomeDesignIndex | null> {
  const candidates = [
    path.join(process.cwd(), "skills", "website-generation-workflow", "awesome-design.local.index.json"),
    path.join(process.cwd(), "..", "..", ".cache", "awesome-design-md", "index.json"),
  ];

  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, "utf8");
      const parsed = JSON.parse(raw) as AwesomeDesignIndex;
      if (parsed && Array.isArray(parsed.categories)) {
        return parsed;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function buildTemplateCards(index: AwesomeDesignIndex | null, limit = 4): LaunchCenterTemplateCard[] {
  if (!index?.categories?.length) return DEFAULT_TEMPLATES;

  const picked: LaunchCenterTemplateCard[] = [];
  const allStyles: AwesomeDesignStyle[] = [];

  for (const category of index.categories) {
    const styles = Array.isArray(category.styles) ? category.styles : [];
    if (styles.length > 0) {
      allStyles.push(...styles);
      const first = styles[0];
      if (first?.name && first?.slug) {
        picked.push({
          name: first.name,
          slug: first.slug,
          tag: category.name || first.category || "Template",
          tone: first.description || "Curated style blueprint.",
          sourceUrl: first.sourceUrl,
        });
      }
    }
    if (picked.length >= limit) break;
  }

  if (picked.length < limit) {
    const existing = new Set(picked.map((item) => item.slug));
    for (const style of allStyles) {
      if (!style?.name || !style?.slug || existing.has(style.slug)) continue;
      picked.push({
        name: style.name,
        slug: style.slug,
        tag: style.category || "Template",
        tone: style.description || "Curated style blueprint.",
        sourceUrl: style.sourceUrl,
      });
      existing.add(style.slug);
      if (picked.length >= limit) break;
    }
  }

  return picked.length > 0 ? picked.slice(0, limit) : DEFAULT_TEMPLATES;
}

async function loadTemplateCards(): Promise<LaunchCenterTemplateCard[]> {
  const index = await readAwesomeDesignIndex();
  return buildTemplateCards(index, 4);
}

async function loadRecentProjects(ownerUserId: string): Promise<LaunchCenterProjectCard[]> {
  try {
    const sessions = await listChatSessionsForOwner(ownerUserId, { includeArchived: false, limit: 6 });
    return sessions.slice(0, 3).map((session) => {
      const ts = session.lastMessageAt || session.updatedAt || session.createdAt || Date.now();
      return {
        id: session.id,
        title: session.title || "Untitled Session",
        ageLabel: formatRelativeTimeLabel(ts),
        summary: session.lastMessage || PROJECT_FALLBACK_SUMMARY,
      };
    });
  } catch {
    return [];
  }
}

const getCachedTemplateCards = unstable_cache(loadTemplateCards, ["launch-center-template-cards-v1"], {
  revalidate: 60 * 60,
  tags: [LAUNCH_CENTER_TEMPLATE_CARDS_TAG],
});

const getCachedRecentProjectsByUser = unstable_cache(
  async (ownerUserId: string) => loadRecentProjects(ownerUserId),
  ["launch-center-recent-projects-v1"],
  {
    revalidate: 45,
    tags: [LAUNCH_CENTER_RECENT_PROJECTS_TAG],
  },
);

export async function getLaunchCenterData(ownerUserId?: string) {
  const normalizedOwner = String(ownerUserId || "").trim();
  const [templateCards, recentProjects] = await Promise.all([
    getCachedTemplateCards(),
    normalizedOwner ? getCachedRecentProjectsByUser(normalizedOwner) : Promise.resolve([]),
  ]);

  return {
    templateCards,
    recentProjects,
  };
}
