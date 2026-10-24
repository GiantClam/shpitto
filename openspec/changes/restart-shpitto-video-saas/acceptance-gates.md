# Staged acceptance contract

Status: selected engineering acceptance policy; implementation has started at M0. The initial planning register began at `NOT_STARTED`; the current register records M0 as `IN_PROGRESS` and all later stages as `NOT_STARTED`. Document review and OpenSpec validation do not pass an implementation stage.

Companions: [tasks](tasks.md), [capability traceability](traceability.md), [design](design.md), [original G/T catalog](../../../.omx/plans/test-spec-shpitto-restart.md), [complete Chinese policy](../../reviews/stage-acceptance.zh-CN.md), [record template](acceptance-record.template.json), [initial stage register](acceptance-status.json).

## 1. Operating rules

1. Nine milestone gates reuse tasks 1.8, 2.8, 3.12, 4.12, 5.10, 6.10, 7.14, 8.15 and 9.15. There are still 105 implementation tasks. A task checkbox and its stage acceptance are different records.
2. Every implemented task must satisfy its existing SC/T evidence; the criteria below aggregate that evidence. Minimum checks in this document do not replace other required scenarios. An early profile cannot pass a later profile or the whole G gate.
3. The implementation owner submits the evidence; the automated validator records the current candidate result. Independent review and integration decisions are accumulated in the final manual-acceptance queue. A stage becomes `READY_FOR_REVIEW` when all automated evidence passes; only final manual acceptance may promote it to `PASS`. The product owner receives the queue and owns commercial policy/release decisions. Automated readiness does not authorize spending, production changes or publication.
4. A failed or blocked stage blocks its dependent tasks and release claims. Independent tasks may continue only if their explicit prerequisites are passed and they do not alter a frozen shared contract. M4 and M5 can run in parallel after M3; partial success cannot unlock M6 completion. Early M7 drafting may follow its task dependencies after M1, but M7 final acceptance waits for M6.
5. A passed stage is scoped to its source, schema, dependency/configuration and policy digests plus evidence environment. Changed relevant bytes/contracts mark affected evidence `STALE`; the reviewer records impact and reruns affected cases and regressions. Cross-cutting auth/ledger/state contracts also reopen dependent stages. Unchanged evidence may be carried forward only with a recorded equivalence argument; a previous commit label alone is insufficient.
6. Gate checking is a future implementation deliverable under 1.7/2.3 and final packaging 9.14/9.15. The present JSON/Markdown files document the policy; they are not an already installed CI enforcement system.

### Deferred manual acceptance policy

Automated verification and manual acceptance are separate states:

- `IN_PROGRESS`, `BLOCKED`, `FAIL` and `STALE` mean automated work still has a missing prerequisite, an unresolved failure or stale candidate bytes. These states continue to block only the dependent automated work.
- `READY_FOR_REVIEW` means every applicable automated criterion, scenario, command, coverage threshold, digest check and available sandbox/profile check passed on the exact candidate. It does not require `independentReview` or `integrationDecision` fields to be completed.
- `PASS` is reserved for the final manual-acceptance decision. A final reviewer checks the accumulated stage records together, and a separate integrator records the cross-stage decision once at the final checkpoint.
- The generated `internal/evidence/final-manual-acceptance-queue.json` is the single queue for deferred independent reviews, integration decisions and still-missing external inputs. A missing manual decision must not prevent unrelated automated checks from running.

Automated stage work may use a predecessor at `READY_FOR_REVIEW` when its required contracts and automated evidence are available. Final release and commercial claims still require every applicable predecessor to reach `PASS` through the final manual-acceptance queue.

## 2. Common pass/fail standards

| Area | Required result |
| --- | --- |
| Scope | Every task required by the stage and every mandatory scenario in the accepted profile is complete; 100% of those checks pass. Skipped, flaky-unexplained, missing or blocked results do not pass. |
| Build and checks | Frozen-lock install, relevant build, typecheck, lint and import-boundary checks exit successfully for the implemented new-app scope. Warnings are inventoried; no warning may conceal a required failure. Legacy is excluded. M0 evaluates its disposable prototype, not an unbuilt future app. |
| Coverage | At least 80% aggregate branch coverage in delivered, owned core-domain modules, with the denominator and generated/third-party exclusions recorded before review. Every monetary, authorization, isolation, idempotency and state-transition case must pass irrespective of percentage. M0/M1 without delivered domain behavior record coverage as not-yet-applicable, not 100%. |
| Defects | Zero open P0/P1 defects. Any failure of a mandatory condition blocks regardless of its label. A P2/P3 issue can remain only if genuinely outside mandatory acceptance, independently reviewed with impact, owner and due date; such notes cannot waive tests, security, money or data-loss criteria. |
| Isolation/security | All negative authorization cases pass; no cross-workspace data/object URL disclosure, exposed secret in browser/export/logs, unverified privileged operation or direct protected-CRUD bypass. |
| Financial/task integrity | No negative spendable balance, duplicate grant/charge/refund, unauthorized money mutation, lost audit transaction, blind repeated paid submission or reopened terminal outcome. Evidence includes database invariants, not screenshots alone. |
| UI completeness | Relevant success/loading/empty/error/denied states work. Review applicable product/admin flows at desktop 1440×900 and mobile 390×844, plus keyboard access to the stage's controls. Blocked actions have actionable copy. These are acceptance viewports, not a claim of complete browser/device certification. |
| Evidence | Exact candidate, environment/tool versions, configured limits, fixture/seed, command, expected/observed results, logs/assertions and reviewer decision are recorded without secrets. External failures identify upstream versus application responsibility. |
| Recovery | Required failure/restore drill works without damaging unrelated work or repeating financial effects; a rollback description alone is insufficient once its implementation phase arrives. |

Severity: P0 means active data/credential exposure, unrecoverable loss, unauthorized financial effects or widespread unusability. P1 means a promised core journey or required integrity/recovery property fails. P2/P3 classify remaining limited/noncritical defects; severity labels cannot override the mandatory scenario rule.

### Repeatability protocol

The following are selected verification defaults, not production capacity or provider SLA promises:

- For each selected critical database race, run at least three independently reset repetitions with recorded interleavings/seeds on real PostgreSQL. Use ten simultaneous attempts for overspending, duplicate-command/checkout contention and ownership-mutation cases where applicable. Assert exact final state and external-intent counts.
- Replay the same financial/callback event twenty times, plus a conflicting payload and a reordered event permutation. Assert a single intended effect, conflict handling and unchanged unrelated records. Use deterministic local fixtures or sandbox events; do not multiply paid calls to meet this repetition count.
- At every documented crash boundary, stop/restart the process once per boundary and compare task/grant/ledger/outbox state. Boundaries include reservation, dispatch claim, ambiguous external response, verified inbox receipt, object upload before DB finalization and external success before local acknowledgement.
- Test exact time boundaries using a controlled application/database clock: immediately before, at and after expiry/deadline; use persisted real production interval configuration in contract checks. Accelerated fixture clocks are labeled and do not claim an actual hour-long service trial.
- A failing repetition is recorded and fixed; repeated reruns until one passes do not erase it. Live provider success evidence needs at least one usable result per provider/mode row under an authorized account/budget, with a stronger sample chosen if evidence reveals instability.

## 3. Milestone gates

The listed G IDs are supported by each phase. Complete release closure still requires all applicable environments/profiles in section 4 and M8. Record criterion identifiers as `<milestone>-C<two-digit item number>` (for example, `M0-C01`). M8 numbering continues across its checkpoints: RC C01–C05, BETA C06–C08 and STABLE C09–C11. Common standards and existing mandatory SC/T cases apply in addition to these summary criteria.

### M0 — Feasibility and preservation approval (task 1.8)

**Entry:** accepted scope/design and authority to execute the plan; tasks 1.1–1.7 complete. **Submitter:** foundation lead. **Reviewer:** independent architecture/release reviewer. **Environment:** read-only repository inventory plus disposable selected-stack prototype.

**Mandatory criteria**

1. Every top-level path is classified as move/retain/private/regenerable; all tracked files and selected untracked/ignored authored files have a destination/retained location, hashes and restoration instructions. There is no unresolved overwrite or path-containment conflict. `.git`, current OpenSpec and approved planning sources have explicit retention rules.
2. The selected stack resolves under a frozen lock and builds in the prototype without unsupported peer overrides. All copied source/components/binaries have provenance and permitted redistribution evidence; unknown licensing blocks use of that component.
3. Better Auth → separate operator authorization → React-admin → domain command → Drizzle integration works in the prototype; injected domain/ledger/audit/outbox failure rolls back the command, and direct unauthorized API calls fail. One migration authority is proved.
4. Versioned MDX/static search, admin isolation, standalone packaging and worker media probe build/run in their prototype slices. Media tool checksums/notices are recorded.
5. The external contract/account matrix is explicit. Real model/account/paid evidence not yet obtained is assigned to M4/M6/M8; it is not a failure of this gate unless it already proves a selected required contract impossible. E01–E05 and ownership of shared DTOs, domain lock ordering and schema are frozen with responsible owners.

**Evidence:** inventory and relocation/restore map; lock/provenance reports; prototype command/assertion logs; external-input register; T44 inventory subset, T52, T59–T62 prototype subsets; SC-FND-01/02/06/07/11/12/13/14. **Gate effect:** permits preservation snapshot and relocation M1; does not mark G02/G15/G31 globally passed or stop any online service.

### M1 — Reversible archive and reproducible scaffold (task 2.8)

**Entry:** M0 PASS; tasks 2.1–2.7 complete. **Submitter:** foundation/release owner. **Reviewer:** independent release reviewer. **Environment:** disposable restore copy, clean new-root checkout, local containers.

**Mandatory criteria**

1. All inventoried preserved bytes are accounted for by matching hashes or explicitly reviewed changes; root Git history remains reachable. Unrelated/private authored files are retained at recorded locations. A disposable restoration drill restores the mapped source without overwriting unrelated work.
2. Frozen-lock install, build, lint/typecheck/format/test-discovery/import/export-context checks target only the new product. A deliberately invalid legacy sentinel is excluded; old workspace/deploy globs do not leak into the new root. Existing remote services are unchanged by source relocation.
3. Declared PostgreSQL, mail capture, worker/media and asset volumes start with Node/pnpm/Docker alone and survive restart; no cloud keys or developer-only files are required. Production configuration rejects demo drivers/sample secrets.
4. English product/auth/app/admin/Docs shells and error/permission states have clear owners. The default brand/token baseline is present across shared shells, navigation/menu controls use consistent dimensions and keyboard focus/disabled states, and the four UI acceptance viewports show usable success/loading/empty/error/denied states. New root guidance references current contracts, while old harness guidance remains with legacy. The export classes distinguish buyer content, vendor business and internal state.

**Evidence:** before/after manifest and restore drill; clean install/build/check logs; legacy-sentinel and production-config rejection; volume/readiness proof; T44–T48 scaffold subsets, T56/T59/T62 foundation subsets; SC-FND-01–12 as applicable. **Gate effect:** permits M2 and allowed early M7 authoring; does not claim a complete generation journey.

### M2 — Identity, tenant isolation and credit invariants (task 3.12)

**Entry:** M1 PASS; tasks 3.1–3.11 complete. **Submitter:** domain owner. **Reviewer:** independent identity/financial correctness reviewer. **Environment:** real local PostgreSQL, controlled clock, domain/API fixtures.

**Mandatory criteria**

1. Persistent signup/session/verification/reset and recoverable onboarding work. Personal ownership is immutable; teams, email-bound seven-day single-use invitations and verified-member transfer obey current permissions. Removed/disabled users lose access; last-owner races cannot create an ownerless team.
2. W1 actors cannot access W2 IDs across every implemented API/relation. Composite tenant constraints and the E02 suspension/billing-hold matrix are enforced server-side; unimplemented future endpoints remain later-stage obligations.
3. The ledger explains every grant bucket; amounts remain nonnegative and sum correctly. FEFO allocation, source expiry, permanent packs and idempotent operations pass concurrent request/replay checks. No client-supplied price can control a debit.
4. Failure-settlement commands restore original allocations. Only expired subscription portions produce a single compensation grant expiring exactly seven days after refund; compensation refunds never renew expiry. Mixed grants, duplicate settlement and clock-boundary cases pass using disposable task-domain fixtures.
5. Demo funding occurs after ledger infrastructure, once only despite concurrent onboarding retries, and never in production. Defined account/credit read projections and coverage meet section 2.

**Evidence:** migrations/constraints; full relevant IAM/CRD domain cases; T01 onboarding subset, T02–T09 domain subsets, T16–T18, T60; coverage and race assertions. **Gate effect:** permits M3. G05 browser journeys await 4.13/M3; Stripe issuance and real task/provider settlement await their later gates.

### M3 — Persistent local product and recovery (task 4.12)

**Entry:** M2 PASS; tasks 4.1–4.11 **and 4.13** complete. **Submitter:** product/domain owner. **Reviewer:** independent verifier/product reviewer. **Environment:** clean local setup, PostgreSQL, persistent Mock/worker/storage, browser.

**Mandatory criteria**

1. With no cloud credentials, a new user signs in, uses a workspace, sees the server quote, generates a playable Mock video, finds history/credit lineage and downloads the owned asset. Application and worker restart preserve records/output.
2. Team creation, invitation/acceptance, member removal, owner transfer and switching work in the UI for owners/members; revoked access and prohibited personal-space actions fail in API and browser checks. Required states and viewports pass.
3. Cancel/dispatch racing has exactly one outcome. Repeated submission, callback and settlement produces one task/reservation/terminal effect. Provider completion with an error or without a valid durable asset cannot count as success.
4. Crash recovery at every relevant local boundary, independent sweep/lease fencing, lost scheduling, queue starvation and deadline/success races preserve invariants. Unknown submission reaches bounded failure/refund without another paid-submit intent; late success remains quarantined.
5. Input/output MIME/size/path/media and private-download checks reject unsafe/cross-tenant content. If the candidate implements remote provider-output fetching, deterministic SSRF/redirect/DNS fixtures are mandatory; a no-cloud Mock candidate with no remote-fetch path must prove that caller-supplied/provider URLs are rejected and must identify remote-fetch protection as deferred to the provider-integration gate. No public API-key product surface is advertised.
6. The seeded Mock demo exercises team invitation/member management, fixture billing, operations/admin views and each implemented local route's success/loading/empty/error/denied state. The record identifies local/mock evidence and leaves real provider/payment/production rows pending.

**Evidence:** J1/J3/J4/J7 local walkthrough; T01–T20 relevant integrated cases, T49/T53 local recovery, 4.13 UI cases; SC-GEN/CRD/IAM outcomes and restart/crash assertions. **Gate effect:** automated `READY_FOR_REVIEW` evidence permits M4/M5 in parallel on frozen shared contracts; final manual `PASS` remains queued, and Mock evidence cannot pass G03/G10.

### M4 — Four real generation paths and production recovery (task 5.10)

**Automated entry:** M3 automated evidence is `READY_FOR_REVIEW` or `PASS`; tasks 5.1–5.9 have their available automated prerequisites. **Final acceptance entry:** M3 is `PASS` in the final manual queue. **Submitter:** integration owner. **Reviewer:** deferred to final manual acceptance. **Environment:** actual Replicate and fal accounts, a buyer-owned provider worker or the optional Trigger runtime, and private S3-compatible storage; safe deterministic fault fixtures alongside live success evidence.

**Mandatory criteria**

1. Replicate T2V, Replicate I2V, fal T2V and fal I2V each produce at least one playable, validated, owned output. For all four, record endpoint/version/schema, request/attempt ID, input/output digest, duration, credits, cost status and successful authorized download. Unknown provider cost stays unknown.
2. Authentic callbacks and authenticated polling normalize correctly. Forged/stale/wrong-account callbacks fail; duplicate and reordered observations cannot produce duplicate financial effects. All output candidates pass bounded ingestion and integrity checks.
3. Unknown submission has no blind create retry; maximum 24 probes/60-minute deadline and 30-minute alert are configured. Queue deadline 10 minutes, known inference 60 minutes, materialization 30 minutes/eight attempts, overall 90 minutes hold without retry resetting them. Independent self-hosted or Trigger sweep/lease recovery works for the selected task runtime; total-outage limits are disclosed and restored overdue work is settled first.
4. Storage failure after provider success, expired output, stale worker acknowledgements and late output after refund pass the real adapters' contract/fault suites. At least one controlled self-hosted worker or configured Trigger-runner restart/recovery drill uses a fixture or an already authorized request, without deliberate extra paid generation.

**Evidence:** four-row real-provider matrix; PRV scenarios, production GEN profiles; T11–T20/T22/T49/T53 relevant cases; actual media and private object integrity proof. **Gate effect:** supports G03/G10 and real-generation profiles. Unavailable account/budget or one missing row means BLOCKED/FAIL, never a three-of-four pass.

### M5 — Canonical payment and cash recovery (task 6.10)

**Automated entry:** M3 automated evidence is `READY_FOR_REVIEW` or `PASS`; tasks 6.1–6.9 have their available automated prerequisites; fixed test catalog and Stripe test-mode access are available. **Final acceptance entry:** M3 is `PASS` in the final manual queue. **Submitter:** billing owner. **Reviewer:** deferred to final manual acceptance. **Environment:** real local PostgreSQL plus authorized Stripe test mode.

**Mandatory criteria**

1. Monthly subscription and permanent pack purchases grant the correct workspace exactly once after authoritative payment verification. Browser returns cannot grant. Cancel-at-period-end, renewal failure/recovery and cancel-then-repurchase preserve original expiry; annual/scheduled/prorated unsupported paths are hidden or rejected.
2. Concurrent recurring Checkout requests and lost responses reuse one unresolved attempt/slot and persisted Stripe idempotency key. Payment session/invoice/PaymentIntent aliases converge on one canonical economic event.
3. Duplicate/twenty-fold/reordered/forged events, refund/dispute-before-paid, concurrent reserve/refund, old fenced reads and transactional failures cannot overgrant, double-reverse or erase recovery holds. Historical customer mappings preserve workspace eligibility.
4. Full wholly unused refunds revoke only their own available grant. Partial, spent, reserved or disputed exposure becomes a recovery hold without negative/unrelated confiscation; active generation settles. Dispute restoration occurs once under original expiry rules.
5. Owner/member billing UI, cash-versus-credit explanation and local-domain cash refund preview/command/pending-result reconciliation work. **SC-BIL-17 operator UI is explicitly deferred to 7.3/M6**; this gate uses the test-mode domain port and cannot require the later UI.

**Evidence:** SC-BIL-01–16 full phase scope plus SC-BIL-17 domain/adapter subset; T21–T24/T28/T60; PostgreSQL race proofs and Stripe object/event IDs. **Gate effect:** supports G11/G12 and allows finance/affiliate M6 tasks; test-mode success does not authorize live charges/refunds.

### M6 — Operations and optional affiliate program (task 7.14)

**Automated entry:** M4 and M5 automated evidence is `READY_FOR_REVIEW` or `PASS`; all available 7.x prerequisites are complete. **Final acceptance entry:** M4 and M5 are `PASS` in the final manual queue. **Submitter:** operations/integration owners. **Reviewer:** deferred to final manual acceptance. **Environment:** local database/admin, actual supported FirstPromoter account/campaign test path and authorized non-live financial fixtures.

**Mandatory criteria**

1. Workspace owners cannot access global admin APIs. Current support/operator/superadmin permissions, revoked-role requests, completed-session 2FA and ten-minute same-session step-up pass positive/negative checks. Role edits and account disablement share a concurrency guard preserving one active superadmin; audited server recovery is documented and rehearsed in a disposable environment.
2. Lists/details are scoped, paginated/redacted and useful; named privileged commands require reason, expected version and semantic idempotency. Domain/ledger/audit/outbox failure rolls back atomically; protected generic CRUD is denied. Cash-refund operator UI closes SC-BIL-17 without initiating unauthorized live transfers.
3. Affiliate-disabled core operation works. Buyer and vendor programs/accounts are separate. Creator's last-valid touch within 30 days, immutable workspace UID and first effective subscription-or-pack payment are verified; changed members/payers/customers do not reset eligibility. Five-minute history reconciliation and late earlier-payment holds are proved.
4. Service-backed evidence establishes the native one-payment default and deliberate alternative campaign revision behavior. Duplicate tracking, unique incremental cash refund, credit-refund non-reversal and dispute-win manual correction holds behave as specified. No local commission balance ledger exists.
5. Asynchronous denial completion, stale/failed synchronization, changed policy/account checkpoint and review refresh older than 60 seconds prevent approval/payout handoff. Self-referral/suspicion holds preserve legitimate workspace eligibility. Demonstrate review and hosted settlement entry under a safe supported account path; actual payout is not required or authorized by this check.

**Evidence:** SC-OPS-01–12/14, AFF scenarios and SC-BIL-17 UI; T04/T25–T31/T49/T59–T61. SC-OPS-13/T62 here proves local integration/notices only. **Gate effect:** supports G22–G27 and permits final M7 integration; clean-customer admin profiles and complete G31 remain M8 obligations. Missing supported account/campaign evidence blocks the integrated gate.

### M7 — Governed customization and developer Docs (task 8.15)

**Entry:** final M4/M5/M6 interfaces accepted; tasks 8.1–8.14 complete and 8.15 ready for review. Early drafting follows its individual prerequisites. **Submitter:** Skills/Docs/product owner. **Reviewer:** independent contract/UX/docs reviewer. **Environment:** disposable candidate copies, trusted external validator baseline, supported coding-agent discovery and built Docs.

**Mandatory criteria**

1. All twelve canonical Skills include prerequisites, inputs, allowed changes, outputs, evidence and recovery. Supported Codex/Claude Code/OpenCode adapters locate them; application startup does not require an agent CLI. Dedicated extensions use their declared domain contracts.
2. Demonstrate all four personalization workflows—brand, new page, page modification, whole site—and inspect actual diffs, responsive/accessibility outcomes and protected auth/billing/credit/generation journeys.
3. Protected-path crossing, indirect business breakage, unapproved dependency/mock integration, validator/policy tampering, forced skipped checks and stale source/config/lock digest all fail or reclassify appropriately. Candidate edits cannot self-certify. Rollback preserves unrelated work and detects overlaps.
4. Template, all twelve Skill and actual API/integration Docs are discoverable/directly linkable/searchable, release-labeled and contract-accurate. Every shipped Skill has at least one usable invocation example; API examples correspond to real supported routes, with no claim of the deferred public generation API.
5. Shared-source buyer guides can be materialized and checked in a disposable candidate; examples contain no secrets and source/license notices are complete. This is **candidate content/validator evidence**. M8 still authors final deploy/recovery recipes, regenerates guides at 9.12, freezes at 9.3 and retests final bytes; 8.15 does not depend on M8.

**Evidence:** SKL and DOC scenario matrices; T32–T43/T50/T52/T54–T58 candidate profiles; before/after diffs, behavior reports, tamper/stale-proof rejection and guide/source manifests. **Gate effect:** supports G09/G28/G29 and candidate G30; final release matching and customer independence remain M8.

### M8 — Clean delivery, paid Beta and stable release (task 9.15)

**Entry:** all earlier gates PASS; required 9.x predecessors complete; candidate source and shipped files finalized. **Submitter:** release owner. **Reviewer:** independent release/security reviewer; product owner handles commercial/release authorization. **Environment:** the same immutable 9.3 candidate in a clean local installation, selected managed deployment and Docker application deployment.

**M8-RC — Candidate acceptance**

1. Author deploy/environment/migration/restore guides before final freeze; regenerate buyer docs at 9.12, then build the allowlisted package/new-history repository at 9.3. Final SHA-256/source/lock/config/contract/validator digests match all release checks. A shipped-file change reopens 9.3 and reruns 9.4 plus affected 9.14 proof.
2. The package/history/image context includes required code/migrations/Skills/guides/notices and no legacy/vendor business, original Git history, agent/private state, private dependencies or secrets. False-positive scan findings must be resolved with provenance, not ignored wholesale.
3. Fresh local operation and both production deployment recipes run from the same candidate with declared buyer-owned prerequisites. Real authentication/workspace, generation/durable download, billing test path, operator guard, affiliate-disabled behavior and admin prerequisites work. Complete SC-OPS-13/T62 on these clean profiles.
4. Backups restore and migration/worker compatibility/rollback drill have observed evidence. For the first release, use an explicitly versioned prior schema/customized-source fixture rather than claiming a previous customer release exists. Record measured restore time/data loss against existing RPO 15-minute/RTO four-hour objectives; missed objectives require a reviewed achievable configuration or corrected declared objective before release, never a fabricated pass.
5. Reconcile all G01–G31/T01–T62 obligations and detailed SC cases with their correct profiles. Final Docs/skills/source version agrees; draft stage evidence cannot substitute for final customer-byte checks.

**M8-BETA — Paid Beta readiness**

6. RC acceptance passed; no open P0/P1 or mandatory-condition failure. Selected real provider/account, affiliate program and two deployment paths have required evidence. Source-sales/vendor affiliates remain separate from buyer Stripe/FirstPromoter.
7. Approved source license/project/seat/redistribution scope, price/credit catalog, commercial refund/support terms, source update/renewal access and account qualification are recorded. Rehearse verified-order → clean per-customer repository/ZIP fulfillment, update expiry and acquired-version continued use through sandbox/local evidence. Publish only under the concrete existing release authority; live payout is not a release test prerequisite.
8. Record `M8-BETA=PASS` as permission to label the approved candidate paid-Beta-ready. It does not close stable acceptance or imply publication actually occurred. Keep task 9.15 open until M8-STABLE passes; this is a sub-checkpoint within the existing task, not a 106th implementation task.

**M8-STABLE — Stable readiness**

9. Complete an authorized representative Beta/staging observation plan on the accepted behavioral baseline. Record the observation window, its risk-based rationale, monitoring coverage and owner at M8-RC before observation begins. During that window, exercise every applicable J1–J10 journey, recovery/upgrade path and recurring worker/alert path at least once, collecting actual assertions and monitoring records. Empty traffic or elapsed days alone do not qualify. Use safe fixtures/test modes and authorized real evidence appropriately; accelerated clocks remain labeled. No fixed calendar duration, customer count, release date or service SLA is invented by this policy.
10. No open P0/P1, no mandatory regression, no unexplained ledger mismatch/duplicate financial effect/tenant exposure, and no untriaged stuck task or missing alert. Correct expected provider failures follow bounded recovery/refund and remain classified rather than being hidden in a success-rate claim. All Beta findings have disposition/owner and required fixes have evidence.
11. A behavioral change affecting auth, money, generation, provider contract, schema/migration or recovery invalidates affected observation evidence; rerun the impacted journeys/fault cases on the new baseline and restart their observation under a reviewed window. Docs/presentation-only changes require impact review, a new final artifact/digest and affected checks; they do not automatically reset unrelated observation if equivalence is documented. Revalidate current external configuration, source support/upgrade guidance and final artifact immediately before release labeling.

**Gate effect:** M8-STABLE PASS completes 9.15 and permits accurate stable-ready reporting. Deployment/publication are separately recorded actions. All earlier checkpoints, artifact evidence and commercial limitations remain visible; elapsed days or a calendar deadline cannot override a failed requirement.

## 4. Cross-phase evidence ownership

| Obligation | Earlier evidence | Full later evidence |
| --- | --- | --- |
| G02 source preservation | M0 inventory/restore plan | M1 actual byte accounting and disposable restore |
| G05 workspace product | M2 domain/API concurrency/authorization | M3 task 4.13 browser journey; M8 exported regression |
| G12 credits | M2 grant/ledger rules | M5 real test-mode issuance/lifecycle; M8 current-byte regression |
| G15/G31 stack/admin | M0 prototype, M1 foundation, M6 runtime integration | M8 single-owner migrations, licenses and clean local/managed/Docker customer profiles |
| G03/G10 real generation | M3 Mock and fixtures | M4 all four real rows; M8 candidate/config carry-forward or rerun with explicit impact evidence |
| SC-BIL-17 | M5 refund domain/adapter/test-mode | M6 privileged operator UI |
| SC-OPS-13/T62 | M6 local admin integration/notices | M8 9.4/9.14 same-candidate clean customer profiles |
| G09/G28/G29 Skills | M7 candidate workflows and trusted checks | M8 released Skill sources/validator/artifact still match the accepted proof |
| G30 Docs | M7 versioned candidate content and sample guide materialization | M8 final deploy/upgrade content regenerated, vendor Docs and buyer guides matched to 9.3 bytes |
| G19 release labeling | Every phase's truthful records | M8 distinct RC, paid-Beta-ready and stable-ready decisions |
| SC-REL-13 | 9.14 checks RC evidence integrity and rejects unsupported labels | 9.15 records BETA and STABLE decisions after their respective evidence exists; 9.14 need not observe a future stable run |

All G01–G31 must have their applicable complete profiles before paid Beta; the additional stable observation closes the stable level of G19. A G gate may carry profile-specific evidence without a misleading global PASS at an earlier stage.

## 5. Records, status and rework

Use `internal/evidence/acceptance/<stage>/<candidate-id>/record.json` and a short report during implementation. These paths are proposed implementation outputs, not evidence produced by this planning turn. Each record uses the [template](acceptance-record.template.json): task dependencies, source/schema/lock/config/validator digests, environment, profile-specific cases, expected/actual assertions, commands/logs, defect register, submitter, deferred review state, unresolved external inputs, recovery location and next allowed tasks. Do not store raw secrets or signed URLs in the report.

| Status | Meaning and transition |
| --- | --- |
| NOT_STARTED | No stage implementation evidence yet |
| IN_PROGRESS | Automated work/evidence collection is underway; only dependent automated work is held |
| READY_FOR_REVIEW | All automated mandatory cases and evidence pass for the exact candidate; independent review and integration are queued for final manual acceptance |
| PASS | Final manual acceptance confirms every mandatory condition for this exact profile/candidate and records separate review/integration decisions |
| FAIL | A mandatory case or integrity condition failed; fix and rerun affected plus regression evidence before review |
| BLOCKED | Required account/budget/authority/environment/evidence is unavailable; identify owner and next action, do not substitute Mock |
| STALE | Previously accepted evidence no longer matches relevant source/config/schema/policy; impact review and revalidation required |

For M8, record the three sub-checkpoints separately. Main M8 status becomes PASS only after STABLE PASS. An authorized paid Beta can proceed after BETA PASS while M8 remains IN_PROGRESS.

The final manual review reports: delivered scope; requirement/case coverage; runnable demo; observed evidence; blockers/defects and proposed corrections; rollback point; exact decision and next permitted tasks across the accumulated queue. Technical review must be independent of the affected implementation. A second automated agent may prepare technical findings, but it cannot impersonate a product owner's commercial authorization.

Failure workflow: retain original failing evidence → classify and assign owner → stop dependent work → fix at the owning contract/domain layer → rerun failed case plus affected regressions → refresh digests and downstream impact → independent rereview. No skipping mandatory checks, relabeling a defect to bypass the gate or rolling back unrelated customer work.
