# AI Image Tool Baseline Template

Canonical template id: `ai-image-tool-baseline-v1`

This template freezes `fluxkreafree` as the source product baseline for AI
image websites generated through Shpitto. The template preserves the core AI
image workflow while allowing branding, visitor-facing content, and approved
layout changes.

## Preserved Product Routes

- `/`
- `/pricing`
- `/flux-prompt-generator`
- `/sign-in`
- `/app`
- `/app/generate`
- `/app/history`
- `/app/giftcode`
- `/app/order`
- `/privacy-policy`
- `/terms-of-use`

## Required Runtime Contracts

- billing must run through `PaymentProviderAdapter`
- credits and entitlements must run through `BillingRuleEngine`
- Payload is low-frequency admin/config only
- locale changes must preserve route ownership
- secrets must remain server-only

## Getting Started

1. Copy `.env.example` to `.env.local`.
2. Configure database, auth, storage, and AI provider keys.
3. Configure at least one payment provider. Stripe is the default adapter.
4. If Payload is enabled, configure `PAYLOAD_SECRET` and `PAYLOAD_DATABASE_URL`.
5. Run install, typecheck, build, then route smoke checks before publishing.

## Template Verification Gate

Before promoting this baseline into platform flows, verify:

1. core routes render
2. mock or sandbox AI generation works
3. Stripe checkout and webhook verification work
4. i18n can add at least one extra locale without route-purpose drift
5. Payload schema covers settings, billing metadata, and localized content
6. export artifacts and deployment guides are present

## Deployment Guides

- `deployment-guides/vercel.md`
- `deployment-guides/cloudflare-pages.md`
- `deployment-guides/railway.md`
