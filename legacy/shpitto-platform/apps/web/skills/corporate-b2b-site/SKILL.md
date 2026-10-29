---
name: "corporate-b2b-site"
description: "Type-specific generation contract for corporate and B2B company websites. Use for manufacturers, exporters, service firms, and enterprise-facing official websites."
triggers:
  - "corporate"
  - "company website"
  - "official website"
  - "b2b"
  - "manufacturer"
  - "enterprise buyers"
  - "procurement"
  - "supplier"
---

# Corporate B2B Site

Use this skill when the website is an official company presence serving enterprise buyers, procurement teams, distributors, partners, or sourcing audiences.

## Homepage contract

- Homepage must present the company as an operational business, not a personal brand or creator landing page.
- Opening should emphasize capability, offer, proof, and contact path.
- Hero/media treatment should support business credibility and fast comprehension.
- Homepage hero must read as one shared image-backed surface with overlay copy, not as two separate sibling cards.
- The hero image may dominate the first screen, but the title/lead/CTA must sit on that same hero surface with a readable scrim.
- Do not render the homepage hero as `copy card on one side + image card on the other`.
- Keep `.enterprise-hero__content` as a transparent overlay text layer. Do not
  turn it into a frosted or bordered card with `background`, `border`,
  `box-shadow`, or `backdrop-filter`.
- Keep the homepage hero subtree enterprise-specific. Do not reuse legacy
  classes such as `hero-title`, `hero-copy`, `hero-actions`, `page-section`,
  `hero-grid`, or similar marketing-hero utility names inside the enterprise
  hero.
- Do not use generic action-group classes such as `hero-actions` anywhere on
  the homepage. Use enterprise-owned action classes such as
  `enterprise-hero__actions` or `cta-band__actions` instead.
- The homepage opening wrapper itself must be an enterprise-specific hero class
  such as `enterprise-hero`. Do not fall back to generic wrappers such as
  `hero`, `section hero`, or similar marketing-landing hero shells.
- Do not default to founder-story, editorial, boutique, or diary-style framing.

## Visual identity contract

- Corporate B2B sites must not share the same visual system as docs/knowledge sites or content hubs.
- Prefer an industrial enterprise, procurement, operations, or institutional-trust aesthetic with a steel/graphite/navy or similarly grounded base and one restrained high-contrast accent.
- Do not default to a generic green-white rounded-card dashboard theme when the surface is corporate B2B.
- Preferred CSS token family: dark steel or graphite base, light enterprise text,
  blue/cyan primary, and amber operational accent.
- The dominant composition should be an image-backed enterprise masthead, wide proof bands, capability/process modules, and concrete operational media.
- Avoid documentation workspace chrome, editorial archive shelves, and repeated floating-card grids as the dominant corporate template.

## Route contract

Common route roles:

- `/` company overview and primary offer
- `/products` catalog / product families / specification logic
- `/custom-solutions` solution process / customization / buyer fit
- `/cases` proof / application / results
- `/about` company identity / operation / trust
- `/contact` inquiry / contact path / response expectations

### Route opening topology contract

- Interior routes must not repeat the same opening composition with only swapped text.
- `products` must open with a catalog/assortment lead, buyer comparison frame, or specification-oriented lead band.
- `custom-solutions` must open with a process intro, scenario-fit lead, or customization workflow header.
- `cases` must open with an evidence header, outcome ledger, or scenario/result frame.
- `about` must open with a company masthead, operating profile, or trust/process slab.
- `contact` must open form-first, channel-first, or response-expectation-first.
- Do not let `products`, `custom-solutions`, `cases`, `about`, and `contact` all render a repeated hero shell, repeated lead image treatment, or repeated opening CTA block.
- Shared theme, nav, footer, and tokens may stay identical; opening module topology must vary by route role.
- `products`, `custom-solutions`, and `cases` must not open as oversized white text slabs with an empty or weak right side. Each of those routes needs route-owned media in the opening band or the first opening-adjacent proof band.
- `products` should show product/material proof immediately.
- `custom-solutions` should show process/scenario/delivery proof immediately.
- `cases` should show scenario/result proof immediately.

## Shared shell contract

- Navigation and footer must be consistent across all pages.
- Shared shell copy must stay visitor-facing and business-facing.
- Do not expose implementation notes, i18n labels, brand-system notes, or design-system rationale in visible shell copy.
- Do not ship visible inline style attributes on final corporate pages for media or layout blocks. Images, figures, cards, grids, and support layouts must be styled through shared classes in `/styles.css`.
- Do not ship mojibake or encoding-corrupted punctuation such as broken apostrophes, broken dashes, or replacement characters in visible copy, placeholders, or CTA labels.
- Locale controls belong to one dedicated utility wrapper adjacent to nav. Do not leave an empty `header-utility` shell beside the nav while the locale buttons remain nested inside `<nav>`.
- Keep locale button labels literal `EN` and `ZH`. Do not render `English`,
  `Chinese`, `中文`, `英文`, or other long-form labels inside the header switch.
- For bilingual corporate pages, the final HTML should keep stable
  `data-i18n` keys only. Store actual English and Chinese strings in
  `/i18n/messages.en.json` and `/i18n/messages.zh-CN.json` instead of emitting
  inline `data-i18n-zh` / `data-i18n-en` values throughout the final HTML.
- Shared shell spacing must feel composed and breathable rather than dashboard-tight.
- Hero-to-header transition should feel controlled, not collapsed.
- Major section bands across homepage and interior pages should usually breathe in roughly the `40-72px` range.
- Nested proof rows, capability-card grids, CTA action groups, and support clusters should still feel spacious, usually in roughly the `28-44px` range rather than collapsing into 8-16px utility spacing.
- Card padding and internal stack spacing should feel comfortably readable for enterprise content, not compressed like a dense dashboard tile.

## Shared shell QA contract

- Treat navigation/footer drift as a generation defect, not as acceptable page-by-page variation.
- Route order, labels, and business CTA wording in nav/footer must remain identical across all primary routes unless the confirmed manifest changes.
- Locale controls may appear only once in a dedicated utility slot adjacent to nav; they must not be duplicated in nav links, footer links, or body sections.
- Utility/documentation/i18n mechanics must never replace buyer-facing shell copy.

## Tone contract

- Clear, operational, and trust-building.
- Prefer capability, process, sourcing clarity, quality control, delivery discipline, and response readiness.
- Warmth is allowed only as restraint. Do not drift into personal, artisanal-journal, or editorial-soft tone.

## Media contract

- Images support proof, product understanding, material understanding, or application context.
- Prefer real-photo or stock-photo business/product context over decorative abstraction.
- Media must belong to named modules, not be appended after layout decisions.
- Final route media should use shared semantic classes instead of hard-coded inline presentation such as `style="width:100%..."`.
- Visible image captions must be buyer-facing. They may describe material proof, application context, sourcing relevance, delivery context, or product range, but they must not describe layout intent or tell the reader what the visual module is supposed to do.
- `/products`: use product-family, material, texture, folded-pack, or specification-context imagery that helps buyers compare and understand assortments.
- `/custom-solutions`: use environment/process imagery that explains customization, delivery context, or operational fit.
- `/cases`: use application/result imagery that reinforces scenario, intervention, and outcome proof.
- `/about`: use company/production/quality-discipline imagery that reinforces operational trust instead of founder-portrait storytelling.
- `/contact`: use restrained support/context imagery only when it reduces inquiry friction; contact pages should never become gallery-like.
- `/products`, `/custom-solutions`, and `/cases`: the first meaningful image must appear in the opening route band or the first opening-adjacent proof band. Do not delay the first useful image until a later support section.
- `/products`, `/custom-solutions`, and `/cases`: do not use meta-design captions such as `Use contextual visuals`, `this image supports`, `proof image`, `should show`, `should feel`, or similar art-direction coaching text in visible `figcaption` copy.
- `/products`, `/custom-solutions`, and `/cases`: do not let visible leads, captions, or support lines repeat instruction verbs such as `should`, `must`, `use`, `explain`, or other spec-language phrasing.
- `/products`, `/custom-solutions`, and `/cases`: the first visible route-owned opening container must use route-specific classes such as `catalog-lead`, `process-intro`, or `evidence-header`, not a generic `section content-grid` or `section stack-lg` shell.
- `/products`, `/custom-solutions`, and `/cases`: opening proof media must use reusable semantic classes such as `product-media`, `process-media`, `case-media`, `panel-image`, or similarly route-owned image classes. Do not use inline `style=` attributes on `<img>`, `<figure>`, or wrapping proof panels to set width, height, object-fit, max-width, or alignment.
- `/contact`: the opening support panel must use a dedicated class such as `contact-conversion__aside`, `contact-support-panel`, or another route-owned utility class. Do not use inline `style=` attributes like `max-width`, `justify-self`, or ad-hoc spacing/alignment fixes on the contact opening panel.
- Interior routes and CTA bands must not use inline-styled generic utility blocks such as `hero-title`, `section-title`, `cta-actions`, `muted`, `spec-grid`, `card-grid`, or `media-frame` to control spacing and sizing. Use reusable route-owned classes instead.
- Interior routes and CTA bands must not use generic `hero-actions` class names.
  Use route-owned or shell-owned action cluster classes instead.
- Do not place inline `style=` attributes on `section__head`, `section-header`,
  or equivalent section-heading wrappers. Section-head spacing and alignment
  must come from shared CSS classes only.
- Footer support notes must use reusable footer classes. Do not emit inline
  `margin-top` styles on `footer-notes`, helper paragraphs, or footer action
  groups.

## Copy exclusions

- Do not expose internal design-direction labels in visitor-facing copy.
- Do not expose internal layout, responsive-review, or QA labels such as
  `Responsive layout`, `Shared shell`, `Desktop and mobile review`,
  `homepage groups`, `homepage frames`, or `visual system keeps`.
- Banned visible direction labels include examples such as `heritage manufacturing`, `heritage craft`, `warm palette`, and similar internal art-direction metadata.
- These phrases must not appear in homepage eyebrows, hero kickers, trust rows, proof rows, footer copy, or other public-facing text.
- Unless the brief explicitly asks for company history or heritage storytelling, do not use `heritage`, `craft tradition`, or similar legacy-positioning words as homepage value claims. Prefer sourcing clarity, quality control, responsiveness, and production discipline.
- Unless the brief explicitly asks for company history or heritage storytelling,
  treat plain `heritage` as internal direction metadata rather than homepage
  value language.
- Specifically do not use homepage eyebrow/kicker lines that expose a hidden
  product vertical or art-direction preset. Homepage kickers should describe
  business offer, buyer fit, operating trust, or sourcing reliability
  instead.
- Shared-shell bilingual resources must be clean:
  - `messages.zh-CN.json` must contain real Chinese translations for core nav
    and locale keys rather than copied English text
  - avoid mixed-script corruption such as `Textile manufacturer 路 Export ready`
  - keep `locale.en = EN` and `locale.zh = ZH`
