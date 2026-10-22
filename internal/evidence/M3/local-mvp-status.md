# M3 local MVP acceptance status

Current applicability (2026-10-19): the PASS below belongs to the historical
October 1 candidate only. Current source, configuration and validator bytes have
changed. A separate current-candidate run and independent review are required;
the historical record is preserved and does not approve the current tree.
See `../acceptance/M3/working-tree-20261019-current/record.json` for the retained
incomplete attempt. New attempts must use fresh output directories.

Updated: 2026-10-01T02:27:40.160Z. Stage status: PASS. All 73 mandatory checks pass for source `73ec731c971aca355335d6c86a3ba14e8c91e84e9cf8569007cb7abf3f6bd3ab`. Tasks 4.13 and 4.12 are complete after independent whole-stage review and separate integrator approval.

This acceptance covers local PostgreSQL and Mock generation. Production email, real providers, Stripe and historical anomalous-balance recovery remain later stages. Tasks 5.1 and 6.1 are eligible; later stage gates are not approved.

## Verification

Attempt `2026-10-01T02-12-59-069Z-0691f958-7be7-407a-a12b-e871950529a9` passes all 53 recorded commands: frozen-lock installation, production build, typecheck, lint, formatting, strict OpenSpec, domain/protocol/HTTP probes, unit coverage and crash/restart recovery. Coverage is 993/1166 owned branches (85.16%) across all 38 owned modules, with no missing source. All six digests remain stable and the disposable database was removed.

Independent supplemental verification passes 12 probes across 12 fresh databases: three each of ownership, credit reservation, duplicate command and generation replay contention. All 28 recorded setup/probe/digest commands pass; databases and scratch directories are removed. PostgreSQL 17.6 is supported by explicit SQL queries.

The final browser evidence contains 11 complete journeys and eight UI checks: fresh onboarding and generation, team/invitation operations, replay/expiry, ownership transfer/removal, workspace and personal restrictions, revoked open-tab access, playable private download, app/worker restart, desktop/mobile and keyboard traversal. The stale-tab artifact is explicitly excluded; corrected roster/revocation artifacts were independently reviewed.

Authoritative proof: [record](../acceptance/M3/working-tree-20261001-current/record.json), [independent stage review](final-stage-review-20261001.md), [integrator decision](../acceptance/M3/working-tree-20261001-current/final-integration/decision.json), [browser walkthrough](browser-walkthrough-20261001.json), [supplemental races](final-independent-race-repetitions-20261001/final-summary.json) and [M2 impact](m2-prerequisite-impact-20261001.md). Historical attempt records and findings remain preserved.

## Repaired behavior and changed ownership

Workspace onboarding is explicit and durable, with a normalized idempotency payload and a server-selected local credit grant. Ready inputs are authorized at the generation HTTP boundary. Upload bodies are bounded before decoding. Private dashboard/team/member reads and cached generation commands check current active identity, workspace status and membership before returning data.

Asset deletion is restricted to the current owner or creator and serialized against input use. Materialization and terminal settlement recheck live lease/deadline fences after contention. Independently scheduled orphan cleanup resumes a bounded private cursor. Existing domain commands remain authoritative; no dependency, schema migration or model-setting change was required by these final repairs.

Implementation changes are in onboarding UI/API/domain code; the generation/assets POST routes; dashboard/team/member pages; generation create/lifecycle, asset authorization/ingest/cleanup and local worker modules; and their existing regression probes. The digest/evidence verifier now binds canonical traceability and requires complete unique browser checks. See [audit history](independent-review-20261001-current.md) for exact files and RED/GREEN evidence.

## Local manual acceptance entry

Open [local login](http://localhost:3100/login). The managed application and local worker remain running. Use the demo owner/member credentials and current invitation displayed in the login page or stored in private `.data/demo-credentials.json`; older chat invitation URLs may have expired or been consumed. The successful fresh-user walkthrough uses a separate private fixture and does not remove the default seed.

If a managed process later stops, start it from the repository with `corepack pnpm dev --port 3100` and `corepack pnpm worker:local`. Runtime availability is a local session property, not a production deployment claim.

## Remaining limits

Filesystem directory sorting and workspace enumeration scale with size; concurrent cleanup workers may repeat a safe page; an interrupted cursor write may leave harmless temporary metadata. The verification runner emits its existing Node DEP0190 child-launch warning, retained in logs, without any required command failure. Production provider webhooks and remote-fetch/payment/email behavior need their later-stage evidence. Technical M3 acceptance is complete; separate human product sign-off is not asserted.
