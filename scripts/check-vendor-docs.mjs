import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'content', 'docs', 'v1', 'manifest.json');
const navigationPath = path.join(root, 'vendor', 'sales', 'app', 'docs', 'navigation.json');
const sourceConfigPath = path.join(root, 'vendor', 'sales', 'source.config.ts');
const buyerRoot = path.join(root, 'docs', 'buyer', 'generated', 'v1');
const evidencePath = path.join(root, 'internal', 'evidence', 'm8', 'vendor-docs', 'result.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizedNavigation(manifest) {
  return manifest.navigation.map(({title, path: pagePath}) => ({title, path: pagePath}));
}

function validateVendorDocs({manifest, navigation, sourceConfig, exists = fs.existsSync, read = (file) => fs.readFileSync(file, 'utf8')}) {
  const errors = [];
  if (manifest.version !== 'v1' || manifest.source !== 'content/docs/v1') errors.push('canonical manifest must identify v1 content/docs source');
  if (manifest.search?.mode !== 'published-only' || manifest.search.source !== manifest.source) errors.push('canonical search must be published-only');
  if (!sourceConfig.includes("source: 'content/docs/v1'")) errors.push('vendor source config must point at the shared docs source');
  if (!sourceConfig.includes("searchMode: 'published-only'")) errors.push('vendor source config must keep search published-only');
  if (navigation.release !== manifest.version || navigation.source !== manifest.source || navigation.search?.mode !== manifest.search.mode || navigation.search?.source !== manifest.search.source) {
    errors.push('vendor navigation metadata is out of sync with canonical manifest');
  }
  if (JSON.stringify(navigation.pages) !== JSON.stringify(normalizedNavigation(manifest))) errors.push('vendor navigation pages are out of sync with canonical manifest');
  for (const entry of manifest.navigation) {
    const source = path.join(root, manifest.source, entry.path);
    if (!exists(source)) errors.push(`canonical docs page is missing: ${entry.path}`);
    else if (!/status:\s*published/.test(read(source))) errors.push(`vendor navigation includes unpublished page: ${entry.path}`);
    const buyer = path.join(buyerRoot, entry.path.replace(/\.mdx$/, '.md'));
    if (!exists(buyer)) errors.push(`buyer guide is missing for vendor page: ${entry.path}`);
    else {
      const buyerContent = read(buyer);
      if (!buyerContent.includes(`Source release: ${manifest.version}`) || !buyerContent.includes(`Canonical source: ${manifest.source}/${entry.path}`)) errors.push(`buyer guide is not release-matched: ${entry.path}`);
      if (/vendor\/sales|BEGIN PRIVATE KEY|signed[_-]?url/i.test(buyerContent)) errors.push(`buyer guide contains vendor-only content: ${entry.path}`);
    }
  }
  return errors;
}

function run() {
  const manifest = readJson(manifestPath);
  const navigation = readJson(navigationPath);
  const sourceConfig = fs.readFileSync(sourceConfigPath, 'utf8');
  const errors = validateVendorDocs({manifest, navigation, sourceConfig});
  const result = {
    status: errors.length ? 'FAIL' : 'PASS',
    profile: 'local-vendor-docs-sync',
    release: manifest.version,
    pages: manifest.navigation.length,
    checks: {
      sharedSource: errors.some((error) => error.includes('canonical')) ? 'FAIL' : 'PASS',
      navigationParity: errors.some((error) => error.includes('navigation')) ? 'FAIL' : 'PASS',
      publishedOnly: errors.some((error) => error.includes('unpublished')) ? 'FAIL' : 'PASS',
      buyerGuideParity: errors.some((error) => error.includes('buyer guide')) ? 'FAIL' : 'PASS',
      vendorContentExclusion: errors.some((error) => error.includes('vendor-only')) ? 'FAIL' : 'PASS',
    },
    errors,
    vendorAccount: 'NOT_PROVIDED',
    commercialTerms: 'NOT_PROVIDED',
    note: 'Local synchronization proof only; Lemon Squeezy merchant setup and commercial readiness remain open.',
  };
  fs.mkdirSync(path.dirname(evidencePath), {recursive: true});
  fs.writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 1;
}

export {validateVendorDocs};

if (process.argv[1]?.endsWith('check-vendor-docs.mjs')) run();
