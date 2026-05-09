# Bilingual Prompt Guidance

## Round Language Guidance
- Language guidance: bilingual/EN-ZH output should show one active language at a time. Default visible language is {{DEFAULT_VISIBLE_LANGUAGE}}. Store inactive translations in data-i18n attributes, dictionaries, generated i18n files, or hidden templates and switch them with /script.js; avoid obvious visible translation pairs such as Chinese text followed by the same English paragraph.

## Round Strict Protocol
- If bilingual/EN-ZH support is requested, visible copy should show one active language at a time; avoid obvious inline translated pairs such as `中文 / English`, duplicated headings, or consecutive translated paragraphs.
- If emitting article/detail pages for a bilingual site, render exactly one visible article language body at a time; alternate-language article translations should live in i18n data and be swapped into view by /script.js. Do not place an English abstract/summary below a Chinese article body, do not append Chinese translations below English copy, and do not alternate zh/en paragraphs in the same initial page render.
- For bilingual sites, never describe the language toggle as a reading path, dual path, or recommended reading order. Keep language-switch labels literal and UI-focused.

## Target Blog Detail Guidance
- Bilingual article detail guidance: default visible language is {{DEFAULT_VISIBLE_LANGUAGE}}. Render exactly one visible article language body in this file. Store alternate-language article title/summary/body in i18n data and reveal it through the language switch instead of placing English summaries under Chinese text, Chinese summaries under English text, side-by-side translations, or alternating zh/en paragraphs in the initial HTML.

## Target Language Gate
- Bilingual language gate: show exactly one active language at a time. Do not render Chinese and English simultaneously in visible headings, paragraphs, cards, nav items, CTAs, footer, or article bodies.
- Default visible language for this file: {{DEFAULT_VISIBLE_LANGUAGE}}. If this is zh-CN, all visible UI/editorial labels must be Chinese; English labels such as Latest essays, stories, one theme, featured, read more, collection, or journal are inactive-language copy and must not be visible until English is selected.
- Store alternate-language copy in data-i18n attributes, an in-page dictionary, generated i18n files, or hidden templates, and replace visible text when EN/ZH is selected.
- Invalid visible patterns include `Chinese / 中文`, `中文 / English`, translated titles in one heading, and Chinese plus English paragraphs shown consecutively.
- Do not explain bilingual behavior with editorial phrasing like two reading paths, bilingual reading paths, or recommended reading order. Language switching is a control, not a visitor-facing thesis.
