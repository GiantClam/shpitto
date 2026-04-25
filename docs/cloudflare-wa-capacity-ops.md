# Cloudflare WA Capacity Ops

## Goal
Prevent deploy-time analytics failures caused by Cloudflare Web Analytics non-proxied capacity (`maxSiteInfo`).

## Runtime Guard (already integrated)

`CloudflareClient.ensureWebAnalyticsSite()` now:
1. Lists WA sites with full pagination (`/rum/site_info/list?per_page=100&page=N`).
2. Reuses existing host binding if found.
3. When close to limit, auto-cleans old test hosts (pattern-based).
4. On `maxSiteInfo`, performs cleanup and retries once.

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
```

## Manual Cleanup Script

Dry-run (recommended first):

```bash
pnpm -C apps/web ops:wa:cleanup
```

Apply deletion:

```bash
pnpm -C apps/web ops:wa:cleanup --apply
```

Optional flags:

```bash
pnpm -C apps/web ops:wa:cleanup --apply --max-delete=5 --exclude=lc-cnc-bindtest2.coworkany.com
```

