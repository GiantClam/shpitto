# Design System Structure

每个品牌的 DESIGN.md 包含以下章节：

## 1. Visual Theme & Atmosphere

设计理念和氛围描述。

```markdown
## 1. Visual Theme & Atmosphere

Design System Inspiration of **Vercel**

Vercel's design system embodies speed, clarity, and developer-focused aesthetics.
The visual language emphasizes clean lines, generous whitespace, and subtle depth.
```

## 2. Color Palette & Roles

### Primary Colors
```markdown
### Primary Colors

**Slate 50** (#fafafa): Primary brand color, used for backgrounds
**Slate 900** (#111111): Primary text and strong elements
**White** (#ffffff): Cards, elevated surfaces
```

### Accent Colors
```markdown
### Accent Colors

**Vercel Blue** (#0070f3): Interactive elements, CTAs, links
**Vercel Blue Hover** (#1e6af8): Hover state for interactive elements
```

### Neutral Colors
```markdown
### Neutral Colors

Used for backgrounds, borders, and secondary text.
**Slate 100** (#f4f4f5): Page backgrounds
**Slate 200** (#e4e4e7): Borders, dividers
```

### Semantic Colors
```markdown
### Semantic Colors

**Success Green** (#10b981): Success states, positive feedback
**Error Red** (#ef4444): Error states, destructive actions
**Warning Amber** (#f59e0b): Warning states, caution messages
```

## 3. Typography Rules

### Font Families
```markdown
### Font Families

Primary: Geist (Latin), Geist Mono (Monospace)
Fallback: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
```

### Type Scale
| Role | Font | Size | Weight | Line Height | Letter Spacing |
|------|------|------|--------|-------------|----------------|
| Display | Geist | 72px | 700 | 1.0 | -0.02em |
| H1 | Geist | 48px | 700 | 1.1 | -0.02em |
| H2 | Geist | 36px | 600 | 1.2 | -0.01em |
| H3 | Geist | 24px | 600 | 1.3 | 0 |
| Body | Geist | 16px | 400 | 1.5 | 0 |
| Small | Geist | 14px | 400 | 1.5 | 0.01em |

## 4. Component Stylings

### Buttons
```markdown
### Buttons

**Primary Button**
- Background: Vercel Blue (#0070f3)
- Text: White (#ffffff)
- Padding: 12px 24px
- Border Radius: 6px
- Font Weight: 500

**States**:
- Hover: Background darkens to #1e6af8
- Active: Background is #0051b3
- Disabled: Opacity 50%, cursor not-allowed
```

### Cards
```markdown
### Cards

- Background: White (#ffffff)
- Border: None (use shadow-as-border)
- Border Radius: 12px
- Shadow: 0 0 0 1px rgba(0, 0, 0, 0.1)
- Padding: 24px
```

## 5. Layout Principles

### Spacing System
```markdown
Base unit: 8px

| Token | Value |
|-------|-------|
| space-1 | 4px |
| space-2 | 8px |
| space-4 | 16px |
| space-6 | 24px |
| space-8 | 32px |
| space-12 | 48px |
| space-16 | 64px |
```

### Grid System
```markdown
12-column grid
Max content width: 1200px
Column gap: 24px
Page padding: 16px (mobile), 24px (tablet), 32px (desktop)
```

## 6. Depth & Elevation

### Shadow System
```markdown
### Shadow Scale

**shadow-border** (Cards, Inputs)
box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1)

**shadow-sm** (Hover states)
box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05)

**shadow-md** (Dropdowns)
box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1)

**shadow-lg** (Modals)
box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2)
```

## 7. Do's and Don'ts

```markdown
### Do

- Use shadow-as-border instead of actual borders on cards
- Keep to the 8px spacing grid
- Use the defined color palette only
- Maintain generous whitespace between sections

### Don't

- Use colors outside the defined palette
- Apply borders and shadows to the same element
- Use non-standard spacing values
- Use fonts other than Geist (or fallback)
```

## 8. Responsive Behavior

```markdown
### Breakpoints

| Name | Min Width | Description |
|------|-----------|--------------|
| Mobile | < 640px | Single column, 16px padding |
| Tablet | 640px - 1024px | 2-column grid, 24px padding |
| Desktop | > 1024px | Full grid, 32px padding |

### Typography Scaling

- Mobile: 0.875x base size
- Tablet: 0.9375x base size
- Desktop: 1x (full size)
```

## 9. Agent Prompt Guide

Quick reference for AI agents:

```markdown
# Agent Prompt Guide

When generating UI components:

1. Use exact color values from palette
2. Apply typography scale precisely
3. Use shadow tokens, never hardcode
4. Respect 8px spacing grid
5. Apply shadow-as-border technique
```
