/**
 * Component Validator - Validate generated components against design specs
 */

import type { DesignSystem } from './design-system-tools';

export interface ValidationResult {
  passed: boolean;
  score: number;
  checks: ValidationCheck[];
  errors: string[];
  warnings: string[];
}

export interface ValidationCheck {
  rule: string;
  category: 'color' | 'typography' | 'shadow' | 'spacing' | 'accessibility';
  passed: boolean;
  message: string;
  severity: 'critical' | 'major' | 'minor';
  location?: string;
}

export interface DesignSpec {
  version: string;
  sourceDesignSystems: string[];
  appliedDesignSystem: DesignSystem;
  customOverrides: Record<string, any>;
  generatedAt: string;
  confirmedItems: string[];
}

/**
 * Validate a component against design spec
 */
export async function validateComponent(
  componentCode: string,
  designSpec: DesignSpec,
  designContext: any
): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  checks.push(...checkColorCompliance(componentCode, designSpec));
  checks.push(...checkTypographyHierarchy(componentCode, designSpec));
  checks.push(...checkShadowTechnique(componentCode, designSpec));
  checks.push(...checkSpacingGrid(componentCode, designSpec));
  checks.push(...checkAccessibility(componentCode));

  const passedChecks = checks.filter(c => c.passed).length;
  const score = Math.round((passedChecks / checks.length) * 100);

  for (const check of checks) {
    if (!check.passed) {
      if (check.severity === 'critical' || check.severity === 'major') {
        errors.push(`[${check.category}] ${check.message}`);
      } else {
        warnings.push(`[${check.category}] ${check.message}`);
      }
    }
  }

  return {
    passed: errors.length === 0,
    score,
    checks,
    errors,
    warnings,
  };
}

function checkColorCompliance(code: string, spec: DesignSpec): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const ds = spec.appliedDesignSystem;

  const hardcodedColorPatterns = [
    { pattern: /bg-blue-\d+/, message: 'Hardcoded Tailwind blue color' },
    { pattern: /bg-gray-\d+/, message: 'Hardcoded Tailwind gray color' },
    { pattern: /text-black|background:\s*#000/i, message: 'Hardcoded black color' },
    { pattern: /#[0-9A-Fa-f]{6}(?![0-9A-Fa-f]{2})/, message: 'Potential hardcoded hex color' },
  ];

  for (const { pattern, message } of hardcodedColorPatterns) {
    if (pattern.test(code)) {
      checks.push({
        rule: 'no-hardcoded-colors',
        category: 'color',
        passed: false,
        message,
        severity: 'major',
      });
    }
  }

  const primaryColor = ds.colors.primary?.[0]?.value;
  if (primaryColor) {
    const usesPrimary = code.includes(primaryColor.replace('#', '').toLowerCase()) || 
                        code.includes(primaryColor);
    checks.push({
      rule: 'uses-primary-color',
      category: 'color',
      passed: usesPrimary,
      message: usesPrimary ? 'Primary color is used' : 'Primary color not found',
      severity: 'minor',
    });
  }

  return checks;
}

function checkTypographyHierarchy(code: string, spec: DesignSpec): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const ds = spec.appliedDesignSystem;

  const fontFamilies = ds.typography?.map(t => t.font) || [];
  const hasFontDeclaration = fontFamilies.some(font => 
    code.includes(font) || code.includes(`fontFamily`)
  );

  checks.push({
    rule: 'font-family-declaration',
    category: 'typography',
    passed: hasFontDeclaration,
    message: hasFontDeclaration ? 'Font family declared' : 'No font family found',
    severity: 'major',
  });

  const semanticElements = ['<h1', '<h2', '<h3', '<p>', '<span>', '<button'];
  const hasSemanticHTML = semanticElements.some(el => code.includes(el));

  checks.push({
    rule: 'semantic-html',
    category: 'typography',
    passed: hasSemanticHTML,
    message: hasSemanticHTML ? 'Semantic HTML elements found' : 'No semantic HTML found',
    severity: 'minor',
  });

  return checks;
}

function checkShadowTechnique(code: string, spec: DesignSpec): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  const hasBorderAndShadow = /border[^>]*shadow|border[^>]*box-shadow|box-shadow[^>]*border/
    .test(code);

  if (hasBorderAndShadow) {
    checks.push({
      rule: 'shadow-as-border',
      category: 'shadow',
      passed: false,
      message: 'Using both border and shadow - violates shadow-as-border technique',
      severity: 'major',
    });
  } else {
    checks.push({
      rule: 'shadow-as-border',
      category: 'shadow',
      passed: true,
      message: 'No conflicting border+shadow usage',
      severity: 'minor',
    });
  }

  const shadowTokens = Object.keys(spec.appliedDesignSystem.shadows || {});
  const usesShadowTokens = shadowTokens.some(token => code.includes(token));

  checks.push({
    rule: 'uses-shadow-tokens',
    category: 'shadow',
    passed: usesShadowTokens || code.includes('shadow'),
    message: usesShadowTokens ? 'Shadow tokens used' : 'Consider using shadow tokens',
    severity: 'minor',
  });

  return checks;
}

function checkSpacingGrid(code: string, spec: DesignSpec): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  const hasMaxWidth = /max-w-|maxWidth|max-width/.test(code);

  checks.push({
    rule: 'max-width-constraint',
    category: 'spacing',
    passed: hasMaxWidth,
    message: hasMaxWidth ? 'Max width constraint found' : 'No max width found',
    severity: 'minor',
  });

  const spacingPattern = /p-|m-|gap-|px-|py-|pl-|pr-|mt-|mb-|ml-|mr-/;
  const hasSpacing = spacingPattern.test(code);

  checks.push({
    rule: 'uses-spacing',
    category: 'spacing',
    passed: hasSpacing,
    message: hasSpacing ? 'Spacing classes found' : 'No spacing classes found',
    severity: 'minor',
  });

  return checks;
}

function checkAccessibility(code: string): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  const buttonsWithoutAria = code.match(/<button[^>]*>(?!.*aria-label)/gi);
  if (buttonsWithoutAria) {
    checks.push({
      rule: 'button-aria-label',
      category: 'accessibility',
      passed: false,
      message: `${buttonsWithoutAria.length} button(s) missing aria-label`,
      severity: 'major',
    });
  } else {
    checks.push({
      rule: 'button-aria-label',
      category: 'accessibility',
      passed: true,
      message: 'All buttons have aria-labels',
      severity: 'minor',
    });
  }

  const imagesWithoutAlt = code.match(/<img[^>]*>(?!.*alt=)/gi);
  if (imagesWithoutAlt) {
    checks.push({
      rule: 'img-alt-attribute',
      category: 'accessibility',
      passed: false,
      message: `${imagesWithoutAlt.length} image(s) missing alt attribute`,
      severity: 'major',
    });
  } else {
    checks.push({
      rule: 'img-alt-attribute',
      category: 'accessibility',
      passed: true,
      message: 'All images have alt attributes',
      severity: 'minor',
    });
  }

  const hasFocusVisible = /focus-visible|:focus\b/.test(code);

  checks.push({
    rule: 'focus-visibility',
    category: 'accessibility',
    passed: hasFocusVisible,
    message: hasFocusVisible ? 'Focus styles found' : 'No focus styles found',
    severity: 'minor',
  });

  return checks;
}
