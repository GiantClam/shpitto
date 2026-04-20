# Task Plan: LC-CNC Website

## Goal
Generate a single-page industrial English website for 灵创智能 (LC-CNC), a Shenzhen CNC machine factory targeting Southeast Asia B2B buyers.

## Design System
- **Selected**: BMW (industrial precision, dark hero, zero border-radius, high contrast)
- **Rationale**: Angular geometry, dark/light rhythm, engineering confidence — perfect for CNC machinery
- **Exclusions**: Tesla (too consumer), NVIDIA (too tech/gaming)

## Design Tokens
- Background Light: `#ffffff`
- Background Dark: `#1a1a1a`
- Background Section: `#f4f4f4`
- Text Primary: `#262626`
- Text Secondary: `#757575`
- Text Muted: `#bbbbbb`
- Accent: `#1c69d4` (BMW Blue → Industrial Steel Blue)
- Accent Hover: `#0653b6`
- Border: `#e0e0e0`
- Border Radius: `0px` (zero — industrial sharp corners)
- Font: `Helvetica Neue, Helvetica, Arial, sans-serif`

## Page Sections
1. [x] Header — Logo LC-CNC™ + Nav
2. [x] Hero — Full-bleed dark, headline + CTA
3. [x] Product Grid — 4 cards, industrial gray bg
4. [x] Features Strip — 3 columns
5. [x] Case Slider — 4 cases
6. [x] About — Company info
7. [x] Certification — ISO/CE/SGS icons
8. [x] Contact — Form + WhatsApp
9. [x] Footer

## Output
- `sites/lc-cnc/index.html` — single file, self-contained

## Status
- [x] Phase 0: Requirements
- [x] Phase 0.5: Design system selected (BMW)
- [x] Phase 1: Tokens defined
- [ ] Phase 2: HTML generation
- [ ] Phase 3: QA
