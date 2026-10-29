---
name: "responsive-by-default"
description: "Responsive layout contract for generated websites. Use when creating or refining any page, route, section, table, navigation shell, media block, or form."
---

# Responsive By Default

Generated websites must be usable at mobile, tablet, and desktop widths without relying on a later visual repair pass.

## Required Breakpoints

- Validate layout behavior at 320px, 768px, and 1440px.
- Every multi-column grid must collapse or reflow before text, cards, tables, or media clip.
- Touch targets must remain reachable and readable on small screens.
- Fixed-width media and fixed-height containers are allowed only when paired with responsive `max-width`, `aspect-ratio`, or overflow rules.

## Hard Rules

1. Do not hard-code page, section, card, table, or media widths that exceed the viewport.
2. Do not let button text, headings, nav labels, stat labels, or table cells overflow their container.
3. Do not use heading CSS that causes arbitrary word breaks, automatic hyphenation, or cramped negative letter spacing.
4. Tables and comparison matrices must either be wrapped in a responsive scroll shell or rendered as stacked cards on mobile.
5. Hero side panels, stat cards, and summary cards must use short labels and compact facts. Long explanatory copy belongs in full-width sections.
6. Images, video, and visual placeholders must preserve aspect ratio and must not cover important text.

## Completion Check

Before finishing a generated route, confirm:

- no horizontal scroll at 320px,
- primary navigation remains available,
- all calls to action fit,
- tables are responsive,
- media crops remain meaningful,
- footer links wrap cleanly.
