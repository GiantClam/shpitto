import { promises as fs } from 'node:fs';
import path from 'node:path';

import { designSystemToSummary, listDesignSystems, loadDesignSystem } from './design-system-tools';
import { validateComponent, type DesignSpec } from './component-validator';
import {
  buildContextForPageN,
  buildDesignContext,
  buildPageContext,
  formatContextForPrompt,
  type DesignContext,
  type PageContext,
} from './context-builder';
import { executeLLMJSON, generateComponent } from './llm-executor';

const QA_MAX_RETRIES = 2;

export interface ComponentCode {
  name: string;
  filePath: string;
  code: string;
}

export interface PageGenerationResult {
  pageName: string;
  components: ComponentCode[];
  pageContext: PageContext;
  qa: QAReport;
  errors: string[];
  warnings: string[];
}

export interface PageStructure {
  pageName: string;
  pagePath: string;
  sections: string[];
  navigation: {
    type: 'horizontal' | 'vertical';
    items: string[];
  };
  footer: {
    type: 'simple' | 'multi-column';
    columns: string[];
  };
}

export interface GenerationRequest {
  prompt: string;
  brand: string;
  sections?: string[];
  outputDir?: string;
  includeMagicUI?: boolean;
}

export interface GenerationResult {
  success: boolean;
  brand: string;
  components: ComponentCode[];
  pageStructure: PageStructure;
  qaReport?: QAReport;
  errors: string[];
  warnings: string[];
}

export interface QAReport {
  passed: boolean;
  score: number;
  retries: number;
  checks: Array<{
    category: string;
    passed: boolean;
    message: string;
    severity: string;
  }>;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

export async function generateWebsite(
  request: GenerationRequest
): Promise<GenerationResult> {
  const {
    prompt,
    brand,
    sections = ['hero', 'features', 'cta'],
    outputDir = 'output',
  } = request;
  const errors: string[] = [];
  const warnings: string[] = [];

  const designSystem = await loadDesignSystem(brand);
  if (!designSystem) {
    return {
      success: false,
      brand,
      components: [],
      pageStructure: emptyPageStructure(outputDir),
      errors: [`Design system '${brand}' not found`],
      warnings,
    };
  }

  const spec: DesignSpec = {
    version: '1.0',
    sourceDesignSystems: [brand],
    appliedDesignSystem: designSystem,
    customOverrides: {},
    generatedAt: new Date().toISOString(),
    confirmedItems: [],
  };

  const designContext = buildDesignContext(spec);
  const pageStructure = await planPageStructure('Generated Page', outputDir, spec, prompt, sections);

  const allComponents: ComponentCode[] = [];
  const pageContexts: PageContext[] = [];
  let totalQARetries = 0;

  for (let index = 0; index < sections.length; index += 1) {
    const sectionName = sections[index];
    const pageName = toPageName(sectionName);
    const pageResult = await generatePageWithQARetry(
      {
        pageName,
        pageOrder: index + 1,
        pagePath: outputDir,
        prompt,
        sectionName,
        spec,
        designContext,
      },
      pageContexts
    );

    allComponents.push(...pageResult.components);
    pageContexts.push(pageResult.pageContext);
    totalQARetries += pageResult.qa.retries;
    errors.push(...pageResult.errors);
    warnings.push(...pageResult.warnings);
  }

  let qaReport: QAReport | undefined;
  if (allComponents.length > 0) {
    qaReport = await runDesignQA(
      {
        pageName: 'Combined',
        components: allComponents,
        pageContext: pageContexts[pageContexts.length - 1],
        qa: emptyQAReport(),
        errors: [],
        warnings: [],
      },
      spec,
      designContext
    );
    qaReport.retries += totalQARetries;
  }

  return {
    success: errors.length === 0,
    brand,
    components: allComponents,
    pageStructure,
    qaReport,
    errors,
    warnings,
  };
}

type GeneratePageInput = {
  pageName: string;
  pageOrder: number;
  pagePath: string;
  prompt: string;
  sectionName: string;
  spec: DesignSpec;
  designContext: DesignContext;
};

async function generatePageWithQARetry(
  input: GeneratePageInput,
  allPreviousPageContexts: PageContext[]
): Promise<PageGenerationResult> {
  const { pageName, pageOrder, pagePath, prompt, sectionName, spec, designContext } = input;
  const components: ComponentCode[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const contextSummary = buildContextForPageN(pageOrder, allPreviousPageContexts);

  let qaReport = emptyQAReport();
  let finalCode = '';

  for (let attempt = 0; attempt <= QA_MAX_RETRIES; attempt += 1) {
    const fixInstructions =
      attempt === 0
        ? ''
        : `\n\n## QA Fix Instructions\nResolve these QA issues and regenerate:\n${qaReport.errors
            .concat(qaReport.warnings)
            .map((item) => `- ${item}`)
            .join('\n')}`;

    finalCode = await generateComponent(
      `Generate page "${pageName}" for section "${sectionName}".

## User Requirements
${prompt}

## Design System (${designContext.brand})
${formatContextForPrompt(designContext)}

${contextSummary}
${fixInstructions}

Output complete TSX code only.`,
      'You are an expert React/Next.js page generator. Follow design tokens and accessibility rules strictly.',
      'website page'
    );

    const validation = await validateComponent(finalCode, spec, designContext);
    qaReport = {
      passed: validation.passed,
      score: validation.score,
      retries: attempt,
      checks: validation.checks.map((check) => ({
        category: check.category,
        passed: check.passed,
        message: check.message,
        severity: check.severity,
      })),
      errors: validation.errors,
      warnings: validation.warnings,
      recommendations: validation.warnings,
    };

    if (qaReport.passed) {
      break;
    }
  }

  const filePath = path.join(pagePath, `${pageName}.tsx`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, finalCode, 'utf-8');

  components.push({
    name: pageName,
    filePath,
    code: finalCode,
  });

  if (!qaReport.passed) {
    warnings.push(`QA failed for ${pageName} after ${QA_MAX_RETRIES + 1} attempts`);
  }

  const pageContext = buildPageContext(
    pageName,
    pageOrder,
    {
      headings: [{ text: pageName, level: 1, usedTerms: [sectionName] }],
      keyTerms: [{ term: sectionName, definition: `${sectionName} section`, usageCount: 1 }],
      featureList: [],
      toneAndManner: 'professional',
    },
    {
      colorsUsed: designContext.colors.primary.slice(0, 2).map((token) => ({
        token: token.name,
        value: token.value,
        usage: `used in ${pageName}`,
      })),
      typographyUsed: designContext.typography.scale.slice(0, 3).map((token) => ({
        role: token.role,
        font: token.font,
        size: token.size,
        usage: `used in ${pageName}`,
      })),
      componentsUsed: [pageName],
    },
    {
      sections: [sectionName],
      links: [],
      navigationItems: [],
    }
  );

  return {
    pageName,
    components,
    pageContext,
    qa: qaReport,
    errors,
    warnings,
  };
}

function toPageName(sectionName: string): string {
  return sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
}

function emptyPageStructure(pagePath: string): PageStructure {
  return {
    pageName: '',
    pagePath,
    sections: [],
    navigation: { type: 'horizontal', items: [] },
    footer: { type: 'simple', columns: [] },
  };
}

function emptyQAReport(): QAReport {
  return {
    passed: true,
    score: 100,
    retries: 0,
    checks: [],
    errors: [],
    warnings: [],
    recommendations: [],
  };
}

async function planPageStructure(
  pageName: string,
  pagePath: string,
  spec: DesignSpec,
  requirements?: string,
  sections: string[] = []
): Promise<PageStructure> {
  const fallback = {
    pageName,
    pagePath,
    sections: sections.length > 0 ? sections : ['hero', 'features', 'cta'],
    navigation: {
      type: 'horizontal' as const,
      items: ['Home', 'Features', 'Pricing', 'Contact'],
    },
    footer: {
      type: 'simple' as const,
      columns: ['Company', 'Resources', 'Legal'],
    },
  };

  try {
    const generated = await executeLLMJSON<Partial<PageStructure>>(
      `Plan a page structure for:
- Page name: ${pageName}
- Requirements: ${requirements || 'N/A'}
- Design system: ${spec.appliedDesignSystem.name}

Return JSON with keys:
{
  "sections": string[],
  "navigation": {"type":"horizontal|vertical","items": string[]},
  "footer": {"type":"simple|multi-column","columns": string[]}
}`,
      'You are an information architect. Return concise valid JSON only.',
      { maxTokens: 1200, temperature: 0.2, jsonRetries: 1 }
    );

    return {
      pageName,
      pagePath,
      sections: generated.sections?.length ? generated.sections : fallback.sections,
      navigation: {
        type:
          generated.navigation?.type === 'vertical' || generated.navigation?.type === 'horizontal'
            ? generated.navigation.type
            : fallback.navigation.type,
        items: generated.navigation?.items?.length ? generated.navigation.items : fallback.navigation.items,
      },
      footer: {
        type:
          generated.footer?.type === 'multi-column' || generated.footer?.type === 'simple'
            ? generated.footer.type
            : fallback.footer.type,
        columns: generated.footer?.columns?.length ? generated.footer.columns : fallback.footer.columns,
      },
    };
  } catch {
    return fallback;
  }
}

async function runDesignQA(
  result: PageGenerationResult,
  spec: DesignSpec,
  designContext: DesignContext
): Promise<QAReport> {
  const mergedCode = result.components.map((component) => component.code).join('\n\n');
  const validation = await validateComponent(mergedCode, spec, designContext);

  return {
    passed: validation.passed,
    score: validation.score,
    retries: result.qa.retries,
    checks: validation.checks.map((check) => ({
      category: check.category,
      passed: check.passed,
      message: check.message,
      severity: check.severity,
    })),
    errors: validation.errors,
    warnings: validation.warnings,
    recommendations: validation.warnings,
  };
}

export interface RecommendationResult {
  recommendations: Array<{
    name: string;
    description: string;
    category: string;
    suitableFor: string;
  }>;
  allBrands: string[];
}

export async function recommendDesignSystem(
  requirements: string,
  count: number = 5
): Promise<RecommendationResult> {
  const brands = await listDesignSystems();
  const allBrandNames = brands.map((brand) => brand.name);

  try {
    const response = await executeLLMJSON<{
      recommendations?: Array<{ name: string; description?: string; category?: string; suitableFor?: string }>;
    }>(
      `Based on requirements below, recommend top ${count} design systems.

Requirements: ${requirements}
Available design systems: ${allBrandNames.join(', ')}

Return JSON { "recommendations": [...] } with brand names exactly from available list.`,
      'You are a design-system recommender. Return JSON only.',
      { maxTokens: 2048, temperature: 0.2, jsonRetries: 1 }
    );

    return {
      recommendations: (response.recommendations || []).slice(0, count).map((item) => ({
        name: item.name,
        description: item.description || '',
        category: item.category || 'other',
        suitableFor: item.suitableFor || '',
      })),
      allBrands: allBrandNames,
    };
  } catch {
    return {
      recommendations: [],
      allBrands: allBrandNames,
    };
  }
}

export interface PageStructureResult {
  brand: string;
  pageType: string;
  structure: PageStructure;
  designSummary: string;
}

export async function generatePageStructure(
  brand: string,
  pageType: string = 'landing',
  requirements?: string
): Promise<PageStructureResult | null> {
  const designSystem = await loadDesignSystem(brand);
  if (!designSystem) return null;

  const spec: DesignSpec = {
    version: '1.0',
    sourceDesignSystems: [brand],
    appliedDesignSystem: designSystem,
    customOverrides: {},
    generatedAt: new Date().toISOString(),
    confirmedItems: [],
  };

  const structure = await planPageStructure(pageType, pageType, spec, requirements);
  return {
    brand,
    pageType,
    structure,
    designSummary: designSystemToSummary(designSystem),
  };
}

export interface QAResult {
  passed: boolean;
  score: number;
  checks: Array<{
    category: string;
    passed: boolean;
    message: string;
    severity: string;
  }>;
  recommendations: string[];
}

export async function runDesignQAForComponents(
  components: string[],
  designSystemBrand: string
): Promise<QAResult | null> {
  const designSystem = await loadDesignSystem(designSystemBrand);
  if (!designSystem) return null;

  const spec: DesignSpec = {
    version: '1.0',
    sourceDesignSystems: [designSystemBrand],
    appliedDesignSystem: designSystem,
    customOverrides: {},
    generatedAt: new Date().toISOString(),
    confirmedItems: [],
  };
  const designContext = buildDesignContext(spec);
  const validation = await validateComponent(components.join('\n\n'), spec, designContext);

  return {
    passed: validation.passed,
    score: validation.score,
    checks: validation.checks.map((check) => ({
      category: check.category,
      passed: check.passed,
      message: check.message,
      severity: check.severity,
    })),
    recommendations: validation.warnings,
  };
}
