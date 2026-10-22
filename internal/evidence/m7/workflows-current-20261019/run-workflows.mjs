import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Client} from 'pg';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Local evidence only. Copies and databases belong to this invocation; the
// repository, live database and existing user servers are never mutated.
const root = process.cwd();
const evidenceRoot = path.dirname(fileURLToPath(import.meta.url));
const runId = new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const temporaryRoot = path.join(root, '.data', `m7-four-workflows-${runId}`);
const resultRoot = path.join(evidenceRoot, 'runs', runId);
const environment = globalThis.process['env'];
const databaseAdminUrl = 'postgres://shpitto:shpitto-local-only@127.0.0.1:55432/postgres';
const secret = `local-m7-workflow-${randomUUID()}-secret`;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
const writeJson = (file, value) => {mkdirSync(path.dirname(file), {recursive: true}); writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');};
const read = (file) => readFileSync(file, 'utf8');
const checks = [];
const protectedRoots = ['src/db', 'src/modules', 'src/adapters', 'src/app/api', 'src/lib/auth.ts', 'src/config/env.ts', 'src/config/models.ts', 'src/config/plans.ts', 'src/config/task-runtime.ts', 'src/config/provider-worker.ts', '.shpitto/contracts', 'scripts', 'tests', 'tooling', 'package.json', 'pnpm-lock.yaml'];
const walk = (base, ref) => existsSync(path.join(base, ref))
  ? readdirOrFile(base, ref) : [];
function readdirOrFile(base, ref) {
  try {return readdirSync(path.join(base, ref), {withFileTypes: true}).flatMap((entry) => entry.isDirectory() ? walk(base, path.join(ref, entry.name)) : [path.join(ref, entry.name).replaceAll('\\', '/')]);}
  catch (error) {if (error.code === 'ENOTDIR') return [ref.replaceAll('\\', '/')]; throw error;}
}
const protectedManifest = (base) => [...new Set(protectedRoots.flatMap((ref) => walk(base, ref)))].sort().map((ref) => ({path: ref, sha256: digest(readFileSync(path.join(base, ref)))}));

function run(id, executable, args, cwd, env = {}, timeout = 180_000, expectedExit = 0) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(executable, args, {cwd, env: {...environment, ...env}, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true});
  const file = path.join(resultRoot, 'logs', `${id}.log`);
  mkdirSync(path.dirname(file), {recursive: true});
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}`.replaceAll(databaseAdminUrl, '[local database]').replaceAll('shpitto-local-only', '[redacted]').replaceAll(secret, '[redacted]');
  writeFileSync(file, output, 'utf8');
  const entry = {id, startedAt, endedAt: new Date().toISOString(), executable, args, cwd: relative(cwd), exitCode: result.status, expectedExit, status: result.status === expectedExit ? 'PASS' : 'FAIL', outputRef: relative(file)};
  checks.push(entry);
  writeJson(path.join(resultRoot, 'commands.json'), checks);
  console.log(`${id}: ${entry.status}`);
  assert.equal(result.status, expectedExit, `${id} failed; see ${relative(file)}`);
  return result.stdout ?? '';
}

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Expected exactly one mutation target: ${before}`);
  return source.replace(before, after);
}

const workflows = [
  {id: 'customize-brand', brief: 'A fictional Meridian Motion evaluation changes canonical name, tagline and studio canvas. Existing template logo artwork remains labeled as fallback; this is not customer delivery.', files: ['src/config/brand.ts'],
    mutate(candidate) {const file = path.join(candidate, this.files[0]); let value = read(file); for (const [before, after] of [["name: 'Shpitto'", "name: 'Meridian Motion'"], ["productName: 'Shpitto'", "productName: 'Meridian Motion'"], ["tagline: 'Give your ideas a little motion.'", "tagline: 'Give every idea a moving start.'"], ["canvas: '#101012'", "canvas: '#11151b'"]]) value = replaceOnce(value, before, after); writeFileSync(file, value, 'utf8');}},
  {id: 'create-page', brief: 'A public Studio notes page explains prompt planning using the existing marketing shell, semantic classes and links. Add its marketing navigation entry; add no commands or API.', files: ['src/config/navigation.ts', 'src/app/(marketing)/studio-notes/page.tsx'],
    mutate(candidate) {const nav = path.join(candidate, this.files[0]); writeFileSync(nav, replaceOnce(read(nav), "  {label: 'Docs', href: '/docs'},", "  {label: 'Studio notes', href: '/studio-notes'},\n  {label: 'Docs', href: '/docs'},"), 'utf8'); const route = path.join(candidate, this.files[1]); mkdirSync(path.dirname(route), {recursive: true}); writeFileSync(route, "import type {Metadata} from 'next';\nimport {SiteShell} from '../../../components/shell/site-shell';\n\nexport const metadata: Metadata = {title: 'Studio notes | Shpitto', description: 'Plan a focused prompt for your next short video.'};\n\nexport default function StudioNotesPage() {\n  return <SiteShell><main className=\"page\"><p className=\"eyebrow\">Studio notes</p><h1>Plan a focused short video.</h1><p>Choose one subject, describe its motion, and select a useful frame before you review the video in your workspace.</p><section className=\"status-card\"><h2>Start with one clear idea</h2><p>Keep the prompt specific. Review your model, credits and any image upload in the existing studio.</p><a className=\"button\" href=\"/#create\">Try a video prompt</a></section></main></SiteShell>;\n}\n", 'utf8');}},
  {id: 'modify-page', brief: 'Clarify local fixture pricing copy while retaining product catalog amounts, credit quantities, checkout handlers, disabled states and portal bindings exactly.', files: ['src/components/billing/fixture-billing-panel.tsx'],
    mutate(candidate) {const file = path.join(candidate, this.files[0]); let value = replaceOnce(read(file), '>Local Mock billing</h2>', '>Explore local credit options</h2>'); value = replaceOnce(value, 'Use the fixture products to exercise checkout, webhook reconciliation and recovery state end to end.', 'Choose a fixture product to review local credits and exercise checkout. No real payment is collected.'); writeFileSync(file, value, 'utf8');}},
  {id: 'customize-site', brief: 'Refresh the shared creator/workspace shell helper copy using existing semantic styling, dimensions, navigation destinations and action semantics.', files: ['src/components/shell/site-shell.tsx'],
    mutate(candidate) {const file = path.join(candidate, this.files[0]); let value = read(file); for (const [before, after] of [['CREATE SOMETHING', 'YOUR CREATIVE SPACE'], ['From idea to first take.', 'Make room for your next idea.'], ['Help & documentation', 'Studio guides']]) value = replaceOnce(value, before, after); writeFileSync(file, value, 'utf8');}},
];

function billingBindings(source) {
  const file = ts.createSourceFile('fixture-billing-panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes = [];
  const visit = (node) => {
    if ((ts.isFunctionDeclaration(node) && ['post', 'checkout', 'portal'].includes(node.name?.text))
      || (ts.isCallExpression(node) && node.expression.getText(file) === 'products.map')) nodes.push(node.getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.equal(nodes.length, 4, 'Expected actual billing transport, checkout, portal and catalog rendering AST nodes.');
  return {sha256: digest(nodes.join('\n')), nodes: nodes.map((source) => ({sha256: digest(source), source}))};
}

async function renderSmoke(candidate, workflow, output) {
  // Compile the actual changed React presentation modules with the installed
  // TypeScript compiler. This is a static React/CSS viewport smoke, not a
  // Next.js route, hydration or authenticated checkout acceptance claim.
  const compiled = new Map();
  function compile(ref) {
    if (compiled.has(ref)) return compiled.get(ref);
    const target = path.join(candidate, '.data', 'react-render', `${ref}.mjs`);
    compiled.set(ref, target);
    let code = ts.transpileModule(read(path.join(candidate, ref)), {compilerOptions: {jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
    code = code.replace(/from (['"])(\.[^'"]+)\1/g, (whole, quote, relativeImport) => {
      const base = path.resolve(candidate, path.dirname(ref), relativeImport);
      const source = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((file) => existsSync(file) && !file.endsWith('.css'));
      assert(source, `Cannot compile presentation import ${relativeImport}`);
      return `from ${quote}${pathToFileURL(compile(path.relative(candidate, source))).href}${quote}`;
    });
    mkdirSync(path.dirname(target), {recursive: true}); writeFileSync(target, code, 'utf8'); return target;
  }
  const {SiteShell} = await import(pathToFileURL(compile('src/components/shell/site-shell.tsx')).href);
  const {FixtureBillingPanel} = await import(pathToFileURL(compile('src/components/billing/fixture-billing-panel.tsx')).href);
  const {brand, brandCssVariables} = await import(pathToFileURL(compile('src/config/brand.ts')).href);
  const {getBillingCatalog} = await import(pathToFileURL(path.join(candidate, 'src/config/plans.ts')).href);
  const catalog = getBillingCatalog('local');
  const productView = catalog.map((product) => ({...product, credits: String(product.credits), amountMinor: String(product.amountMinor)}));
  let body;
  if (workflow.id === 'create-page') {const Page = (await import(pathToFileURL(compile('src/app/(marketing)/studio-notes/page.tsx')).href)).default; body = React.createElement(Page);}
  else body = React.createElement(SiteShell, {variant: workflow.id === 'modify-page' ? 'workspace' : 'creator', workspaceId: workflow.id === 'modify-page' ? 'local-workflow-space' : undefined}, React.createElement('main', {className: 'page'}, React.createElement('h1', null, 'Local workflow preview'), React.createElement(FixtureBillingPanel, {workspaceId: 'local-workflow-space', products: productView})));
  const html = '<!doctype html>' + renderToStaticMarkup(React.createElement('html', {lang: 'en', style: brandCssVariables}, React.createElement('head', null, React.createElement('meta', {name: 'viewport', content: 'width=device-width, initial-scale=1'}), React.createElement('title', null, `${brand.productName} local workflow smoke`), React.createElement('link', {rel: 'stylesheet', href: '/globals.css'})), React.createElement('body', null, body)));
  writeFileSync(path.join(output, 'rendered.html'), html, 'utf8');
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let file = null;
    if (url.pathname === '/globals.css') file = path.join(candidate, 'src/app/globals.css');
    else if (url.pathname.startsWith('/brand/')) file = path.join(candidate, 'public', url.pathname);
    if (file && existsSync(file)) {response.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'image/png'); response.end(readFileSync(file));}
    else {response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(html);}
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const {chromium} = await import('file:///C:/Users/liula/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
    browser = await chromium.launch({headless: true});
    const observations = [];
    for (const [viewportId, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      const page = await browser.newPage({viewport: {width, height}, reducedMotion: 'reduce'});
      const errors = []; page.on('pageerror', (error) => errors.push(String(error)));
      await page.goto(`http://127.0.0.1:${server.address().port}${workflow.id === 'create-page' ? '/studio-notes' : '/'}`, {waitUntil: 'networkidle'});
      const layout = await page.evaluate(() => ({viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth, headingCount: document.querySelectorAll('h1').length, buttonCount: document.querySelectorAll('button').length, overflow: document.documentElement.scrollWidth > innerWidth}));
      assert.equal(layout.overflow, false, `${workflow.id} ${viewportId} has horizontal overflow`);
      if (workflow.id === 'create-page') {assert.equal(await page.getByRole('heading', {name: 'Plan a focused short video.'}).count(), 1); assert.equal(await page.getByRole('link', {name: 'Studio notes', exact: true}).getAttribute('href'), '/studio-notes');}
      if (workflow.id === 'customize-brand') assert.equal(await page.getByRole('link', {name: 'Meridian Motion home'}).count(), 1);
      if (workflow.id === 'customize-site') assert.equal(await page.getByText('YOUR CREATIVE SPACE', {exact: true}).count(), 1);
      if (workflow.id !== 'create-page') for (const product of productView) assert.equal(await page.getByText(`${product.currency.toUpperCase()} ${(Number(product.amountMinor) / 100).toFixed(2)}`, {exact: true}).count(), 1);
      const keyboard = [];
      for (let i = 0; i < 6; i += 1) {await page.keyboard.press('Tab'); keyboard.push(await page.evaluate(() => ({tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim(), href: document.activeElement?.getAttribute('href'), outline: getComputedStyle(document.activeElement).outlineStyle})));}
      await page.screenshot({path: path.join(output, `${viewportId}.png`), fullPage: true});
      observations.push({viewportId, width, height, reducedMotion: 'reduce', layout, keyboard, browserErrors: errors, source: 'Actual candidate React modules compiled to static markup; no hydration or routed application server', catalog: workflow.id === 'create-page' ? null : productView});
      assert.deepEqual(errors, []); await page.close();
    }
    writeJson(path.join(output, 'viewport-smoke.json'), {status: 'PASS', capturedAt: new Date().toISOString(), observations});
  } finally {await browser?.close(); await new Promise((resolve) => server.close(resolve));}
}

async function main() {
  mkdirSync(resultRoot, {recursive: true}); mkdirSync(temporaryRoot, {recursive: true});
  const baseline = JSON.parse(run('baseline-digests', process.execPath, ['scripts/candidate-digests.mjs', path.join(resultRoot, 'baseline')], root));
  const expected = environment.SHPITTO_M7_EXPECTED_SOURCE_SHA;
  if (expected) assert.equal(baseline.sourceTreeSha256, expected, 'Root source no longer matches the explicitly frozen source.');
  const baselineProtected = protectedManifest(root);
  writeJson(path.join(resultRoot, 'protected-baseline.json'), baselineProtected);
  const summary = {schemaVersion: '1.0', scope: 'M7 task 8.9 local actual four-workflow execution', runId, startedAt: new Date().toISOString(), candidateCurrency: expected ? 'EXPLICIT_ROOT_FREEZE_BOUND' : 'PROVISIONAL_PENDING_ROOT_FREEZE', baselineSourceTreeSha256: baseline.sourceTreeSha256, liveProvider: false, livePayment: false, independentReview: 'NOT_RUN', gatePromotion: false, workflows: []};
  writeJson(path.join(resultRoot, 'summary.json'), summary);
  const admin = new Client({connectionString: databaseAdminUrl});
  await admin.connect();
  try {
    for (const workflow of workflows) {
      const candidate = path.join(temporaryRoot, workflow.id);
      const output = path.join(resultRoot, workflow.id); mkdirSync(output, {recursive: true}); mkdirSync(candidate, {recursive: true});
      const copyPaths = [...new Set([...Object.values(baseline.digestInputs).flat(), 'public', 'docs', 'openspec', 'internal/contracts', 'internal/restart', 'DESIGN.md', 'next-env.d.ts', 'pnpm-lock.yaml', 'README.md'])];
      for (const ref of copyPaths) if (existsSync(path.join(root, ref))) cpSync(path.join(root, ref), path.join(candidate, ref), {recursive: true});
      symlinkSync(path.join(root, 'node_modules'), path.join(candidate, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      assert.deepEqual(protectedManifest(candidate), baselineProtected);
      const originals = new Map(workflow.files.map((ref) => [ref, existsSync(path.join(candidate, ref)) ? readFileSync(path.join(candidate, ref)) : null]));
      const billingFile = 'src/components/billing/fixture-billing-panel.tsx';
      const billingBefore = billingBindings(read(path.join(candidate, billingFile)));
      run(`${workflow.id}-git-init`, 'git', ['init', '--quiet'], candidate);
      run(`${workflow.id}-git-line-endings`, 'git', ['config', 'core.autocrlf', 'false'], candidate);
      run(`${workflow.id}-git-baseline`, 'git', ['add', '--', ...workflow.files.filter((ref) => originals.get(ref) !== null)], candidate);
      const dirtyFile = path.join(candidate, '.data', 'unrelated-user-note.txt'); mkdirSync(path.dirname(dirtyFile), {recursive: true}); writeFileSync(dirtyFile, 'Unrelated local user note. Preserve these exact bytes.\n', 'utf8'); const dirtyHash = digest(readFileSync(dirtyFile));
      workflow.mutate(candidate);
      const added = workflow.files.filter((ref) => originals.get(ref) === null); if (added.length) run(`${workflow.id}-git-new-files`, 'git', ['add', '--intent-to-add', '--', ...added], candidate);
      const patch = run(`${workflow.id}-actual-diff`, 'git', ['diff', '--binary', '--', ...workflow.files], candidate); assert(patch.length > 0);
      writeFileSync(path.join(output, 'customization.patch'), patch, 'utf8');
      assert.deepEqual(protectedManifest(candidate), baselineProtected);
      const databaseName = `m7_workflow_${workflow.id.replaceAll('-', '_')}_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
      const databaseUrl = new URL(databaseAdminUrl); databaseUrl.pathname = `/${databaseName}`;
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      const env = {NODE_ENV: 'test', SHPTITTO_RUNTIME_PROFILE: 'local', DATABASE_URL: databaseUrl.toString(), BETTER_AUTH_SECRET: secret, APP_URL: 'http://127.0.0.1:3245', STORAGE_DRIVER: 'local', GENERATION_DRIVER: 'mock', MAIL_DRIVER: 'local', ASSET_ROOT: path.join(candidate, '.data', 'assets')};
      const firstCheck = checks.length;
      try {
        run(`${workflow.id}-route-types`, process.execPath, ['node_modules/next/dist/bin/next', 'typegen'], candidate, env);
        run(`${workflow.id}-typecheck`, process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], candidate, env);
        for (const checker of ['source-boundaries', 'db-boundaries', 'shell-boundaries', 'content-boundaries']) run(`${workflow.id}-${checker}`, process.execPath, [`scripts/check-${checker}.mjs`], candidate, env);
        run(`${workflow.id}-format-check`, process.execPath, ['scripts/format-check.mjs'], candidate, env);
        for (const probe of ['auth-lifecycle', 'credit-ledger', 'generation-create', 'billing-reconciliation', 'm6-admin-reads']) run(`${workflow.id}-probe-${probe}`, process.execPath, ['--experimental-strip-types', `scripts/probe-${probe}.ts`], candidate, env, 240_000);
        const billingAfter = billingBindings(read(path.join(candidate, billingFile))); assert.equal(billingAfter.sha256, billingBefore.sha256);
        const bypass = replaceOnce(read(path.join(candidate, billingFile)), 'onClick={() => checkout(product.productKey)}', "onClick={() => setMessage('Payment complete')}");
        assert.notEqual(billingBindings(bypass).sha256, billingBefore.sha256);
        writeJson(path.join(output, 'billing-bindings.json'), {status: 'PASS', before: billingBefore, after: billingAfter, semanticBypass: {attempt: 'Replace the catalog-bound checkout callback with presentation-only fake success', status: 'REJECTED_BY_LOCAL_AST_INVARIANT', mutatedBindingSha256: billingBindings(bypass).sha256, shippedValidatorSemanticApproval: 'NOT_CLAIMED'}});
        await renderSmoke(candidate, workflow, output);
        const manifest = {release: 'v1', baseline: baseline.sourceTreeSha256, dirtyWork: ['.data/unrelated-user-note.txt'], intent: workflow.brief, classification: 'presentation', changedFiles: workflow.files.map((ref) => ({path: ref, classification: 'presentation', reason: workflow.brief})), checks: checks.slice(firstCheck).map((entry) => ({id: entry.id, status: entry.status, outputRef: entry.outputRef})), recovery: {patchRef: relative(path.join(output, 'customization.patch')), preservesUnrelatedWork: true, overlaps: []}};
        writeJson(path.join(output, 'manifest.json'), manifest);
        const validation = await import(pathToFileURL(path.join(candidate, 'scripts/validate-change.ts')).href);
        assert.deepEqual(validation.validateChangeManifest(manifest), []);
        const forbidden = {...manifest, changedFiles: [{path: 'src/app/api/workspaces/[workspaceId]/billing/checkout/route.ts', classification: 'presentation', reason: 'Attempt an alternate success behavior'}]};
        const forbiddenErrors = validation.validateChangeManifest(forbidden); assert(forbiddenErrors.some((error) => error.includes('engineering-change')));
        const {createRollbackReport} = await import(pathToFileURL(path.join(candidate, 'scripts/rollback-customization.ts')).href);
        assert.equal(createRollbackReport({...manifest, recovery: {...manifest.recovery, overlaps: [workflow.files[0]]}}).status, 'BLOCKED');
        writeJson(path.join(output, 'negative-controls.json'), {status: 'PASS', protectedPathAttempt: {errors: forbiddenErrors, status: 'BLOCKED_BY_SHIPPED_MANIFEST_VALIDATOR'}, overlappingDirtyRollback: createRollbackReport({...manifest, recovery: {...manifest.recovery, overlaps: [workflow.files[0]]}})});
        const protectedAfter = protectedManifest(candidate); assert.deepEqual(protectedAfter, baselineProtected); writeJson(path.join(output, 'protected-after.json'), protectedAfter);
        const modified = JSON.parse(run(`${workflow.id}-modified-digests`, process.execPath, ['scripts/candidate-digests.mjs', path.join(output, 'modified-candidate')], candidate, env));
        run(`${workflow.id}-rollback-check`, 'git', ['apply', '--reverse', '--check', path.join(output, 'customization.patch')], candidate);
        run(`${workflow.id}-rollback-apply`, 'git', ['apply', '--reverse', path.join(output, 'customization.patch')], candidate);
        for (const [ref, original] of originals) if (original === null) assert.equal(existsSync(path.join(candidate, ref)), false); else assert.deepEqual(readFileSync(path.join(candidate, ref)), original);
        assert.equal(digest(readFileSync(dirtyFile)), dirtyHash); assert.deepEqual(protectedManifest(candidate), baselineProtected);
        writeJson(path.join(output, 'rollback.json'), {status: 'PASS', actualScopedReversePatchApplied: true, attributableFilesRestored: workflow.files, unrelatedDirtyFile: '.data/unrelated-user-note.txt', unrelatedBeforeSha256: dirtyHash, unrelatedAfterSha256: digest(readFileSync(dirtyFile)), protectedFilesUnchanged: true});
        summary.workflows.push({id: workflow.id, result: 'PASS', classification: 'local-mock', modifiedSourceTreeSha256: modified.sourceTreeSha256, files: workflow.files, protectedFilesUnchanged: protectedAfter.length, evidenceDirectory: relative(output)});
      } finally {
        await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [databaseName]);
        await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      }
      writeJson(path.join(resultRoot, 'summary.json'), summary);
    }
    const end = JSON.parse(run('end-baseline-digests', process.execPath, ['scripts/candidate-digests.mjs', path.join(resultRoot, 'baseline-after')], root));
    summary.sourceStableDuringRun = ['sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256'].every((key) => end[key] === baseline[key]);
    summary.endedAt = new Date().toISOString(); summary.status = summary.workflows.length === 4 ? 'LOCAL_WORKFLOWS_EXECUTED' : 'IN_PROGRESS';
    summary.limitations = ['No M7 gate promotion or independent reviewer decision.', 'Viewport smoke uses actual static React markup and CSS, not Next route/hydration or browser checkout proof.', 'No real Stripe, external email or provider execution.', 'Without SHPITTO_M7_EXPECTED_SOURCE_SHA the baseline remains provisional pending root freeze.'];
    writeJson(path.join(resultRoot, 'summary.json'), summary); writeJson(path.join(evidenceRoot, 'latest-run.json'), {runId, summaryRef: relative(path.join(resultRoot, 'summary.json'))});
  } finally {await admin.end();}
  console.log(`Evidence: ${relative(resultRoot)}`);
}

main().catch((error) => {writeJson(path.join(resultRoot, 'failure.json'), {status: 'FAIL', at: new Date().toISOString(), message: String(error).replaceAll(databaseAdminUrl, '[local database]').replaceAll(secret, '[redacted]')}); console.error(String(error)); process.exitCode = 1;});
