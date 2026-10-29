# Independent review of the frozen M4 candidate

Reviewer: Dewey, a separate native Codex review session.

Review session ID: `01a1443b-8021-7f53-bab1-5d303ea55187`.

Frozen commit: `ac733fc665d654ce3f485feee45d871f10c79f61`.

Decision: **REQUEST_CHANGES**. This is a new review of retained evidence, not a replacement or retrospective approval of the earlier review record. The reviewer had read-only repository access, did not change files, did not access environment files, and did not contact external services. The implementation/deployment owner retains integration responsibility.

## Original reviewer report

**Recommendation: REQUEST_CHANGES.** The frozen commit `ac733fc665d654ce3f485feee45d871f10c79f61` contains useful retained evidence, but it does not substantiate the recorded M4 PASS.

1. **HIGH — Current coverage is unsupported.** `internal/evidence/acceptance/M4/m4-self-hosted-20261016/record.json:355` calls 1530/1848 branches “current.” Its receipt belongs to an earlier candidate whose five non-lockfile digests differ. The manifest omits newly delivered `replicate/account-binding.ts`, recovery heartbeat, alert delivery/inbox, monitor health and configuration modules. The **82.79% arithmetic is correct; current-candidate coverage is unproven**. Rebuild the owned-module manifest and retain coverage from the final frozen candidate.

2. **HIGH — Mandatory scenario PASS entries reference commands that do not exercise them.** `internal/evidence/acceptance/M4/m4-self-hosted-20261016/record.json:903` assigns authenticated callback replay scenario SC-PRV-08 to `contracts-provider-inputs`. Its supporting matrix establishes individual successful outcomes; the referenced older test manifest does not establish the required twenty authenticated replays, conflict/reordering and durable-inbox crash checks. Likewise, 22 scenario entries reference billing catalogue contracts. Retain execution receipts for the relevant existing integration suites and map each scenario to its actual assertions.

3. **HIGH — M3 carry-forward omits changed mandatory boundaries.** `internal/evidence/acceptance/M4/m4-self-hosted-20261016/m3-equivalence-20261016.json:17` lists broad “unchanged scopes” without a criterion-level impact assessment. Historical M3 contains C01–C05; current policy additionally requires C06. Dashboard/crop UI, authentication integration, dependencies, storage and schema have changed, while the cited local receipt explicitly leaves current M3 HTTP/browser applicability stale. Supply dispositions for C01–C06, with current HTTP/browser evidence for affected behavior and specific equivalence arguments elsewhere.

4. **HIGH — Recovery assertions lack retained execution and candidate provenance.** `internal/evidence/M4/task-5.10/railway-worker/recovery-drill-20261016.json:6` summarizes 102 recovered tasks and successful heartbeat/alert assertions, but contains no invocation, exit code, candidate/image binding or correlated assertion receipt. Its only source log, identified at line 27, is absent from the frozen commit. Fake-clock fixtures are permitted; the missing provenance prevents verification of the claimed selected-runtime drill. Retain sanitized execution, restart, incident/recipient and deployed-byte receipts from the leader’s authorized work.

5. **MEDIUM — Whole-stage review independence is asserted but not traceable.** `internal/evidence/acceptance/M4/m4-self-hosted-20261016/independent-review.json:13` supplies a role-like reviewer ID and `independentFromImplementer: true`, without an identifiable independent review-session artifact or original detailed report. Earlier named-agent reviews expressly exclude whole-M4 acceptance. The frozen evidence does not establish that the whole-stage review occurred independently. Retain the separate reviewer’s original output and provenance, then obtain integration approval after resolving the evidence gaps.

6. **MEDIUM — Digests do not reproduce from frozen Git bytes.** `internal/evidence/acceptance/M4/m4-self-hosted-20261016/candidate.json:6` records schema digest `7560a6…`; independently hashing the frozen blobs using the declared algorithm produces `a6646b…`. Contract and validator digests also differ. Some individual differences are reproducible CRLF conversions. Both source-commit and dirty-patch identifiers are null. Bind acceptance to reproducible Git bytes or retain the exact reviewed archive and its checkout/encoding rules.

7. **MEDIUM — Command timestamps contradict the canonical receipts.** `internal/evidence/acceptance/M4/m4-self-hosted-20261016/record.json:1411` dates commands at 00:30–00:39 UTC on October 16, after review, integration and the commit timestamp. `internal/evidence/M4/task-5.10/railway-worker/final-20261016/commands.json:5` instead records execution around 00:07 UTC. All ten timestamps disagree. Import the actual receipts; preserve the failed same-day billing-schema attempt separately from the explicitly historical PASS and document its applicability.

Fresh verification performed here: **six focused frozen-source tests passed**, with external fetch disabled; coverage totals reconcile; the structural acceptance validator returns no errors when supplied the declared digests. That structural result does not resolve these evidentiary defects.

Provider/storage observations remain **retained evidence**, not fresh reruns: notably Fal T2V is dated October 13, while the other three application rows are dated October 15. Unknown provider cost and the restricted demo scope are appropriately disclosed.

No files were changed, environment files accessed, or external services contacted. Deployment work and whole-project/production-release acceptance remain outside this review.

## Integration disposition

The deployment owner accepts the review outcome. Fresh compilation, offline tests and deployment liveness checks do not prove current owned-module coverage, all mandatory scenario assertions, current M3 HTTP/browser equivalence, or the missing recovery-drill execution. These findings remain open. The historical acceptance files are preserved for audit; their existing structural PASS is not a new substantive M4 approval.

## Reviewer follow-up

The same independent review session supplied this follow-up after receiving the leader's fresh verification and deployment summaries:

Your default is correct. **Based on the receipts you describe, none of the four HIGH findings is resolved outright.**

- **Coverage:** 363 passing cases do not establish current owned-module branch coverage, its denominator or exclusions.
- **Scenario completeness:** closure requires retained results mapped to each mandatory scenario, including replay, conflict, race, crash and fault assertions.
- **M3 applicability:** C06 and affected HTTP/browser journeys still require explicit dispositions and supporting evidence.
- **Recovery execution:** deployment hashes and healthy loops establish worker provenance and observed readiness. They do not establish the controlled restart/outage, overdue-first restoration, financial invariants and correlated durable heartbeat/alert-delivery drill.

The exact export manifest and documented CRLF differences can address the **MEDIUM digest reproducibility finding**, provided the retained artifacts bind the reviewed and deployed bytes.

My original report remains unchanged. These reported updates are additional evidence for subsequent review; they do not retroactively approve the frozen PASS. No new actions or file writes were performed.
