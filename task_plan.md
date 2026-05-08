# Task Plan: Shpitto Pricing Billing PayPal

## Goal
Implement pricing, entitlement-based project limits, prepaid billing, PayPal order capture, subscription-ready records, 15-day retention cleanup, and regression tests for each phase.

## Current Phase
Phase 1

## Phases

### Phase 1: Discovery And Boundaries
- [ ] Map project creation/deployment persistence.
- [ ] Map auth helpers and API route patterns.
- [ ] Identify safe integration points without touching unrelated dirty files.
- **Status:** in_progress

### Phase 2: Billing Domain Logic
- [ ] Add authoritative plan definitions.
- [ ] Add pricing, entitlement, quota, upgrade quote, and retention cleanup calculations.
- [ ] Add unit tests for price math, quota counting, upgrade proration, and cleanup eligibility.
- **Status:** pending

### Phase 3: Storage And Schema
- [ ] Extend Supabase schema with billing tables and project lifecycle fields.
- [ ] Extend D1 schema/runtime table setup for billing and cleanup metadata.
- [ ] Add persistence helpers with idempotent checkout/capture/event behavior.
- [ ] Add storage tests with mocked clients where practical.
- **Status:** pending

### Phase 4: Billing APIs And PayPal
- [ ] Add plans, entitlement, checkout, PayPal order/capture/webhook, upgrade quote/checkout, cancel-renewal routes.
- [ ] Verify API validation, auth, idempotency, and failure paths.
- **Status:** pending

### Phase 5: Quota And Retention Enforcement
- [ ] Enforce project count quota before project creation/generation/deploy entry points.
- [ ] Add 15-day retention cleanup queue logic.
- [ ] Add tests for blocked project creation and cleanup release.
- **Status:** pending

### Phase 6: UI Pages
- [ ] Add pricing page and account billing pages.
- [ ] Show monthly display price, 12-month payment, retention, quota, and upgrade CTAs.
- [ ] Add component/page tests where available.
- **Status:** pending

### Phase 7: Verification And Delivery
- [ ] Run focused tests after each phase.
- [ ] Run lint/typecheck/full tests as feasible.
- [ ] Summarize changed files, tests, and remaining risks.
- **Status:** pending

## Key Decisions
| Decision | Rationale |
|----------|-----------|
| Count created projects, not only published sites | Matches business rule: created projects consume site quota until cleanup completes. |
| Orders API first, subscriptions later | Prepaid 12+ month lock-in and upgrade differences are easier with local ledger. |
| 15-day retention before cleanup | Gives users recovery window while bounding Cloudflare/R2 cost. |
| Keep existing dirty files separate | Avoid overwriting unrelated user work. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
