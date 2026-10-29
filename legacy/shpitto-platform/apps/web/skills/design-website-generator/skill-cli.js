#!/usr/bin/env node
/**
 * Skill CLI - Command-line interface for design-website-generator
 */

import { listDesignSystemsCommand, recommendDesignSystemsCommand, executeSkill, runDesignQACommand } from './tools/skill-executor.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..', '..');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'list-design-systems': {
        const categoryArg = args.indexOf('--category');
        const category = categoryArg !== -1 ? args[categoryArg + 1] : undefined;
        
        const brands = await listDesignSystemsCommand(category);
        
        console.log('\n=== Available Design Systems ===\n');
        for (const brand of brands) {
          console.log(`  ${brand.name.padEnd(20)} - ${brand.description}`);
        }
        console.log(`\nTotal: ${brands.length} design systems\n`);
        break;
      }

      case 'recommend-design-system': {
        const reqIdx = args.indexOf('--requirements');
        const countIdx = args.indexOf('--count');
        
        if (reqIdx === -1) {
          console.error('Error: --requirements is required');
          process.exit(1);
        }
        
        const requirements = args[reqIdx + 1];
        const count = countIdx !== -1 ? parseInt(args[countIdx + 1]) : 5;
        
        const result = await recommendDesignSystemsCommand(requirements, count);
        
        console.log('\n=== Design System Recommendations ===\n');
        for (const rec of result.recommendations) {
          console.log(`  ${rec.name}`);
          console.log(`    Description: ${rec.description}`);
          console.log();
        }
        break;
      }

      case 'generate-website': {
        const promptIdx = args.indexOf('--prompt');
        const brandIdx = args.indexOf('--brand');
        const pagesIdx = args.indexOf('--pages');
        const outputIdx = args.indexOf('--output');
        
        if (promptIdx === -1 || brandIdx === -1) {
          console.error('Error: --prompt and --brand are required');
          process.exit(1);
        }
        
        const prompt = args[promptIdx + 1];
        const brand = args[brandIdx + 1];
        const pages = pagesIdx !== -1 ? args[pagesIdx + 1].split(',') : ['homepage'];
        const outputDir = outputIdx !== -1 ? args[outputIdx + 1] : path.join(ROOT, 'output', brand);
        
        console.log(`\n=== Generating Website ===`);
        console.log(`Brand: ${brand}`);
        console.log(`Pages: ${pages.join(', ')}`);
        console.log(`Output: ${outputDir}\n`);
        
        const result = await executeSkill({
          prompt,
          brand,
          pages,
          outputDir,
          options: { skipQA: false, includeMagicUI: true },
        });
        
        if (result.success) {
          console.log('\n✅ Generation successful!\n');
          for (const page of result.pages) {
            console.log(`  ${page.pageName}: ${page.filePath} (QA: ${page.qaScore}%)\n`);
          }
          if (result.warnings.length > 0) {
            console.log('Warnings:');
            for (const w of result.warnings) {
              console.log(`  ⚠️  ${w}`);
            }
          }
        } else {
          console.log('\n❌ Generation failed:\n');
          for (const e of result.errors) {
            console.log(`  ${e}`);
          }
          process.exit(1);
        }
        break;
      }

      case 'run-design-qa': {
        const componentsIdx = args.indexOf('--components');
        const brandIdx = args.indexOf('--brand');
        
        if (componentsIdx === -1 || brandIdx === -1) {
          console.error('Error: --components and --brand are required');
          process.exit(1);
        }
        
        const files = args[componentsIdx + 1].split(',');
        const brand = args[brandIdx + 1];
        
        const components = [];
        for (const file of files) {
          const content = await fs.readFile(file.trim(), 'utf-8');
          components.push(content);
        }
        
        const result = await runDesignQACommand(components, brand);
        
        console.log(`\n=== QA Results (${result.score}%) ===\n`);
        
        if (result.passed) {
          console.log('✅ All checks passed!\n');
        } else {
          console.log('❌ Some checks failed:\n');
          for (const e of result.errors) {
            console.log(`  ${e}`);
          }
        }
        
        if (result.warnings.length > 0) {
          console.log('Warnings:');
          for (const w of result.warnings) {
            console.log(`  ⚠️  ${w}`);
          }
        }
        break;
      }

      case '--help':
      case 'help':
      default:
        console.log(`
=== design-website-generator CLI ===

Commands:
  list-design-systems [--category <category>]
    List all available design systems
    
  recommend-design-system --requirements <text> [--count <n>]
    Get AI recommendations for design systems
    
  generate-website --prompt <text> --brand <name> [--pages <pages>] [--output <dir>]
    Generate a website using the specified design system
    
  run-design-qa --components <files> --brand <name>
    Run QA checks on generated components

Examples:
  node skill-cli.js list-design-systems
  node skill-cli.js recommend-design-system --requirements "AI startup, dark theme"
  node skill-cli.js generate-website --prompt "Landing page for AI company" --brand apple --pages homepage,features,pricing
  node skill-cli.js run-design-qa --components "output/homepage.tsx,output/features.tsx" --brand apple
`);
        break;
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
