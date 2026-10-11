# M3 current independent audit

Date: 2026-10-01

Reviewers: `/root/m3_review_evidence` (evidence) and `/root/m3_source_audit` (source), both using inherited session settings. No model configuration changed.

Stage decision: PASS for the final local candidate 73ec731c971aca355335d6c86a3ba14e8c91e84e9cf8569007cb7abf3f6bd3ab, independently reviewed by /root/m3_current_review and approved separately by /root. Earlier sections below preserve historical findings and bounded decisions; the final section and linked current record supersede their pending status.

## Reviewed baseline

- Source SHA-256: `1e4072dafe60c18ace16da96d7bd29317993971acb7bbdbd1f9fd397338a7435`.
- Automated attempt: `2026-09-30T22-10-40-919Z-ed0ee87b-e46d-4883-ac43-287366909593`.
- All six declared digests matched the working tree at audit start. All 49 commands passed, 55 checked evidence references existed, and coverage was 897/1071 branches (83.75%).
- Subsequent repair changes require fresh candidate validation.

## Findings

1. P1: `src/modules/assets/ingest.ts` increments materialization attempts before checking the current outbox lease. A superseded worker can consume retry budget and invalidate the active worker's result. Fence the attempt claim before media/file work and test lease takeover.
2. P1: `src/modules/assets/authorize.ts` uses membership for asset deletion, whereas REQ-GEN-09 requires the current workspace owner or recorded creator. The active input guard also needs serialization with generation creation. Membership remains appropriate for download.
3. P2, mandatory: `scripts/local-worker.ts` does not schedule orphan cleanup. The helper is called only by probes. Wire bounded independent cleanup and verify the actual worker entry point.
4. P2, mandatory: `src/modules/assets/cleanup.ts` rescans the first 1,000 files without progress. Retained files can starve later orphan objects indefinitely. Add restart-safe pagination and a retained-prefix regression.
5. Mandatory evidence gap: the submitted browser walkthrough omits fresh-user completion, application restart, UI team/invitation creation, switching, replay/expiry, personal-space denial, revoked access in an already-open tab and required non-success UI states. Existing C01/C02 and UI PASS labels overstate coverage.
6. Process defect: task 4.12 and the stage register claim approval while the authoritative record has no completed independent or integrator PASS. Restore consistent pending/failed status and preserve M4/M5 prerequisite blocks.
7. P1, discovered during independent follow-up: `src/modules/generation/lifecycle.ts` samples settlement time before account/task lock acquisition, while the worker also passes a pre-call fixed time. A disposable PostgreSQL reproduction began settlement at `01:20:15.246Z`, crossed the persisted `01:20:15.794Z` deadline while blocked, and returned succeeded/consumed at `01:20:15.907Z`. Resample the live clock after contention and test the settlement boundary; fixed times remain explicit test-only overrides.

## Review limits and follow-up

The follow-up source review closed the confirmed terminal-settlement defect after independently executing its regression cases. This is not a claim that all application paths were independently tested. Automated crash/race evidence is credible for the reviewed baseline; it cannot replace browser evidence.

Implement repairs with regression tests, rerun the isolated verification suite, obtain a follow-up independent code review, and capture actual current browser assertions before stage approval. The browser tool currently refuses navigation from its cached `data:` connection-error page; the HTTP server itself now responds. No browser security setting was changed.

## Browser evidence required for resubmission

Use `scripts/m3-evidence.mjs` as the checklist validator. Every journey must have an ID, result, nonempty observed assertions and retained repository file references (screenshots, traces or recorded observations). Required IDs are `fresh-user-generation`, `team-creation`, `invitation-creation`, `member-invitation`, `invitation-replay-expiry`, `owner-controls`, `workspace-switching`, `personal-space-denial`, `revoked-open-tab`, `private-download`, and `application-worker-restart`.

`uiReview.checks` must similarly record `success`, `loading`, `empty`, `error`, `denied`, `desktop`, `mobile`, and `keyboard`; acceptance viewports are `1440x900` and `390x844`. Preserve the existing structured submitted-action evidence for removal and transfer. Capture real observations against unchanged source bytes before binding the candidate digest. Never refresh a digest/timestamp on an old walkthrough to substitute for a new run.

## Repair follow-up

- `src/modules/assets/authorize.ts` now checks current owner/creator authority in a transaction. `src/modules/generation/create.ts` holds a ready input row lock through creation, closing both orderings of the delete/create race. Outputs reused as inputs receive the same retention guard.
- `src/modules/assets/ingest.ts` fences materialization attempts before mutation and rechecks real-time lease/deadline after lock waits and asset insertion. `src/modules/generation/lifecycle.ts` uses the database wall clock at the shared transition boundary and places terminal transitions after credit/attempt writes, with pending dispatch rows locked first. `scripts/local-worker.ts` forwards only explicit test clocks. The dedicated `scripts/probe-asset-security.ts` reproduced the original defects and now covers 19 cases, including actual-worker settlement, account/task/reservation/outbox contention and a foreign-key lock spanning publication.
- `src/modules/assets/cleanup.ts` resumes bounded scans from an atomic private cursor, wraps for retries, and protects directory/file ordering and symlink ancestors. The local worker schedules cleanup independently of dispatch. `scripts/probe-asset-cleanup.ts` and `tests/unit/asset-cleanup-scheduling.test.ts` cover restart progress, starvation, retention, tenant/reference guards and the actual scheduler.
- `scripts/m3-evidence.mjs`, its type declaration, `scripts/verify-m3.mjs`, and `tests/unit/m3-evidence.test.ts` reject missing named browser checks or retained artifacts. The M3 runner and `package.json` acceptance command now use the current record directory. No dependencies or model settings changed.
- The cleanup and asset implementation agents cross-reviewed each other's changes. That review found and repaired a cursor ordering defect and a publication lock-wait deadline defect. This cross-review is useful code evidence, but is not a full independent acceptance of the entire final candidate.

Remaining implementation limits: filesystem directory sorting and workspace enumeration scale with size; concurrent local cleanup workers may repeat a safe page; interruption during cursor writing can leave harmless temporary metadata. No required browser case is waived by these repairs. Final isolated verification is recorded in the authoritative acceptance record.

## Independent source follow-up

On 2026-10-01, `/root/m3_source_audit` issued a code-only PASS for source SHA-256 `8711fbceb10c90ce5b989646b6f0d76a1cb3740b6301bd3ec184dcc4ead2119a`. The reviewer re-read `src/modules/generation/lifecycle.ts`, `scripts/local-worker.ts`, `src/modules/shared/commands.ts`, `src/modules/credits/settle.ts` and `scripts/probe-asset-security.ts`, including transition callers, transaction ordering and rollback boundaries. The reviewer independently ran `node --experimental-strip-types scripts/probe-asset-security.ts`: exit 0, 19/19 cases PASS. The prior settlement P1 is closed; no additional actionable defect was found in this bounded follow-up. The reviewer did not modify implementation, evidence or services. This verdict does not approve missing browser evidence or the M3 stage.

## Independent evidence-harness follow-up

`/root/m3_review_evidence` reviewed `scripts/m3-evidence.mjs`, its declaration, `scripts/verify-m3.mjs`, `tests/unit/m3-evidence.test.ts` and the current acceptance command in `package.json`. The reviewer reproduced an additional P2: one passing UI row could conceal a duplicated failed row. Two new tests reproduced that defect before repair. The assessor now requires exactly one complete row per required ID and rejects every failed or incomplete submitted row. Availability metadata distinguishes complete evidence from partial evidence.

The reviewer independently reran the focused tests (10/10 PASS) and approved the bounded harness repair with no remaining actionable findings. No reviewer changed files or services. These final harness/test edits changed the aggregate source digest after the domain review; the domain implementation remained unchanged. The final verification candidate source digest is `dc3962ce4312bba410a99c83c7a487861f78fbd81eb1bdcd945db4e728aa731d`, with validator digest `39dafef63b8515d0c040750a6b397e25c6e1cf04fe91a61b14ca92b4894f950f`.

## Local acceptance handoff limitations

The application login endpoint returned HTTP 200 during this continuation. Browser controls still refuse navigation from the existing cached `data:` connection-error page, so no new browser screenshots or UI assertions were collected. A user must open `http://localhost:3100/login` manually before the required browser walkthrough can resume. The demo seed was reset, so use the current invitation shown by the login page or `.data/demo-credentials.json`, rather than an older chat URL.

The local worker was deliberately stopped while repairing the deadline defect. A later detached hidden-process launch was rejected by the tool approval policy with `blocked by policy`, without a more specific reason. On the next requested continuation, a managed foreground terminal successfully ran `corepack pnpm worker:local` (session 36524); process 38708 was observed running. This provides an observable, controllable process lifecycle. The isolated verification runner exercises separate disposable worker processes; live demo readiness is checked separately.

## Final isolated verification

Attempt `2026-10-01T01-30-41-132Z-6cc2cb36-f9b2-409d-bbf4-bef122d22338` completed with exit 0. All 52 recorded commands passed, including production build, units, PostgreSQL domain and protocol probes, actual crash/restart recovery and isolated HTTP flows. All six candidate digests remained unchanged. Owned branch coverage was 989/1157 (85.48%), with no missing owned source. The record integrity check passed and the disposable database was removed. The existing runner emitted a Node DEP0190 child-launch warning; no command failed.

The authoritative stage record remains IN_PROGRESS: 57 of 73 mandatory checks passed, with 16 browser-dependent and full-stage review entries unresolved. The source/harness reviews above do not convert those entries to PASS. Tasks 4.12/4.13 remain open and tasks 5.1/6.1 remain blocked. See `internal/evidence/acceptance/M3/working-tree-20261001-current/record.json` for the exact candidate and retained command evidence.

`/root/m3_review_evidence` independently accepted the final automated evidence integrity: the current-byte checker returned no errors, current and attempt records matched, all 52 command entries matched the manifest, and all 57 command/criterion references plus 8 additional metadata references existed. The reviewer inspected security, cleanup, crash, replay and HTTP evidence, including three race repetitions, twenty callback deliveries and five applicable crash boundaries. No actionable inconsistency was found. The reviewer explicitly retained the 16 unresolved entries and pending full-stage approval; no files or services were changed.

## Browser continuation and reopened integration findings

Browser access resumed after the user restored the normal local login page. A new tab in the same browser resolved a stale tab connection. Retained files `20` through `47` in `browser-review-20261001-current` record a new verified account, explicit personal setup, generation, private video playback, team creation, invitation creation/acceptance/replay/expiry, workspace switching, personal-space control restrictions, ownership transfer, member removal and denial after reloading an already-open member page. Desktop and mobile layouts and actual keyboard focus traversal were observed. These are intermediate observations; they must not be relabeled as final-candidate proof after subsequent repairs.

The browser run exposed missing personal onboarding UI. The repair adds explicit POST setup, server-selected local demo funding and durable semantic idempotency. Independent review reproduced a changed-payload replay defect before correction, then accepted normalized replay, conflict and current account authorization before replay. Focused HTTP regressions passed.

A broader independent source review reopened three mandatory M3 gaps: trusted ready-asset authorization was missing at the generation HTTP boundary; suspended workspaces could disclose dashboard and member-list data; and cached generation commands could disclose results after membership revocation. The ready-input route repair received a bounded code-only PASS. Access corrections and an upload encoded-body memory limit are being verified before the final source freeze. The earlier automated attempt is historical for these changed source bytes.

## Final source freeze and independent code decision

Final source SHA-256: `73ec731c971aca355335d6c86a3ba14e8c91e84e9cf8569007cb7abf3f6bd3ab`, captured at `2026-10-01T02:05:35.109Z`. Schema, configuration and dependency-lock bytes remain unchanged. Contract/validator footprints now include the canonical traceability mapping; an isolated mapping-mutation regression failed before the footprint repair and passed afterward. `/root/m3_current_review` independently ran the regression (1/1 PASS) and accepted this strengthening of freshness checks.

`/root/m3_source_audit` issued a bounded code-only PASS after reading all three private pages, generation create/lifecycle wrappers, workspace policy/authorization, durable commands, both generation/assets POST routes, and the extended access-state/team/API HTTP probes. The suspended/disabled/unverified read and revoked replay findings are closed. Current authorization precedes private reads and cached responses; billing-hold reads/replays and trusted worker continuation remain supported. The earlier live deadline/lease transition correction remains sound. The reviewer did not edit files, run services/browser actions, or change model settings.

The final browser run starts after this freeze with another new verified account. Intermediate files from earlier candidates are retained separately. Exact-candidate runtime evidence and independent whole-stage acceptance still require the final walkthrough and isolated verification attempt.

## Final whole-stage acceptance

At 2026-10-01T02:27:40.160Z, the integrator accepted the independent decision in `internal/evidence/M3/final-stage-review-20261001.json` after checking current digests, mandatory evidence and retained artifacts. Attempt `2026-10-01T02-12-59-069Z-0691f958-7be7-407a-a12b-e871950529a9` passes all 53 commands. Coverage is 993/1166 branches (85.16%) across all 38 owned modules. The final browser record contains all 11 required journeys and eight UI checks, including actual 1440x900 and 390x844 viewports, keyboard focus, POST 200 ownership operations and application/worker restart.

Supplemental independent verification passes three repetitions each of ownership, credit reservation, command and generation replay contention: 12 probes in 12 fresh PostgreSQL databases, 28 setup/probe/digest commands, with cleanup confirmed and all six digests unchanged. Explicit SQL runtime observations identify PostgreSQL 17.6. See `internal/evidence/M3/final-independent-race-repetitions-20261001/final-summary.json` and `internal/evidence/M3/m2-prerequisite-impact-20261001.md` for replay schedules, exact state assertions, nested subcase mapping and current M2 impact proof.

An independently discovered stale-tab capture was corrected by recapturing the actual final roster; file 21 is retained with an excluded label and is not postcondition proof. Current files 22/23/24 show role reversal, one-owner roster and revoked access. The reviewer inspected the corrected artifacts before approval. No old candidate proof was relabeled.

The authoritative record is PASS with 73/73 mandatory checks and no unresolved entries. Tasks 4.13 and 4.12 are complete; 5.1 and 6.1 are eligible. The raw automated attempt remains preserved without an invented reviewer verdict. Final decisions: `internal/evidence/M3/final-stage-review-20261001.json` and `internal/evidence/acceptance/M3/working-tree-20261001-current/final-integration/decision.json`. Production email, real providers, Stripe and historical anomalous-balance recovery are deferred. This technical acceptance does not claim separate human sign-off or production release.
