# M8 current local verification, 2026-10-19

Scope: local evidence for `local-candidate-20261019` only. No RC, BETA, STABLE,
commercial, external-account or deployment approval is asserted.

The candidate ZIP still has 9,606,977 bytes and SHA-256
`b1967ad98000316ad96539b6baa04c6ae499a68175d707429c8e6d91d8f14c07`.
`fulfillment-result.json` is a fresh invocation of the exported
`verifyLocalFulfillment(process.cwd(), 'local-candidate-20261019')` verifier. All
11 fixture checks passed, including an actual checksum-preserving customer
copy, replay/conflict handling, payment isolation, renewal gaps and retained
access to an acquired version. Its fixture purchase times are controlled
domain clocks, not real order dates. Existing historical fulfillment evidence
was not overwritten.

`release-boundaries.log` records a passing preflight over 396 runtime files and
59 buyer files. `manifest-comparison.json` compares all 455 archived files with
the current source, applying the same approved `createCustomerPackage`
transformation as the packager. At capture time, the only difference was the
generated `next-env.d.ts`. Restore/review that generated drift or regenerate
the final candidate; this comparison does not itself approve equivalence.

## Current rerun and required follow-up

The separately owned candidate verification rerun started at
`2026-10-19T04:34:01.201Z`. Its current result records install, build and exported
buyer checks passing, then `connect ECONNREFUSED 127.0.0.1:55432`. Recover the
declared disposable PostgreSQL prerequisite and repeat the runtime/restore
journey before claiming that rerun passed. The earlier successful observation
must not be presented as this failed run's result.

After implementation freezes, refresh candidate and trusted-validator digests,
reconcile shipped bytes, create/recheck the exact clean-history repository,
and rerun affected immutable-candidate install, Docker, restore, operations,
Docs and customer admin/profile cases. The source validator negative probes in
`internal/evidence/m7/local-current-20261019/validator-negative-probe.json`
are retained regression evidence; the repaired validator shape is recorded as
passing in `validator-fixed-probe.json`. The remaining local blocker is a new
trusted-runner proof for the exact frozen candidate, together with the required
database-backed runtime and restore rerun.

Full M8 remains dependent on all earlier gates, account-backed provider,
Stripe and FirstPromoter evidence, approved merchant eligibility and commercial
terms, the same candidate in both required production profiles, and separate
independent RC/BETA/STABLE reviews. The existing Railway demo and historical
Docs UI observations retain their original candidate and environment scope.
