# Cloudflare WA Capacity Ops

## Goal
Prevent deploy-time analytics failures caused by Cloudflare Web Analytics non-proxied capacity (`maxSiteInfo`).

## Runtime Guard (already integrated)

`CloudflareClient.ensureWebAnalyticsSite()` now:
1. Lists WA sites with full pagination (`/rum/site_info/list?per_page=100&page=N`).
2. Reuses existing host binding if found.
3. When close to limit, auto-cleans old test hosts (pattern-based).
4. On `maxSiteInfo`, performs cleanup and retries once.

## Product Policy (2026-04-29)

Cloudflare Web Analytics limits not-proxied sites to 10. `*.pages.dev` deployments are not proxied custom domains, so creating one Web Analytics site per preview quickly exhausts capacity.

Shpitto now uses this policy:

1. Pages deployment is never blocked by Web Analytics.
2. `*.pages.dev` deployments skip Web Analytics by default.
3. Custom domains can still provision Web Analytics.
4. `CLOUDFLARE_WA_ENABLE_PAGES_DEV=1` is the explicit operator override for pages.dev analytics.
5. The Project Analysis API follows the same rule and will not auto-create WA sites for pages.dev.

## Environment Variables

Set in `.env`:

```bash
# Enable/disable auto cleanup when WA capacity is hit (default: 1)
CLOUDFLARE_WA_CLEANUP_ON_LIMIT=1

# Max sites deleted per cleanup run (default: 3)
CLOUDFLARE_WA_CLEANUP_MAX_DELETE_PER_RUN=3

# Comma-separated wildcard patterns for safe deletion targets
# IMPORTANT: keep this scoped to test hosts only.
CLOUDFLARE_WA_CLEANUP_HOST_PATTERNS=closure-*.coworkany.com,lc-cnc-bindtest*.coworkany.com

# Existing usage alert/guard thresholds
CLOUDFLARE_WA_NOT_PROXIED_SOFT_LIMIT=8
CLOUDFLARE_WA_NOT_PROXIED_HARD_LIMIT=10

# Disable all automatic Web Analytics provisioning if needed (default: 1).
CLOUDFLARE_WA_AUTO_PROVISION=1

# Explicit opt-in for pages.dev analytics. Keep unset/0 in normal preview deployments.
CLOUDFLARE_WA_ENABLE_PAGES_DEV=0
```

## Manual Cleanup Script

Dry-run (recommended first):

```bash
pnpm -C apps/web ops:wa:cleanup
```

Dry-run with an explicit preview-host pattern:

```bash
pnpm -C apps/web ops:wa:cleanup --pattern=shpitto-*.pages.dev
```

Apply deletion:

```bash
pnpm -C apps/web ops:wa:cleanup --apply --pattern=shpitto-*.pages.dev
```

Optional flags:

```bash
pnpm -C apps/web ops:wa:cleanup --apply --pattern=shpitto-*.pages.dev --max-delete=5 --exclude=shpitto-important.pages.dev
```

Operational rule: always inspect the dry-run candidate list before using `--apply`. Keep patterns scoped to generated preview/test hosts only.
