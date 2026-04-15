import { llm } from './graph';
import { loadDesignSystem, DesignSystem, designSystemToSummary } from './design-system-tools';
import { generatePage, ComponentCode, PageGenerationResult } from './design-executor';
import { runDesignQA, QAReport } from './design-qa-gate';
import { planPageStructure, PageStructure } from './page-structure-planner';
import { buildDesignContext, DesignContext } from './design-context-loader';

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

export async function generateWebsite(
  request: GenerationRequest
): Promise<GenerationResult> {
  const { prompt, brand, sections = ['hero', 'features', 'cta'], outputDir = 'output', includeMagicUI = true } = request;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!llm) {
    return {
      success: false,
      brand,
      components: [],
      pageStructure: { pageName: '', pagePath: '', sections: [], navigation: { type: 'horizontal', items: [] }, footer: { type: 'simple', columns: [] } },
      errors: ['LLM client not initialized'],
      warnings,
    };
  }

  const designSystem = await loadDesignSystem(brand);
  if (!designSystem) {
    return {
      success: false,
      brand,
      components: [],
      pageStructure: { pageName: '', pagePath: '', sections: [], navigation: { type: 'horizontal', items: [] }, footer: { type: 'simple', columns: [] } },
      errors: [`Design system '${brand}' not found`],
      warnings,
    };
  }

  const spec = {
    version: '1.0',
    sourceDesignSystems: [brand],
    appliedDesignSystem: designSystem,
    customOverrides: {},
    generatedAt: new Date().toISOString(),
    confirmedItems: [],
  };

  const designContext = buildDesignContext(spec);

  const pageStructure = await planPageStructure(
    'Generated Page',
    outputDir,
    spec,
    prompt
  );

  const generationResults: PageGenerationResult[] = [];

  for (const section of sections) {
    try {
      const sectionUpper = section.charAt(0).toUpperCase() + section.slice(1);
      const result = await generatePage({
        pageName: sectionUpper,
        pagePath: outputDir,
        sections: [sectionUpper],
        designSpec: spec,
        content: { prompt, section },
      });
      generationResults.push(result);
    } catch (error) {
      errors.push(`Failed to generate ${section}: ${error}`);
    }
  }

  const allComponents = generationResults.flatMap(r => r.components);

  let qaReport: QAReport | undefined;
  if (allComponents.length > 0) {
    const combinedResult: PageGenerationResult = {
      pageName: 'Combined',
      components: allComponents,
      errors: [],
      warnings: [],
    };
    qaReport = await runDesignQA(combinedResult, spec, designContext);
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
  const { listDesignSystems } = await import('./design-system-tools');
  const brands = await listDesignSystems();
  const allBrandNames = brands.map(b => b.name);

  if (!llm) {
    return {
      recommendations: [],
      allBrands: allBrandNames,
    };
  }

  const prompt = `Based on the following requirements, recommend the most suitable design systems.

Requirements: ${requirements}

Available design systems: ${allBrandNames.join(', ')}

Recommend the top ${count} design systems. For each, provide:
1. name (exact brand name from available list)
2. description (brief)
3. category
4. suitableFor (why it's good for these requirements)

Return JSON with "recommendations" array.`;

  try {
    const response = await llm.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return { recommendations: [], allBrands: allBrandNames };
    }

    const parsed = JSON.parse(textContent.text);
    return {
      recommendations: (parsed.recommendations || []).map((r: any) => ({
        name: r.name,
        description: r.description || '',
        category: r.category || 'other',
        suitableFor: r.suitableFor || '',
      })),
      allBrands: allBrandNames,
    };
  } catch {
    return { recommendations: [], allBrands: allBrandNames };
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

  const spec = {
    version: '1.0',
    sourceDesignSystems: [brand],
    appliedDesignSystem: designSystem,
    customOverrides: {},
    generatedAt: new Date().toISOString(),
    confirmedItems: [],
  };

  const structure = await planPageStructure(
    pageType,
    pageType,
    spec,
    requirements
  );

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

  const spec = {
    version: '1.0',
    sourceDesignSystems: [designSystemBrand],
    appliedDesignSystem: designSystem,
    customOverrides: {},
    generatedAt: new Date().toISOString(),
    confirmedItems: [],
  };

  const designContext = buildDesignContext(spec);

  const componentCodes: ComponentCode[] = components.map((code, i) => ({
    name: `Component${i + 1}`,
    filePath: `Component${i + 1}.tsx`,
    code,
  }));

  const combinedResult: PageGenerationResult = {
    pageName: 'QA Check',
    components: componentCodes,
    errors: [],
    warnings: [],
  };

  const report = await runDesignQA(combinedResult, spec, designContext);

  return {
    passed: report.passed,
    score: report.score,
    checks: report.checks.map(c => ({
      category: c.category,
      passed: c.passed,
      message: c.message,
      severity: c.severity,
    })),
    recommendations: report.recommendations,
  };
}
