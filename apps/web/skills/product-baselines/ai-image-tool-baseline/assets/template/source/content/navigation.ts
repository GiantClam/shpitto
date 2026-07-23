export const sharedShell = {
  sourceTemplate: 'fluxkreafree',
  legalRoutes: [
    '/terms-of-use',
    '/privacy-policy',
  ],
  supportEmail: 'contact@fluxkreafree.com',
} as const;

export const marketingNavigation = [
  { href: '/app/generate', title: 'Generate', external: false, scope: 'product' },
  { href: '/flux-ai', title: 'FLUX1', external: false, scope: 'brand' },
  { href: '/krea-alternative', title: 'Krea Alternative', external: false, scope: 'brand' },
  { href: '/flux-prompt-generator', title: 'Prompt Generator', external: false, scope: 'brand' },
  { href: '/blog', title: 'Blog', external: false, scope: 'brand' },
] as const;

export const appNavigation = [
  { href: '/app', title: 'Index', external: false, scope: 'product' },
  { href: '/app/generate', title: 'Generate', external: false, scope: 'product' },
  { href: '/app/history', title: 'History', external: false, scope: 'product' },
  { href: '/app/giftcode', title: 'GiftCode', external: false, scope: 'product' },
  { href: '/app/order', title: 'ChargeOrder', external: false, scope: 'product' },
] as const;

export const footerNavigation = [
  { href: '/terms-of-use', title: 'Terms of Use', external: false, scope: 'shared' },
  { href: '/privacy-policy', title: 'Privacy Policy', external: false, scope: 'shared' },
  { href: 'https://www.krea.ai/blog/flux-krea-open-source-release', title: 'Krea FLUX.1', external: true, scope: 'shared' },
  { href: 'https://github.com/krea-ai/flux', title: 'GitHub', external: true, scope: 'shared' },
  { href: 'https://huggingface.co/krea-ai', title: 'Hugging Face', external: true, scope: 'shared' },
] as const;

export const routeOwnership = {
  '/app/generate': 'product',
  '/flux-ai': 'brand',
  '/krea-alternative': 'brand',
  '/flux-prompt-generator': 'brand',
  '/blog': 'brand',
  '/admin': 'product',
  '/app': 'product',
  '/app/history': 'product',
  '/app/giftcode': 'product',
  '/app/order': 'product',
  '/terms-of-use': 'shared',
  '/privacy-policy': 'shared',
  'https://www.krea.ai/blog/flux-krea-open-source-release': 'shared',
  'https://github.com/krea-ai/flux': 'shared',
  'https://huggingface.co/krea-ai': 'shared',
} as const;

export const navigation = marketingNavigation;
