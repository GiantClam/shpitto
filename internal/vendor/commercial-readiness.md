# Commercial readiness register

Local preparation: complete. Public source commerce: **BLOCKED**.
This is a decision-ready draft, not approval of business values or merchant
eligibility. Task 9.13 can report its local artifacts complete while the commercial
release gate remains open. Mock fixtures do not establish any approval below.

| Required input | Current status | Required decision or external proof |
| --- | --- | --- |
| Merchant legal entity / region / product eligibility | NOT_PROVIDED | Actual Lemon Squeezy merchant approval for source software sales |
| Payout onboarding | NOT_PROVIDED | Supported payout account, identity/region checks and merchant confirmation |
| Source price and currency | UNRESOLVED | Approved initial purchase and renewal price/currency, tax-display treatment |
| License project/seat limits | UNRESOLVED | Approved project, seat, client-use, distribution and transfer rights |
| Refund/cancellation policy | DRAFT | Approved policy consistent with merchant terms and applicable law |
| Twelve-month updates/basic support | DRAFT | Approve exact scope and contact channel in the policy below |
| Source-affiliate economics | UNRESOLVED | Approved eligibility, attribution, commission, refund reversal and payout terms |
| Separate customization/deployment services | DRAFT | Approve written scope, quote process and rates before accepting work |
| Public checkout/publication | NOT_AUTHORIZED | Explicit release review and operational authorization after all prerequisites |

## Prepared policy defaults

The spec establishes twelve months of updates and basic technical support,
preservation of acquired code after expiry, optional renewal for later versions,
and separately priced customization/deployment work. These requirements are
reflected in `vendor/sales/content/legal/source-license.md` and
`vendor/sales/content/legal/support-and-services.md`.

For review, basic support covers reproducible defects in an acquired supported
release and clarification of documented installation/configuration. Bespoke
features, operating a buyer's infrastructure and third-party account approvals
are separately scoped. No response-time SLA, guaranteed provider availability,
price or license quantity is promised by this draft.

The local renewal calculation starts a twelve-calendar-month period at the
later of purchase time and the current entitlement end, with leap-day clamping.
Expired gaps stay expired. Approve this arithmetic as part of the renewal policy
before real use, or change the implementation and regression tests together.
Acquired release/version hashes are immutable and independent of these periods.

## Approval record to complete later

For each row, record `status`, accountable approver, approval time, policy/version,
exact approved value and sanitized evidence reference in private vendor records.
Mirror only the status/reference in the deployment configuration. Never replace
an unresolved item with a fabricated value to make the gate pass.

The approvals are commercial decisions in addition to real-account/environment
testing. A complete Mock code path cannot decide license, price or payout terms
for the business owner. These inputs are consolidated into the production
commercial review; they do not require unfinished local implementation work.
