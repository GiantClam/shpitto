---
name: "portfolio-blog-site"
description: "Type-specific generation contract for personal portfolio and blog websites. Use for resumes, creator sites, consultant profiles, and writing-led personal sites."
triggers:
  - "portfolio"
  - "personal site"
  - "resume"
  - "blog"
  - "creator"
  - "consultant"
---

# Portfolio Blog Site

Use this skill when the site represents an individual, creator, consultant, or writing-led personal profile.

## Core contract

- Personal identity and viewpoint may lead the homepage.
- Blog or writing can be a first-class route and narrative surface.
- Narrative, editorial rhythm, and profile storytelling are allowed here in ways they are not for `corporate-b2b-site`.
- Do not force enterprise company-shell expectations onto a true portfolio/blog site.

## Homepage contract

- Homepage must introduce the named person, their technical judgment, and why the audience should trust their writing or services before routing visitors into `/blog`.
- Treat `/` as a profile-led editorial homepage, not as a generic marketing hero and not as a compressed article directory.
- Preferred homepage sequence:
  - profile-led masthead
  - expertise or editorial pillars
  - selected writing/proof band
  - concise CTA or contact strip
- Do not let the homepage read like an archive explainer, route-order note, or "start here" mechanics panel.
- If the homepage opening or first support band uses a visual slot, that slot must be either:
  - a real operator/publication-context image, or
  - a dense writing/proof module with specific article, service, or credibility substance.
- Do not emit low-information visual filler such as pale gradient rectangles, empty context cards, weak right-side rails, decorative placeholder boxes, or "featured context" panels that carry almost no real evidence.
- If no credible image is available, replace the media slot with a substantive writing spotlight, editorial proof stack, or operator evidence module instead of shipping a decorative placeholder surface.
- When a homepage or support band uses a left-right composition, the text block and media block must align as one deliberate paired layout. Do not render a tall text slab beside a small floating image tile with mismatched heights or unrelated baselines.
- If the layout uses a side image, make that image a proper companion panel or card with stable aspect ratio, shared vertical alignment, and enough visual weight to balance the copy column.

## Visual identity contract

- Portfolio/blog surfaces must not reuse the same visual system as corporate, docs, or institutional content-hub sites.
- Prefer an editorial technology-journal aesthetic with warm paper or graphite neutrals, one disciplined accent, readable long-form typography, and strong article-card hierarchy.
- Do not default to the generic green-white rounded-card theme.
- The dominant composition should feel like a polished personal publication: profile masthead, essay cards, article leads, editorial proof, and compact contact moments.

## Blog route contract

- `/blog` may be a first-class archive, but it must remain a real website route with the same shared header, footer, CSS system, and navigation contract as the rest of the site.
- The default first website-generation pass must guarantee a strong `/blog/index.html` archive page, not a full set of `/blog/{slug}/index.html` article pages.
- If the archive shows starter article topics, keep them as archive-ready cards, summaries, or collection entries during the first pass. Do not force the main workflow to finish every detail page up front.
- Blog detail generation is a separate workflow stage. Run it after deploy readiness and before custom-domain binding, or when the user manually triggers article generation.
- When the dedicated `blog-detail-fill-workflow` is active, every requested `/blog/{slug}/` route must become a stable, slug-aligned detail page with real long-form structure: one route-owned H1, a strong intro, multiple substantive H2 sections, and enough real body copy to read like finished technical writing.
- Do not invent archive-category, tag, or author-index routes unless the confirmed manifest explicitly includes them.
- `/blog` must not open as a giant text slab plus an empty or weak visual rail. If the route uses a supporting archive-context panel, that panel needs real archive evidence: featured posts, publication cues, reading themes, or route-owned visual substance.
- Archive and listing surfaces should prefer image-text article cards when a credible supporting image is available. Do not default the archive to text-only blocks if the route already has room for paired editorial thumbnails or proof imagery.
- Product-like showcases, article ledgers, featured writing strips, and proof shelves should prefer integrated image-text cards over separated text rows plus a detached visual placeholder.

## Shared shell contract

- Header, nav order, footer destinations, and shared stylesheet/script references must stay consistent across `/`, `/blog`, `/about`, `/contact`, and any explicit `/blog/{slug}/` routes.
- For a compact route set such as `Home / Blog / About / Contact`, desktop and tablet headers should render the primary links directly. Do not leave a visible textual `Menu` button in the desktop nav when the links already fit on one line.
- If a disclosure trigger is used for narrow widths, it must be mobile-only and backed by matching CSS and JavaScript. Do not ship a header where the toggle is visible but the nav never collapses.
- Interior routes may vary in opening modules and editorial rhythm, but they must not collapse the footer into a flat legal row or drift into one-off shell markup.
- Shared shell copy must stay visitor-facing. Do not expose implementation notes, article-count instructions, publishing workflow text, or design-system rationale in visible copy.
- Blog detail pages must inherit the same shared footer destination set as the homepage and blog index.
- Footer must use a structured footer shell, not a bare `pagefoot` row or flat stream of anchors. Minimum shape:
  - one footer band with visible separation from main content
  - one identity/brand zone
  - one navigation/link zone
  - one support/meta/actions zone
- If shared CSS defines footer shell utilities such as `site-footer__inner`, `footer-grid`, `footer-brand`, `footer-links`, `footer-nav`, `footer-meta`, `footer-actions`, `footer-bottom`, or equivalent BEM/footer-column classes, the HTML footer must use those same structured zones instead of collapsing to a single inline row.
- Footer grouping must stay distinct. Do not repeat the same route set under multiple headings such as both `Primary navigation` and `Key sections`; each footer group needs a separate job.

## Copy exclusions

- Do not expose route-mechanics wording such as "start with these three articles", "this page collects", "reading order", or "continue to the next page".
- Do not expose internal QA or layout labels such as `Responsive layout`, `Shared shell`, `Desktop and mobile review`, `homepage groups`, or `visual system keeps`.
- Do not use placeholder article filler, TODO labels, lorem ipsum, or abstract content-strategy commentary in visible blog detail prose.

## Media preference

- When the brief is a technical personal site, consultant profile, or writing-led publication, prefer real operator/editorial context imagery on `/` and `/blog` whenever the route already reserves visual space.
- Good matches include workspace, writing desk, meeting-table, notebook, editorial, research, or implementation-context photography that reinforces the route purpose.
- Do not fill those slots with abstract gradients, empty cards, generic icon mosaics, or weak support rails when a credible contextual image is available.
