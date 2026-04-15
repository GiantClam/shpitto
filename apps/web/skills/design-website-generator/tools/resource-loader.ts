/**
 * Resource Loader - Load prompts, rules, and references
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from "url";

export interface Rule {
  name: string;
  file: string;
  category: 'color' | 'typography' | 'shadow' | 'spacing' | 'accessibility';
  content: string;
}

export interface Prompt {
  name: string;
  file: string;
  purpose: string;
  content: string;
}

export interface Reference {
  name: string;
  file: string;
  description: string;
  content: string;
}

function getSkillRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, '..');
}

const RULES_DIR = path.join(getSkillRoot(), 'rules');
const PROMPTS_DIR = path.join(getSkillRoot(), 'prompts');
const REFERENCES_DIR = path.join(getSkillRoot(), 'references');

/**
 * Load a specific rule file
 */
export async function loadRule(ruleName: string): Promise<Rule | null> {
  const categoryMap: Record<string, string[]> = {
    color: ['design-color-compliance'],
    typography: ['design-typography-hierarchy'],
    shadow: ['design-shadow-technique'],
    spacing: ['design-spacing-grid'],
    accessibility: ['design-accessibility'],
  };

  const possibleFiles = categoryMap[ruleName] || [ruleName];
  
  for (const file of possibleFiles) {
    const filePath = path.join(RULES_DIR, `${file}.md`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        name: file,
        file: `${file}.md`,
        category: determineCategory(file),
        content,
      };
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Load all rules
 */
export async function loadAllRules(): Promise<Rule[]> {
  try {
    const entries = await fs.readdir(RULES_DIR);
    const rules: Rule[] = [];

    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const filePath = path.join(RULES_DIR, entry);
      const content = await fs.readFile(filePath, 'utf-8');
      rules.push({
        name: entry.replace('.md', ''),
        file: entry,
        category: determineCategory(entry),
        content,
      });
    }

    return rules;
  } catch {
    return [];
  }
}

/**
 * Load a specific prompt file
 */
export async function loadPrompt(promptName: string): Promise<Prompt | null> {
  const promptMap: Record<string, string> = {
    'sequential-workflow': 'sequential-workflow.md',
    'selection-criteria': 'selection-criteria.md',
  };

  const fileName = promptMap[promptName] || `${promptName}.md`;
  const filePath = path.join(PROMPTS_DIR, fileName);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      name: promptName,
      file: fileName,
      purpose: getPromptPurpose(promptName),
      content,
    };
  } catch {
    return null;
  }
}

/**
 * Load all prompts
 */
export async function loadAllPrompts(): Promise<Prompt[]> {
  try {
    const entries = await fs.readdir(PROMPTS_DIR);
    const prompts: Prompt[] = [];

    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const filePath = path.join(PROMPTS_DIR, entry);
      const content = await fs.readFile(filePath, 'utf-8');
      const name = entry.replace('.md', '');
      prompts.push({
        name,
        file: entry,
        purpose: getPromptPurpose(name),
        content,
      });
    }

    return prompts;
  } catch {
    return [];
  }
}

/**
 * Load a specific reference file
 */
export async function loadReference(refName: string): Promise<Reference | null> {
  const refMap: Record<string, string> = {
    'command-reference': 'command-reference.md',
    'troubleshooting': 'troubleshooting.md',
    'design-system-structure': 'design-system-structure.md',
  };

  const fileName = refMap[refName] || `${refName}.md`;
  const filePath = path.join(REFERENCES_DIR, fileName);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      name: refName,
      file: fileName,
      description: getReferenceDescription(refName),
      content,
    };
  } catch {
    return null;
  }
}

/**
 * Load all references
 */
export async function loadAllReferences(): Promise<Reference[]> {
  try {
    const entries = await fs.readdir(REFERENCES_DIR);
    const refs: Reference[] = [];

    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const filePath = path.join(REFERENCES_DIR, entry);
      const content = await fs.readFile(filePath, 'utf-8');
      const name = entry.replace('.md', '');
      refs.push({
        name,
        file: entry,
        description: getReferenceDescription(name),
        content,
      });
    }

    return refs;
  } catch {
    return [];
  }
}

function determineCategory(fileName: string): Rule['category'] {
  const name = fileName.toLowerCase();
  if (name.includes('color')) return 'color';
  if (name.includes('typography')) return 'typography';
  if (name.includes('shadow')) return 'shadow';
  if (name.includes('spacing')) return 'spacing';
  if (name.includes('accessibility')) return 'accessibility';
  return 'color';
}

function getPromptPurpose(promptName: string): string {
  const purposes: Record<string, string> = {
    'sequential-workflow': 'Detailed steps and prompt templates for sequential page generation',
    'selection-criteria': 'Rules and decision trees for selecting design systems',
  };
  return purposes[promptName] || '';
}

function getReferenceDescription(refName: string): string {
  const descriptions: Record<string, string> = {
    'command-reference': 'Quick reference for all commands and parameters',
    'troubleshooting': 'Common issues and solutions',
    'design-system-structure': 'Detailed structure of DESIGN.md files',
  };
  return descriptions[refName] || '';
}

/**
 * Get rules summary for prompt injection
 */
export async function getRulesSummary(): Promise<string> {
  const rules = await loadAllRules();
  
  return rules.map(rule => `
## ${rule.name} (${rule.category})

${rule.content.slice(0, 500)}${rule.content.length > 500 ? '...' : ''}
`).join('\n');
}

/**
 * Fill template variables
 */
export function fillTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}
