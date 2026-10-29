import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const policy = JSON.parse(fs.readFileSync(path.join(root, 'tooling/lint-policy.json'), 'utf8'));
const sourceExtensions = new Set(['.ts', '.tsx', '.mjs']);
const violations = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    if (policy.excludedRoots.includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (!sourceExtensions.has(path.extname(entry.name))) continue;
    inspect(absolute);
  }
}

function inspect(absolute) {
  const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
  const source = fs.readFileSync(absolute, 'utf8');
  for (const prefix of policy.forbiddenImportPrefixes) {
    const importPattern = new RegExp(`(?:from|import|require\\s*\\()\\s*[\\\"']${prefix.replace('/', '\\/')}`);
    if (importPattern.test(source)) {
      violations.push(`${relative}: imports legacy/vendor prefix ${prefix}`);
    }
  }
  if (policy.serverBoundaryRoots.some((prefix) => relative.startsWith(prefix))) {
    for (const prefix of policy.forbiddenServerBoundaryImports) {
      const importPattern = new RegExp(`(?:from|import|require\\s*\\()\\s*[\\\"']${prefix.replace('/', '\\\\/')}`);
      if (importPattern.test(source)) {
        violations.push(`${relative}: server boundary imports forbidden runtime prefix ${prefix}`);
      }
    }
    if (/from ['\"](?:@\/)?src\/app(?:\/|['\"])/.test(source)) {
      violations.push(`${relative}: server boundary imports application route code`);
    }
  }
  const scannerFile = policy.environmentPatternScannerFiles.includes(relative);
  const explicitlyAllowed = policy.environmentAccessAllowlist.includes(relative);
  if (!scannerFile && !explicitlyAllowed && relative !== policy.forbiddenEnvironmentAccessOutside[0] && /process\.env\b/.test(source)) {
    violations.push(`${relative}: reads process.env outside src/config/env.ts`);
  }
}

for (const sourceRoot of policy.sourceRoots) walk(path.join(root, sourceRoot));

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Source boundary check passed for ${policy.sourceRoots.join(', ')}.`);
}
