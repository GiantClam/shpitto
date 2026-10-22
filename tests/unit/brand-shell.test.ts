import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brand, brandCssVariables} from '../../src/config/brand.ts';
import {creatorNavigation, getWorkspaceNavigation} from '../../src/config/navigation.ts';

test('default brand exposes the shared presentation contract', () => {
  assert.equal(brand.source, 'https://shpitto.com');
  assert.equal(brand.assetRole, 'template-default-fallback');
  assert.equal(brand.customerOverrideRequiredForDelivery, true);
  assert.equal(brand.tokens.colors.canvas, '#f5f1eb');
  assert.equal(brand.tokens.colors.brand, '#f16a3f');
  assert.equal(brand.tokens.colors.secondary, '#e8dcff');
  assert.match(brand.tokens.typography.body, /^"Avenir Next",/);
  assert.equal(brand.tokens.spacing.controlHeight, '2.875rem');
  assert.equal(brand.design.sourceMethod, 'semantic-tokens-and-component-states');
  assert.equal(brand.tokens.layout.baseUnit, '4px');
  assert.equal(brand.tokens.layout.maxContent, brand.tokens.spacing.maxContent);
  assert.equal(brand.tokens.radii.sm, brand.tokens.spacing.radiusSm);
  assert.equal(brandCssVariables['--color-brand'], brand.tokens.colors.brand);
  assert.equal(brandCssVariables['--shp-primary'], brand.tokens.colors.brand);
  assert.equal(brandCssVariables['--shp-bg'], brand.tokens.colors.canvas);
  assert.equal(brandCssVariables['--shell-nav-height'], brand.tokens.spacing.navHeight);
  assert.equal(brandCssVariables['--shell-control-height'], brand.tokens.spacing.controlHeight);
  assert.match(readFileSync('src/app/globals.css', 'utf8'), /color-scheme:\s*light/);
  assert.match(readFileSync('src/app/globals.css', 'utf8'), /prefers-reduced-motion/);
  assert.match(readFileSync('src/app/globals.css', 'utf8'), /public-composer/);
  assert.match(readFileSync('src/app/layout.tsx', 'utf8'), /brandCssVariables as CSSProperties/);
  assert.match(readFileSync('src/app/layout.tsx', 'utf8'), /themeColor: brand\.tokens\.colors\.canvas/);
  assert.match(readFileSync('src/components/shell/site-shell.tsx', 'utf8'), /shpitto-logo-full\.png/);
  assert.match(readFileSync('src/components/shell/site-shell.tsx', 'utf8'), /skip-link/);
  assert.match(readFileSync('src/admin/admin-app.tsx', 'utf8'), /AdminShell/);
  assert.match(readFileSync('src/admin/admin-app.tsx', 'utf8'), /getAdminCapabilities/);
  assert.doesNotMatch(readFileSync('src/admin/admin-app.tsx', 'utf8'), /react-admin|defaultLightTheme|<Resource/);
  assert.match(readFileSync('src/admin/capabilities.ts', 'utf8'), /templateKind: 'image'/);
  assert.match(readFileSync('src/admin/capabilities.ts', 'utf8'), /templateKind: 'video'/);
  assert.match(readFileSync('src/components/ui/README.md', 'utf8'), /project-owned/);
  assert.match(readFileSync('src/admin/admin.css', 'utf8'), /var\(--color-brand\)/);
  assert.match(readFileSync('src/admin/admin.css', 'utf8'), /var\(--shell-radius-sm\)/);
  assert.match(readFileSync('skills/customize-brand/SKILL.md', 'utf8'), /customer's own visual/);
  assert.match(readFileSync('skills/customize-site/SKILL.md', 'utf8'), /customer's own brand/);
  assert.match(readFileSync('DESIGN.md', 'utf8'), /## 2\. Color Roles/);
  assert.match(readFileSync('DESIGN.md', 'utf8'), /## 4\. Component States/);
  const presentation = JSON.parse(readFileSync('.shpitto/contracts/presentation.json', 'utf8')) as {defaults?: {brandSource?: string; brandAssets?: string[]; brandReference?: string; brandBaseline?: string; designContract?: string; tokenSource?: string; assetRole?: string; customerOverrideRequiredForDelivery?: boolean; runtimeBinding?: string; sharedShell?: string[]}; editable?: {brand?: string[]; presentation?: string[]}};
  assert.equal(presentation.defaults?.brandSource, 'src/config/brand.ts');
  assert.equal(presentation.defaults?.assetRole, 'template-default-fallback');
  assert.equal(presentation.defaults?.customerOverrideRequiredForDelivery, true);
  assert.ok(presentation.defaults?.brandAssets?.includes('public/brand/shpitto-logo-full.png'));
  assert.equal(presentation.defaults?.brandReference, 'https://shpitto.com');
  assert.match(presentation.defaults?.brandBaseline ?? '', /#f16a3f/);
  assert.equal(presentation.defaults?.designContract, 'DESIGN.md');
  assert.equal(presentation.defaults?.tokenSource, 'src/config/brand.ts');
  assert.equal(presentation.defaults?.runtimeBinding, 'src/app/layout.tsx');
  assert.ok(presentation.defaults?.sharedShell?.includes('src/admin/admin-app.tsx'));
  assert.ok(presentation.defaults?.sharedShell?.includes('src/admin/capabilities.ts'));
  assert.ok(presentation.editable?.brand?.includes('src/app/globals.css'));
  assert.ok(presentation.editable?.presentation?.includes('src/app/(app)'));
});

function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

test('body, status and primary action token pairs meet AA text contrast', () => {
  const {colors} = brand.tokens;
  for (const background of [colors.canvas, colors.surface]) {
    for (const foreground of [colors.text, colors.textMuted, colors.textSubtle, colors.brandText, colors.success, colors.danger]) {
      assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
    }
  }
  for (const background of [colors.brand, colors.brandStrong]) {
    assert.ok(contrast(colors.onBrand, background) >= 4.5, `button on ${background}`);
  }
});

test('studio roles project from the brand contract without a second palette', () => {
  assert.equal(brandCssVariables['--studio-canvas'], brand.tokens.studio.canvas);
  assert.equal(brandCssVariables['--studio-text'], brand.tokens.studio.text);
  assert.equal(brandCssVariables['--studio-accent'], 'var(--color-brand)');
  for (const background of [brand.tokens.studio.canvas, brand.tokens.studio.surface, brand.tokens.studio.surfaceRaised]) {
    for (const foreground of [brand.tokens.studio.text, brand.tokens.studio.textMuted, brand.tokens.studio.danger]) {
      assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
    }
  }
  assert.doesNotMatch(readFileSync('src/app/globals.css', 'utf8'), /#[0-9a-f]{3,8}\b/i);
});

test('workspace navigation keeps creation, assets, history and billing in the selected workspace', () => {
  const navigation = getWorkspaceNavigation('team / one');
  assert.ok(navigation.some((item) => item.href === '/dashboard?workspace=team%20%2F%20one'));
  assert.ok(navigation.some((item) => item.href === '/dashboard?workspace=team%20%2F%20one#history'));
  assert.ok(navigation.some((item) => item.href === '/dashboard?workspace=team%20%2F%20one#assets'));
  assert.ok(navigation.some((item) => item.href === '/workspaces/team%20%2F%20one/billing'));
  assert.ok(navigation.some((item) => item.href === '/workspaces/team%20%2F%20one/settings/members'));
  assert.ok(!navigation.some((item) => item.href.startsWith('/dashboard/team?')));
  assert.ok(getWorkspaceNavigation().every((item) => !item.href.includes('undefined')));
});

test('creator navigation separates product destinations from video input modes', () => {
  assert.deepEqual(creatorNavigation.map((item) => item.label), ['Create', 'My creations', 'Explore']);
  assert.equal(creatorNavigation[0]?.href, '/#create');
  assert.equal(creatorNavigation[1]?.href, '/dashboard#history');
  assert.equal(creatorNavigation[2]?.href, '/#explore');
  const shell = readFileSync('src/components/shell/site-shell.tsx', 'utf8');
  assert.match(shell, /aria-current=\{item\.href === createHref/);
  assert.doesNotMatch(shell, /sidebar-library/);
});
