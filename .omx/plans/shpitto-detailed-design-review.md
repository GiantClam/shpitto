# Shpitto detailed design review record

Date: 2026-09-27
Scope: requirements D01-D31, concrete technical selections and detailed implementation design. Planning only; no runtime correctness claim.

## Planner draft

The draft selected a root Next.js modular monolith, Better Auth, Drizzle/PostgreSQL, React-admin OSS, Fumadocs/MDX, the four Replicate/fal Wan endpoints, FirstPromoter V2, managed and Docker reference paths. It specified tables, commands, state transitions, APIs, Skills, export and execution evidence.

## Architect, iteration 1: ITERATE

Three blocking contracts required clarification:

1. Refund/dispute events could arrive before initial credit issuance, and concurrent subscription Checkout attempts needed a persistent slot.
2. Task deadlines needed a DB-driven recovery sweep independent of the original task and fenced worker acknowledgements.
3. Affiliate denial and payout review needed persistent status, freshness checks, fail-closed holds and explicit abuse defaults.

The strongest alternative was Refine with shadcn for a single UI system. React-admin's existing operational screens justify accepting a separate MUI admin presentation.

## Planner revision

Added sections 6.4, 9.4 and 10.7, supplementary schema/lease/identity records, deterministic account/payment lock ordering, first-payment reconciliation, worker fencing, review freshness and direct-dashboard control boundaries. Mirrored these amendments in Chinese.

## Architect, iteration 2: APPROVE

The independent Architect confirmed the three blockers were resolved and found no new material contradiction. Approval covers the design; concurrency, recovery, provider, affiliate, deployment and export evidence still requires implementation.

## Critic, iteration 2: APPROVE

The independent Critic approved the planning deliverable with no remaining material findings. It confirmed concrete selections, actionable implementation contracts, resolved architecture blockers, risk/verification planning, Chinese parity for critical controls, and accurate separation of selection from runtime evidence. The Critic was dispatched only after the Architect completed its approval, preserving sequential review.

## Documentary verification

- All 13 primary planning/review documents decode as UTF-8.
- English and Chinese detailed designs have 14 second-level sections, 38 third-level sections, 242 table lines and 18 code fences each at this review checkpoint.
- Final pass after recording reviews: all 14 primary/review documents decode as UTF-8; all 100 local Markdown links resolve.
- The requirements retain 31 D identifiers; acceptance retains 31 G identifiers and 62 T identifiers without duplicate table IDs.
- No source relocation, dependencies, builds, application tests, paid generation, commission payments or remote publication were executed.
