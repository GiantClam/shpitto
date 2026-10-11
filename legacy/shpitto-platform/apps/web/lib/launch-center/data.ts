import { unstable_cache } from "next/cache";
import { listChatSessionsForOwner } from "@/lib/agent/chat-task-store";
import {
  LAUNCH_CENTER_RECENT_PROJECTS_TAG,
  LAUNCH_CENTER_TEMPLATE_CARDS_TAG,
} from "@/lib/launch-center/cache";

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
  workflowId: string;
  promptHint: string;
};

const DEFAULT_TEMPLATES: LaunchCenterTemplateCard[] = [
  {
    name: "AI Image Tool Starter",
    slug: "ai-image-tool-starter",
    tag: "AI Tool",
    tone: "Product-shaped AI image tool baseline with generate, gallery, pricing, FAQ, and plugin-ready workflow surfaces.",
    workflowId: "build-ai-image-tool",
    promptHint: "Build an AI image tool product shell with a generator route, example gallery, pricing model, FAQ, and plugin-ready editing surfaces.",
  },
  {
    name: "Agent Launch Site",
    slug: "agent-launch-site",
    tag: "Marketing",
    tone: "Outcome-led homepage, workflow proof, pricing CTA, and reusable product narrative.",
    workflowId: "build-marketing-site",
    promptHint: "Use a bold developer-marketing layout with workflow proof, comparison sections, and a clear launch CTA.",
  },
  {
    name: "Indie SaaS Starter",
    slug: "indie-saas-starter",
    tag: "SaaS",
    tone: "Lean launch template for solo founders shipping waitlists, demos, and feature proof.",
    workflowId: "build-marketing-site",
    promptHint: "Keep the structure compact, launch-ready, and focused on value proposition, product proof, and signup flow.",
  },
  {
    name: "B2B Lead Engine",
    slug: "b2b-lead-engine",
    tag: "B2B",
    tone: "Inquiry-ready company site with solutions, proof, trust blocks, and contact path.",
    workflowId: "build-b2b-site",
    promptHint: "Frame the site for procurement and enterprise buyers with capability proof, solutions, and contact conversion.",
  },
  {
    name: "Docs + Blog Funnel",
    slug: "docs-blog-funnel",
    tag: "Content",
    tone: "Marketing homepage plus docs/blog route system for onboarding and long-tail discovery.",
    workflowId: "build-marketing-site",
    promptHint: "Include a docs/blog-ready information architecture that supports onboarding, SEO content, and product education.",
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

async function loadTemplateCards(): Promise<LaunchCenterTemplateCard[]> {
  return DEFAULT_TEMPLATES;
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
