# M4 implementation acceptance — m4-self-hosted-20261017

The selected self-hosted Railway demo profile was revalidated on October 17, 2026 against the current six-digest candidate. The local disposable PostgreSQL verification passed with 1,698 of 2,025 owned branches covered (83.85185185185186%), with no missing modules and no paid provider calls. The provider webhook replay/crash suite passed 6/6 after running against a new disposable PostgreSQL container.

The Railway recovery drill used a fresh isolated workspace, 102 fixture tasks, 102 deadline failures and 102 reservation releases; the worker recovered to active with provider creates disabled. Web, worker, monitor and PostgreSQL deployments were successful at the end of the drill.

The four authorized provider rows, private R2 publication/download authorization and cleanup evidence remain carried from the prior live validation because their relevant application bytes are unchanged; the current candidate review records that equivalence explicitly. Provider billed cost remains UNKNOWN. Production email, commercial readiness, Stripe transactions, historical anomalous-balance recovery and further paid generation remain outside this M4 profile.

Evidence root: internal/evidence/M4/task-5.10/railway-worker/revalidation-20261017/
