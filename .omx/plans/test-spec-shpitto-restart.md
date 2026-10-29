# Shpitto Restart Acceptance and Test Specification

Date: 2026-09-27
Status: This specification retains 31 acceptance gates and 62 focused scenarios for D01-D31. Historical D01-D29 review does not automatically cover later additions. The current technical design selects React-admin OSS 5.15.4, Fumadocs/MDX and FirstPromoter V2; M0 validates the selected configuration. Authoring this specification has not installed software, executed tests or performed real transactions.

Companions: [confirmed requirements](../../docs/plans/2026-09-27-shpitto-restart-requirements.md), [PRD](./prd-shpitto-restart.md), [master plan](./shpitto-restart-plan.md).

Selected architecture: [detailed technical design](../../docs/plans/2026-09-27-shpitto-detailed-technical-design.md). The [admin assessment](../../docs/plans/2026-09-27-shpitto-admin-foundation-assessment.md) records alternatives. React-admin OSS integrates with Better Auth sessions, separate global operator authorization and domain-owned Drizzle tables; Payload/Refine are not selected runtimes. Selection is complete; runtime integration evidence remains required.

## 1. Evidence rules

Record the commit/release identifier, environment, case ID, expected result, observed result, and sanitized evidence path for each gate. Missing, blocked, or skipped evidence is not a pass. Keep secrets, signed URLs, session tokens, and raw sensitive payloads out of reports.

For customization and customer release, record a digest of the final staged source, lockfile, contracts and relevant configuration, plus the pinned trusted validator/policy version and actual required-suite outcomes. Load the validator outside the candidate diff. Record initial dirty work separately. The supported exporter/deployer compares current staged bytes against that evidence and rejects missing, stale or mismatched results; a commit identifier alone is insufficient. Validation-policy changes require explicit engineering review and deliberate rebaselining.

- Local domain tests and the Mock Provider prove local behavior only.
- Provider contract fixtures prove adapter behavior, not current account/model availability.
- Real provider coverage requires authenticated, account-backed runs for all four provider/mode combinations and durable downloaded output. These calls require explicit budgets/credentials before execution.
- Stripe test-mode evidence does not establish a production account's eligibility or authorize live charges.
- Affiliate simulated events cannot establish that a chosen vendor's campaign configuration enforces workspace-first-payment rules. Obtain vendor-backed test evidence where available and label any limitation.
- Deployment proof is performed from a clean exported copy, not merely the developer checkout.
- Developer-documentation evidence must identify the matching template release and content source. Verify navigation, direct links, examples and API/Skill descriptions against that release's actual contracts; documentation does not establish the availability of a deferred public API.
- Admin evidence names the selected React-admin version, adapters/notices, backend authorization entrypoints, Drizzle migration ownership and transaction boundaries. Compatible metadata, a UI demonstration or installation alone cannot pass D31; missing integration evidence remains unresolved.
- Use a new disposable fixture for destructive fault injection. Preserve the buyer's real working tree and unrelated changes.

All command names and test paths below are proposed interfaces to implement, not commands confirmed to exist today. The execution owner must establish the supported commands and their gates before claiming a phase exit.

## 2. Verification layers

| Layer | Coverage | Suggested evidence |
| --- | --- | --- |
| Unit/domain | Grant allocation/expiry, compensation lineage, task transitions, model validation, authorization decisions, affiliate eligibility | Deterministic tests with controlled clock; domain branch coverage and failed-edge cases |
| Integration | Real local Postgres transactions, membership changes, webhook inbox/outbox, durable jobs, storage, retries/restarts | Transaction and concurrency runs with database assertions; no in-memory substitute for atomicity proof |
| Adapter contracts | Replicate/fal, Stripe, Trigger.dev, storage, email, affiliate mapping | Documented success/failure/duplicate/out-of-order/timeout fixtures plus external validation where required |
| E2E | Local demo, subscription/packs in test mode, teams, generation/download, admin, affiliate entry, personalization | Browser flows with assertions, route checks and desktop/mobile screenshots |
| Packaging/deployment | Legacy exclusions, secret/source allowlist, clean history, independent installation, managed and Docker paths | Inventory/export manifests, image context inspection, fresh-run logs and service checks |
| Developer documentation | Sales-site docs discovery, template/Skills/API sections, release-matched tutorials and references, synchronized buyer guides | Navigation and direct-link checks, twelve-Skill/contract cross-reference, documentation version/source records, sanitized example review and exported-guide inspection |
| Admin foundation | React-admin OSS, Better Auth session/global-role adaptation, domain commands, Drizzle migration ownership, atomic transactions and customer delivery | M0 selected-configuration validation, data/authProvider review, negative authorization and fault injection, dependency/license inventory and export/deployment evidence |
| Observability/recovery | Correlation, stalled jobs, ambiguous dispatch, missing assets, delivery failures, ledger events | Sanitized structured records and a documented recovery drill |

Plan implementation tests before writing affected production behavior. No application tests are added or run during this planning task. The implementation plan should target at least 80% branch coverage in owned core domain modules, while mandatory monetary/isolation/state-machine scenarios must pass regardless of the aggregate percentage.

## 3. Core fixture design

- Users A/B/C, workspaces W1/W2, owner/member relationships, and a separate operator account.
- Clock-controlled subscription grants, permanent purchase grants, compensation grants, and mixed-source reservations.
- A scripted Mock Provider with queued, running, success, failure, delayed response, ambiguous submission and duplicate/out-of-order callbacks.
- Local PostgreSQL and local object/asset persistence; an in-process ephemeral balance is not enough.
- Stripe test-mode purchases and webhook replay fixtures; external affiliate and provider credentials kept separate from local defaults.
- A customization fixture with both unrelated pre-existing edits and an intentional protected-core edit.
- A packaging fixture with ignored local files and benign secret markers placed outside the delivery allowlist to prove exclusion without exposing actual secrets.
- A release-tagged developer-documentation source with template tutorials, references for all twelve shipped Skills, and applicable internal API/integration examples; generate or select the sales-site content and necessary packaged buyer guides from that shared source, using placeholders rather than real secrets.
- A disposable React-admin fixture with customer/workspace-owner/operator roles sharing Better Auth identity, role revocation, direct admin endpoint access, duplicate privileged commands, Drizzle migration records and injected domain/ledger/audit failures. No Payload-generated interfaces or second CMS database is part of this fixture.

## 4. Focused scenarios

### Persistence, identity and authorization

| ID | Scenario | Required result |
| --- | --- | --- |
| T01 | New checkout, no cloud keys; initialize local dependencies, sign in, generate Mock video, restart application | Auth/workspace/task/credit/asset state persists; output remains accessible |
| T02 | Member in W1 supplies W2 IDs to task/history/asset/download/billing endpoints | Server denies access and no W2 data or signed URL leaks |
| T03 | Remove member while their session remains active | Subsequent W1 requests denied; client cache is not the authority |
| T04 | Workspace owner requests global admin endpoints; operator performs supported adjustment | Owner denied; operator action authorized and audited with actor, reason and correlation |
| T05 | Invitation replay/expiry and personal/team switching | Membership changes occur once; expiry and workspace isolation are preserved |

### Credits and generation lifecycle

| ID | Scenario | Required result |
| --- | --- | --- |
| T06 | Two simultaneous submissions contend for an insufficient balance | At most the affordable reservation succeeds; no negative spendable balance |
| T07 | Mix grants with different expiries and permanent purchases | Earliest eligible expiry consumed first; allocation records preserve source lineage |
| T08 | Subscription grant expires while part is reserved | Unreserved portion expires; reserved allocation follows the existing task outcome and is not spent twice |
| T09 | Same submission, callback and settlement delivered repeatedly | One task/attempt as applicable, one reservation and one terminal credit effect; duplicates observable |
| T10 | Cancellation races with dispatch claim | Exactly one boundary outcome: cancel before dispatch releases credits, or dispatch wins and cancellation is denied |
| T11 | Provider receives submission but network response is lost | Persist ambiguous attempt; no blind second paid submission; reconcile using available provider evidence or operator action |
| T12 | Worker stops after reservation, dispatch, callback receipt, or storage copy | Restart resumes/reconciles from durable state without duplicate spend or lost terminal effects |
| T13 | Provider reports completion with a failure payload or unavailable output | Adapter inspects actual outcome; task is not falsely delivered |
| T14 | Provider succeeds, asset copy fails transiently, source URL is expiring | Retry/reconcile storage under a bounded policy; success requires durable output; terminal delivery failure follows D20 |
| T15 | Terminal task failure despite an upstream charge | End-user credits fully refunded; provider charge/failure retained separately for operator cost reporting |
| T16 | Failed task allocated 100 expired subscription credits | One compensation grant of 100 with expiry exactly seven days from refund time |
| T17 | Compensation reserved again and refunded before/after its original expiry | Original compensation expiry retained; no rolling extension or new grant lineage |
| T18 | Failure with mixed expired subscription, valid subscription and permanent credits | Only eligible expired subscription portion gets compensation; other allocations keep original terms |
| T19 | Late/conflicting provider callback after terminal settlement/refund | Domain cannot re-charge/refund silently; record conflict for reconciliation under a documented terminal-state policy |
| T20 | Task queue is terminal but provider result is uncertain | Do not equate queue completion/timeout with provider success/failure; expose reconciliation state |

### Billing and affiliate integration

| ID | Scenario | Required result |
| --- | --- | --- |
| T21 | Stripe subscription payment and pack purchase | Correct workspace receives grants once, matching configured amount/source/period |
| T22 | Webhook replay, out-of-order delivery and a forged signature | Replay harmless; state reconciled; forged event rejected without granting credits |
| T23 | Payment failure, cancellation, renewal and configured plan transition | Entitlements/grants follow the documented lifecycle; UI return URL alone cannot activate payment |
| T24 | One order causes multiple Stripe event types | A stable business key prevents duplicate grants across event types |
| T25 | First workspace payment followed by renewal and pack add-on | FirstPromoter stable workspace UID and native one-payment cap enforce only the first effective payment; a first pack also qualifies. Duplicate delivery creates no duplicate commission, and the application does not implement its own commission ledger |
| T26 | Payer/member/Stripe-customer mapping changes after first payment | FirstPromoter receives the same stable workspace UID; workspace eligibility does not reset. A second workspace is evaluated independently |
| T27 | Two referred members and competing referral sources | Chosen attribution policy is deterministic, recorded and proven against selected service configuration |
| T28 | Cash refund/dispute versus generation-credit refund | Cash events follow specified commission reversal policy; in-app credit refund alone does not reverse cash commission |
| T29 | Affiliate disabled, then configured with a buyer-owned account | Core app still works when disabled; referrals attach only to the configured independent program |
| T30 | Operator reviews commission and initiates supported settlement | Relevant status/portal references available; walkthrough uses test mode where possible, no unsolicited live payout |
| T31 | Disallowed self-referral or suspicious workspace multiplication | Implement the chosen policy without silently changing legitimate D26 workspace eligibility; flag/audit as specified |

T27/T28/T31 use the concrete attribution, reversal and abuse defaults in the detailed technical design. Verify these against FirstPromoter account/campaign configuration before M6 acceptance; service defaults cannot silently override D25/D26. No unsupported capability may be represented as configured.

### Governed website customization

| ID | Scenario | Required result |
| --- | --- | --- |
| T32 | Brand name/colors/logo/fonts change through personalization Skill | Declared theme/content/configuration diff; consistent marketing/product shell and responsive views |
| T33 | Create a use-case page and navigation entry | Valid route, working links, existing UI primitives, metadata, no unintended auth/billing changes |
| T34 | Edit one pricing section | Layout/copy updated; actual plan/price/checkout identifiers continue to come from the approved product configuration |
| T35 | Restyle the whole site | Shared shell and design tokens coherent; sign-in, workspace navigation, submit/download and billing journeys retain behavior |
| T36 | Imported block contains a mock payment callback, alternate auth, or new unapproved dependency | Adapt to current contracts or flag out-of-scope requirement; never replace a real integration silently |
| T37 | Page request or actual diff crosses a protected path/interface | Scope checker detects it; request is reclassified into a dedicated engineering workflow |
| T38 | Malicious/incorrect visual edit breaks a protected behavior without touching a protected file | Required behavioral checks fail; path allowlists alone cannot produce a pass |
| T39 | Change attempts to modify validation rules, skip tests, or replace expected output to pass | Diff policy rejects undisclosed gate changes; ordinary customization cannot weaken its own acceptance criteria |
| T40 | Required validation fails in the supplied release/deploy workflow | Workflow returns failure and does not package/publish as a successful release |
| T41 | Roll back a failed customization with unrelated or overlapping user work present | Restore only attributable changes; preserve unrelated work; overlapping ownership is surfaced before destructive recovery |
| T42 | Install/load documented external-agent adapters on an exported template | Canonical Skills resolve correctly with scoped inputs/outputs; unsupported capabilities are not advertised |
| T43 | Dedicated provider/task extension needs a legitimate core-adjacent change | Dedicated Skill allows the declared extension with its own contract/migration/regression evidence; no permanent blanket lock |

### Migration, export, deployment and operations

| ID | Scenario | Required result |
| --- | --- | --- |
| T44 | Execute future archive map against a pre-recorded inventory | Tracked and selected untracked source hashes accounted for; .git remains root; approved docs/plans retained; no existing service implicitly stopped |
| T45 | Run install/build/lint/typecheck/format/export on new root | Legacy paths excluded explicitly; old workspace/build/deployment globs not inherited accidentally |
| T46 | Scan delivery file manifest, Git history and image context | No legacy source, old history, credentials, internal workflow state, vendor business or cache artifacts leak |
| T47 | Build/run an exported release in a fresh directory with documented prerequisites | No dependency on development checkout, ignored local state or absent private files |
| T48 | Managed deployment and Docker application deployment | Both documented paths run with explicit managed-service prerequisites; production rejects demo drivers/secrets |
| T49 | Reconcile overdue tasks, asset copy failure, dead webhook delivery and ledger mismatch alert | Operator can locate events by workspace/task/attempt IDs and follow recovery without secret exposure or duplicate ledger effects |
| T50 | Upgrade a customized release using declared migration metadata | Customization diff and compatibility report available; migrations applied in controlled order with recovery strategy |
| T51 | Update entitlement expires after twelve months | Acquired application version still runs; delivery policy controls later updates/support, not runtime access |
| T52 | Review reused assets/Skills/components and notices in export | Approved source/version/license inventory present; uncertain provenance excluded pending resolution |
| T53 | Submission response and provider ID are lost; bounded reconciliation exhausts; subscription credits expire; late success arrives after disposition | Audited unrecoverable-delivery failure restores credits once with applicable seven-day compensation; upstream cost remains unknown/operator-owned; no automatic paid resubmit or later re-debit/reopening; late result quarantined |
| T54 | Candidate edits the validator or policy to approve an otherwise forbidden/broken customization | Trusted baseline validator rejects or reclassifies the policy change; candidate tooling cannot self-certify; deliberate rebaselining needs independent engineering review |
| T55 | Candidate changes source, lockfile, contracts or relevant config after validation passes, then exports/deploys | Current staged digest differs from the bound evidence; export/deploy fails until matching required checks are rerun; missing proof also fails |

### Developer documentation on the template sales website

| ID | Scenario | Required result |
| --- | --- | --- |
| T56 | A prospective template buyer discovers the sales site's docs, uses navigation or lookup, and opens direct links into the template, Skills and API sections | All three core sections are discoverable and directly addressable; readers can locate relevant pages through the documented navigation or lookup mechanism; content is clearly for developers buying/configuring/extending the template and is distinguished from the video SaaS end user's help |
| T57 | Compare tutorials, all twelve shipped Skill references, and applicable API/integration examples against the documented release | Instructions and examples match actual release contracts and availability; no secrets appear; applicable internal interfaces explain real identity and workspace authorization, and third-party Webhook descriptions preserve their actual authentication and integration boundaries. D08 remains explicit: public generation APIs and customer API-key management are deferred; do not invent endpoints or claim unimplemented API availability |
| T58 | Publish/update a documentation version, follow its links, and inspect the buyer guides included with the corresponding clean customer package | Documentation identifies its applicable release, and links resolve within the intended version context; sales-site technical content and necessary packaged buyer guides derive from a shared maintained source and remain synchronized. Export includes the guides needed for basic setup/use without depending solely on remote-only instructions, while excluding the vendor sales shell and commercial/private business material |

### Selected open-source admin foundation

T59-T62 verify the selected React-admin OSS integration. M0 validates the chosen configuration; M1 integrates it. dataProvider/authProvider must map actual server-side services and authority. Framework choice is settled; an unexecuted prototype is not passing integration evidence.

| ID | Scenario | Required result |
| --- | --- | --- |
| T59 | Customer, workspace owner and operator exercise admin routes/endpoints; revoke global role or workspace membership while the Better Auth session remains active | Identity uses Better Auth; operations require a separately assigned global role, never workspace ownership. dataProvider/authProvider map the real session and internal command/read endpoints. Every server entrypoint checks current role and scope, denies unauthorized post-revocation requests and audits privileged actions. Hidden buttons or a cached client role cannot grant authority |
| T60 | Apply owned migrations and inject failures during a privileged domain command, ledger effect and required audit write | Drizzle owns one auth/application migration sequence; React-admin owns no tables or migrations. State change, ledger effect and required audit commit in the same domain transaction or all roll back. No schema push or competing migration system alters domain tables. External synchronization uses durable outbox/idempotent reconciliation without claiming a cross-service atomic transaction |
| T61 | Attempt generic create/update/delete on core ledger, orders and tasks; replay a supported privileged adjustment or recovery command | Auto-generated or generic CRUD cannot bypass protected domain invariants through any enabled interface. Core mutations use authorized domain commands with a required reason, stable idempotency key and actor/correlation audit; retries do not duplicate ledger effects or improperly change terminal task/order state. Framework hooks or UI restrictions alone do not substitute for domain enforcement |
| T62 | Review selected dependency licenses/versions, export a clean package and exercise local, Docker and managed paths | Selected React-admin OSS versions and adapter dependencies are compatible; notices permit source delivery and no unlicensed Enterprise code enters export. Include buyer admin/configuration/guides while excluding vendor data, secrets and seller-only services. The no-cloud demo and documented deployments use buyer configuration without seller CMS dependence. Missing license, compatibility or deployment evidence cannot pass |

## 5. Provider-backed matrix

| Provider | Mode | Mandatory evidence |
| --- | --- | --- |
| Replicate | Text-to-video | Pinned model/version or endpoint, validated inputs, request/prediction ID, sanitized task history, provider outcome, durable output, credit outcome, observed cost/limit notes |
| Replicate | Image-to-video | Above plus authorized source-image handling, supported image parameters, and output verification |
| fal.ai | Text-to-video | Pinned endpoint, queue/request identifiers, normalized response, callback/poll evidence, durable output, credit outcome |
| fal.ai | Image-to-video | Above plus authorized source-image handling and input/output verification |

At least one successful generation per row is necessary but insufficient: negative/retry cases use deterministic contracts and controlled real failure evidence where safe. The same upstream model may be accessible through two providers, but neither provider may be represented only by a Mock adapter. Do not promise upstream creation idempotency without endpoint-specific verification.

## 6. D01-D31 acceptance gates

| Gate | Observable pass condition | Evidence/cases |
| --- | --- | --- |
| G01 | Exported source runs independently under buyer-owned configuration | T47, delivery walkthrough |
| G02 | Frozen archive preserves inventoried source/history without a legacy build promise | T44, inventory/rollback map |
| G03 | Both modes work on both real providers | Four-row provider matrix |
| G04 | Vendor sales/delivery channel is separate from video SaaS billing | Sales/delivery configuration review and export manifest |
| G05 | Personal/team permissions, invitations/removal and isolation hold | T02-T05 |
| G06 | English product copy and a consistent localization boundary; no accidental bilingual UI | Route/content review and browser captures |
| G07 | Managed and Docker application paths are reproducible | T48 |
| G08 | No promised public generation API or nonfunctional API-key settings | Route/navigation/API-surface review |
| G09 | External Skills work on customer source; deployed app does not require an agent CLI | T42, production dependency/runtime review |
| G10 | Both Replicate and fal.ai adapters produce real results | Provider matrix and adapter fixtures |
| G11 | Subscription and one-off purchase grants work once | T21-T24 |
| G12 | Grant source/expiry, spending order and purchases' permanence preserved | T07-T08, credit UI |
| G13 | Cancellation succeeds only before dispatch begins | T10-T11, T53 |
| G14 | New root application is active and legacy excluded throughout toolchain | T44-T46 |
| G15 | Agreed baseline is implemented with pinned compatible dependencies and reproducible setup | Lockfile/SBOM/config review, T47-T48, T62 |
| G16 | Clean customer repository/packages omit original history/internal artifacts and match validated bytes | T46-T47, T55, T62 |
| G17 | Terms/access procedure deliver twelve months updates/support and ongoing use of acquired versions | T51 and delivery-policy review |
| G18 | Persistent no-cloud local demo completes core workflow | T01 and local browser journey |
| G19 | Beta/stable are labeled by achieved gates, with blocked evidence visible | Release evidence matrix, no deadline-only pass |
| G20 | System failure without delivered video restores full generation credits, including bounded unrecoverable-delivery disposition | T13-T15, T18-T20, T53 |
| G21 | Expired subscription refunds create only one seven-day compensation period | T16-T18, T53 |
| G22 | Operator support/admin scope is functional and separately authorized/audited | T04, T49, T59-T61, admin walkthrough |
| G23 | Vendor and buyer affiliate accounts/rules/settlements stay independent | Program/account/export review |
| G24 | One complete supported third-party affiliate integration; disabled state keeps core app working | T25-T30 |
| G25 | Default first effective payment only; subscription-first and pack-first both covered | T25 |
| G26 | First-payment qualification is per workspace, stable across payer/member changes | T26-T27 |
| G27 | Human review and supported payment initiation documented; automatic payout optional | T30, eligibility/fee prerequisites |
| G28 | Four website-personalization workflows operate on buyer's AI SaaS | T32-T35, T42 |
| G29 | Trusted scope/behavior/release checks catch breakage and bind proof to exported bytes; targeted rollback protects local work | T36-T41, T43, T54-T55 |
| G30 | The developer-facing template sales website provides discoverable, release-matched template/Skills/API docs; actual contracts and D08 boundaries are accurate, and necessary buyer guides are synchronized into the clean source delivery without exporting the vendor sales shell | T56-T58, documentation version/source records and exported-guide review |
| G31 | Selected React-admin OSS reduces generic UI work while preserving D15, Better Auth/global-role authorization, domain-owned Drizzle transactions/migrations and independent licensed delivery | T59-T62; detailed technical design, M0 selected-configuration evidence and admin assessment; any substantive D15 change requires a separate explicit decision |

## 7. Observability and failure drill

Emit structured identifiers for workspace, job, provider attempt, webhook event, credit operation and release version. Capture state transitions, dispatch ambiguity, age of unresolved tasks, asset ingestion failures, duplicate-event handling and audit actor/reason. Never label estimated provider cost as reconciled actual spend.

At the release drill, interrupt a job after dispatch, replay its provider/billing events, temporarily fail object storage, remove a workspace member, and trigger a failed UI validation in a disposable environment. The operator must locate the issue and recover using documented actions while preserving authorization and ledger invariants. Alert thresholds/SLOs are configured after observed model timings; missing data is explicitly unknown.

## 8. Release verification sequence

1. Check selected contracts/configuration/models/services and dependency/license inventory against the detailed technical design. Validate pinned React-admin OSS, allowed adapters, redistribution notices, Better Auth/global-role authority and Drizzle migration ownership; an architecture decision alone cannot pass G31.
2. Run scoped unit/domain tests, real-database integration, type checks, lint and build for the new app only. Prove React-admin domain-command, ledger/audit transaction and migration boundaries plus durable external-effect recovery (T60-T61).
3. Run local-demo browser flows and negative authorization/customization scenarios, including all applicable admin entrypoints and active-session revocation (T59). Check the developer-docs entry, navigation or lookup, and direct links across all three core sections (T56).
4. Collect provider-backed four-mode evidence and Stripe test-mode/affiliate integration evidence under authorized resources.
5. Exercise failure recovery and verify sanitized operator records.
6. Stage an explicit allowlist, inspect history/content/secret boundaries, then install and run in a fresh directory. Verify release-matched developer tutorials, twelve Skill references, applicable API examples, documentation links, and shared-source synchronization of necessary packaged buyer guides; preserve D08 and exclude the vendor sales shell/private business material (T57-T58). Verify the selected admin foundation's notices, buyer-owned configuration, packaged guides and no-cloud local operation, without a dependency on the seller's online CMS (T62). Bind validation to staged source/configuration digests and validator version; export only the matching validated content and reject any mutation or missing proof.
7. Exercise selected managed and Docker recipes with documented buyer-owned service prerequisites, including React-admin and the single Drizzle-owned PostgreSQL database (T62).
8. Populate G01-G31 with evidence and remaining limitations. Paid Beta requires all promised V1 capabilities, including developer documentation and the selected admin foundation, with limitations disclosed; stable requires the release-blocking issues to be closed and migration/support documentation complete. Record new D30/D31 review evidence separately from the historical D01-D29 review.

If external credentials or budget are unavailable, complete local and simulated work and mark the affected external gate blocked. Do not substitute a Mock run for a paid-beta claim that real providers or financial integrations work.
