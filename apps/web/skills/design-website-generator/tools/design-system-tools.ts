import { promises as fs } from 'fs';
import path from 'path';

function getSkillRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..', 'builder', 'design-systems', 'design-md');
}

const DESIGN_SYSTEMS_PATH = getSkillRoot();

export interface DesignSystem {
  name: string;
  visualTheme: string;
  colors: {
    primary: Array<{ name: string; value: string; description?: string }>;
    accent: Array<{ name: string; value: string; description?: string }>;
    neutral: Array<{ name: string; value: string; description?: string }>;
    semantic: Array<{ name: string; value: string; description?: string }>;
    shadows: Array<{ name: string; value: string }>;
  };
  typography: Array<{
    role: string;
    font: string;
    size: string;
    weight: number;
    lineHeight: string;
    letterSpacing: string;
  }>;
  shadows: Record<string, string>;
  layout: {
    spacing: number[];
    maxWidth: string;
    grid: string;
    borderRadius: Record<string, string>;
  };
  dosAndDonts: {
    dos: string[];
    donts: string[];
  };
}

export interface BrandInfo {
  name: string;
  description: string;
  category: string;
  keyColors: string[];
}

const BRAND_CATEGORIES: Record<string, string[]> = {
  ai: ['claude', 'cohere', 'elevenlabs', 'minimax', 'mistral.ai', 'ollama', 'opencode.ai', 'replicate', 'runwayml', 'together.ai', 'voltagent', 'x.ai'],
  developer: ['cursor', 'expo', 'linear.app', 'lovable', 'mintlify', 'posthog', 'raycast', 'resend', 'sentry', 'supabase', 'superhuman', 'vercel', 'warp', 'zapier'],
  infrastructure: ['clickhouse', 'composio', 'hashicorp', 'mongodb', 'sanity', 'stripe'],
  fintech: ['coinbase', 'kraken', 'revolut', 'wise'],
  enterprise: ['airbnb', 'apple', 'ibm', 'nvidia', 'spacex', 'spotify', 'uber'],
  automotive: ['bmw', 'ferrari', 'lamborghini', 'renault', 'tesla'],
  design: ['airtable', 'cal.com', 'clay', 'figma', 'framer', 'intercom', 'miro', 'notion', 'pinterest', 'webflow'],
};

export async function listDesignSystems(category?: string): Promise<BrandInfo[]> {
  const brands: BrandInfo[] = [];
  
  try {
    const dir = path.join(process.cwd(), DESIGN_SYSTEMS_PATH);
    const entries = await fs.readdir(dir);
    
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      
      const brandPath = path.join(dir, entry);
      const stat = await fs.stat(brandPath);
      if (!stat.isDirectory()) continue;
      
      const brandCategory = Object.entries(BRAND_CATEGORIES).find(([, names]) => 
        names.includes(entry.toLowerCase())
      )?.[0] || 'other';
      
      if (category && brandCategory !== category) continue;
      
      const designMdPath = path.join(brandPath, 'DESIGN.md');
      let description = '';
      
      try {
        const content = await fs.readFile(designMdPath, 'utf-8');
        const firstLine = content.split('\n').find(l => l.startsWith('# '));
        description = firstLine?.replace('# Design System Inspiration of ', '').trim() || entry;
      } catch {
        description = entry;
      }
      
      brands.push({
        name: entry,
        description,
        category: brandCategory,
        keyColors: [],
      });
    }
  } catch (error) {
    throw new Error(`Failed to list design systems: ${error}`);
  }
  
  return brands.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadDesignSystem(brand: string): Promise<DesignSystem | null> {
  const filePath = path.join(process.cwd(), DESIGN_SYSTEMS_PATH, brand, 'DESIGN.md');
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseDesignMd(content, brand);
  } catch {
    return null;
  }
}

function parseDesignMd(content: string, name: string): DesignSystem {
  const sections = content.split(/^## \d+\. /m).filter(Boolean);
  
  return {
    name,
    visualTheme: extractSection(sections, 'Visual Theme'),
    colors: parseColors(sections),
    typography: parseTypography(sections),
    shadows: parseShadows(sections),
    layout: parseLayout(sections),
    dosAndDonts: parseDosDonts(sections),
  };
}

function extractSection(sections: string[], keyword: string): string {
  const idx = sections.findIndex(s => s.toLowerCase().startsWith(keyword.toLowerCase()));
  return idx >= 0 ? sections[idx].split('\n').slice(1, 4).join(' ').trim() : '';
}

function parseColors(sections: string[]): DesignSystem['colors'] {
  const colorSection = sections.find(s => s.toLowerCase().startsWith('color palette'));
  if (!colorSection) {
    return { primary: [], accent: [], neutral: [], semantic: [], shadows: [] };
  }
  
  const result = { primary: [], accent: [], neutral: [], semantic: [], shadows: [] };
  const colorBlocks = colorSection.split(/### /).filter(Boolean);
  
  for (const block of colorBlocks) {
    const lines = block.split('\n').filter(l => l.trim());
    if (!lines[0]) continue;
    
    const category = lines[0].toLowerCase();
    const isPrimary = category.includes('primary') || category.includes('black') || category.includes('white');
    const isAccent = category.includes('accent') || category.includes('workflow') || category.includes('interactive');
    const isNeutral = category.includes('neutral') || category.includes('gray');
    const isShadow = category.includes('shadow');
    
    for (const line of lines.slice(1)) {
      const match = line.match(/\*\*([^*]+)\*\*\s*\((\#[^\)]+)\)(?::\s*(.+))?/);
      if (match) {
        const token = { name: match[1].trim(), value: match[2].trim(), description: match[3]?.trim() };
        if (isShadow) result.shadows.push(token);
        else if (isPrimary) result.primary.push(token);
        else if (isAccent) result.accent.push(token);
        else if (isNeutral) result.neutral.push(token);
        else result.semantic.push(token);
      }
    }
  }
  
  return result;
}

function parseTypography(sections: string[]): DesignSystem['typography'] {
  const typoSection = sections.find(s => s.toLowerCase().startsWith('typography'));
  if (!typoSection) return [];
  
  const tableMatch = typoSection.match(/\| Role[\s\S]*?\|[\s\S]*?\|[\s\S]*?\|/);
  if (!tableMatch) return [];
  
  const rules: DesignSystem['typography'] = [];
  const rows = tableMatch[0].split('\n').filter(r => r.includes('|') && !r.includes('---'));
  
  for (const row of rows.slice(1)) {
    const cells = row.split('|').filter(c => c.trim() && !c.includes('Role'));
    if (cells.length >= 7) {
      rules.push({
        role: cells[1].trim(),
        font: cells[2].trim(),
        size: cells[3].trim(),
        weight: parseInt(cells[4].trim()) || 400,
        lineHeight: cells[5].trim(),
        letterSpacing: cells[6].trim(),
      });
    }
  }
  
  return rules;
}

function parseShadows(sections: string[]): Record<string, string> {
  const depthSection = sections.find(s => s.toLowerCase().includes('depth') || s.toLowerCase().includes('shadow'));
  if (!depthSection) return {};
  
  const shadows: Record<string, string> = {};
  const matches = depthSection.matchAll(/-\s*\*\*([^*]+)\*\*\s*\( ([^)]+) \):/g);
  
  for (const m of matches) {
    shadows[m[1].trim()] = m[2].trim();
  }
  
  return shadows;
}

function parseLayout(sections: string[]): DesignSystem['layout'] {
  const layoutSection = sections.find(s => s.toLowerCase().startsWith('layout'));
  if (!layoutSection) {
    return { spacing: [1, 2, 4, 8, 16, 32], maxWidth: '1200px', grid: '12-col', borderRadius: {} };
  }
  
  const spacingMatch = layoutSection.match(/Base unit:\s*(\d+)px/i);
  const maxWidthMatch = layoutSection.match(/Max content width:\s*[^0-9]*([0-9]+)px/i);
  
  return {
    spacing: spacingMatch ? [1, 2, parseInt(spacingMatch[1]), parseInt(spacingMatch[1]) * 2, parseInt(spacingMatch[1]) * 4, parseInt(spacingMatch[1]) * 8] : [1, 2, 4, 8, 16, 32],
    maxWidth: maxWidthMatch ? `${maxWidthMatch[1]}px` : '1200px',
    grid: '12-col',
    borderRadius: {},
  };
}

function parseDosDonts(sections: string[]): DesignSystem['dosAndDonts'] {
  const dosSection = sections.find(s => s.toLowerCase().includes("do's"));
  const dontsSection = sections.find(s => s.toLowerCase().includes("don't"));
  
  const dos: string[] = [];
  const donts: string[] = [];
  
  if (dosSection) {
    const matches = dosSection.matchAll(/^### Do\s*([\s\S]*?)(?=###|$)/gi);
    for (const m of matches) {
      const items = m[1].matchAll(/-\s*(.+)/g);
      for (const item of items) dos.push(item[1].trim());
    }
  }
  
  if (dontsSection) {
    const matches = dontsSection.matchAll(/^### Don't\s*([\s\S]*?)(?=###|$)/gi);
    for (const m of matches) {
      const items = m[1].matchAll(/-\s*(.+)/g);
      for (const item of items) donts.push(item[1].trim());
    }
  }
  
  return { dos, donts };
}

export function designSystemToSummary(ds: DesignSystem): string {
  const lines: string[] = [];
  
  lines.push(`## ${ds.name}`);
  lines.push(`\n${ds.visualTheme.slice(0, 200)}...\n`);
  
  lines.push('### Colors');
  if (ds.colors.primary[0]) lines.push(`- Primary: ${ds.colors.primary[0].value}`);
  if (ds.colors.accent[0]) lines.push(`- Accent: ${ds.colors.accent[0].value}`);
  if (ds.colors.neutral[0]) lines.push(`- Neutral: ${ds.colors.neutral[0].value}`);
  
  lines.push('\n### Typography');
  if (ds.typography[0]) {
    const t = ds.typography[0];
    lines.push(`- ${t.role}: ${t.font} ${t.size}`);
  }
  
  return lines.join('\n');
}
