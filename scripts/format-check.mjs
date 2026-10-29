import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const policy = JSON.parse(fs.readFileSync(path.join(root, 'tooling/format-policy.json'), 'utf8'));
const write = process.argv.includes('--write');
const violations = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    if (entry.isDirectory() && ['node_modules', '.next'].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (policy.extensions.includes(path.extname(entry.name))) inspect(absolute);
  }
}

function inspect(absolute) {
  const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
  const original = fs.readFileSync(absolute, 'utf8');
  const normalized = original.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const formatted = policy.requireFinalNewline && normalized.length > 0 && !normalized.endsWith('\n')
    ? `${normalized}\n`
    : normalized;
  if (write && formatted !== original) {
    fs.writeFileSync(absolute, formatted, 'utf8');
  } else if (!write && formatted !== original) {
    violations.push(`${relative}: expected UTF-8 LF text with a final newline`);
  }
}

for (const sourceRoot of policy.sourceRoots) walk(path.join(root, sourceRoot));

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`${write ? 'Formatting normalization' : 'Format check'} passed.`);
}
