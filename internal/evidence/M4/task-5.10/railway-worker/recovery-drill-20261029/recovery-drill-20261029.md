# M4 selected self-hosted recovery revalidation (2026-10-29)

Fresh recovery acceptance drill on `shpitto-m4-staging` after the hosted four-path create.

- runId `9b0d0a5d-2bf7-4958-832e-40fef041dfb0`
- workspace `fc4b6bb4-eccc-431e-ac49-bc8241bd1b90`
- incident `9525d623-9d2b-4856-930c-ed43b30e62bf` opened, recovered, and delivered
- 102 overdue tasks `generation.deadline_exceeded`; 102 reservations released; unknown-submission fence preserved
- worker left `active` with provider creates disabled and drill workspace binding retained
- recovery-monitor `/healthz` ready with `deliveryPending=false`
- local `probe-provider-recovery` PASS (4 cases)

No paid provider create and no live Stripe/FirstPromoter write.

See [recovery-execution-20261029.json](recovery-execution-20261029.json).
