# M0 implementation contract register

Status: **FROZEN_FOR_M0_REVIEW**. This register is the single ownership and boundary record for the selected restart stack. It freezes the implementation interfaces while leaving account-backed provider, payment and commercial evidence for their later gates. It does not create runtime code or authorize external side effects.

## Contract authority

| Contract | Single accountable owner | Canonical source | Boundary rule |
| --- | --- | --- | --- |
| Better Auth identity, sessions, verification and 2FA | identity module | Better Auth adapter plus domain access policy | Better Auth owns credentials and sessions; domain policy owns suspension, membership and entitlement effects |
| Workspace membership and tenant authorization | workspace module | domain commands and server-side membership policy | Every command resolves the current workspace server-side; a client ID or React-admin resource cannot widen scope |
| Credit grants, reservations, expiry and compensation | credit module | Drizzle domain tables and credit commands | Integer units, immutable grant lineage, FEFO and idempotency are domain-owned; UI and providers cannot mutate balances |
| Generation tasks and attempts | generation module | task/attempt state machine | Provider observations never grant credits or mark durable success directly |
| `ProviderPort` and shared DTOs | contracts module with provider adapters | `integration-matrix.md` and the approved design | Adapters translate protocols only; domain owns lifecycle, cost uncertainty, delivery and settlement |
| Billing economic events | billing module | canonical payment reducer and Stripe adapter | Stripe IDs are aliases of one canonical payment; browser returns never grant entitlement |
| Affiliate attribution and outbox | affiliate module | attribution policy and tracking outbox | Stable workspace UID and external commission state; no local commission balance ledger |
| Operations and admin authorization | operations module | named command guards and audit policy | React-admin is presentation only; privileged commands require role, reason, expected version and step-up |
| Schema and migrations | migration owner | one reviewed Drizzle PostgreSQL migration chain | Better Auth and domain tables share one migration authority; no request-time migration or second CMS schema authority |
| Audit and outbox | shared domain infrastructure | transaction boundary and idempotency policy | Business effect, successful privileged audit and outbox append commit together; dispatch follows commit |

## Shared DTO and `ProviderPort` contract

The shared contract originated as `contracts/v1` for M0 planning. Task 5.1 materializes the approved design E03 signatures in `src/adapters/providers/port.ts`; this corrects the older planning-only argument names below without changing domain ownership. Model selection is explicit in capabilities and the closed input DTO, and reconciliation reads a stable request reference carrying its accepted catalog snapshot.

```ts
interface ProviderPort {
  capabilities(modelKey: string): ModelCapabilities;
  validate(input: VideoInput): ValidatedVideoInput;
  submit(context: SubmissionContext): Promise<SubmitResult>;
  getStatus(request: ProviderRequestRef): Promise<ProviderObservation>;
  readResult(request: ProviderRequestRef): Promise<ProviderResult>;
  verifyWebhook(rawBody: Uint8Array, headers: Headers): Promise<VerifiedObservation>;
}
```

- `SubmissionContext` contains validated input, an immutable catalog/quote/policy snapshot, workspace/task/attempt correlation and an attempt nonce. Persisting these values before dispatch is the domain's responsibility; the nonce is not a claim that paid vendor creation is idempotent.
- `SubmitResult` is exactly `accepted(requestId)`, `definitelyRejected(code)` or `unknown(evidence)`; a timeout is never treated as rejection.
- `ProviderObservation` contains normalized state, stable vendor identity, observed timestamps and sanitized vendor evidence.
- `ProviderResult` contains bounded output candidates or an explicit failure/unavailable result. A provider-completed observation is not durable delivery.
- Public DTOs never contain provider secrets, raw fetch URLs, payment details or unredacted signed locations.
- Callback and polling observations are authenticated, replay-safe and unable to settle credits outside the domain command.

## Schema and migration ownership

Better Auth tables are created through its Drizzle adapter schema and the same reviewed migration chain as the domain tables. Domain tables own workspace, membership, policy, credits, generation, billing, affiliate, audit and outbox state. Composite workspace keys and server-side policy checks are mandatory for tenant isolation. PostgreSQL RLS is defense in depth; it is not a substitute for command authorization.

The M0 disposable migration and forced-RLS probe are evidence for this boundary. M1 must turn the boundary into the final release migration chain, indexes and deployment runbook before production schema work begins. No Payload.js or other CMS migration authority is introduced into the application.

## Lock and transaction order

Every cross-module mutation follows this order and records the same idempotency key:

1. Workspace and live policy lock.
2. Canonical economic or generation command lock.
3. Credit account, grant or reservation rows.
4. Audit and outbox append in the same transaction.
5. Commit; dispatch external work only after durable commit.

Reconciliation acquires the same locks and uses fencing/lease state. It never repeats an unknown paid submission merely because a response was lost. A lock-order change requires updates to this register, the affected specs and the acceptance evidence before dependent work proceeds.

## Frozen E01–E05 defaults

- **E01 personal/team ownership:** personal space ownership is immutable and creator-only; collaboration uses a separate team. Transfer requires an active verified member and a lock-protected final-owner guard.
- **E02 access and suspension:** combine user disablement, workspace suspension, membership and billing holds by the most restrictive live result. Restoration is an audited idempotent command and never deletes financial history or cancels a paid provider job.
- **E03 billing lifecycle:** one monthly subscription and permanent packs are supported. Annual, scheduled and proration paths are rejected or hidden until separately specified. Cancel-at-period-end and renewal recovery preserve the original entitlement lineage.
- **E04 delivery and settlement:** successful provider observation is not success until private output is materialized, probed, owned and downloadable. Failure/refund, cancellation and late output are settled once and quarantined when conflicting.
- **E05 affiliate attribution:** buyer affiliate is disabled by default. When enabled, attribution uses `workspace:<uuid>`, the sealed creator touch and chronological first effective payment; provider-owned commission state remains external and corrections create holds rather than a local balance ledger.

## Deferred evidence, not open ownership

The following are intentionally deferred inputs and do not reopen the frozen ownership boundary: authorized Replicate/fal model access and budget, Stripe test account/catalog, FirstPromoter campaign eligibility, Lemon Squeezy commercial terms, managed-host accounts, final shipped-image notices and final production operator-role administration/step-up/release migration work. The disposable persisted operator-role boundary is already proven in M0; its production promotion remains an M1 responsibility. Owners and gate deadlines are recorded in [external-inputs.json](external-inputs.json).

Any feasibility failure must be handled by changing the selected adapter or updating the approved spec and this register together. It may not be hidden by a scenario-specific runtime exception or a second competing schema.
