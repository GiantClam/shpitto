# Restart OpenSpec documentary review

Date: 2026-09-27  
Scope: proposal/specification/design/task readiness, not application verification.  
Status: **APPROVE — planning package; implementation M0 in progress**. Formal artifact validation and independent documentary re-review passed; implementation progress is 1/105 tasks complete and no stage has passed.

## Evidence boundaries

OpenSpec 1.8.0 was initialized with `--tools none --profile core --no-animation`; the active `spec-driven` schema supplies proposal, capability specs, design and tasks. Existing global skill templates were not installed over project guidance. The local proposal Skill's older flat delta example was replaced by the installed schema's `specs/<capability>/spec.md` format.

No application source migration, dependency installation, application tests, paid generation, live payment/payout, commit, push or publication occurred while preparing this plan. Task evidence remains future work. Baseline documents are made trackable through named ignore exceptions; unrelated docs, private state, logs and credentials remain ignored. Trackable is not committed.

## Independent review, iteration one

An independent critic who did not author the new artifacts returned **ITERATE**. The following corrections were applied and re-reviewed:

| Finding | Correction owner and concrete change |
| --- | --- |
| M5 requires an operator refund UI built during M6 | Commercial lane splits SC-BIL-17 domain/test-mode evidence from M6 operator-UI closure |
| M6 requires clean-release deployment built during M8 | Commercial/delivery lanes split SC-OPS-13 local integration from M8 final clean managed/Docker evidence |
| Customer archives precede changes to shipped deploy files | Delivery lane authors deploy assets/guides before 9.3 freeze; 9.4 and 9.14 prove the same final candidate; later byte changes invalidate prior proof |
| Final superadmin can be disabled despite role protection | Commercial lane protects active administrative ownership across role changes and account disablement, with concurrency evidence and an audited recovery procedure |
| Local demo funding precedes ledger implementation | Core lane keeps 3.2 account/workspace-only, adds idempotent funding after ledger infrastructure in 3.10 and replay at 3.12 |
| Team product UI lacks a task owner | Core lane adds 4.13 for team creation/invitations/membership/transfer UI and browser evidence before M3 gate 4.12 |
| Chinese wording could mean only 2FA enrollment | Commercial lane requires completed second-factor authentication for the session, distinct from privileged command ten-minute step-up |

Historical D01-D29 and detailed-design reviews remain provenance. They do not automatically approve these new changes or establish runtime evidence.

## Independent review, iteration two

The critic returned **APPROVE — OpenSpec planning package** after reading the integrated files. It confirmed the evidence-stage separation, final candidate freeze, active-superadmin protection, ledger-before-demo ordering, team UI task and completed-session 2FA wording. It independently parsed all 105 dependencies, found no unknown dependency or explicit cycle, and confirmed the regenerated JSON/order agrees with `tasks.md`. It also confirmed all 80 requirement and 175 scenario identifiers appear in the Chinese review set. No remaining material contradiction was reported within this scope.

Integration checks caught a trace-index parser defect: a dependency followed by a sentence-ending period was omitted. The parser was corrected, the index regenerated, and the independent re-review confirmed every predecessor precedes its task in the published valid order. A missing direct SC-OPS-14 task-evidence reference was also added to 7.1/7.4/7.14. These were planning-tool corrections, not application test results.

## Initial planning-package verification

| Check | Observed result |
| --- | --- |
| Installed CLI | OpenSpec 1.8.0 |
| Strict change validation | 1 change passed; 0 issues; exit code 0 |
| Artifact status | proposal, specs, design and tasks all `done`; `isPlanningComplete=true` |
| Capability/spec counts | 12 capabilities; 80 unique requirements; 175 unique scenarios |
| Implementation task registry | 105 unique unchecked tasks; zero unknown dependencies and no dependency cycles |
| Product/acceptance coverage | D 31/31, J 10/10, T 62/62, G 31/31 mapped through requirements/scenarios/tasks |
| Chinese counterparts | Core 31 requirements/62 scenarios/35 tasks; commercial 22/55/24; delivery 21/44/30; foundation 6/14/16 in the Chinese entry |
| Encoding and references | 36 Markdown files decoded as UTF-8; no replacement characters or unclosed fences; 1,766 local links and 1,622 anchors resolved |
| Baseline preservation | 14 named baseline documents eligible for tracking, with current SHA-256 manifest; no linked normative baseline remains ignored |
| Private-state isolation | Six ignore probes confirm private state/logs, unrelated docs, environment files and temporary files remain ignored |
| Application/runtime evidence | Not executed; no implementation task or G gate claimed passed |

The reproducible CLI checks are:

```powershell
openspec validate restart-shpitto-video-saas --strict --json --no-interactive
openspec status --change restart-shpitto-video-saas --json
```

The [machine-readable verification record](validation.json) preserves the checks. The [trace register](../changes/restart-shpitto-video-saas/traceability.json) contains the final task graph and coverage data; the [baseline manifest](../baseline-manifest.json) identifies exactly which prior documents are preserved. Historical local-only old-platform references are labeled as such, rather than appearing as required files in a clean planning checkout.

CLI `isComplete` here concerns planning artifacts. It does not mean implementation or release completion. Pricing/commission/license/account/budget inputs remain gated by design; new-source migration begins only with future M0/M1 work. Do not archive the change on the strength of this review.

## Staged acceptance supplement review

Date: 2026-09-27. Status: **APPROVE — acceptance policy and bilingual plan consistency**, not implementation acceptance.

The requested supplement adds the [English staged contract](../changes/restart-shpitto-video-saas/acceptance-gates.md), [complete Chinese review](stage-acceptance.zh-CN.md), [unfilled record template](../changes/restart-shpitto-video-saas/acceptance-record.template.json) and [initial stage register](../changes/restart-shpitto-video-saas/acceptance-status.json). It defines nine M0–M8 gates, 49 summary criteria plus the existing mandatory scenarios/common standards, and separate M8-RC/BETA/STABLE decisions. Existing 105 task IDs are retained; 1.1 is now complete and the remaining 104 are unchecked. The current register records M0 IN_PROGRESS and every later stage/checkpoint NOT_STARTED.

The supplement is integrated into the proposal, design, gate task descriptions, REQ-FND-06/SC-FND-14 and REQ-REL-06/SC-REL-13, traceability and Chinese review entry/companions. Tasks 1.7/2.3 own future record-checker/CI wiring; these planning files do not install an enforcement system. BETA PASS does not close 9.15; STABLE requires representative journey/recovery/upgrade/monitoring evidence and issue closure, without inventing a fixed number of days or customers.

An independent reviewer first inspected existing stage dependencies, then reviewed the authored policy/records/tasks/specs and the complete Chinese counterpart. Final verdict: APPROVE within this documentary scope. The following findings were corrected:

- M7 entry now requires 8.1–8.14 complete and 8.15 ready for review, avoiding a self-reference.
- Stage Acceptance lines are attached to their own gate tasks rather than the following milestone heading.
- 9.15 completion semantics are synchronized across task/design/spec and both languages.
- SC-REL-13 records 9.14 RC evidence integrity separately from later BETA/STABLE decisions at 9.15.
- Chinese M0-C05 identifies domain lock ordering rather than dependency lockfiles.
- The stable observation plan/window is recorded before use; elapsed time alone cannot establish readiness.

Documentary verification reconfirmed 80 requirements, 175 scenarios, 105 unchecked tasks, full D31/J10/T62/G31 mapping, nine exact gate/predecessor mappings, 49 criterion IDs, three initial release checkpoints, no unknown task dependency and no cycle. The current machine-readable validation record replaces artifact hashes with the latest reviewed bytes and records updated UTF-8/link counts. Historical counts in the initial-package table above remain historical observations.

No application source, migration, application test, real generation/payment/payout or deployment was executed for this supplement. External qualification and runtime evidence remain future gate obligations. The immediate implementation entry is M0; no milestone has passed because of this review.

## Owner layer and inspected sources for both planning deliveries

- Owner layer: requirement/specification and implementation planning.
- Upstream sources inspected: confirmed requirements, PRD, detailed technical design, prior master plan, acceptance catalog, admin foundation assessment, current root `AGENTS.md`, `.gitignore`, OpenSpec proposal Skill and installed CLI schema.
- Layer rationale: the task converts an approved product/design direction into reviewable implementation contracts; runtime or generated-artifact patches cannot perform this work.
- Verification: documentary validation only; no runtime behavior is claimed.
