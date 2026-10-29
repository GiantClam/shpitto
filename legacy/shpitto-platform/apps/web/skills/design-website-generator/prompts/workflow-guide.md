# Design Website Generator Workflow

## Overview

4-phase workflow for generating websites using design systems from awesome-design-md.

## Phase 1: Design System Selection

### Step 1.1: List Available Design Systems
```typescript
const brands = await listDesignSystems();
// Returns: BrandInfo[] with name, description, category
```

### Step 1.2: Get AI Recommendations
```typescript
const result = await recommendDesignSystem(
  "Modern AI startup landing page with dark theme",
  5
);
// Returns: { recommendations: [...], allBrands: [...] }
```

### Step 1.3: User Selects Brand
User picks a brand from recommendations or manually specifies one.

## Phase 2: Design Confirmation (8 Items)

For the selected design system, confirm/adjust:

| # | Item | Description |
|---|------|-------------|
| 1 | Primary Color | Main brand color |
| 2 | Accent Color | CTA and highlights |
| 3 | Neutral/Background | Background and surface colors |
| 4 | Heading Font | Typography for headings |
| 5 | Body Font | Typography for body text |
| 6 | Card Style | Card component styling |
| 7 | Spacing Base | Base spacing unit (usually 8px) |
| 8 | Shadow Style | Shadow-as-border technique |

## Phase 3: Page Structure Planning

### Input
- Design system brand
- Page type (landing, product, pricing, etc.)
- User requirements

### Output
```typescript
interface PageStructure {
  pageName: string;
  pagePath: string;
  sections: Section[];
  navigation: NavigationConfig;
  footer: FooterConfig;
}

interface Section {
  name: string;
  type: 'hero' | 'features' | 'pricing' | 'cta' | 'faq' | 'testimonials' | ...;
  order: number;
  required: boolean;
}
```

## Phase 4: Component Generation

### Generation Request
```typescript
interface GenerationRequest {
  prompt: string;
  brand: string;
  sections?: string[];
  outputDir?: string;
  includeMagicUI?: boolean;
}
```

### Magic UI Components (Optional)
When `includeMagicUI: true`, include these animations:

| Component | Animation |
|-----------|-----------|
| TextReveal | Scroll-based text reveal |
| NumberTicker | Animated counter |
| GradientText | Gradient animation |
| Marquee | Infinite scroll |
| AnimatedBeam | Connected beam animation |
| Particles | Background particles |

## Phase 5: Visual QA

### QA Checks
1. **Color Compliance** - Uses only design system colors
2. **Typography Hierarchy** - Correct font, size, weight, spacing
3. **Shadow Technique** - Uses shadow-as-border where specified
4. **Spacing System** - Follows 8px grid
5. **Accessibility** - Proper ARIA labels, alt text

### QA Result
```typescript
interface QAResult {
  passed: boolean;
  score: number; // 0-100
  checks: QACheck[];
  recommendations: string[];
}
```

Pass threshold: score >= 80% and no critical failures.

## Example Workflow

```typescript
// 1. List design systems
const brands = await listDesignSystems({ category: 'ai' });

// 2. Get recommendations
const recs = await recommendDesignSystem(
  "AI coding assistant landing page"
);

// 3. Generate website
const result = await generateWebsite({
  prompt: "Landing page for AI coding assistant",
  brand: "claude",
  sections: ["hero", "features", "pricing", "cta"],
  includeMagicUI: true
});

// 4. Check QA
if (result.qaReport && result.qaReport.score < 80) {
  console.log("QA warnings:", result.qaReport.recommendations);
}
```

## Design System File Structure

Each brand in `builder/design-systems/design-md/{brand}/`:
- `DESIGN.md` - Complete design specification
- `preview.html` - Visual preview (light)
- `preview-dark.html` - Visual preview (dark)

## Key Design Principles

### Shadow-as-Border
Vercel and similar designs use:
```css
box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08);
```
Instead of traditional `border`.

### Typography Compression
Geist font uses aggressive negative letter-spacing:
- Display: -2.4px to -2.88px
- Section heading: -1.28px
- Body: normal

### Workflow Accent Colors
Some designs have workflow-specific colors:
- Vercel: Ship Red (#ff5b4f), Preview Pink (#de1d8d), Develop Blue (#0a72ef)
