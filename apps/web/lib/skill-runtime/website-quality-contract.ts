export function renderWebsiteQualityContract(): string {
  return [
    "## Website Quality Contract",
    "- Runtime scope is website generation only; do not generate mobile apps, slide decks, native app screens, or external coding-agent instructions.",
    "- One generated website must render correctly in desktop browser, MacBook, iPad, iPhone, and Android preview shells.",
    "- Treat preview as WYSIWYG: navigation, layout, media, forms, and responsive breakpoints must work inside iframe preview.",
    "- Use the selected local design system as the visual source of truth for color, typography, spacing, radius, shadows, motion, and component rhythm.",
    "- Avoid AI-slop defaults: no placeholder copy, no generic Feature 1/2/3 grids, no anonymous testimonials, no fake metrics, no repeated card modules across pages.",
    "- Visual direction must be distinctive: expressive type pairing, intentional background system, layered sections, strong hero composition, and mobile-specific composition.",
    "- CSS must include responsive strategy using media queries, container queries, or clamp-based fluid sizing.",
    "- Every page must contain enough route-specific content depth to stand alone; sibling pages must not be superficial copies.",
    "- Route / must always read as the site home entry, not as a downloads hub, certification portal, or login page.",
    "- If a hero visual rail is tall, it must contain real media, chart, or data-viz content; do not leave a large empty visual card with only bottom-aligned text.",
    "- Result cards rendered inside a 12-column grid must span the full available row unless the design explicitly calls for a narrower card layout.",
    "- Final HTML must include viewport meta, semantic landmarks, accessible labels, keyboard-safe interactions, and shared stylesheet/script references.",
  ].join("\n");
}
