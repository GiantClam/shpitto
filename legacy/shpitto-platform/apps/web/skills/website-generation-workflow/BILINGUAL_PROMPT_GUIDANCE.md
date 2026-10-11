# Bilingual Prompt Guidance

## Round Language Guidance
- Language guidance: bilingual EN/ZH output uses an i18n-ready first pass. Visible HTML must default to `{{DEFAULT_VISIBLE_LANGUAGE}}`; the inactive locale belongs in generated i18n files or other hidden resources.
- First-pass priority: generate stable `data-i18n` keys on visible translatable nodes plus `/i18n/messages.en.json` and `/i18n/messages.zh-CN.json`. Do not spend round budget duplicating Chinese and English copy inside HTML.
- A visible EN/ZH switch is valid only when `/script.js` can swap visible copy from the i18n resource files while preserving the current route and language preference.
- Preferred protocol: translatable visible text nodes use stable `data-i18n` keys, while `i18n/messages.en.json` and `i18n/messages.zh-CN.json` provide the locale strings. Inline `data-i18n-zh` / `data-i18n-en` pairs are optional compatibility data, not the primary first-pass transport.
- Do not invent i18n key variants or fake toggle semantics. Invalid toggle variants include `data-language-toggle` and `data-lang-switch`. Keep the runtime recognizable to validation and later translation passes.
- If the round is budget-constrained, cut decorative sections and optional flourishes before dropping i18n keys, i18n JSON resource files, or the shared locale runtime contract.
- Keep locale UX in the shared shell. Do not add a repeated EN/ZH explainer block, language card rail, or second menu-like language utility panel inside each interior page hero/opening section.
- On bilingual company sites, route differentiation still matters. Do not solve localization by repeating the same hero-side-panel composition across products, solutions, cases, contact, and about pages.
- Do not generate visible body sections whose editorial topic is language switching itself. Invalid headings include `Switch between English and Chinese`, `Choose language`, `Read in both languages`, or any equivalent copy that turns locale choice into page content.
- On corporate-b2b sites, keep locale button labels literal `EN` and `ZH`. Do not localize the header switch to `English`, `Chinese`, or any other long-form locale label.
- On corporate-b2b sites, ensure `/i18n/messages.zh-CN.json` contains real Chinese translations for shared-shell keys such as nav labels and `locale.switch.label`. Do not mirror English values into the Chinese dictionary.

## Round Strict Protocol
- If bilingual EN/ZH support is requested, visible copy should show one active language at a time. Avoid inline translated pairs such as `Chinese / English`, duplicated headings, or consecutive translated paragraphs.
- First-pass bilingual output must stay `{{DEFAULT_VISIBLE_LANGUAGE}}`-visible while shipping i18n resource files. Do not force simultaneous zh/en visibility just to prove the site is bilingual-capable.
- If emitting article/detail pages for a bilingual site, render exactly one visible article language body at a time; alternate-language article translations should live in i18n data and be swapped into view by `/script.js`. Do not place an English abstract/summary below a Chinese article body, do not append Chinese translations below English copy, and do not alternate zh/en paragraphs in the same initial page render.
- For bilingual sites, never describe the language toggle as a reading path, dual path, or recommended reading order. Keep language-switch labels literal and UI-focused.
- Reject corrupted punctuation, mojibake, or mixed-script copy that injects stray glyphs into English phrases, plus replacement characters or broken apostrophes/dashes inside locale resources.

## Target Blog Detail Guidance
- Bilingual article detail guidance: initial visible article language should stay `{{DEFAULT_VISIBLE_LANGUAGE}}`. Store alternate-language article title/summary/body in i18n data and reveal it through the language switch instead of placing English summaries under Chinese text, Chinese summaries under English text, side-by-side translations, or alternating zh/en paragraphs in the initial HTML.
- Do not postpone `/blog/{slug}/index.html` emission to a later cleanup step once `/blog/index.html` already links to that slug. Every visible Blog card promised in the generated HTML must leave the same generation run with a matching static detail file.

## Target Language Gate
- Bilingual language gate: show exactly one active language at a time. Do not render Chinese and English simultaneously in visible headings, paragraphs, cards, nav items, CTAs, footer, or article bodies.
- First-pass visible language for this file should be `{{DEFAULT_VISIBLE_LANGUAGE}}`. The inactive locale belongs in the i18n resources, not as duplicated visible fallback copy.
- Store alternate-language copy in `i18n/messages.en.json`, `i18n/messages.zh-CN.json`, or an equivalent hidden dictionary keyed by `data-i18n`. Inline `data-i18n-zh` / `data-i18n-en` pairs are optional compatibility data, not the required first-pass shape.
- If the generated HTML and JS include a language switch, it must work by loading/swapping i18n resource content, updating active/pressed state, updating `html[lang]`, and persisting language preference.
- Invalid visible patterns include `Chinese / English`, translated titles in one heading, and Chinese plus English paragraphs shown consecutively.
- Do not explain bilingual behavior with editorial phrasing like two reading paths, bilingual reading paths, or recommended reading order. Language switching is a control, not a visitor-facing thesis.
