import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];

for (const required of [
  'src/app/(marketing)/page.tsx',
  'src/app/(auth)/login/page.tsx',
  'src/app/(app)/dashboard/page.tsx',
  'src/app/admin/[[...segments]]/page.tsx',
  'src/app/docs/page.tsx',
  'content/docs/v1/index.mdx',
]) {
  if (!fs.existsSync(path.join(root, required))) failures.push(`missing shell or docs source: ${required}`);
}
if (!read('src/components/shell/admin-shell.tsx').startsWith("'use client';")) failures.push('admin shell must remain client-only');
if (!read('src/app/docs/page.tsx').includes('DocsArticle') || !read('src/app/docs/_components/article.tsx').includes('production verification remain separate release gates')) failures.push('Docs shell must render canonical content and retain the external release boundary');
const authLogin = read('src/app/(auth)/login/page.tsx');
const authForm = read('src/components/auth/auth-form.tsx');
if (!authLogin.includes('<AuthForm mode="login"') || !authForm.includes("login: '/api/auth/sign-in/email'")) {
  failures.push('login must mount the shared form with the Better Auth sign-in endpoint');
}
if (!read('src/app/(app)/dashboard/page.tsx').includes('not configured')) failures.push('app shell must expose its guard status');
if (/Stripe|checkout|public API key|production billing/i.test(read('src/app/(marketing)/page.tsx'))) failures.push('marketing shell must not claim deferred billing/API behavior');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Product shell boundary check passed.');
