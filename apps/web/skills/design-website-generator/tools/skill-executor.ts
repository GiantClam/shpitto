/**
 * Skill Executor - Main execution engine for design-website-generator
 * 
 * This module orchestrates the skill workflow by:
 * 1. Loading design systems
 * 2. Building design contexts
 * 3. Generating components via LLM
 * 4. Validating outputs
 * 5. Writing files to output directory
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadDesignSystem, listDesignSystems, designSystemToSummary, DesignSystem, BrandInfo } from './design-system-tools';
import { executeLLM, generateComponent } from './llm-executor';
import { validateComponent, DesignSpec } from './component-validator';
import { buildDesignContext, buildPageContext, formatContextForPrompt, PageContext } from './context-builder';
import { loadPrompt, loadAllRules, getRulesSummary, fillTemplate } from './resource-loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getSkillRoot(): string {
  return path.resolve(__dirname, '..');
}

export interface GenerationRequest {
  prompt: string;
  brand: string;
  pages?: string[];
  outputDir?: string;
  options?: {
    skipPreview?: boolean;
    skipQA?: boolean;
    includeMagicUI?: boolean;
  };
}

export interface GenerationResult {
  success: boolean;
  brand: string;
  pages: PageResult[];
  errors: string[];
  warnings: string[];
}

export interface PageResult {
  pageName: string;
  components: ComponentResult[];
  pageContext: PageContext;
  qaPassed: boolean;
  qaScore: number;
}

export interface ComponentResult {
  name: string;
  code: string;
  filePath: string;
}

/**
 * Main skill executor
 */
export async function executeSkill(request: GenerationRequest): Promise<GenerationResult> {
  const { prompt, brand, pages = ['homepage'], outputDir = 'output', options = {} } = request;
  const errors: string[] = [];
  const warnings: string[] = [];
  const pageResults: PageResult[] = [];

  try {
    const designSystem = await loadDesignSystem(brand);
    if (!designSystem) {
      throw new Error(`Design system '${brand}' not found. Use list-design-systems to see available options.`);
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
    const rulesSummary = await getRulesSummary();

    let previousPageContext: PageContext | undefined;

    for (let i = 0; i < pages.length; i++) {
      const pageName = pages[i];
      console.log(`Generating page ${i + 1}/${pages.length}: ${pageName}`);

      const pageContext = await generatePage(
        pageName,
        i + 1,
        prompt,
        designContext,
        rulesSummary,
        previousPageContext,
        outputDir,
        options
      );

      pageResults.push(pageContext);
      previousPageContext = pageContext.pageContext;

      if (pageContext.qaPassed === false && !options.skipQA) {
        warnings.push(`QA check failed for ${pageName} (score: ${pageContext.qaScore}%)`);
      }
    }

    return {
      success: errors.length === 0,
      brand,
      pages: pageResults,
      errors,
      warnings,
    };

  } catch (error: any) {
    return {
      success: false,
      brand,
      pages: [],
      errors: [error.message],
      warnings,
    };
  }
}

async function generatePage(
  pageName: string,
  pageOrder: number,
  globalPrompt: string,
  designContext: any,
  rulesSummary: string,
  previousPageContext: PageContext | undefined,
  outputDir: string,
  options: any
): Promise<PageResult> {
  const componentResults: ComponentResult[] = [];

  const sequentialPrompt = await loadPrompt('sequential-workflow');
  
  let systemPrompt = `You are an expert website generator using the design-website-generator skill.
Follow the sequential page generation workflow exactly.
SKILL is the source of truth, you execute based on its definitions.

Design Rules to follow:
${rulesSummary}

Your output must be production-ready React/Next.js code.`;

  let userPrompt: string;

  if (pageOrder === 1) {
    userPrompt = buildFirstPagePrompt(pageName, globalPrompt, designContext, sequentialPrompt?.content);
  } else {
    userPrompt = buildSequentialPagePrompt(pageName, globalPrompt, designContext, sequentialPrompt?.content, previousPageContext);
  }

  const componentCode = await generateComponent(
    userPrompt,
    systemPrompt,
    'website page'
  );

  const filePath = path.join(outputDir, `${pageName}.tsx`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, componentCode, 'utf-8');

  componentResults.push({
    name: pageName,
    code: componentCode,
    filePath,
  });

  const validationResult = await validateComponent(componentCode, designContext.designSpec, designContext);

  const pageContext = buildPageContext(
    pageName,
    pageOrder,
    { headings: [], keyTerms: [], featureList: [], toneAndManner: 'professional' },
    { colorsUsed: [], typographyUsed: [], componentsUsed: [pageName] },
    { sections: [], links: [], navigationItems: [] }
  );

  return {
    pageName,
    components: componentResults,
    pageContext,
    qaPassed: validationResult.passed,
    qaScore: validationResult.score,
  };
}

function buildFirstPagePrompt(
  pageName: string,
  globalPrompt: string,
  designContext: any,
  templateContent?: string
): string {
  return `Generate a complete ${pageName} page for a website.

## User Requirements
${globalPrompt}

## Design System (${designContext.brand})
${formatContextForPrompt(designContext)}

## First Page Generation
This is the FIRST page. Establish the brand tone, core terminology, and design token usage patterns.
Generate a complete page with all necessary sections (hero, features, CTA, etc.).

Output the complete React component code.`;
}

function buildSequentialPagePrompt(
  pageName: string,
  globalPrompt: string,
  designContext: any,
  templateContent?: string,
  previousPageContext?: PageContext
): string {
  let coherenceContext = '';
  
  if (previousPageContext) {
    coherenceContext = `
## Previous Page Context (MUST FOLLOW)
- Page: ${previousPageContext.pageName}
- Use the SAME terminology as the previous page
- Use the SAME design token application patterns
- Maintain visual consistency with ${previousPageContext.pageName}
`;
  }

  return `Generate a ${pageName} page for the website.

## User Requirements
${globalPrompt}

## Design System (${designContext.brand})
${formatContextForPrompt(designContext)}

${coherenceContext}

## Sequential Generation Rules
1. Inherit terminology from previous pages (do NOT introduce new synonyms)
2. Use the same design tokens as previous pages
3. Maintain visual and stylistic consistency
4. Build upon the established structure

Generate the complete React component code.`;
}

/**
 * List available design systems
 */
export async function listDesignSystemsCommand(category?: string): Promise<BrandInfo[]> {
  return listDesignSystems(category);
}

/**
 * Recommend design systems based on requirements
 */
export async function recommendDesignSystemsCommand(
  requirements: string,
  count: number = 5
): Promise<{ recommendations: BrandInfo[]; allBrands: string[] }> {
  const brands = await listDesignSystems();
  const allBrandNames = brands.map(b => b.name);

  const selectionCriteria = await loadPrompt('selection-criteria');
  
  const systemPrompt = `You are a design system expert. Recommend the best design systems based on user requirements.
Consider: industry match, style preference, complexity, and target audience.
Be concise and specific in your recommendations.`;

  const userPrompt = `Based on these requirements, recommend the top ${count} design systems:

Requirements: ${requirements}

Available design systems: ${allBrandNames.join(', ')}

${selectionCriteria?.content || ''}

Return a JSON object with:
{
  "recommendations": [
    { "name": "brand-name", "reason": "why this fits" }
  ]
}`;

  try {
    const response = await executeLLM(userPrompt, systemPrompt, { maxTokens: 2048 });
    
    let parsed: any;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      parsed = { recommendations: brands.slice(0, count).map(b => ({ name: b.name, reason: b.description })) };
    }

    const recommendedBrands = (parsed.recommendations || [])
      .slice(0, count)
      .map((r: any) => brands.find(b => b.name.toLowerCase() === r.name.toLowerCase()) || r);

    return {
      recommendations: recommendedBrands,
      allBrands: allBrandNames,
    };
  } catch (error) {
    return {
      recommendations: brands.slice(0, count),
      allBrands: allBrandNames,
    };
  }
}

/**
 * Run QA check on components
 */
export async function runDesignQACommand(
  components: string[],
  brand: string
): Promise<{ passed: boolean; score: number; errors: string[]; warnings: string[] }> {
  const designSystem = await loadDesignSystem(brand);
  if (!designSystem) {
    throw new Error(`Design system '${brand}' not found`);
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

  const allCode = components.join('\n\n');
  const result = await validateComponent(allCode, spec, designContext);

  return {
    passed: result.passed,
    score: result.score,
    errors: result.errors,
    warnings: result.warnings,
  };
}
