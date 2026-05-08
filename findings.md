# Findings: Shpitto Pricing Billing PayPal

## Requirements
- Implement Free, Experience, Starter, Growth, and Scale plans.
- Display monthly prices while charging prepaid 12+ month totals with 7折 discount.
- Count projects at creation time toward site quota, including drafts, deleted, archived, expired, paused, and deployed projects.
- Release quota only after 15-day retention cleanup completes.
- Use PayPal for first payment path with order capture and webhook idempotency.
- Ensure every phase has regression tests.

## Initial Findings
- Existing worktree has unrelated dirty files in blog/workspace areas and D1 docs; implementation must avoid reverting them.
- `apps/web` uses Next.js route handlers and Vitest.
- Root `docs/` is ignored, so the plan document is local guidance but not tracked by Git.

## Decisions
| Decision | Rationale |
|----------|-----------|
| Implement billing math as pure TypeScript first | Makes price/quota/upgrade tests deterministic before API/storage wiring. |
| Keep PayPal integration behind small service functions | Allows mocked route tests without network calls. |
| Use service-role Supabase for billing-sensitive tables | Existing auth uses Supabase; payment data should not rely on client RLS writes. |

## Open Questions
- Production PayPal currency may need USD if CNY is unavailable; implementation should support configurable display and settlement currency.
- Actual cleanup of Cloudflare Pages projects must be conservative and idempotent.
