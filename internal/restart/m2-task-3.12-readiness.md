# M2 remediation and aggregate readiness

M2 is PASS for candidate working-tree-20260929-m2-repair after independent review and integration. Task 4.1 is eligible; M3 implementation has not started. The independent reviewer ran successfully using a generic native agent with the explicitly requested gpt-6-sol model. Named specialist roles were bound to old models; a model override on those roles did not change their fixed model. The dispatch problem is resolved.

The reviewer rejected the earlier candidate for actual source and evidence gaps. Successful dispatch or a record-shape check does not establish acceptance.

## Corrections to previous evidence

- The earlier 110/132 (83.33%) result covered only credits. Excluding delivered IAM, workspace, operation and billing-policy domains was invalid. It is not an M2 coverage PASS.
- Seeded verified-user probes did not prove signup, verification-email delivery, login, persistent sessions or password reset.
- Domain authorization probes did not prove every implemented HTTP route rejects cross-workspace requests.
- Historical allocation linkage alone did not prove migrated balances remained usable.
- T49 operator recovery is deferred to task 4.11; task 3.11 proves discrepancy reporting and mutation holds only.
- Old command timestamps and digests are historical claims, not evidence for this repaired candidate. Fresh logs record actual start/end times and file hashes including tests.

## Repair scope

1. Enforce reconciliation holds after account locking in settlement and expiry scans.
2. Prove exact seven-day compensation expiry, retry before and after expiry, no renewal, consumption, cancellation and twenty reordered duplicate events.
3. Capture legacy grant evidence before ledger introduction through the canonical migration runner. Forward migration 0010 opens only unchanged captured snapshots. Already upgraded databases without proof remain held; modern missing/partial ledger history is never inferred or silently repaired. Unknown legacy reserved credits remain reserved pending audited recovery.
4. Complete real Better Auth email verification/password reset, usable auth forms, persistent-session tests and local Mailpit delivery wiring. Production mail transport remains a later integration obligation.
5. Exercise implemented HTTP routes for unauthenticated, forged-origin, cross-workspace and removed-member requests. Use session creation time, not refresh time, for ownership-transfer freshness.
6. Measure all delivered core modules plus quote, HTTP, auth and mail contracts. scripts/verify-m2.mjs rejects missing LCOV source files and coverage below 80%, and runs three independent resets of selected race probes.

## Promotion rule

Task 3.11 and aggregate 3.12 require separate current-candidate decisions. The aggregate needs actual mandatory scenario evidence, full denominator coverage, current source/schema/config/contract/validator digests and independent review. Task 3.12 passed on the repaired candidate and permits task 4.1. Later milestones still require their own evidence. No provider, payment, affiliate, hosted release or full operations console completion is claimed.

