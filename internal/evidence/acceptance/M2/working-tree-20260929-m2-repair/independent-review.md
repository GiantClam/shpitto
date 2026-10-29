# Independent M2 review

Candidate: `working-tree-20260929-m2-repair`, source tree SHA-256 `9a2f3e2edae55f3b21b933ebee91944791b903adc9106a3e680f35203b59b7fe`. This final review supersedes my provisional review of the pre-UI source tree `a4a53f4c71b8ad2e58c1f9339b8fc3a612ed4b3b0768efcbdf0cf1ad9fed6227`.

## Decisions

- **Task 3.11: PASS** for the local M2 credit profile. Source-aware settlement, nonrenewing seven-day compensation, reconciliation holds, and proven-legacy opening migration meet the reviewed 3.11 cases. Unknown historical reserved amounts and already-ledgered databases without pre-ledger proof stay held for audited recovery at task 4.11.
- **M2 aggregate: PASS** for this candidate and local M2 profile. The mandatory C01–C05 domain/API cases, common standards, and applicable UI checks have passing evidence. This is the independent technical review; the acceptance records remain `READY_FOR_REVIEW` until the integrator records the gate decision.

## Verification and evidence

I independently ran `node scripts/verify-m2.mjs internal/evidence/acceptance/M2/working-tree-20260929-m2-repair/independent-verification` with local disposable PostgreSQL fixtures. Exit code was 0: 28/28 tests, 575/620 owned branches (92.74%), no missing owned files, and 12/12 race repetitions across three independent resets. The suite covers legacy upgrade, spending and replay; modern missing or partial ledger holds; 20 reordered settlement replays and conflicting evidence; exact compensation expiry; and held commands on all terminal outcomes.

I inspected live Next/Mailpit authentication and API isolation logs, including 35 denied cross-workspace/forged-origin cases. The final `corepack pnpm verify` run exited 0 after the UI change; earlier failed attempts remain in the evidence and were not counted as passes. Exact Node, pnpm, Docker, PostgreSQL, Next, Better Auth and Mailpit versions and effective local limits appear in both records.

I compared the final candidate digest output to current bytes: source, schema, configuration, contract, validator and lockfile SHA-256 values matched. Both `task-3.11.json` and `record.json` passed `python internal/restart/check-acceptance-record.py <record> --current` with no errors. The pre-UI/final digest footprints differ only at `src/app/globals.css` and `src/components/auth/auth-form.tsx`; all 40 owned domain and test inputs used by my independent run remain byte-identical. The final build/checks were rerun after those presentation changes.

I visually inspected mobile signup/reset and desktop login screenshots and reviewed `ui/checks.json` for all four forms at 1440×900 and 390×844. Controls are at least 44 CSS pixels high, labels are associated, focus rings are visible, Enter triggers required-field validation, the mismatch alert appears without a server mutation, and the checked viewports have no horizontal overflow. These checks cover the M2 auth UI; they are not broad browser/device certification.

## Scope and limitations

This decision does not claim production email transport, payment issuance, real provider settlement, M3 browser workspace journeys, or T49 operator recovery. The last two are assigned to tasks 4.13 and 4.11 respectively. Historical balances without proven lineage remain held. My verification created and cleaned disposable database fixtures; I made no source changes or persistent product-data changes.
