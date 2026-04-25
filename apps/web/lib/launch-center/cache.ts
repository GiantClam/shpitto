export const LAUNCH_CENTER_RECENT_PROJECTS_TAG = "launch-center-recent-projects-v1";
export const LAUNCH_CENTER_TEMPLATE_CARDS_TAG = "launch-center-template-cards-v1";

export async function invalidateLaunchCenterRecentProjectsCache(): Promise<void> {
  try {
    const cache = await import("next/cache");
    cache.revalidateTag(LAUNCH_CENTER_RECENT_PROJECTS_TAG, "max");
  } catch {
    // Best-effort cache invalidation; ignore when runtime does not support next/cache.
  }
}
