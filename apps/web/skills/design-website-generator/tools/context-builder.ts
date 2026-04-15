/**
 * Context Builder - Build contexts for page generation
 */

import type { DesignSystem } from './design-system-tools';

export interface DesignContext {
  brand: string;
  designSpec: DesignSpec;
  colors: ColorContext;
  typography: TypographyContext;
  shadows: ShadowContext;
  spacing: SpacingContext;
  components: ComponentContext;
}

export interface PageContext {
  pageName: string;
  pageOrder: number;
  generatedAt: string;
  content: ContentSummary;
  design: DesignUsage;
  structure: StructureInfo;
}

export interface DesignSpec {
  version: string;
  sourceDesignSystems: string[];
  appliedDesignSystem: DesignSystem;
  customOverrides: Record<string, any>;
  generatedAt: string;
  confirmedItems: string[];
}

interface ColorContext {
  primary: { name: string; value: string }[];
  accent: { name: string; value: string }[];
  neutral: { name: string; value: string }[];
  semantic: { name: string; value: string }[];
}

interface TypographyContext {
  fontFamily: string;
  fontFamilyMono?: string;
  scale: TypographyScale[];
}

interface TypographyScale {
  role: string;
  size: string;
  weight: number;
  lineHeight: string;
  letterSpacing: string;
}

interface ShadowContext {
  tokens: Record<string, string>;
  technique: 'shadow-as-border' | 'traditional';
}

interface SpacingContext {
  base: number;
  scale: number[];
  maxWidth: string;
  grid: string;
}

interface ComponentContext {
  button: ButtonStyle;
  card: CardStyle;
  input: InputStyle;
}

interface ButtonStyle {
  background: string;
  color: string;
  padding: string;
  borderRadius: string;
}

interface CardStyle {
  background: string;
  border: string;
  borderRadius: string;
  padding: string;
}

interface InputStyle {
  background: string;
  border: string;
  borderRadius: string;
  padding: string;
}

interface ContentSummary {
  headings: string[];
  keyTerms: string[];
  featureList: string[];
  pricingTiers?: string[];
  toneAndManner: string;
}

interface DesignUsage {
  colorsUsed: string[];
  typographyUsed: string[];
  componentsUsed: string[];
}

interface StructureInfo {
  sections: string[];
  links: { target: string; anchor: string; type: string }[];
  navigationItems: string[];
}

/**
 * Build design context from design spec
 */
export function buildDesignContext(spec: DesignSpec): DesignContext {
  const ds = spec.appliedDesignSystem;

  return {
    brand: ds.name,
    designSpec: spec,
    colors: {
      primary: ds.colors.primary || [],
      accent: ds.colors.accent || [],
      neutral: ds.colors.neutral || [],
      semantic: ds.colors.semantic || [],
    },
    typography: {
      fontFamily: ds.typography?.[0]?.font || 'sans-serif',
      fontFamilyMono: ds.typography?.find(t => t.role.includes('Mono'))?.font,
      scale: ds.typography || [],
    },
    shadows: {
      tokens: ds.shadows || {},
      technique: 'shadow-as-border',
    },
    spacing: {
      base: 8,
      scale: ds.layout?.spacing || [1, 2, 4, 8, 16, 32],
      maxWidth: ds.layout?.maxWidth || '1200px',
      grid: ds.layout?.grid || '12-col',
    },
    components: {
      button: {
        background: ds.colors.primary?.[0]?.value || '#000',
        color: '#fff',
        padding: '12px 24px',
        borderRadius: ds.layout?.borderRadius?.['button'] || '6px',
      },
      card: {
        background: '#fff',
        border: 'none (use shadow-as-border)',
        borderRadius: ds.layout?.borderRadius?.['card'] || '12px',
        padding: '24px',
      },
      input: {
        background: '#fff',
        border: '1px solid',
        borderRadius: ds.layout?.borderRadius?.['input'] || '6px',
        padding: '12px 16px',
      },
    },
  };
}

/**
 * Build page context from previous pages
 */
export function buildPageContext(
  pageName: string,
  pageOrder: number,
  content: ContentSummary,
  design: DesignUsage,
  structure: StructureInfo
): PageContext {
  return {
    pageName,
    pageOrder,
    generatedAt: new Date().toISOString(),
    content,
    design,
    structure,
  };
}

/**
 * Merge multiple page contexts for sequential generation
 */
export function mergePageContexts(previousContexts: PageContext[]): {
  mergedTerms: { term: string; definition: string }[];
  mergedDesignUsage: { token: string; usage: string }[];
  mergedStructure: { pageName: string; sections: string[] }[];
} {
  const termMap = new Map<string, string>();
  const designUsageMap = new Map<string, string>();
  const structureList: { pageName: string; sections: string[] }[] = [];

  for (const ctx of previousContexts) {
    for (const heading of ctx.content.headings) {
      if (!termMap.has(heading.toLowerCase())) {
        termMap.set(heading.toLowerCase(), heading);
      }
    }
    for (const term of ctx.content.keyTerms) {
      if (!termMap.has(term.toLowerCase())) {
        termMap.set(term.toLowerCase(), term);
      }
    }

    for (const color of ctx.design.colorsUsed) {
      designUsageMap.set(color, 'used in previous pages');
    }
    for (const typo of ctx.design.typographyUsed) {
      designUsageMap.set(typo, 'used in previous pages');
    }

    structureList.push({
      pageName: ctx.pageName,
      sections: ctx.structure.sections,
    });
  }

  return {
    mergedTerms: Array.from(termMap.entries()).map(([_, term]) => ({ term, definition: '' })),
    mergedDesignUsage: Array.from(designUsageMap.entries()).map(([token, usage]) => ({ token, usage })),
    mergedStructure: structureList,
  };
}

/**
 * Format context for LLM prompt
 */
export function formatContextForPrompt(context: DesignContext | PageContext): string {
  if ('appliedDesignSystem' in context) {
    const dc = context as DesignContext;
    return `
## Design Context

**Brand**: ${dc.brand}

**Colors**:
- Primary: ${dc.colors.primary.map(c => `${c.name} (${c.value})`).join(', ')}
- Accent: ${dc.colors.accent.map(c => `${c.name} (${c.value})`).join(', ')}
- Neutral: ${dc.colors.neutral.map(c => `${c.name} (${c.value})`).join(', ')}

**Typography**:
- Font: ${dc.typography.fontFamily}
- Scale: ${dc.typography.scale.length} levels

**Shadows** (${dc.shadows.technique}):
${Object.entries(dc.shadows.tokens).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

**Spacing**:
- Base: ${dc.spacing.base}px
- Scale: ${dc.spacing.scale.join(', ')}
- Max Width: ${dc.spacing.maxWidth}
`;
  } else {
    const pc = context as PageContext;
    return `
## Page Context

**Page**: ${pc.pageName} (Order: ${pc.pageOrder})

**Headings**: ${pc.content.headings.join(', ') || 'N/A'}
**Key Terms**: ${pc.content.keyTerms.join(', ') || 'N/A'}
**Tone**: ${pc.content.toneAndManner}

**Design Usage**: ${pc.design.componentsUsed.join(', ') || 'N/A'}
**Sections**: ${pc.structure.sections.join(', ') || 'N/A'}
`;
  }
}
