# M4 selected self-hosted recovery revalidation

The current candidate was revalidated on October 17, 2026 in the isolated `shpitto-m4-staging` Railway project. The worker was paused, the monitor observed a stale heartbeat after the configured three-minute window, the alert was delivered to the application operator receipt, and the worker was restarted with the same run-owned workspace binding.

The fresh run used `runId` `6f5b8c58-9b1e-4c9c-9a71-93f7dbde8d2a` and workspace `e5f44b9e-4531-480f-a28e-524db7c6c8cf`. Preparation, isolated fixture seeding, inspection and verification all exited successfully. The selected recovery fixture contained 102 tasks: 102 reached `generation.deadline_exceeded`, 102 reservations were released, and the original unknown-submission fence remained unchanged. No provider create request was issued.

The controlled outage produced incident `c9152460-db55-4ac1-9f3b-b34aba2d30c7`. The monitor delivered the corresponding operator receipt before the worker restart, and the resumed worker wrote a fresh heartbeat. Railway deployment status was `SUCCESS` for web, worker, monitor and Postgres at the end of the drill; the worker state was restored to `active` with provider creates disabled and the isolated workspace binding retained.

The execution receipt is [recovery-execution-20261017.json](recovery-execution-20261017.json). The current local disposable verification is under [local-verification](local-verification), with 83.85185185185186% owned branch coverage, 2025 branches found, 1698 hit, zero missing modules and zero paid provider calls. The current candidate digest is under [candidate](candidate).

This evidence closes the previously missing recovery execution provenance. It remains scoped to the selected self-hosted demo profile and does not claim production email, commercial readiness, provider invoice cost or later milestone gates.
