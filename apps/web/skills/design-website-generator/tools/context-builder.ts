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
  font: string;
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
  headings: HeadingRecord[];
  keyTerms: TermRecord[];
  featureList: string[];
  pricingTiers?: string[];
  toneAndManner: string;
}

export interface HeadingRecord {
  text: string;
  level: number;
  usedTerms: string[];
}

export interface TermRecord {
  term: string;
  definition: string;
  usageCount: number;
}

export interface ColorUsage {
  token: string;
  value: string;
  usage: string;
}

export interface TypoUsage {
  role: string;
  font: string;
  size: string;
  usage: string;
}

export interface DesignUsage {
  colorsUsed: ColorUsage[];
  typographyUsed: TypoUsage[];
  componentsUsed: string[];
}

export interface LinkRecord {
  target: string;
  anchor: string;
  type: string;
}

export interface StructureInfo {
  sections: string[];
  links: LinkRecord[];
  navigationItems: string[];
}

export interface ContextBudgetOptions {
  maxChars?: number;
  maxPages?: number;
  maxTerms?: number;
}

const DEFAULT_CONTEXT_MAX_CHARS = Number(process.env.PAGE_CONTEXT_MAX_CHARS || 6000);
const DEFAULT_CONTEXT_MAX_PAGES = Number(process.env.PAGE_CONTEXT_MAX_PAGES || 4);
const DEFAULT_CONTEXT_MAX_TERMS = Number(process.env.PAGE_CONTEXT_MAX_TERMS || 24);

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
  mergedTerms: TermRecord[];
  mergedDesignUsage: { token: string; usage: string }[];
  mergedStructure: { pageName: string; sections: string[] }[];
} {
  const termMap = new Map<string, TermRecord>();
  const designUsageMap = new Map<string, string>();
  const structureList: { pageName: string; sections: string[] }[] = [];

  for (const ctx of previousContexts) {
    for (const heading of ctx.content.headings) {
      const key = heading.text.toLowerCase();
      const existing = termMap.get(key);
      if (!existing) {
        termMap.set(key, {
          term: heading.text,
          definition: '',
          usageCount: 1,
        });
      } else {
        existing.usageCount += 1;
      }
    }

    for (const term of ctx.content.keyTerms) {
      const key = term.term.toLowerCase();
      const existing = termMap.get(key);
      if (!existing) {
        termMap.set(key, { ...term });
      } else {
        existing.usageCount += term.usageCount;
        if (!existing.definition && term.definition) {
          existing.definition = term.definition;
        }
      }
    }

    for (const color of ctx.design.colorsUsed) {
      designUsageMap.set(`color:${color.token}`, color.usage || 'used in previous pages');
    }
    for (const typography of ctx.design.typographyUsed) {
      designUsageMap.set(`typography:${typography.role}`, typography.usage || 'used in previous pages');
    }

    structureList.push({
      pageName: ctx.pageName,
      sections: ctx.structure.sections,
    });
  }

  return {
    mergedTerms: Array.from(termMap.values()),
    mergedDesignUsage: Array.from(designUsageMap.entries()).map(([token, usage]) => ({ token, usage })),
    mergedStructure: structureList,
  };
}

/**
 * Build bounded context string for page N generation.
 * Uses all previous pages but enforces a token/size budget to avoid prompt blow-up.
 */
export function buildContextForPageN(
  pageN: number,
  allContexts: PageContext[],
  options: ContextBudgetOptions = {}
): string {
  const maxChars = Math.max(1000, options.maxChars ?? DEFAULT_CONTEXT_MAX_CHARS);
  const maxPages = Math.max(1, options.maxPages ?? DEFAULT_CONTEXT_MAX_PAGES);
  const maxTerms = Math.max(5, options.maxTerms ?? DEFAULT_CONTEXT_MAX_TERMS);
  const previousContexts = allContexts.slice(0, Math.max(0, pageN - 1));
  if (previousContexts.length === 0) return '';

  const merged = mergePageContexts(previousContexts);
  const termSummary = merged.mergedTerms
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, maxTerms)
    .map((term) => `- ${term.term}: ${term.definition || 'shared term'} (usage: ${term.usageCount})`)
    .join('\n');
  const usageSummary = merged.mergedDesignUsage
    .slice(0, maxTerms)
    .map((usage) => `- ${usage.token}: ${usage.usage}`)
    .join('\n');

  const sortedRecentPages = [...previousContexts]
    .sort((a, b) => b.pageOrder - a.pageOrder)
    .slice(0, maxPages);
  const pageSummaries = sortedRecentPages
    .map((ctx) => {
      const headings = ctx.content.headings.slice(0, 6).map((heading) => heading.text).join(', ');
      const terms = ctx.content.keyTerms.slice(0, 6).map((term) => term.term).join(', ');
      return [
        `### ${ctx.pageName} (#${ctx.pageOrder})`,
        `- Sections: ${ctx.structure.sections.join(', ') || 'N/A'}`,
        `- Headings: ${headings || 'N/A'}`,
        `- Terms: ${terms || 'N/A'}`,
      ].join('\n');
    })
    .join('\n');

  const contextText = [
    '## Previous Page Context Summary',
    '',
    '### Terminology (reuse these terms)',
    termSummary || '- N/A',
    '',
    '### Design Token Usage Patterns',
    usageSummary || '- N/A',
    '',
    '### Recent Page Snapshots',
    pageSummaries || '- N/A',
  ].join('\n');

  if (contextText.length <= maxChars) return contextText;

  return `${contextText.slice(0, maxChars - 32)}\n\n[Context truncated to fit budget]`;
}

/**
 * Format context for LLM prompt
 */
export function formatContextForPrompt(context: DesignContext | PageContext): string {
  if ('designSpec' in context) {
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
    const headings = pc.content.headings
      .map((heading) => `- H${heading.level}: ${heading.text}`)
      .join('\n') || '- N/A';
    const terms = pc.content.keyTerms
      .map((term) => `- ${term.term}: ${term.definition || 'N/A'} (usage: ${term.usageCount})`)
      .join('\n') || '- N/A';
    const colors = pc.design.colorsUsed
      .map((color) => `- ${color.token} (${color.value}): ${color.usage}`)
      .join('\n') || '- N/A';
    const typography = pc.design.typographyUsed
      .map((record) => `- ${record.role}: ${record.font} ${record.size} (${record.usage})`)
      .join('\n') || '- N/A';
    const links = pc.structure.links
      .map((link) => `- ${link.anchor} -> ${link.target} (${link.type})`)
      .join('\n') || '- N/A';

    return `
## Page Context

**Page**: ${pc.pageName} (Order: ${pc.pageOrder})

**Headings**:
${headings}

**Key Terms**:
${terms}

**Tone & Manner**: ${pc.content.toneAndManner || 'N/A'}

**Color Usage**:
${colors}

**Typography Usage**:
${typography}

**Components Used**: ${pc.design.componentsUsed.join(', ') || 'N/A'}
**Sections**: ${pc.structure.sections.join(', ') || 'N/A'}

**Internal Links**:
${links}
`;
  }
}
